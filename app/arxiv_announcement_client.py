from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from html.parser import HTMLParser
import logging
import re
from typing import Iterable
from urllib.parse import parse_qs, urlparse

from .arxiv_api_client import fetch_papers_by_ids
from .arxiv_client import _apply_domain_filter
from .arxiv_transport import fetch_arxiv_text
from .models import DomainBucket, Paper

logger = logging.getLogger(__name__)

ARXIV_RECENT_INDEX_SHOW = 2000
ARXIV_RECENT_DETAIL_SHOW = 2000
_DATE_PATTERNS = [
    "%a, %d %b %Y",
    "%A, %d %B %Y",
]
_DATE_REGEXES = [
    re.compile(r"(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+\d{1,2}\s+[A-Za-z]{3}\s+\d{4}"),
    re.compile(
        r"(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+\d{1,2}\s+[A-Za-z]+\s+\d{4}"
    ),
]
_ABS_HREF_RE = re.compile(r"/abs/([^?#\"'>]+)")
_SHOWING_COUNTS_RE = re.compile(r"showing(?:\s+first)?\s+(\d+)\s+of\s+(\d+)\s+entries", re.IGNORECASE)


@dataclass
class AnnouncementListItem:
    paper_id: str
    announcement_date: date
    section: str
    category: str


@dataclass
class AnnouncementPageParseResult:
    items: list[AnnouncementListItem]
    available_dates: list[date]
    date_skips: dict[date, int]
    day_entry_counts: dict[date, int]


@dataclass
class AnnouncementFetchResult:
    papers: list[Paper]
    candidate_count_before_filter: int
    candidate_count_after_filter: int
    announcement_dates: list[str]
    latest_announcement_date: str | None


class _RecentAnnouncementParser(HTMLParser):
    def __init__(self, category: str) -> None:
        super().__init__(convert_charrefs=True)
        self.category = category
        self.items: list[AnnouncementListItem] = []
        self.available_dates: set[date] = set()
        self.date_skips: dict[date, int] = {}
        self.day_entry_counts: dict[date, int] = {}
        self.current_date: date | None = None
        self._in_heading = False
        self._heading_chunks: list[str] = []
        self._in_anchor = False
        self._anchor_href = ""
        self._anchor_text_chunks: list[str] = []
        self._in_dt = False
        self._seen_item_keys: set[tuple[str, date]] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        lowered = tag.lower()
        if lowered in {"h1", "h2", "h3", "h4"}:
            self._in_heading = True
            self._heading_chunks = []
            return

        if lowered == "dt":
            self._in_dt = True
            return

        if lowered == "a":
            attr_map = dict(attrs)
            self._in_anchor = True
            self._anchor_href = attr_map.get("href") or ""
            self._anchor_text_chunks = []

            if not self._in_dt:
                return

            match = _ABS_HREF_RE.search(self._anchor_href)
            if not match or self.current_date is None:
                return

            paper_id = match.group(1)
            key = (paper_id, self.current_date)
            if key in self._seen_item_keys:
                return

            self._seen_item_keys.add(key)
            self.items.append(
                AnnouncementListItem(
                    paper_id=paper_id,
                    announcement_date=self.current_date,
                    section="recent",
                    category=self.category,
                )
            )

    def handle_endtag(self, tag: str) -> None:
        lowered = tag.lower()
        if lowered in {"h1", "h2", "h3", "h4"} and self._in_heading:
            self._consume_heading(" ".join(self._heading_chunks))
            self._in_heading = False
            self._heading_chunks = []
            return

        if lowered == "a" and self._in_anchor:
            self._consume_anchor(" ".join(self._anchor_text_chunks), self._anchor_href)
            self._in_anchor = False
            self._anchor_href = ""
            self._anchor_text_chunks = []
            return

        if lowered == "dt":
            self._in_dt = False

    def handle_data(self, data: str) -> None:
        text = data.strip()
        if not text:
            return
        if self._in_heading:
            self._heading_chunks.append(text)
        if self._in_anchor:
            self._anchor_text_chunks.append(text)

    def _consume_heading(self, text: str) -> None:
        heading = " ".join(text.replace("\xa0", " ").split())
        if not heading:
            return

        parsed_date = _extract_announcement_date(heading)
        if parsed_date is None:
            return

        self.current_date = parsed_date
        self.available_dates.add(parsed_date)

        counts_match = _SHOWING_COUNTS_RE.search(heading)
        if counts_match:
            self.day_entry_counts[parsed_date] = int(counts_match.group(2))

    def _consume_anchor(self, text: str, href: str) -> None:
        parsed_date = _extract_announcement_date(text)
        if parsed_date is None:
            return

        self.available_dates.add(parsed_date)
        skip = _extract_skip(href)
        if skip is not None:
            self.date_skips[parsed_date] = skip


def _extract_announcement_date(text: str) -> date | None:
    normalized = " ".join(text.replace("\xa0", " ").split())
    if not normalized:
        return None

    candidates = [normalized]
    if " for " in normalized:
        candidates.insert(0, normalized.split(" for ", 1)[1])

    for candidate in candidates:
        for regex in _DATE_REGEXES:
            match = regex.search(candidate)
            if not match:
                continue
            raw = match.group(0)
            for pattern in _DATE_PATTERNS:
                try:
                    return datetime.strptime(raw, pattern).date()
                except ValueError:
                    continue
    return None


def _extract_skip(href: str) -> int | None:
    if not href:
        return None
    query = parse_qs(urlparse(href).query)
    values = query.get("skip")
    if not values:
        return None
    try:
        return max(0, int(values[0]))
    except (TypeError, ValueError):
        return None


