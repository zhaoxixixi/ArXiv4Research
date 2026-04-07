from __future__ import annotations

from pathlib import Path

import yaml

from .models import Config, DomainBucket

_SUPPORTED_SOURCE_MODES = {"announcement_list", "api_strict_window"}



def _as_bool(value: object, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)



def _parse_source_mode(value: object) -> str:
    mode = str(value or "announcement_list").strip()
    if mode not in _SUPPORTED_SOURCE_MODES:
        supported = ", ".join(sorted(_SUPPORTED_SOURCE_MODES))
        raise ValueError(f"Unsupported source.mode: {mode}. Supported modes: {supported}.")
    return mode



def load_config(config_path: str | Path) -> Config:
    raw = yaml.safe_load(Path(config_path).read_text(encoding="utf-8"))
    project = raw["project"]
    prompts = raw.get("prompts", {})
    source = raw.get("source", {})
    source_announcement = source.get("announcement", {})
    source_api = source.get("api", {})
    source_fetch_state = source.get("fetch_state", {})
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
        source_mode=_parse_source_mode(source.get("mode", "announcement_list")),
        announcement_lookback_days_if_no_state=int(source_announcement.get("lookback_days_if_no_state", 7)),
        api_sort_by=source_api.get("sort_by", "submittedDate"),
        api_sort_order=source_api.get("sort_order", "descending"),
        api_max_results_per_category=int(
            source_api.get("max_results_per_category", retrieval.get("max_feed_items_per_category", 120))
        ),
        api_window_lookback_hours_if_no_state=int(source_api.get("window_lookback_hours_if_no_state", 72)),
        fetch_state_path=source_fetch_state.get("path", "fetch_state.json"),
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
        affiliation_web_fetch_top_per_domain=max(0, int(affiliation.get("web_fetch_top_per_domain", 5))),
        affiliation_llm_fallback_enabled=_as_bool(affiliation.get("llm_fallback_enabled"), default=True),
        affiliation_llm_fallback_model=affiliation.get("llm_fallback_model") or analysis["model"],
    )
