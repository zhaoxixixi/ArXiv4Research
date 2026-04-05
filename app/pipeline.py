from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .ai_client import analyze_paper, build_embedding_client, build_openai_client, maybe_refine_affiliations_with_llm
from .arxiv_api_client import fetch_window_by_categories
from .arxiv_client import enrich_affiliations
from .config import load_config
from .fetch_state import build_candidate_window, build_success_fetch_state, load_fetch_state, save_fetch_state
from .rerank import rank_papers, select_top_papers_balanced
from .sniffer import sniff_code_links
from .storage import prune_daily_files, write_daily_snapshot, write_index, write_search_index


def _resolve_report_timezone(timezone_name: str) -> ZoneInfo:
    try:
        return ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError as exc:
        raise ValueError(f"Invalid project.timezone: {timezone_name}") from exc


def _to_utc_z(dt: datetime) -> str:
    utc_dt = dt.astimezone(timezone.utc)
    return utc_dt.isoformat(timespec="seconds").replace("+00:00", "Z")


def run_pipeline(config_path: str = "config/config.yaml", data_dir: str = "data") -> None:
    cfg = load_config(config_path)
    report_timezone = _resolve_report_timezone(cfg.timezone)
    categories = sorted({c for d in cfg.domains for c in d.categories})
    run_started_at_utc = datetime.now(timezone.utc)
    generated_at_local = run_started_at_utc.astimezone(report_timezone)
    snapshot_metadata: dict[str, object] = {}
    if cfg.source_mode != "api_strict_window":
        raise ValueError(f"Unsupported source.mode: {cfg.source_mode}. Only 'api_strict_window' is supported.")

    previous_state = load_fetch_state(base_dir=data_dir, state_path=cfg.fetch_state_path)
    candidate_window = build_candidate_window(
        now_utc=run_started_at_utc,
        previous_state=previous_state,
        lookback_hours_if_no_state=cfg.api_window_lookback_hours_if_no_state,
    )
    fetch_result = fetch_window_by_categories(
        categories=categories,
        domain_buckets=cfg.domains,
        global_keywords=cfg.keywords,
        window_start=candidate_window.start,
        window_end=candidate_window.end,
        limit_per_cat=cfg.api_max_results_per_category,
        sort_by=cfg.api_sort_by,
        sort_order=cfg.api_sort_order,
    )
    papers = fetch_result.papers
    snapshot_metadata = {
        "source": "arxiv_api_strict_window",
        "window_start": _to_utc_z(candidate_window.start),
        "window_end": _to_utc_z(candidate_window.end),
        "candidate_count_before_filter": fetch_result.candidate_count_before_filter,
        "candidate_count_after_filter": fetch_result.candidate_count_after_filter,
    }
    fetch_state_to_save = build_success_fetch_state(
        window=candidate_window,
        report_date_local=generated_at_local.strftime("%Y-%m-%d"),
        candidate_count_before_filter=fetch_result.candidate_count_before_filter,
        candidate_count_after_filter=fetch_result.candidate_count_after_filter,
        source="arxiv_api_strict_window",
        updated_at_utc=run_started_at_utc,
    )

    if papers:
        embedding_client = build_embedding_client()
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
    else:
        ranked = []

    top = select_top_papers_balanced(
        ranked_papers=ranked,
        top_k=cfg.top_k,
        domains=cfg.domains,
    )
    enrich_affiliations(top)

    if top:
        chat_client = build_openai_client()
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

    write_daily_snapshot(
        base_dir=data_dir,
        papers=top,
        generated_at_local=generated_at_local,
        report_timezone=cfg.timezone,
        snapshot_metadata=snapshot_metadata,
    )
    dates = prune_daily_files(base_dir=data_dir, keep_days=cfg.keep_days)
    write_index(base_dir=data_dir, dates=dates, title=cfg.title)
    write_search_index(base_dir=data_dir, dates=dates)
    if fetch_state_to_save is not None:
        save_fetch_state(base_dir=data_dir, state=fetch_state_to_save, state_path=cfg.fetch_state_path)
