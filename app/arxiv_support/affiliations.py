from __future__ import annotations

from html import unescape as html_unescape
from html.parser import HTMLParser
import json
import logging
import re
from typing import Any, Iterable

from ..arxiv_transport import fetch_arxiv_text
from ..models import Paper
from .parsing import _dedupe_preserve_order

logger = logging.getLogger(__name__)

META_AFFILIATION_NAMES = {
    "citation_author_institution",
    "citation_author_affiliation",
}
LATEX_AFFILIATION_COMMANDS = (
    "orgdiv",
    "orgname",
    "department",
    "dept",
    "school",
    "faculty",
    "institution",
    "institute",
    "center",
    "centre",
    "laboratory",
    "lab",
    "hospital",
    "clinic",
    "college",
    "unit",
    "division",
)
ADDRESS_TAIL_HINTS = (
    "street",
    "st.",
    "road",
    "rd.",
    "avenue",
    "ave.",
    "lane",
    "drive",
    "building",
    "room",
    "floor",
    "campus",
    "mailstop",
    "p.o.",
    "po box",
    "zip",
    "postal",
    "postcode",
    "box",
)
AFFILIATION_CONTAINER_HINTS = (
    "affiliation",
    "institution",
    "author-note",
    "author_notes",
    "author-notes",
    "author-footnote",
    "author-info",
    "authorblock",
    "ltx_author_notes",
)
VOID_TAGS = {
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
}


class _ArxivAffiliationHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.meta_affiliations: list[str] = []
        self.affiliation_blocks: list[str] = []
        self.jsonld_scripts: list[str] = []
        self._tag_stack: list[bool] = []
        self._affiliation_depth = 0
        self._affiliation_buffer: list[str] = []
        self._capture_jsonld = False
        self._jsonld_buffer: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_dict = {key.lower(): (value or "") for key, value in attrs}

        if tag == "meta":
            self._handle_meta(attrs_dict)
            return

        if tag == "script" and "ld+json" in attrs_dict.get("type", "").lower():
            self._capture_jsonld = True
            self._jsonld_buffer = []

        started_capture = False
        if tag not in VOID_TAGS and self._is_affiliation_container(attrs_dict):
            if self._affiliation_depth == 0:
                self._affiliation_buffer = []
            self._affiliation_depth += 1
            started_capture = True

        if tag not in VOID_TAGS:
            self._tag_stack.append(started_capture)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "meta":
            attrs_dict = {key.lower(): (value or "") for key, value in attrs}
            self._handle_meta(attrs_dict)

    def handle_endtag(self, tag: str) -> None:
        if tag == "script" and self._capture_jsonld:
            payload = "".join(self._jsonld_buffer).strip()
            if payload:
                self.jsonld_scripts.append(payload)
            self._capture_jsonld = False
            self._jsonld_buffer = []

        if tag in VOID_TAGS or not self._tag_stack:
            return

        started_capture = self._tag_stack.pop()
        if started_capture:
            self._affiliation_depth = max(0, self._affiliation_depth - 1)
            if self._affiliation_depth == 0:
                text = " ".join(part.strip() for part in self._affiliation_buffer if part.strip())
                if text:
                    self.affiliation_blocks.append(text)
                self._affiliation_buffer = []

    def handle_data(self, data: str) -> None:
        if self._capture_jsonld:
            self._jsonld_buffer.append(data)
        if self._affiliation_depth > 0 and data.strip():
            self._affiliation_buffer.append(data)

    def _handle_meta(self, attrs_dict: dict[str, str]) -> None:
        name = attrs_dict.get("name", "").strip().lower()
        content = attrs_dict.get("content", "").strip()
        if name in META_AFFILIATION_NAMES and content:
            self.meta_affiliations.append(content)

    def _is_affiliation_container(self, attrs_dict: dict[str, str]) -> bool:
        signal = " ".join(
            [
                attrs_dict.get("class", ""),
                attrs_dict.get("id", ""),
                attrs_dict.get("data-name", ""),
                attrs_dict.get("data-testid", ""),
            ]
        ).lower()
        return bool(signal) and any(hint in signal for hint in AFFILIATION_CONTAINER_HINTS)



def enrich_affiliations(papers: Iterable[Paper]) -> None:
    for paper in papers:
        if paper.affiliations:
            continue
        candidates = _collect_affiliation_candidates_for_paper(paper)
        paper.affiliation_evidence = candidates
        paper.affiliations = _clean_affiliations(candidates)



def fetch_affiliations_for_paper(paper: Paper) -> list[str]:
    return _clean_affiliations(_collect_affiliation_candidates_for_paper(paper))



def _collect_affiliation_candidates_for_paper(paper: Paper) -> list[str]:
    if not paper.link:
        return []

    candidates: list[str] = []
    candidates.extend(_extract_affiliations_from_page(paper.paper_id, paper.link))

    if not candidates:
        html_link = _derive_html_url(paper.link)
        if html_link and html_link != paper.link:
            candidates.extend(_extract_affiliations_from_page(paper.paper_id, html_link))

    return _dedupe_preserve_order(candidates)



