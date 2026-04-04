from __future__ import annotations

import argparse
import json
from pathlib import Path

from .ai_client import build_openai_client, followup_answer
from .config import load_config
from .models import Paper


def _find_paper(data_dir: str, date: str, paper_id: str) -> Paper:
    path = Path(data_dir) / "daily" / f"{date}.json"
    payload = json.loads(path.read_text(encoding="utf-8"))
    for p in payload.get("papers", []):
        if p.get("id") == paper_id:
            return Paper(
                paper_id=p["id"],
                title=p.get("title", ""),
                summary=p.get("summary", ""),
                authors=p.get("authors", []),
                affiliations=p.get("affiliations", []),
                categories=p.get("categories", []),
                published=p.get("published", ""),
                link=p.get("link", ""),
                domain=p.get("domain", "general"),
                relevance_score=float(p.get("relevance_score", 0)),
                ai=p.get("ai"),
                code=p.get("code"),
            )
    raise ValueError(f"Paper not found: {paper_id}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", required=True)
    parser.add_argument("--paper-id", required=True)
    parser.add_argument("--question", required=True)
    parser.add_argument("--config", default="config/config.yaml")
    parser.add_argument("--data-dir", default="data")
    args = parser.parse_args()

    cfg = load_config(args.config)
    paper = _find_paper(args.data_dir, args.date, args.paper_id)
    client = build_openai_client()
    answer = followup_answer(
        client=client,
        model=cfg.analysis_model,
        temperature=cfg.analysis_temperature,
        language=cfg.language,
        paper=paper,
        question=args.question,
        research_context=cfg.research_context,
        prompt_dir=cfg.prompt_dir,
    )
    print(answer)


if __name__ == "__main__":
    main()
