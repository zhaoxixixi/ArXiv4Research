from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse
from unittest.mock import patch

import feedparser

from app.arxiv_api_client import (
    ARXIV_API_ENDPOINT,
    build_category_search_query,
    build_id_list_query_url,
    build_query_url,
    fetch_latest_by_categories,
    fetch_window_by_categories,
    normalize_arxiv_abs_url,
    normalize_arxiv_id,
    parse_api_feed,
)
from app.models import DomainBucket


def _build_feed(entries_xml: str) -> feedparser.FeedParserDict:
    payload = f"""<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>arXiv Query Results</title>
  {entries_xml}
</feed>
"""
    return feedparser.parse(payload.encode("utf-8"))


class ArxivApiClientTests(unittest.TestCase):
    def setUp(self) -> None:
        self.domains = [
            DomainBucket(
                name="biology",
                priority=100,
                categories=["q-bio.GN"],
                keywords=["single-cell"],
                filter_mode="hard",
                cross_keywords=["neural network"],
            ),
            DomainBucket(
                name="ai4science",
                priority=90,
                categories=["cs.LG"],
                keywords=["neural operator"],
                filter_mode="soft",
                cross_keywords=[],
            ),
        ]
        self.global_keywords = ["diffusion", "representation learning"]

    def test_build_query_helpers_support_category_and_submitted_window(self) -> None:
        submitted_start = datetime(2026, 4, 3, 0, 0, tzinfo=timezone.utc)
        submitted_end = datetime(2026, 4, 4, 6, 30, tzinfo=timezone(timedelta(hours=8)))

        search_query = build_category_search_query(
            category="cs.LG",
            submitted_start=submitted_start,
            submitted_end=submitted_end,
            extra_clause="all:operator",
        )
        url = build_query_url(search_query=search_query, start=50, max_results=25)

        self.assertEqual(
            search_query,
            "cat:cs.LG AND all:operator AND submittedDate:[202604030000 TO 202604032230]",
        )
        self.assertEqual(url.split("?")[0], ARXIV_API_ENDPOINT)

        params = parse_qs(urlparse(url).query)
        self.assertEqual(params["search_query"][0], search_query)
        self.assertEqual(params["start"][0], "50")
        self.assertEqual(params["max_results"][0], "25")
        self.assertEqual(params["sortBy"][0], "submittedDate")
        self.assertEqual(params["sortOrder"][0], "descending")

    def test_parse_api_feed_returns_filtered_papers_with_domain_metadata(self) -> None:
        payload = """<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2604.00001</id>
    <updated>2026-04-04T02:00:00Z</updated>
    <published>2026-04-04T01:00:00Z</published>
    <title>Single-cell graph learning</title>
    <summary>Single-cell analysis with a neural network backbone.</summary>
    <author><name>Alice Example</name></author>
    <author><name>Bob Example</name></author>
    <category term="q-bio.GN" />
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2604.00002</id>
    <updated>2026-04-04T02:10:00Z</updated>
    <published>2026-04-04T01:10:00Z</published>
    <title>Single-cell atlas compression</title>
    <summary>Single-cell atlases without the CS-side signal.</summary>
    <author><name>Carol Example</name></author>
    <category term="q-bio.GN" />
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2604.00003</id>
    <updated>2026-04-04T02:20:00Z</updated>
    <published>2026-04-04T01:20:00Z</published>
    <title>Neural operator pretraining</title>
    <summary>Method paper for operator learning.</summary>
    <author><name>David Example</name></author>
    <category term="cs.LG" />
  </entry>
</feed>
"""

        papers = parse_api_feed(
            payload=payload.encode("utf-8"),
            domain_buckets=self.domains,
            global_keywords=self.global_keywords,
            apply_filters=True,
        )

        self.assertEqual([paper.paper_id for paper in papers], ["2604.00001", "2604.00003"])
        self.assertEqual(papers[0].authors, ["Alice Example", "Bob Example"])
        self.assertEqual(papers[0].domain, "biology")
        self.assertEqual(papers[0].published, "2026-04-04T01:00:00Z")
        self.assertEqual(papers[1].domain, "ai4science")

    def test_parse_api_feed_normalizes_versioned_ids(self) -> None:
        payload = """<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2604.04702v1</id>
    <updated>2026-04-07T02:00:00Z</updated>
    <published>2026-04-07T01:00:00Z</published>
    <title>Neural operator update</title>
    <summary>Operator learning for science.</summary>
    <author><name>Alice Example</name></author>
    <category term="cs.LG" />
  </entry>
</feed>
"""

        papers = parse_api_feed(
            payload=payload.encode("utf-8"),
            domain_buckets=self.domains,
            global_keywords=self.global_keywords,
            apply_filters=False,
        )

        self.assertEqual([paper.paper_id for paper in papers], ["2604.04702"])
        self.assertEqual(papers[0].link, "https://arxiv.org/abs/2604.04702v1")

    def test_normalize_arxiv_id_handles_modern_and_legacy_forms(self) -> None:
        self.assertEqual(normalize_arxiv_id("2604.04702v3"), "2604.04702")
        self.assertEqual(normalize_arxiv_id("http://arxiv.org/abs/2604.04702v1"), "2604.04702")
        self.assertEqual(normalize_arxiv_id("arXiv:2604.04702v2"), "2604.04702")
        self.assertEqual(normalize_arxiv_id("http://arxiv.org/abs/math/0301234v2"), "math/0301234")

    def test_normalize_arxiv_abs_url_uses_https_abs_links(self) -> None:
        self.assertEqual(
            normalize_arxiv_abs_url("http://arxiv.org/abs/2604.04702v1"),
            "https://arxiv.org/abs/2604.04702v1",
        )
        self.assertEqual(
            normalize_arxiv_abs_url("arXiv:2604.04702v2"),
            "https://arxiv.org/abs/2604.04702v2",
        )
        self.assertEqual(
            normalize_arxiv_abs_url("/abs/math/0301234v2"),
            "https://arxiv.org/abs/math/0301234v2",
        )
        self.assertEqual(
            normalize_arxiv_abs_url("", fallback_paper_id="2604.04702"),
            "https://arxiv.org/abs/2604.04702",
        )

    def test_build_id_list_query_url_uses_canonical_non_versioned_ids(self) -> None:
        url = build_id_list_query_url(["2604.04702v1", "http://arxiv.org/abs/2604.04703v2"])
        params = parse_qs(urlparse(url).query)

        self.assertEqual(params["id_list"][0], "2604.04702,2604.04703")

    def test_fetch_latest_by_categories_paginates_and_dedupes(self) -> None:
        first_page = _build_feed(
            """
  <entry>
    <id>http://arxiv.org/abs/2604.10001</id>
    <updated>2026-04-04T03:00:00Z</updated>
    <published>2026-04-04T03:00:00Z</published>
    <title>Neural operator methods</title>
    <summary>Operator learning for science.</summary>
    <author><name>Author One</name></author>
    <category term="cs.LG" />
  </entry>
"""
        )
        second_page = _build_feed(
            """
  <entry>
    <id>http://arxiv.org/abs/2604.10002</id>
    <updated>2026-04-04T04:00:00Z</updated>
    <published>2026-04-04T04:00:00Z</published>
    <title>Second neural operator paper</title>
    <summary>Scientific machine learning.</summary>
    <author><name>Author Two</name></author>
    <category term="cs.LG" />
  </entry>
"""
        )
        duplicate_page = _build_feed(
            """
  <entry>
    <id>http://arxiv.org/abs/2604.10001</id>
    <updated>2026-04-04T03:00:00Z</updated>
    <published>2026-04-04T03:00:00Z</published>
    <title>Neural operator methods</title>
    <summary>Operator learning for science.</summary>
    <author><name>Author One</name></author>
    <category term="cs.LG" />
  </entry>
"""
        )
        empty_page = _build_feed("")

        def fake_fetch(
            search_query: str,
            start: int = 0,
            max_results: int = 100,
            sort_by: str = "submittedDate",
            sort_order: str = "descending",
        ) -> feedparser.FeedParserDict:
            self.assertEqual(sort_by, "submittedDate")
            self.assertEqual(sort_order, "descending")
            if "cat:cs.LG" in search_query and start == 0:
                return first_page
            if "cat:cs.LG" in search_query and start == 1:
                return second_page
            if "cat:cs.LG" in search_query and start == 2:
                return empty_page
            if "cat:cs.AI" in search_query and start == 0:
                return duplicate_page
            return empty_page

        with patch("app.arxiv_api_client._fetch_api_feed", side_effect=fake_fetch) as mocked_fetch:
            papers = fetch_latest_by_categories(
                categories=["cs.LG", "cs.AI"],
                domain_buckets=self.domains,
                global_keywords=self.global_keywords,
                limit_per_cat=2,
                page_size=1,
            )

        self.assertEqual(mocked_fetch.call_count, 4)
        self.assertEqual(sorted(paper.paper_id for paper in papers), ["2604.10001", "2604.10002"])

    def test_fetch_window_by_categories_returns_window_stats(self) -> None:
        window_feed = _build_feed(
            """
  <entry>
    <id>http://arxiv.org/abs/2604.20001</id>
    <updated>2026-04-04T05:00:00Z</updated>
    <published>2026-04-04T05:00:00Z</published>
    <title>Single-cell neural network method</title>
    <summary>Single-cell analysis with neural network priors.</summary>
    <author><name>Author A</name></author>
    <category term="q-bio.GN" />
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2604.20002</id>
    <updated>2026-04-04T05:30:00Z</updated>
    <published>2026-04-04T05:30:00Z</published>
    <title>Single-cell clustering baseline</title>
    <summary>Single-cell processing without the CS-side signal.</summary>
    <author><name>Author B</name></author>
    <category term="q-bio.GN" />
  </entry>
"""
        )
        empty_page = _build_feed("")

        def fake_fetch(
            search_query: str,
            start: int = 0,
            max_results: int = 100,
            sort_by: str = "submittedDate",
            sort_order: str = "descending",
        ) -> feedparser.FeedParserDict:
            self.assertIn("submittedDate:[202604040000 TO 202604041200]", search_query)
            if start == 0:
                return window_feed
            return empty_page

        with patch("app.arxiv_api_client._fetch_api_feed", side_effect=fake_fetch):
            result = fetch_window_by_categories(
                categories=["q-bio.GN"],
                domain_buckets=self.domains,
                global_keywords=self.global_keywords,
                window_start=datetime(2026, 4, 4, 0, 0, tzinfo=timezone.utc),
                window_end=datetime(2026, 4, 4, 12, 0, tzinfo=timezone.utc),
                limit_per_cat=5,
                page_size=5,
            )

        self.assertEqual(result.candidate_count_before_filter, 2)
        self.assertEqual(result.candidate_count_after_filter, 1)
        self.assertEqual([paper.paper_id for paper in result.papers], ["2604.20001"])

    def test_fetch_window_by_categories_exact_filters_same_minute_boundaries(self) -> None:
        boundary_feed = _build_feed(
            """
  <entry>
    <id>http://arxiv.org/abs/2604.21001</id>
    <updated>2026-04-04T05:30:10Z</updated>
    <published>2026-04-04T05:30:10Z</published>
    <title>Neural operator early paper</title>
    <summary>Operator learning for science.</summary>
    <author><name>Author Early</name></author>
    <category term="cs.LG" />
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2604.21002</id>
    <updated>2026-04-04T05:30:50Z</updated>
    <published>2026-04-04T05:30:50Z</published>
    <title>Neural operator late paper</title>
    <summary>Operator learning for science.</summary>
    <author><name>Author Late</name></author>
    <category term="cs.LG" />
  </entry>
"""
        )

        def fake_fetch(
            search_query: str,
            start: int = 0,
            max_results: int = 100,
            sort_by: str = "submittedDate",
            sort_order: str = "descending",
        ) -> feedparser.FeedParserDict:
            self.assertIn("submittedDate:[202604040530 TO 202604040531]", search_query)
            if start == 0:
                return boundary_feed
            return _build_feed("")

        with patch("app.arxiv_api_client._fetch_api_feed", side_effect=fake_fetch):
            result = fetch_window_by_categories(
                categories=["cs.LG"],
                domain_buckets=self.domains,
                global_keywords=self.global_keywords,
                window_start=datetime(2026, 4, 4, 5, 30, 30, tzinfo=timezone.utc),
                window_end=datetime(2026, 4, 4, 5, 31, 0, tzinfo=timezone.utc),
                limit_per_cat=10,
                page_size=10,
            )

        self.assertEqual(result.candidate_count_before_filter, 1)
        self.assertEqual(result.candidate_count_after_filter, 1)
        self.assertEqual([paper.paper_id for paper in result.papers], ["2604.21002"])

    def test_consecutive_windows_do_not_duplicate_or_miss_boundary_papers(self) -> None:
        first_feed = _build_feed(
            """
  <entry>
    <id>http://arxiv.org/abs/2604.22001</id>
    <updated>2026-04-04T05:30:00Z</updated>
    <published>2026-04-04T05:30:00Z</published>
    <title>Neural operator boundary paper</title>
    <summary>Operator learning for science.</summary>
    <author><name>Author Boundary</name></author>
    <category term="cs.LG" />
  </entry>
"""
        )
        second_feed = _build_feed(
            """
  <entry>
    <id>http://arxiv.org/abs/2604.22001</id>
    <updated>2026-04-04T05:30:00Z</updated>
    <published>2026-04-04T05:30:00Z</published>
    <title>Neural operator boundary paper</title>
    <summary>Operator learning for science.</summary>
    <author><name>Author Boundary</name></author>
    <category term="cs.LG" />
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2604.22002</id>
    <updated>2026-04-04T05:30:40Z</updated>
    <published>2026-04-04T05:30:40Z</published>
    <title>Neural operator next paper</title>
    <summary>Operator learning for science.</summary>
    <author><name>Author Next</name></author>
    <category term="cs.LG" />
  </entry>
"""
        )

        def fake_fetch(
            search_query: str,
            start: int = 0,
            max_results: int = 100,
            sort_by: str = "submittedDate",
            sort_order: str = "descending",
        ) -> feedparser.FeedParserDict:
            if start > 0:
                return _build_feed("")
            if "submittedDate:[202604040529 TO 202604040530]" in search_query:
                return first_feed
            if "submittedDate:[202604040530 TO 202604040531]" in search_query:
                return second_feed
            return _build_feed("")

        with patch("app.arxiv_api_client._fetch_api_feed", side_effect=fake_fetch):
            first_result = fetch_window_by_categories(
                categories=["cs.LG"],
                domain_buckets=self.domains,
                global_keywords=self.global_keywords,
                window_start=datetime(2026, 4, 4, 5, 29, 0, tzinfo=timezone.utc),
                window_end=datetime(2026, 4, 4, 5, 30, 0, tzinfo=timezone.utc),
                limit_per_cat=10,
                page_size=10,
            )
            second_result = fetch_window_by_categories(
                categories=["cs.LG"],
                domain_buckets=self.domains,
                global_keywords=self.global_keywords,
                window_start=datetime(2026, 4, 4, 5, 30, 0, tzinfo=timezone.utc),
                window_end=datetime(2026, 4, 4, 5, 31, 0, tzinfo=timezone.utc),
                limit_per_cat=10,
                page_size=10,
            )

        self.assertEqual([paper.paper_id for paper in first_result.papers], [])
        self.assertEqual([paper.paper_id for paper in second_result.papers], ["2604.22001", "2604.22002"])


if __name__ == "__main__":
    unittest.main()
