from __future__ import annotations

from datetime import datetime, timezone

from .ai_client import analyze_paper, build_embedding_client, build_openai_client, maybe_refine_affiliations_with_llm
from .arxiv_client import enrich_affiliations, fetch_latest_by_categories
from .config import load_config
from .rerank import rank_papers
from .sniffer import sniff_code_links
from .storage import prune_daily_files, write_daily_snapshot, write_index, write_search_index


def run_pipeline(config_path: str = "config/config.yaml", data_dir: str = "data") -> None:
    cfg = load_config(config_path)
    chat_client = build_openai_client()
    embedding_client = build_embedding_client()
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
    )
    top = ranked[: cfg.top_k]
    enrich_affiliations(top)

    for paper in top:
        paper.code = sniff_code_links(paper)
        paper.ai, analyzed_affiliations = analyze_paper(
            client=chat_client,
            paper=paper,
            model=cfg.analysis_model,
            language=cfg.language,
            temperature=cfg.analysis_temperature,
        )
        if analyzed_affiliations:
            paper.affiliations = analyzed_affiliations
        else:
            paper.affiliations = maybe_refine_affiliations_with_llm(
                client=chat_client,
                paper=paper,
                model=cfg.affiliation_llm_fallback_model,
                enabled=cfg.affiliation_llm_fallback_enabled,
            )

    today = datetime.now(timezone.utc)
    write_daily_snapshot(base_dir=data_dir, papers=top, today=today)
    dates = prune_daily_files(base_dir=data_dir, keep_days=cfg.keep_days)
    write_index(base_dir=data_dir, dates=dates, title=cfg.title)
    write_search_index(base_dir=data_dir, dates=dates)
