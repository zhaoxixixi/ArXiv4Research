from __future__ import annotations

import json
import logging

from openai import OpenAI

from ..models import Paper
from ..prompts import get_prompt, render_prompt_template
from .normalization import (
    _dedupe_text_list,
    _normalize_affiliation_list_payload,
    _normalize_analysis_result,
    _paper_needs_affiliation_llm_cleanup,
    _strip_code_fence,
)

logger = logging.getLogger(__name__)



def maybe_refine_affiliations_with_llm(
    client: OpenAI,
    paper: Paper,
    model: str,
    *,
    enabled: bool = True,
    prompt_dir: str | None = None,
) -> list[str]:
    current = paper.affiliations or []
    if not enabled or not _paper_needs_affiliation_llm_cleanup(paper):
        return current

    evidence = _dedupe_text_list((paper.affiliation_evidence or [])[:8])
    if not evidence:
        return current

    system_prompt = get_prompt("affiliation_cleanup_system", prompt_dir)
    user_prompt = render_prompt_template(
        get_prompt("affiliation_cleanup_user", prompt_dir),
        {
            "title": paper.title,
            "authors_csv": ", ".join(paper.authors) if paper.authors else "Unknown",
            "current_affiliations_json": json.dumps(current, ensure_ascii=False),
            "raw_affiliation_candidates_json": json.dumps(evidence, ensure_ascii=False),
        },
    )

    try:
        response = client.chat.completions.create(
            model=model,
            temperature=0.0,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        content = _strip_code_fence((response.choices[0].message.content or "{}").strip())
        data = json.loads(content)
        refined = _normalize_affiliation_list_payload(data)
        if refined:
            return refined
    except Exception as exc:  # pragma: no cover - network/provider failures should not stop pipeline
        logger.warning("LLM affiliation cleanup failed for %s: %s", paper.paper_id, exc)

    return current



def analyze_paper(
    client: OpenAI,
    paper: Paper,
    model: str,
    language: str,
    temperature: float,
    prompt_dir: str | None = None,
) -> tuple[dict, list[str]]:
    system_prompt = get_prompt("analysis_system", prompt_dir)
    user_prompt = render_prompt_template(
        get_prompt("analysis_user", prompt_dir),
        {
            "language": language,
            "title": paper.title,
            "abstract": paper.summary,
            "authors_json": json.dumps(paper.authors or [], ensure_ascii=False),
            "domain": paper.domain,
            "current_affiliations_json": json.dumps(paper.affiliations or [], ensure_ascii=False),
            "raw_affiliation_candidates_json": json.dumps((paper.affiliation_evidence or [])[:8], ensure_ascii=False),
        },
    )
    response = client.chat.completions.create(
        model=model,
        temperature=temperature,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )
    content = _strip_code_fence((response.choices[0].message.content or "{}").strip())
    try:
        data = json.loads(content)
        if isinstance(data, dict):
            return _normalize_analysis_result(data, language)
    except json.JSONDecodeError:
        pass

    return _normalize_analysis_result({}, language, fallback_text=content.strip())



def followup_answer(
    client: OpenAI,
    model: str,
    temperature: float,
    language: str,
    paper: Paper,
    question: str,
    research_context: str,
    prompt_dir: str | None = None,
) -> str:
    system_prompt = render_prompt_template(
        get_prompt("followup_system", prompt_dir),
        {
            "language": language,
        },
    )
    user_prompt = render_prompt_template(
        get_prompt("followup_user", prompt_dir),
        {
            "research_context": research_context,
            "title": paper.title,
            "abstract": paper.summary,
            "question": question,
        },
    )
    response = client.chat.completions.create(
        model=model,
        temperature=temperature,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )
    return (response.choices[0].message.content or "").strip()


__all__ = [
    "analyze_paper",
    "followup_answer",
    "maybe_refine_affiliations_with_llm",
]
