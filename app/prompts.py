from __future__ import annotations

from functools import lru_cache
from pathlib import Path
import re
from typing import Mapping

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PROMPT_DIR = PROJECT_ROOT / "prompts" / "backend"
PLACEHOLDER_PATTERN = re.compile(r"\[\[([a-zA-Z0-9_]+)\]\]")

PROMPT_FILENAMES = {
    "analysis_system": "analysis_system.txt",
    "analysis_user": "analysis_user.txt",
    "affiliation_cleanup_system": "affiliation_cleanup_system.txt",
    "affiliation_cleanup_user": "affiliation_cleanup_user.txt",
    "followup_system": "followup_system.txt",
    "followup_user": "followup_user.txt",
    "rerank_query": "rerank_query.txt",
}

DEFAULT_PROMPTS = {
    "analysis_system": """You are a research assistant for AI4Science.
Return strict JSON only.
Top-level keys must be exactly: affiliations, keywords_raw, keywords_normalized, zh, en.

For affiliations:
- return a concise list of institution / department / laboratory names
- remove street addresses, room numbers, postcodes, emails, URLs, and author-note noise
- do not invent affiliations unsupported by the provided candidates
- if unsure, return an empty list

For keywords_raw:
- return 3 to 8 paper-specific topic phrases
- keep them concrete and close to the paper itself

For keywords_normalized:
- return 3 to 6 normalized topic labels suitable for cross-paper aggregation
- prefer broader, stable research themes over overly specific paper phrases
- do not output obvious parent/child near-duplicates together
- for example, if a raw keyword is \"diffusion MRI\", normalized keywords may be \"diffusion\" and \"medical imaging\"

For both zh and en, include keys:
tldr, motivation, method, result, help_to_user, idea_spark.

For idea_spark, include keys:
transferable, idea, risk, inspiration.

Requirements:
- zh: concise Simplified Chinese
- en: concise English
- Stay factual and grounded in the provided title/abstract only
- Do not invent unavailable experimental details
""",
    "analysis_user": """Preferred UI language: [[language]]
Title: [[title]]
Abstract: [[abstract]]
Authors: [[authors_json]]
Domain: [[domain]]
Current extracted affiliations: [[current_affiliations_json]]
Raw affiliation candidates: [[raw_affiliation_candidates_json]]
Return strict JSON only with top-level keys affiliations, keywords_raw, keywords_normalized, zh, en.""",
    "affiliation_cleanup_system": """You normalize noisy author affiliation strings extracted from arXiv pages.
Return strict JSON only with the top-level key: affiliations.

Requirements:
- affiliations must be a list of concise institution / department / laboratory names
- remove street addresses, room numbers, postcodes, country-only fragments, emails, URLs, and author notes
- do not invent affiliations that are not supported by the candidate strings
- if the candidates are insufficient, return an empty list
""",
    "affiliation_cleanup_user": """Paper title: [[title]]
Authors: [[authors_csv]]
Current cleaned affiliations: [[current_affiliations_json]]
Raw affiliation candidates: [[raw_affiliation_candidates_json]]
Normalize these into a short affiliation list. JSON only.""",
    "followup_system": """You are a concise research copilot. Reply in [[language]]. Answer based on the paper and user context. Use practical, experiment-oriented suggestions.""",
    "followup_user": """User research context:
[[research_context]]

Paper title: [[title]]
Paper abstract: [[abstract]]
Question: [[question]]""",
    "rerank_query": """Research context:
[[research_context]]

Keywords: [[keywords_csv]]""",
}


def resolve_prompt_dir(prompt_dir: str | Path | None = None) -> Path:
    if not prompt_dir:
        return DEFAULT_PROMPT_DIR
    path = Path(prompt_dir)
    return path if path.is_absolute() else PROJECT_ROOT / path


@lru_cache(maxsize=None)
def _load_prompt_text(prompt_dir_str: str, prompt_key: str) -> str:
    prompt_dir = Path(prompt_dir_str)
    filename = PROMPT_FILENAMES[prompt_key]
    path = prompt_dir / filename
    if path.exists():
        return path.read_text(encoding="utf-8").strip()
    return DEFAULT_PROMPTS[prompt_key].strip()


def get_prompt(prompt_key: str, prompt_dir: str | Path | None = None) -> str:
    if prompt_key not in PROMPT_FILENAMES:
        raise KeyError(f"Unknown prompt key: {prompt_key}")
    resolved_dir = resolve_prompt_dir(prompt_dir)
    return _load_prompt_text(str(resolved_dir), prompt_key)


def render_prompt_template(template: str, values: Mapping[str, object]) -> str:
    def replace(match: re.Match[str]) -> str:
        key = match.group(1)
        value = values.get(key)
        return "" if value is None else str(value)

    return PLACEHOLDER_PATTERN.sub(replace, template)
