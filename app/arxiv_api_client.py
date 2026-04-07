from __future__ import annotations

from datetime import datetime, timezone
from dataclasses import dataclass
from html import unescape as html_unescape
import re
from typing import Iterable
from urllib.parse import urlencode

import feedparser

from .arxiv_client import (
    _apply_domain_filter,
    _parse_authors,
    _parse_categories,
    _pick_domain,
)
from .models import DomainBucket, Paper
from .arxiv_transport import fetch_arxiv_response

ARXIV_API_ENDPOINT = "https://export.arxiv.org/api/query"
DEFAULT_API_SORT_BY = "submittedDate"
DEFAULT_API_SORT_ORDER = "descending"
DEFAULT_API_PAGE_SIZE = 100


@dataclass
class WindowFetchResult:
    papers: list[Paper]
    candidate_count_before_filter: int
    candidate_count_after_filter: int


def normalize_arxiv_id(value: str) -> str:
    """Normalize an arXiv id to a canonical non-versioned form."""

    normalized = str(value or "").strip()
    if not normalized:
        return ""

    if normalized.lower().startswith("arxiv:"):
        normalized = normalized.split(":", 1)[1]
    elif "/abs/" in normalized:
        normalized = normalized.split("/abs/", 1)[1]

    return normalized.rsplit("v", 1)[0] if re.search(r"v\d+$", normalized) else normalized


def _format_submitted_date(dt: datetime) -> str:
    """Format a datetime for arXiv API submittedDate range filters."""

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.strftime("%Y%m%d%H%M")


def _parse_published_datetime(value: str) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _paper_is_in_exact_window(paper: Paper, window_start: datetime, window_end: datetime) -> bool:
    published_at = _parse_published_datetime(paper.published)
    if published_at is None:
        return True
    return window_start <= published_at < window_end


def _filter_paper_map_to_exact_window(
    papers: dict[str, Paper],
    window_start: datetime,
    window_end: datetime,
) -> dict[str, Paper]:
    return {
        paper_id: paper
        for paper_id, paper in papers.items()
        if _paper_is_in_exact_window(paper, window_start, window_end)
    }


def build_category_search_query(
    category: str,
    submitted_start: datetime | None = None,
    submitted_end: datetime | None = None,
    extra_clause: str | None = None,
) -> str:
    """Build an arXiv API `search_query` string for one category."""

    query_parts = [f"cat:{category}"]

    if extra_clause:
        query_parts.append(extra_clause.strip())

    if submitted_start or submitted_end:
        if submitted_start is None or submitted_end is None:
            raise ValueError("submitted_start and submitted_end must be provided together")
        date_clause = (
            f"submittedDate:[{_format_submitted_date(submitted_start)} "
            f"TO {_format_submitted_date(submitted_end)}]"
        )
        query_parts.append(date_clause)

    return " AND ".join(part for part in query_parts if part)


def build_query_url(
    search_query: str,
    start: int = 0,
    max_results: int = DEFAULT_API_PAGE_SIZE,
    sort_by: str = DEFAULT_API_SORT_BY,
    sort_order: str = DEFAULT_API_SORT_ORDER,
) -> str:
    """Build a complete arXiv API request URL."""

    params = {
        "search_query": search_query,
        "start": max(0, int(start)),
        "max_results": max(1, int(max_results)),
        "sortBy": sort_by,
        "sortOrder": sort_order,
    }
    return f"{ARXIV_API_ENDPOINT}?{urlencode(params)}"


def _normalize_published(value: str) -> str:
    if not value:
        return value
    try:
        return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").isoformat() + "Z"
    except ValueError:
        return value


def _entry_to_paper(entry: dict, domain_buckets: list[DomainBucket]) -> Paper:
    paper_id = normalize_arxiv_id(entry.get("id", ""))
    title = html_unescape(entry.title).strip().replace("\n", " ")
    summary = html_unescape(entry.summary).strip().replace("\n", " ")
    categories = _parse_categories(entry)
    link = entry.get("id", f"https://arxiv.org/abs/{paper_id}")

    paper = Paper(
        paper_id=paper_id,
        title=title,
        summary=summary,
        authors=_parse_authors(entry),
        categories=categories,
        published=_normalize_published(entry.get("published", "")),
        link=link,
    )
    paper.domain = _pick_domain(categories, domain_buckets)
    return paper


