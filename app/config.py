from __future__ import annotations

from pathlib import Path

import yaml

from .models import Config, DomainBucket


def _as_bool(value: object, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


def load_config(config_path: str | Path) -> Config:
    raw = yaml.safe_load(Path(config_path).read_text(encoding="utf-8"))
    project = raw["project"]
    prompts = raw.get("prompts", {})
    retrieval = raw["retrieval"]
    relevance = raw["relevance"]
    rerank = raw.get("rerank", {})
    analysis = raw["analysis"]
    affiliation = raw.get("affiliation", {})
    domain_cfg = retrieval.get("domains", [])
    domains: list[DomainBucket] = []
    for item in domain_cfg:
        domains.append(
            DomainBucket(
                name=item["name"],
                priority=int(item.get("priority", 50)),
                categories=item.get("categories", []),
                keywords=item.get("keywords", []),
                filter_mode=item.get("filter_mode", "soft"),
                cross_keywords=item.get("cross_keywords", []),
            )
        )

    return Config(
        title=project["title"],
        top_k=int(project.get("top_k", 30)),
        keep_days=int(project.get("keep_days", 7)),
        timezone=project.get("timezone", "Asia/Shanghai"),
        language=project.get("language", "Chinese"),
        prompt_dir=prompts.get("dir", "prompts/backend"),
        max_feed_items_per_category=int(retrieval.get("max_feed_items_per_category", 120)),
        domains=domains,
        research_context=relevance["research_context"],
        keywords=relevance["keywords"],
        embedding_model=relevance.get("embedding_model", "text-embedding-3-small"),
        rerank_mode=rerank.get("mode", "embedding_only"),
        rerank_model=rerank.get("model", "qwen3-rerank"),
        rerank_pool_size=int(rerank.get("pool_size", 60)),
        rerank_instruct=rerank.get(
            "instruct",
            "Given a research profile, rank candidate arXiv papers by practical relevance, transferability, and idea-generation potential.",
        ),
        analysis_model=analysis["model"],
        analysis_temperature=float(analysis.get("temperature", 0.2)),
        affiliation_llm_fallback_enabled=_as_bool(affiliation.get("llm_fallback_enabled"), default=True),
        affiliation_llm_fallback_model=affiliation.get("llm_fallback_model") or analysis["model"],
    )
