from __future__ import annotations

import json
import logging
import os
import re
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from openai import OpenAI

from .models import Paper

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a research assistant for AI4Science.
Return strict JSON only.
Top-level keys must be exactly: zh, en.

For both zh and en, include keys:
tldr, motivation, method, result, help_to_user, idea_spark.

For idea_spark, include keys:
transferable, idea, risk, inspiration.

Requirements:
- zh: concise Simplified Chinese
- en: concise English
- Stay factual and grounded in the provided title/abstract only
- Do not invent unavailable experimental details
"""
AFFILIATION_CLEANUP_SYSTEM_PROMPT = """You normalize noisy author affiliation strings extracted from arXiv pages.
Return strict JSON only with the top-level key: affiliations.

Requirements:
- affiliations must be a list of concise institution / department / laboratory names
- remove street addresses, room numbers, postcodes, country-only fragments, emails, URLs, and author notes
- do not invent affiliations that are not supported by the candidate strings
- if the candidates are insufficient, return an empty list
"""

ANALYSIS_TEXT_FIELDS = ("tldr", "motivation", "method", "result", "help_to_user")
IDEA_SPARK_FIELDS = ("idea", "risk", "inspiration")


def build_openai_client() -> OpenAI:
    api_key = os.environ.get("OPENAI_API_KEY", "")
    base_url = os.environ.get("OPENAI_BASE_URL")
    if not api_key:
        raise ValueError("OPENAI_API_KEY is required.")
    kwargs = {"api_key": api_key}
    if base_url:
        kwargs["base_url"] = base_url
    return OpenAI(**kwargs)


def build_embedding_client() -> OpenAI:
    api_key = os.environ.get("EMBEDDING_API_KEY", "")
    base_url = os.environ.get("EMBEDDING_BASE_URL")
    if not api_key:
        raise ValueError("EMBEDDING_API_KEY is required.")
    if not base_url:
        raise ValueError("EMBEDDING_BASE_URL is required.")
    return OpenAI(api_key=api_key, base_url=base_url)


def get_rerank_credentials() -> tuple[str, str]:
    api_key = (
        os.environ.get("RERANK_API_KEY")
        or os.environ.get("EMBEDDING_API_KEY")
        or os.environ.get("DASHSCOPE_API_KEY")
        or ""
    )
    base_url = os.environ.get("RERANK_BASE_URL", "https://dashscope.aliyuncs.com/compatible-api/v1/reranks")
    if not api_key:
        raise ValueError("RERANK_API_KEY or EMBEDDING_API_KEY or DASHSCOPE_API_KEY is required for rerank.")
    return api_key, base_url


def get_embeddings(embedding_client: OpenAI, texts: list[str], model: str) -> list[list[float]]:
    # DashScope text-embedding-v4 accepts max 10 inputs per request.
    batch_size = int(os.environ.get("EMBEDDING_BATCH_SIZE", "10"))
    if batch_size <= 0:
        batch_size = 10
    all_embeddings: list[list[float]] = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        response = embedding_client.embeddings.create(model=model, input=batch)
        all_embeddings.extend([item.embedding for item in response.data])
    return all_embeddings


def rerank_documents(
    query: str,
    documents: list[str],
    model: str,
    *,
    top_n: int | None = None,
    instruct: str | None = None,
) -> list[dict]:
    api_key, base_url = get_rerank_credentials()
    payload: dict = {
        "model": model,
        "documents": documents,
        "query": query,
    }
    if top_n is not None:
        payload["top_n"] = top_n
    if instruct:
        payload["instruct"] = instruct

    request = Request(
        base_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=60) as response:
            body = response.read().decode("utf-8")
    except HTTPError as exc:
        message = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Rerank request failed with HTTP {exc.code}: {message[:240]}") from exc
    except URLError as exc:
        raise RuntimeError(f"Rerank request failed: {exc}") from exc

    data = json.loads(body)
    results = ((data.get("output") or {}).get("results")) or data.get("results") or []
    if not isinstance(results, list):
        logger.warning("Unexpected rerank response format: %s", data)
        return []
    return results


def _strip_code_fence(content: str) -> str:
    text = (content or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        text = text.replace("json\n", "", 1).strip()
    return text


def _empty_ai_section() -> dict:
    return {
        "tldr": "",
        "motivation": "",
        "method": "",
        "result": "",
        "help_to_user": "",
        "idea_spark": {
            "transferable": False,
            "idea": "",
            "risk": "",
            "inspiration": "",
        },
    }


def _normalize_ai_section(raw: dict | None) -> dict:
    data = raw or {}
    idea = (data.get("idea_spark", {}) or {}) if isinstance(data, dict) else {}
    section = _empty_ai_section()
    for key in ANALYSIS_TEXT_FIELDS:
        section[key] = str(data.get(key, "") or "")
    section["idea_spark"] = {
        "transferable": bool(idea.get("transferable", False)),
        "idea": str(idea.get("idea", "") or ""),
        "risk": str(idea.get("risk", "") or ""),
        "inspiration": str(idea.get("inspiration", "") or ""),
    }
    return section


def _looks_nonempty_section(section: dict) -> bool:
    if any(section.get(key) for key in ANALYSIS_TEXT_FIELDS):
        return True
    idea = section.get("idea_spark", {}) or {}
    return bool(idea.get("idea") or idea.get("risk") or idea.get("inspiration"))


def _normalize_analysis_payload(data: dict, language: str, fallback_text: str = "") -> dict:
    zh_candidate = data.get("zh") if isinstance(data.get("zh"), dict) else None
    en_candidate = data.get("en") if isinstance(data.get("en"), dict) else None

    flat_candidate = None
    if any(key in data for key in (*ANALYSIS_TEXT_FIELDS, "idea_spark")):
        flat_candidate = data

    zh_section = _normalize_ai_section(zh_candidate or flat_candidate)
    en_section = _normalize_ai_section(en_candidate)

    if not _looks_nonempty_section(en_section) and flat_candidate and "en" not in data:
        language_lower = (language or "").strip().lower()
        if language_lower.startswith("en") or "english" in language_lower:
            en_section = _normalize_ai_section(flat_candidate)

    if fallback_text and not _looks_nonempty_section(zh_section):
        zh_section["tldr"] = fallback_text
    if fallback_text and not _looks_nonempty_section(en_section):
        en_section["tldr"] = fallback_text

    language_lower = (language or "").strip().lower()
    primary_lang = "en" if language_lower.startswith("en") or "english" in language_lower else "zh"
    primary = zh_section if primary_lang == "zh" else en_section
    secondary = en_section if primary_lang == "zh" else zh_section
    if not _looks_nonempty_section(primary):
        primary = secondary

    normalized = dict(primary)
    normalized["bilingual"] = {
        "zh": zh_section,
        "en": en_section,
    }
    return normalized


def _dedupe_text_list(items: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for item in items:
        text = re.sub(r"\s+", " ", str(item or "")).strip(" ,;|/:-")
        if not text:
            continue
        key = text.casefold()
        if key in seen:
            continue
        seen.add(key)
        ordered.append(text)
    return ordered


def _affiliation_text_looks_noisy(text: str) -> bool:
    lowered = (text or "").casefold()
    noisy_fragments = (
        "\\org",
        "\\author",
        "\\address",
        "<",
        ">",
        "{",
        "}",
        "postcode",
        "street",
        "mailstop",
        "building",
        "room ",
    )
    if any(fragment in lowered for fragment in noisy_fragments):
        return True
    if re.search(r"\d{3,}", text or ""):
        return True
    return False


def _paper_needs_affiliation_llm_cleanup(paper: Paper) -> bool:
    evidence = paper.affiliation_evidence or []
    affiliations = paper.affiliations or []
    if not evidence:
        return False
    if not affiliations:
        return True
    return any(_affiliation_text_looks_noisy(item) for item in affiliations)


def _normalize_affiliation_list_payload(data: object) -> list[str]:
    from .arxiv_client import _normalize_affiliation

    if isinstance(data, dict):
        candidate = data.get("affiliations", [])
    else:
        candidate = data

    if isinstance(candidate, str):
        candidate_items = [candidate]
    elif isinstance(candidate, list):
        candidate_items = [str(item or "") for item in candidate]
    else:
        return []

    cleaned: list[str] = []
    for item in _dedupe_text_list(candidate_items):
        normalized = _normalize_affiliation(item)
        if len(normalized) < 3:
            continue
        cleaned.append(normalized)
    return cleaned[:8]


def maybe_refine_affiliations_with_llm(
    client: OpenAI,
    paper: Paper,
    model: str,
    *,
    enabled: bool = True,
) -> list[str]:
    current = paper.affiliations or []
    if not enabled or not _paper_needs_affiliation_llm_cleanup(paper):
        return current

    evidence = _dedupe_text_list((paper.affiliation_evidence or [])[:8])
    if not evidence:
        return current

    user_prompt = (
        f"Paper title: {paper.title}\n"
        f"Authors: {', '.join(paper.authors) if paper.authors else 'Unknown'}\n"
        f"Current cleaned affiliations: {json.dumps(current, ensure_ascii=False)}\n"
        f"Raw affiliation candidates: {json.dumps(evidence, ensure_ascii=False)}\n"
        "Normalize these into a short affiliation list. JSON only."
    )

    try:
        response = client.chat.completions.create(
            model=model,
            temperature=0.0,
            messages=[
                {"role": "system", "content": AFFILIATION_CLEANUP_SYSTEM_PROMPT},
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


def analyze_paper(client: OpenAI, paper: Paper, model: str, language: str, temperature: float) -> dict:
    user_prompt = (
        f"Preferred UI language: {language}\n"
        f"Title: {paper.title}\n"
        f"Abstract: {paper.summary}\n"
        f"Domain: {paper.domain}\n"
        "Return bilingual JSON only with both zh and en."
    )
    response = client.chat.completions.create(
        model=model,
        temperature=temperature,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
    )
    content = _strip_code_fence((response.choices[0].message.content or "{}").strip())
    try:
        data = json.loads(content)
        if isinstance(data, dict):
            return _normalize_analysis_payload(data, language)
    except json.JSONDecodeError:
        pass

    return _normalize_analysis_payload({}, language, fallback_text=content.strip())


def followup_answer(client: OpenAI, model: str, temperature: float, language: str, paper: Paper, question: str, research_context: str) -> str:
    response = client.chat.completions.create(
        model=model,
        temperature=temperature,
        messages=[
            {
                "role": "system",
                "content": (
                    f"You are a concise research copilot. Reply in {language}. "
                    "Answer based on the paper and user context. Use practical, experiment-oriented suggestions."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"User research context:\n{research_context}\n\n"
                    f"Paper title: {paper.title}\n"
                    f"Paper abstract: {paper.summary}\n"
                    f"Question: {question}"
                ),
            },
        ],
    )
    return (response.choices[0].message.content or "").strip()
