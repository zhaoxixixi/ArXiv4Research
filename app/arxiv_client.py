from __future__ import annotations

"""Backward-compatible facade for arXiv parsing and affiliation helpers.

Internal implementation now lives under ``app.arxiv_support`` so metadata
parsing and affiliation extraction can evolve independently without changing
existing imports.
"""

from .arxiv_support import (
    _apply_domain_filter,
    _normalize_affiliation,
    _parse_authors,
    _parse_categories,
    _pick_domain,
    enrich_affiliations,
    fetch_affiliations_for_paper,
)

__all__ = [
    "_apply_domain_filter",
    "_normalize_affiliation",
    "_parse_authors",
    "_parse_categories",
    "_pick_domain",
    "enrich_affiliations",
    "fetch_affiliations_for_paper",
]
