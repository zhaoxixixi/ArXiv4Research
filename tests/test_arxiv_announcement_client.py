from __future__ import annotations

import unittest
from datetime import date, datetime, timezone
from unittest.mock import patch

from app.arxiv_announcement_client import fetch_announcements_by_categories, parse_announcement_list_html
from app.models import DomainBucket, Paper


class ArxivAnnouncementClientTests(unittest.TestCase):
    def test_parse_recent_page_extracts_dates_skips_and_ids(self) -> None:
        html = """
        <div class="list-dates">
          <a href="/list/cs.LG/recent?skip=0&show=50">Tue, 7 Apr 2026</a>
          <a href="/list/cs.LG/recent?skip=327&show=50">Mon, 6 Apr 2026</a>
        </div>
        <h3>Tue, 7 Apr 2026 (showing first 50 of 327 entries )</h3>
        <dl>
          <dt><a href="/abs/2604.00001">arXiv:2604.00001</a></dt>
          <dt><a href="/abs/2604.00002">arXiv:2604.00002</a></dt>
        </dl>
        <h3>Mon, 6 Apr 2026 (showing 12 of 12 entries )</h3>
        <dl>
          <dt><a href="/abs/2604.00003">arXiv:2604.00003</a></dt>
        </dl>
        """

        parsed = parse_announcement_list_html(html=html, category="cs.LG")

        self.assertEqual(parsed.available_dates, [date(2026, 4, 6), date(2026, 4, 7)])
        self.assertEqual(parsed.date_skips[date(2026, 4, 7)], 0)
        self.assertEqual(parsed.date_skips[date(2026, 4, 6)], 327)
        self.assertEqual(parsed.day_entry_counts[date(2026, 4, 7)], 327)
        self.assertEqual(parsed.day_entry_counts[date(2026, 4, 6)], 12)
        self.assertEqual([item.paper_id for item in parsed.items], ["2604.00001", "2604.00002", "2604.00003"])
        self.assertTrue(all(item.section == "recent" for item in parsed.items))

    def test_fetch_announcements_uses_recent_skip_pages_for_newer_dates(self) -> None:
        root_html = """
        <div class="list-dates">
          <a href="/list/cs.LG/recent?skip=0&show=2000">Tue, 7 Apr 2026</a>
          <a href="/list/cs.LG/recent?skip=327&show=2000">Mon, 6 Apr 2026</a>
        </div>
        <h3>Tue, 7 Apr 2026 (showing first 50 of 327 entries )</h3>
        <dl>
          <dt><a href="/abs/2604.00001">arXiv:2604.00001</a></dt>
        </dl>
        <h3>Mon, 6 Apr 2026 (showing 12 of 12 entries )</h3>
        <dl>
          <dt><a href="/abs/2604.00002">arXiv:2604.00002</a></dt>
        </dl>
        """
        domains = [
            DomainBucket(
                name="ai4science",
                priority=90,
                categories=["cs.LG"],
                keywords=["operator"],
                filter_mode="soft",
                cross_keywords=[],
            )
        ]
        paper = Paper(
            paper_id="2604.00001",
            title="Operator transfer",
            summary="A transferable operator model.",
            authors=["Author"],
            categories=["cs.LG"],
            published="2026-04-07T00:00:00Z",
            link="https://arxiv.org/abs/2604.00001",
            domain="ai4science",
        )

        def fake_fetch(url: str) -> str:
            if "skip=0&show=2000" in url:
                return root_html
            raise AssertionError(f"Unexpected URL: {url}")

        with (
            patch("app.arxiv_announcement_client.fetch_arxiv_text", side_effect=fake_fetch),
            patch("app.arxiv_announcement_client.fetch_papers_by_ids", return_value=[paper]) as mocked_fetch_ids,
        ):
            result = fetch_announcements_by_categories(
                categories=["cs.LG"],
                domain_buckets=domains,
                global_keywords=["operator"],
                last_processed_announcement_date=date(2026, 4, 6),
                lookback_days_if_no_state=7,
                now_utc=datetime(2026, 4, 8, 0, 0, tzinfo=timezone.utc),
            )

        mocked_fetch_ids.assert_called_once_with(
            paper_ids=["2604.00001"],
            domain_buckets=domains,
            global_keywords=["operator"],
            apply_filters=False,
        )
        self.assertEqual(result.announcement_dates, ["2026-04-07"])
        self.assertEqual(result.latest_announcement_date, "2026-04-07")
        self.assertEqual(result.candidate_count_before_filter, 1)
        self.assertEqual(result.candidate_count_after_filter, 1)
        self.assertEqual([paper.paper_id for paper in result.papers], ["2604.00001"])

    def test_seen_announcement_date_with_zero_items_still_advances_boundary(self) -> None:
        root_html = """
        <div class="list-dates">
          <a href="/list/cs.LG/recent?skip=0&show=2000">Tue, 7 Apr 2026</a>
        </div>
        <h3>Tue, 7 Apr 2026 (showing 0 of 0 entries )</h3>
        """
        domains = [
            DomainBucket(
                name="ai4science",
                priority=90,
                categories=["cs.LG"],
                keywords=["operator"],
                filter_mode="soft",
                cross_keywords=[],
            )
        ]

        def fake_fetch(url: str) -> str:
            if "skip=0&show=2000" in url:
                return root_html
            raise AssertionError(f"Unexpected URL: {url}")

        with (
            patch("app.arxiv_announcement_client.fetch_arxiv_text", side_effect=fake_fetch),
            patch("app.arxiv_announcement_client.fetch_papers_by_ids") as mocked_fetch_ids,
        ):
            result = fetch_announcements_by_categories(
                categories=["cs.LG"],
                domain_buckets=domains,
                global_keywords=["operator"],
                last_processed_announcement_date=date(2026, 4, 6),
                lookback_days_if_no_state=7,
                now_utc=datetime(2026, 4, 8, 0, 0, tzinfo=timezone.utc),
            )

        mocked_fetch_ids.assert_not_called()
        self.assertEqual(result.announcement_dates, ["2026-04-07"])
        self.assertEqual(result.latest_announcement_date, "2026-04-07")
        self.assertEqual(result.candidate_count_before_filter, 0)
        self.assertEqual(result.candidate_count_after_filter, 0)
        self.assertEqual(result.papers, [])


if __name__ == "__main__":
    unittest.main()
