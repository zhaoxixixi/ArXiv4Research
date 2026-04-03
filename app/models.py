from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass
class DomainBucket:
    name: str
    priority: int
    categories: list[str]
    keywords: list[str]
    filter_mode: str  # "hard" | "soft"
    cross_keywords: list[str] | None = None


@dataclass
class Paper:
    paper_id: str
    title: str
    summary: str
    authors: list[str]
    categories: list[str]
    published: str
    link: str
    affiliations: list[str] | None = None
    affiliation_evidence: list[str] | None = None
    domain: str = "general"
    relevance_score: float = 0.0
    ai: dict[str, Any] | None = None
    code: dict[str, Any] | None = None


@dataclass
class Config:
    title: str
    top_k: int
    keep_days: int
    timezone: str
    language: str
    max_feed_items_per_category: int
    domains: list[DomainBucket]
    research_context: str
    keywords: list[str]
    embedding_model: str
    rerank_mode: str
    rerank_model: str
    rerank_pool_size: int
    rerank_instruct: str
    analysis_model: str
    analysis_temperature: float
    affiliation_llm_fallback_enabled: bool
    affiliation_llm_fallback_model: str


def iso_date(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d")
