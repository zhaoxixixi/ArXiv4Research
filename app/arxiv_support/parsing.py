from __future__ import annotations

from typing import Iterable

from ..models import DomainBucket, Paper



def _split_author_blob(raw: str) -> list[str]:
    value = raw.strip()
    if not value:
        return []

    if ";" in value:
        return [item.strip() for item in value.split(";") if item.strip()]

    if value.count(",") >= 1:
        return [item.strip() for item in value.split(",") if item.strip()]

    if " and " in value:
        return [item.strip() for item in value.split(" and ") if item.strip()]

    return [value]



def _dedupe_preserve_order(items: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for item in items:
        normalized = item.strip()
        if not normalized:
            continue
        key = normalized.casefold()
        if key in seen:
            continue
        seen.add(key)
        ordered.append(normalized)
    return ordered



def _parse_authors(entry: dict) -> list[str]:
    authors: list[str] = []
    if "authors" in entry:
        for author in entry["authors"]:
            name = (author.get("name") or "").strip()
            authors.extend(_split_author_blob(name))
        return _dedupe_preserve_order(authors)

    name = entry.get("author", "")
    return _dedupe_preserve_order(_split_author_blob(name))



def _parse_categories(entry: dict) -> list[str]:
    if "tags" not in entry:
        return []
    categories: list[str] = []
    for tag in entry["tags"]:
        term = tag.get("term")
        if term:
            categories.append(term)
    return categories



def _pick_domain(categories: list[str], domain_buckets: list[DomainBucket]) -> str:
    cat_set = set(categories)
    matched: tuple[int, str] | None = None
    for domain in domain_buckets:
        if cat_set.intersection(set(domain.categories)):
            if matched is None or domain.priority > matched[0]:
                matched = (domain.priority, domain.name)
    return matched[1] if matched else "general"



def _title_abstract_hit(title: str, summary: str, keywords: list[str]) -> bool:
    body = f"{title}\n{summary}".lower()
    return any(keyword.lower() in body for keyword in keywords if keyword.strip())



def _apply_domain_filter(
    paper: Paper,
    domain_buckets: list[DomainBucket],
    global_keywords: list[str],
) -> bool:
    mode = "soft"
    domain_keywords: list[str] = []
    cross_keywords: list[str] = []
    for domain in domain_buckets:
        if domain.name == paper.domain:
            mode = domain.filter_mode
            domain_keywords = domain.keywords
            cross_keywords = domain.cross_keywords or []
            break

    if paper.domain == "biology":
        bio_hit = _title_abstract_hit(paper.title, paper.summary, domain_keywords)
        cross_hit = _title_abstract_hit(paper.title, paper.summary, cross_keywords + global_keywords)
        return bio_hit and cross_hit

    if mode == "hard":
        return _title_abstract_hit(paper.title, paper.summary, global_keywords + domain_keywords)

    return True


__all__ = [
    "_apply_domain_filter",
    "_dedupe_preserve_order",
    "_parse_authors",
    "_parse_categories",
    "_pick_domain",
]
