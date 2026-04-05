from __future__ import annotations

import re

from ..arxiv_support.affiliations import _normalize_affiliation
from ..models import Paper

ANALYSIS_TEXT_FIELDS = ("tldr", "motivation", "method", "result", "help_to_user")
GENERIC_KEYWORD_STOPWORDS = {
    "paper",
    "papers",
    "study",
    "studies",
    "method",
    "methods",
    "approach",
    "approaches",
    "framework",
    "frameworks",
    "model",
    "models",
    "task",
    "tasks",
    "application",
    "applications",
}



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



def _normalize_analysis_result(data: dict | None, language: str, fallback_text: str = "") -> tuple[dict, list[str]]:
    payload = data if isinstance(data, dict) else {}
    analysis = _normalize_analysis_payload(payload, language, fallback_text=fallback_text)
    analysis["keywords_raw"] = _normalize_keyword_list(payload.get("keywords_raw", []), max_items=8, prefer_general=False)
    analysis["keywords_normalized"] = _normalize_keyword_list(
        payload.get("keywords_normalized", []),
        max_items=6,
        prefer_general=True,
    )
    return analysis, _normalize_affiliation_list_payload(payload)



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



def _normalize_keyword_label(value: str) -> str:
    text = str(value or "").strip().lower()
    text = re.sub(r"[“”\"'`]+", "", text)
    text = text.replace("&", " and ")
    text = re.sub(r"[^a-z0-9+\-/ ]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip(" ,;|/:-")
    return text



def _should_skip_keyword(label: str) -> bool:
    if not label or len(label) < 3 or len(label) > 48:
        return True
    if label in GENERIC_KEYWORD_STOPWORDS:
        return True
    if re.fullmatch(r"\d+(?:\.\d+)?", label):
        return True
    return False



def _contains_keyword_phrase(longer: str, shorter: str) -> bool:
    if not longer or not shorter:
        return False
    if longer == shorter:
        return True
    return re.search(rf"(?<![a-z0-9]){re.escape(shorter)}(?![a-z0-9])", longer) is not None



def _normalize_keyword_list(values: object, *, max_items: int, prefer_general: bool) -> list[str]:
    if isinstance(values, str):
        candidates = [values]
    elif isinstance(values, list):
        candidates = [str(item or "") for item in values]
    else:
        return []

    selected: list[str] = []
    for raw in candidates:
        label = _normalize_keyword_label(raw)
        if _should_skip_keyword(label):
            continue

        should_skip = False
        for index, existing in enumerate(list(selected)):
            overlaps = _contains_keyword_phrase(existing, label) or _contains_keyword_phrase(label, existing)
            if not overlaps:
                continue

            if prefer_general:
                existing_parts = existing.split()
                label_tokens = len(label.split())
                generic_expansion = label_tokens == 1 and len(existing_parts) == 2 and any(
                    token in GENERIC_KEYWORD_STOPWORDS for token in existing_parts
                )
                label_is_reasonably_general = label_tokens >= 2 or generic_expansion
                if label_is_reasonably_general and label_tokens <= len(existing_parts) and len(label) <= len(existing):
                    selected[index] = label
                should_skip = True
                break

            existing_tokens = len(existing.split())
            label_tokens = len(label.split())
            if label_tokens >= existing_tokens and len(label) >= len(existing):
                selected[index] = label
            should_skip = True
            break

        if should_skip:
            continue

        selected.append(label)
        if len(selected) >= max_items:
            break

    return _dedupe_text_list(selected)[:max_items]



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


__all__ = [
    "_dedupe_text_list",
    "_normalize_affiliation_list_payload",
    "_normalize_analysis_result",
    "_paper_needs_affiliation_llm_cleanup",
    "_strip_code_fence",
]