def _build_recent_url(category: str, skip: int = 0, show: int = ARXIV_RECENT_INDEX_SHOW) -> str:
    safe_skip = max(0, int(skip))
    safe_show = max(1, int(show))
    return f"https://arxiv.org/list/{category}/recent?skip={safe_skip}&show={safe_show}"


def parse_announcement_list_html(html: str, category: str) -> AnnouncementPageParseResult:
    parser = _RecentAnnouncementParser(category=category)
    parser.feed(html or "")
    parser.close()
    return AnnouncementPageParseResult(
        items=parser.items,
        available_dates=sorted(parser.available_dates),
        date_skips=parser.date_skips,
        day_entry_counts=parser.day_entry_counts,
    )


def _select_target_dates(
    available_dates: Iterable[date],
    last_processed_announcement_date: date | None,
    lookback_days_if_no_state: int,
    now_utc: datetime,
) -> list[date]:
    unique_dates = sorted(set(available_dates))
    if not unique_dates:
        return []

    if last_processed_announcement_date is not None:
        return [d for d in unique_dates if d > last_processed_announcement_date]

    lookback_days = max(1, int(lookback_days_if_no_state))
    floor = now_utc.date() - timedelta(days=lookback_days - 1)
    return [d for d in unique_dates if d >= floor]


def _sort_papers_by_announcement_date(papers: Iterable[Paper], paper_dates: dict[str, set[date]]) -> list[Paper]:
    def _sort_key(paper: Paper) -> tuple[str, str, str]:
        dates = sorted(paper_dates.get(paper.paper_id, set()), reverse=True)
        latest = dates[0].isoformat() if dates else ""
        return (latest, paper.published or "", paper.paper_id)

    return sorted(papers, key=_sort_key, reverse=True)


def _collect_items_for_date(
    category: str,
    target_date: date,
    skip: int,
    parsed_pages_by_skip: dict[int, AnnouncementPageParseResult],
) -> list[AnnouncementListItem]:
    parsed = parsed_pages_by_skip.get(skip)
    if parsed is None:
        detail_html = fetch_arxiv_text(_build_recent_url(category=category, skip=skip, show=ARXIV_RECENT_DETAIL_SHOW))
        if not detail_html:
            logger.warning(
                "Empty arXiv recent detail page for %s (%s, skip=%s)",
                category,
                target_date.isoformat(),
                skip,
            )
            return []
        parsed = parse_announcement_list_html(html=detail_html, category=category)
        parsed_pages_by_skip[skip] = parsed

    return [item for item in parsed.items if item.announcement_date == target_date]


def fetch_announcements_by_categories(
    categories: Iterable[str],
    domain_buckets: list[DomainBucket],
    global_keywords: list[str],
    last_processed_announcement_date: date | None = None,
    lookback_days_if_no_state: int = 7,
    now_utc: datetime | None = None,
) -> AnnouncementFetchResult:
    now = (now_utc or datetime.now(timezone.utc)).astimezone(timezone.utc)

    processed_dates: set[date] = set()
    selected_paper_dates: dict[str, set[date]] = {}

    for category in categories:
        root_html = fetch_arxiv_text(_build_recent_url(category=category, skip=0, show=ARXIV_RECENT_INDEX_SHOW))
        if not root_html:
            logger.warning("Empty arXiv recent page for %s", category)
            continue

        root_parsed = parse_announcement_list_html(html=root_html, category=category)
        category_available_dates = set(root_parsed.available_dates) | set(root_parsed.date_skips)
        target_dates = set(
            _select_target_dates(
                available_dates=category_available_dates,
                last_processed_announcement_date=last_processed_announcement_date,
                lookback_days_if_no_state=lookback_days_if_no_state,
                now_utc=now,
            )
        )
        if not target_dates:
            continue

        processed_dates.update(target_dates)
        parsed_pages_by_skip: dict[int, AnnouncementPageParseResult] = {0: root_parsed}
        for target_date in sorted(target_dates, reverse=True):
            skip = root_parsed.date_skips.get(target_date)
            if skip is None:
                if target_date in category_available_dates:
                    skip = 0
                else:
                    logger.warning("Missing skip link for %s on %s", category, target_date.isoformat())
                    continue

            items = _collect_items_for_date(
                category=category,
                target_date=target_date,
                skip=skip,
                parsed_pages_by_skip=parsed_pages_by_skip,
            )
            for item in items:
                selected_paper_dates.setdefault(item.paper_id, set()).add(item.announcement_date)

    processed_date_strings = [d.isoformat() for d in sorted(processed_dates, reverse=True)]
    selected_ids = sorted(selected_paper_dates)
    if not selected_ids:
        return AnnouncementFetchResult(
            papers=[],
            candidate_count_before_filter=0,
            candidate_count_after_filter=0,
            announcement_dates=processed_date_strings,
            latest_announcement_date=processed_date_strings[0] if processed_date_strings else None,
        )

    all_papers = fetch_papers_by_ids(
        paper_ids=selected_ids,
        domain_buckets=domain_buckets,
        global_keywords=global_keywords,
        apply_filters=False,
    )
    paper_map = {paper.paper_id: paper for paper in all_papers}

    filtered_papers: list[Paper] = []
    for paper_id in selected_ids:
        paper = paper_map.get(paper_id)
        if paper is None:
            logger.warning("Missing API metadata for announced paper %s", paper_id)
            continue
        if _apply_domain_filter(paper, domain_buckets, global_keywords):
            filtered_papers.append(paper)

    sorted_papers = _sort_papers_by_announcement_date(filtered_papers, selected_paper_dates)
    return AnnouncementFetchResult(
        papers=sorted_papers,
        candidate_count_before_filter=len(selected_ids),
        candidate_count_after_filter=len(sorted_papers),
        announcement_dates=processed_date_strings,
        latest_announcement_date=processed_date_strings[0] if processed_date_strings else None,
    )
