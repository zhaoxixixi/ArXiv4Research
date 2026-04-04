from __future__ import annotations

import logging
import math

from .ai_client import get_embeddings, rerank_documents
from .models import DomainBucket, Paper
from .prompts import get_prompt, render_prompt_template

logger = logging.getLogger(__name__)

EMBEDDING_ONLY = "embedding_only"
EMBEDDING_PLUS_QWEN3_RERANK = "embedding_plus_qwen3_rerank"
MAX_RERANK_DOC_CHARS = 3200


def _cosine_similarity(vec1: list[float], vec2: list[float]) -> float:
    dot = sum(a * b for a, b in zip(vec1, vec2))
    norm1 = math.sqrt(sum(a * a for a in vec1))
    norm2 = math.sqrt(sum(b * b for b in vec2))
    if norm1 == 0 or norm2 == 0:
        return 0.0
    return dot / (norm1 * norm2)


def _domain_weight(domain_name: str, domains: list[DomainBucket]) -> float:
    for d in domains:
        if d.name == domain_name:
            return 1.0 + d.priority / 100.0
    return 1.0


def _weighted_score(base_score: float, domain_name: str, domains: list[DomainBucket]) -> float:
    bounded = max(0.0, min(base_score, 1.0))
    weight = _domain_weight(domain_name, domains)
    return 1.0 - (1.0 - bounded) ** weight


def _build_query(research_context: str, keywords: list[str], prompt_dir: str | None = None) -> str:
    return render_prompt_template(
        get_prompt("rerank_query", prompt_dir),
        {
            "research_context": research_context,
            "keywords_csv": ", ".join(keywords),
        },
    )


def _build_doc_text(paper: Paper) -> str:
    text = f"Title: {paper.title}\nAbstract: {paper.summary}"
    if len(text) <= MAX_RERANK_DOC_CHARS:
        return text
    return f"{text[:MAX_RERANK_DOC_CHARS].rstrip()}…"


def _embedding_rank(
    embedding_client,
    papers: list[Paper],
    query: str,
    embedding_model: str,
    domains: list[DomainBucket],
) -> list[Paper]:
    doc_texts = [f"{p.title}\n{p.summary}" for p in papers]
    embeddings = get_embeddings(embedding_client, [query] + doc_texts, embedding_model)
    query_emb = embeddings[0]
    doc_embs = embeddings[1:]

    for paper, emb in zip(papers, doc_embs):
        base = _cosine_similarity(query_emb, emb)
        paper.relevance_score = _weighted_score(base, paper.domain, domains)
    return sorted(papers, key=lambda p: p.relevance_score, reverse=True)


def _apply_qwen3_rerank(
    ranked_papers: list[Paper],
    query: str,
    rerank_model: str,
    rerank_pool_size: int,
    rerank_instruct: str,
    domains: list[DomainBucket],
) -> list[Paper]:
    if not ranked_papers:
        return []

    pool_size = max(1, min(len(ranked_papers), rerank_pool_size))
    pool = ranked_papers[:pool_size]
    remaining = ranked_papers[pool_size:]
    documents = [_build_doc_text(paper) for paper in pool]

    try:
        results = rerank_documents(
            query=query,
            documents=documents,
            model=rerank_model,
            top_n=len(documents),
            instruct=rerank_instruct,
        )
    except Exception as exc:
        logger.warning("Qwen3 rerank failed; fallback to embedding_only. Reason: %s", exc)
        return ranked_papers

    rerank_scores: dict[int, float] = {}
    raw_items: list[tuple[int, float]] = []
    for item in results:
        try:
            raw_items.append((int(item.get("index")), float(item.get("relevance_score", 0.0))))
        except (TypeError, ValueError):
            continue

    zero_based = any(index == 0 for index, _ in raw_items)
    for raw_index, score in raw_items:
        index = raw_index if zero_based else raw_index - 1
        if 0 <= index < len(pool):
            rerank_scores[index] = score

    if not rerank_scores:
        logger.warning("Qwen3 rerank returned no valid results; fallback to embedding_only.")
        return ranked_papers

    reranked_pool: list[Paper] = []
    for index, paper in enumerate(pool):
        rerank_score = rerank_scores.get(index, 0.0)
        paper.relevance_score = _weighted_score(rerank_score, paper.domain, domains)
        reranked_pool.append(paper)

    reranked_pool.sort(key=lambda p: p.relevance_score, reverse=True)
    return reranked_pool + remaining


def rank_papers(
    embedding_client,
    papers: list[Paper],
    research_context: str,
    keywords: list[str],
    embedding_model: str,
    domains: list[DomainBucket],
    rerank_mode: str = EMBEDDING_ONLY,
    rerank_model: str = "qwen3-rerank",
    rerank_pool_size: int = 60,
    rerank_instruct: str = "",
    prompt_dir: str | None = None,
) -> list[Paper]:
    if not papers:
        return []

    query = _build_query(research_context, keywords, prompt_dir)
    ranked = _embedding_rank(
        embedding_client=embedding_client,
        papers=papers,
        query=query,
        embedding_model=embedding_model,
        domains=domains,
    )

    if rerank_mode == EMBEDDING_ONLY:
        return ranked

    if rerank_mode == EMBEDDING_PLUS_QWEN3_RERANK:
        return _apply_qwen3_rerank(
            ranked_papers=ranked,
            query=query,
            rerank_model=rerank_model,
            rerank_pool_size=rerank_pool_size,
            rerank_instruct=rerank_instruct,
            domains=domains,
        )

    logger.warning("Unknown rerank mode '%s'; fallback to embedding_only.", rerank_mode)
    return ranked


def select_top_papers_balanced(
    ranked_papers: list[Paper],
    top_k: int,
    domains: list[DomainBucket],
) -> list[Paper]:
    if top_k <= 0 or not ranked_papers:
        return []

    if len(ranked_papers) <= top_k:
        return ranked_papers

    domain_priority = {domain.name: domain.priority for domain in domains}
    active_domains = sorted(
        {paper.domain for paper in ranked_papers if paper.domain in domain_priority},
        key=lambda name: domain_priority.get(name, 0),
        reverse=True,
    )
    if not active_domains:
        return ranked_papers[:top_k]

    quotas = {name: 0 for name in active_domains}
    base_quota, remainder = divmod(top_k, len(active_domains))
    for name in active_domains:
        quotas[name] = base_quota
    for name in active_domains[:remainder]:
        quotas[name] += 1

    buckets: dict[str, list[Paper]] = {name: [] for name in active_domains}
    for paper in ranked_papers:
        if paper.domain in buckets:
            buckets[paper.domain].append(paper)

    selected: list[Paper] = []
    selected_ids: set[str] = set()

    for domain_name in active_domains:
        for paper in buckets.get(domain_name, [])[: quotas[domain_name]]:
            if paper.paper_id in selected_ids:
                continue
            selected.append(paper)
            selected_ids.add(paper.paper_id)

    if len(selected) >= top_k:
        return sorted(selected, key=lambda paper: paper.relevance_score, reverse=True)[:top_k]

    for paper in ranked_papers:
        if paper.paper_id in selected_ids:
            continue
        selected.append(paper)
        selected_ids.add(paper.paper_id)
        if len(selected) >= top_k:
            break

    return sorted(selected, key=lambda paper: paper.relevance_score, reverse=True)[:top_k]