def _extract_affiliations_from_page(paper_id: str, url: str) -> list[str]:
    html = fetch_arxiv_text(url)
    if not html:
        return []

    parser = _ArxivAffiliationHTMLParser()
    try:
        parser.feed(html)
    except Exception as exc:  # pragma: no cover - parser failure should not stop pipeline
        logger.warning("Failed to parse arXiv page for %s (%s): %s", paper_id, url, exc)
        return []

    candidates: list[str] = []
    candidates.extend(parser.meta_affiliations)
    for payload in parser.jsonld_scripts:
        candidates.extend(_extract_affiliations_from_jsonld(payload))
    candidates.extend(parser.affiliation_blocks)
    return candidates



def _derive_html_url(link: str) -> str:
    if not link:
        return ""
    return link.replace("/abs/", "/html/")



def _extract_affiliations_from_jsonld(payload: str) -> list[str]:
    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        return []
    return _collect_affiliations_from_jsonld(data)



def _collect_affiliations_from_jsonld(value: Any) -> list[str]:
    matches: list[str] = []
    if isinstance(value, dict):
        if "affiliation" in value:
            matches.extend(_collect_affiliation_names(value["affiliation"]))
        for item in value.values():
            matches.extend(_collect_affiliations_from_jsonld(item))
    elif isinstance(value, list):
        for item in value:
            matches.extend(_collect_affiliations_from_jsonld(item))
    return matches



def _collect_affiliation_names(value: Any) -> list[str]:
    matches: list[str] = []
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        for item in value:
            matches.extend(_collect_affiliation_names(item))
        return matches
    if isinstance(value, dict):
        for key in ("name", "legalName", "alternateName"):
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate.strip():
                matches.append(candidate)
        if "organization" in value:
            matches.extend(_collect_affiliation_names(value["organization"]))
    return matches



def _clean_affiliations(values: Iterable[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()

    for raw in values:
        for candidate in re.split(r"[;\n•]+", raw or ""):
            cleaned = _normalize_affiliation(candidate)
            if not cleaned:
                continue
            key = cleaned.casefold()
            if key in seen:
                continue
            seen.add(key)
            normalized.append(cleaned)

    return normalized[:8]



def _normalize_affiliation(value: str) -> str:
    latex_candidate = _extract_latex_affiliation_candidate(value)
    if latex_candidate:
        value = latex_candidate

    text = html_unescape(value or "")
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\\[A-Za-z]+", " ", text)
    text = text.replace("\\", " ")
    text = text.replace("{", " ").replace("}", " ")
    text = re.sub(r"\[[^\]]*\]", " ", text)
    text = text.replace("\xa0", " ")
    text = re.sub(r"^[\s\d,*†‡#]+", "", text)
    text = re.sub(r"^(affiliations?|institutions?)\s*[:：-]\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+", " ", text).strip(" ,;|/:-")

    if not text:
        return ""

    lowered = text.lower()
    if "@" in text or lowered.startswith("http"):
        return ""

    noisy_fragments = (
        "abstract",
        "download pdf",
        "submitter",
        "comments",
        "subjects",
        "report number",
        "journal reference",
        "doi",
        "extra links",
        "current browsing session",
        "authors to",
        "arxivlabs",
    )
    if any(fragment in lowered for fragment in noisy_fragments):
        return ""

    if not re.search(r"[A-Za-z\u4e00-\u9fff]", text):
        return ""

    return _trim_affiliation_address_tail(text)



def _extract_latex_affiliation_candidate(value: str) -> str:
    raw = html_unescape(value or "")
    if "\\org" not in raw and "\\department" not in raw and "\\school" not in raw and "\\faculty" not in raw:
        return ""

    pattern = re.compile(
        r"\\(?:"
        + "|".join(re.escape(command) for command in LATEX_AFFILIATION_COMMANDS)
        + r")\s+([^\\]+)"
    )
    pieces = [_normalize_affiliation_piece(match.group(1)) for match in pattern.finditer(raw)]
    pieces = [piece for piece in pieces if piece]
    if not pieces:
        return ""
    return ", ".join(_dedupe_preserve_order(pieces))



def _normalize_affiliation_piece(value: str) -> str:
    text = html_unescape(value or "")
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("{", " ").replace("}", " ")
    text = re.sub(r"\s+", " ", text).strip(" ,;|/:-")
    return text



def _trim_affiliation_address_tail(text: str) -> str:
    parts = [part.strip(" ,;|/:-") for part in re.split(r",\s*", text) if part.strip(" ,;|/:-")]
    if not parts:
        return ""

    kept: list[str] = []
    for part in parts:
        lowered = part.casefold()
        if "@" in part or lowered.startswith("http"):
            continue

        looks_address = any(hint in lowered for hint in ADDRESS_TAIL_HINTS)
        looks_numeric = bool(re.search(r"\d{3,}", part)) or bool(re.search(r"\d+\s+[A-Za-z]", part))
        if kept and (looks_address or looks_numeric):
            break

        kept.append(part)

    cleaned = ", ".join(_dedupe_preserve_order(kept or parts))
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" ,;|/:-")
    return cleaned


__all__ = [
    "_normalize_affiliation",
    "enrich_affiliations",
    "fetch_affiliations_for_paper",
]