def parse_api_entries(
    entries: Iterable[dict],
    domain_buckets: list[DomainBucket],
    global_keywords: list[str],
    apply_filters: bool = True,
) -> list[Paper]:
    """Parse Atom entries from the arXiv API into `Paper` objects."""

    papers: list[Paper] = []
    for entry in entries:
        paper = _entry_to_paper(entry, domain_buckets)
        if apply_filters and not _apply_domain_filter(paper, domain_buckets, global_keywords):
            continue
        papers.append(paper)
    return papers


def parse_api_feed(
    payload: bytes | str,
    domain_buckets: list[DomainBucket],
    global_keywords: list[str],
    apply_filters: bool = True,
) -> list[Paper]:
    """Parse a raw arXiv API Atom payload into `Paper` objects."""

    feed = feedparser.parse(payload)
    return parse_api_entries(feed.entries, domain_buckets, global_keywords, apply_filters=apply_filters)


def _fetch_api_feed(
    search_query: str,
    start: int = 0,
    max_results: int = DEFAULT_API_PAGE_SIZE,
    sort_by: str = DEFAULT_API_SORT_BY,
    sort_order: str = DEFAULT_API_SORT_ORDER,
) -> feedparser.FeedParserDict:
    url = build_query_url(
        search_query=search_query,
        start=start,
        max_results=max_results,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    body, _charset = fetch_arxiv_response(
        url,
        accept="application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
    )
    return feedparser.parse(body or b"")


def _fetch_categories_impl(
    categories: Iterable[str],
    domain_buckets: list[DomainBucket],
    global_keywords: list[str],
    limit_per_cat: int = 120,
    page_size: int = DEFAULT_API_PAGE_SIZE,
    sort_by: str = DEFAULT_API_SORT_BY,
    sort_order: str = DEFAULT_API_SORT_ORDER,
    submitted_start: datetime | None = None,
    submitted_end: datetime | None = None,
    extra_clause: str | None = None,
) -> WindowFetchResult:
    """Fetch arXiv API metadata for multiple categories and summarize unique candidates.

    When a submitted-date window is provided, we still query arXiv with minute-level bounds,
    but we exact-filter returned papers locally using the half-open interval
    ``[submitted_start, submitted_end)`` based on the per-entry published timestamp.
    This avoids duplicate or missed papers around consecutive window boundaries.
    """

    raw_collected: dict[str, Paper] = {}
    filtered_collected: dict[str, Paper] = {}
    safe_page_size = max(1, min(int(page_size), max(1, int(limit_per_cat))))

    for category in categories:
        search_query = build_category_search_query(
            category=category,
            submitted_start=submitted_start,
            submitted_end=submitted_end,
            extra_clause=extra_clause,
        )
        start_index = 0
        remaining = max(0, int(limit_per_cat))

        while remaining > 0:
            batch_size = min(safe_page_size, remaining)
            feed = _fetch_api_feed(
                search_query=search_query,
                start=start_index,
                max_results=batch_size,
                sort_by=sort_by,
                sort_order=sort_order,
            )
            entries = list(feed.entries)
            if not entries:
                break

            for paper in parse_api_entries(entries, domain_buckets, global_keywords, apply_filters=False):
                raw_collected[paper.paper_id] = paper
                if _apply_domain_filter(paper, domain_buckets, global_keywords):
                    filtered_collected[paper.paper_id] = paper

            entry_count = len(entries)
            if entry_count < batch_size:
                break

            start_index += entry_count
            remaining -= entry_count

    if submitted_start is not None and submitted_end is not None:
        exact_start = submitted_start.astimezone(timezone.utc)
        exact_end = submitted_end.astimezone(timezone.utc)
        raw_collected = _filter_paper_map_to_exact_window(raw_collected, exact_start, exact_end)
        filtered_collected = _filter_paper_map_to_exact_window(filtered_collected, exact_start, exact_end)

    return WindowFetchResult(
        papers=list(filtered_collected.values()),
        candidate_count_before_filter=len(raw_collected),
        candidate_count_after_filter=len(filtered_collected),
    )


def fetch_latest_by_categories(
    categories: Iterable[str],
    domain_buckets: list[DomainBucket],
    global_keywords: list[str],
    limit_per_cat: int = 120,
    page_size: int = DEFAULT_API_PAGE_SIZE,
    sort_by: str = DEFAULT_API_SORT_BY,
    sort_order: str = DEFAULT_API_SORT_ORDER,
    submitted_start: datetime | None = None,
    submitted_end: datetime | None = None,
    extra_clause: str | None = None,
) -> list[Paper]:
    """Fetch arXiv API metadata for multiple categories and return only papers."""

    result = _fetch_categories_impl(
        categories=categories,
        domain_buckets=domain_buckets,
        global_keywords=global_keywords,
        limit_per_cat=limit_per_cat,
        page_size=page_size,
        sort_by=sort_by,
        sort_order=sort_order,
        submitted_start=submitted_start,
        submitted_end=submitted_end,
        extra_clause=extra_clause,
    )
    return result.papers


def fetch_window_by_categories(
    categories: Iterable[str],
    domain_buckets: list[DomainBucket],
    global_keywords: list[str],
    window_start: datetime,
    window_end: datetime,
    limit_per_cat: int = 200,
    page_size: int = DEFAULT_API_PAGE_SIZE,
    sort_by: str = DEFAULT_API_SORT_BY,
    sort_order: str = DEFAULT_API_SORT_ORDER,
    extra_clause: str | None = None,
) -> WindowFetchResult:
    """Fetch papers for a strict submitted-date window across multiple categories.

    Window semantics are half-open: papers are kept iff ``window_start <= published < window_end``.
    """

    return _fetch_categories_impl(
        categories=categories,
        domain_buckets=domain_buckets,
        global_keywords=global_keywords,
        limit_per_cat=limit_per_cat,
        page_size=page_size,
        sort_by=sort_by,
        sort_order=sort_order,
        submitted_start=window_start,
        submitted_end=window_end,
        extra_clause=extra_clause,
    )


def build_id_list_query_url(paper_ids: Iterable[str], max_results: int | None = None) -> str:
    """Build an arXiv API query URL for an explicit list of paper ids."""

    unique_ids = [normalize_arxiv_id(paper_id) for paper_id in paper_ids if normalize_arxiv_id(paper_id)]
    params = {"id_list": ",".join(unique_ids)}
    if max_results is not None:
        params["max_results"] = max(1, int(max_results))
    return f"{ARXIV_API_ENDPOINT}?{urlencode(params)}"



def fetch_papers_by_ids(
    paper_ids: Iterable[str],
    domain_buckets: list[DomainBucket],
    global_keywords: list[str],
    batch_size: int = 50,
    apply_filters: bool = False,
) -> list[Paper]:
    """Fetch explicit paper ids from the arXiv API in small batches."""

    unique_ids: list[str] = []
    seen: set[str] = set()
    for paper_id in paper_ids:
        normalized = normalize_arxiv_id(paper_id)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        unique_ids.append(normalized)

    if not unique_ids:
        return []

    papers_by_id: dict[str, Paper] = {}
    safe_batch_size = max(1, int(batch_size))
    for start in range(0, len(unique_ids), safe_batch_size):
        batch = unique_ids[start : start + safe_batch_size]
        url = build_id_list_query_url(batch, max_results=len(batch))
        body, _charset = fetch_arxiv_response(
            url,
            accept="application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
        )
        feed = feedparser.parse(body or b"")
        for paper in parse_api_entries(feed.entries, domain_buckets, global_keywords, apply_filters=apply_filters):
            papers_by_id[paper.paper_id] = paper

    return [papers_by_id[paper_id] for paper_id in unique_ids if paper_id in papers_by_id]
