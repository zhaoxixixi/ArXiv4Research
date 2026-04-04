from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .ai_client import analyze_paper, build_embedding_client, build_openai_client, maybe_refine_affiliations_with_llm
from .arxiv_client import enrich_affiliations, fetch_latest_by_categories
from .config import load_config
from .rerank import rank_papers, select_top_papers_balanced
from .sniffer import sniff_code_links
from .storage import prune_daily_files, write_daily_snapshot, write_index, write_search_index


def _resolve_report_timezone(timezone_name: str) -> ZoneInfo:
    try:
        return ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError as exc:
        raise ValueError(f"Invalid project.timezone: {timezone_name}") from exc


def run_pipeline(config_path: str = "config/config.yaml", data_dir: str = "data") -> None:
    cfg = load_config(config_path)
    chat_client = build_openai_client()
    embedding_client = build_embedding_client()
    report_timezone = _resolve_report_timezone(cfg.timezone)
    categories = sorted({c for d in cfg.domains for c in d.categories})

    papers = fetch_latest_by_categories(
        categories=categories,
        domain_buckets=cfg.domains,
        global_keywords=cfg.keywords,
        limit_per_cat=cfg.max_feed_items_per_category,
    )
    ranked = rank_papers(
        embedding_client=embedding_client,
        papers=papers,
        research_context=cfg.research_context,
        keywords=cfg.keywords,
        embedding_model=cfg.embedding_model,
        domains=cfg.domains,
        rerank_mode=cfg.rerank_mode,
        rerank_model=cfg.rerank_model,
        rerank_pool_size=cfg.rerank_pool_size,
        rerank_instruct=cfg.rerank_instruct,
        prompt_dir=cfg.prompt_dir,
    )
    top = select_top_papers_balanced(
        ranked_papers=ranked,
        top_k=cfg.top_k,
        domains=cfg.domains,
    )
    enrich_affiliations(top)

    for paper in top:
        paper.code = sniff_code_links(paper)
        paper.ai, analyzed_affiliations = analyze_paper(
            client=chat_client,
            paper=paper,
            model=cfg.analysis_model,
            language=cfg.language,
            temperature=cfg.analysis_temperature,
            prompt_dir=cfg.prompt_dir,
        )
        if analyzed_affiliations:
            paper.affiliations = analyzed_affiliations
        else:
            paper.affiliations = maybe_refine_affiliations_with_llm(
                client=chat_client,
                paper=paper,
                model=cfg.affiliation_llm_fallback_model,
                enabled=cfg.affiliation_llm_fallback_enabled,
                prompt_dir=cfg.prompt_dir,
            )

    generated_at_local = datetime.now(report_timezone)
    write_daily_snapshot(
        base_dir=data_dir,
        papers=top,
        generated_at_local=generated_at_local,
        report_timezone=cfg.timezone,
    )
    dates = prune_daily_files(base_dir=data_dir, keep_days=cfg.keep_days)
    write_index(base_dir=data_dir, dates=dates, title=cfg.title)
    write_search_index(base_dir=data_dir, dates=dates)
