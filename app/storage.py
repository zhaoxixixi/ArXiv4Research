from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from .models import Paper, iso_date


def _paper_to_dict(paper: Paper) -> dict:
    return {
        "id": paper.paper_id,
        "title": paper.title,
        "summary": paper.summary,
        "authors": paper.authors,
        "affiliations": paper.affiliations or [],
        "categories": paper.categories,
        "domain": paper.domain,
        "published": paper.published,
        "link": paper.link,
        "relevance_score": round(paper.relevance_score, 6),
        "ai": paper.ai or {},
        "code": paper.code or {},
    }


def _iso_timestamp(dt: datetime) -> str:
    text = dt.isoformat(timespec="seconds")
    return text.replace("+00:00", "Z")


def write_daily_snapshot(
    base_dir: str | Path,
    papers: list[Paper],
    generated_at_local: datetime,
    report_timezone: str,
) -> Path:
    base = Path(base_dir)
    daily_dir = base / "daily"
    daily_dir.mkdir(parents=True, exist_ok=True)
    file_path = daily_dir / f"{iso_date(generated_at_local)}.json"
    payload = {
        "date": iso_date(generated_at_local),
        "generated_at_local": _iso_timestamp(generated_at_local),
        "generated_at_utc": _iso_timestamp(generated_at_local.astimezone(timezone.utc)),
        "timezone": report_timezone,
        "count": len(papers),
        "papers": [_paper_to_dict(p) for p in papers],
    }
    file_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return file_path


def prune_daily_files(base_dir: str | Path, keep_days: int) -> list[str]:
    daily_dir = Path(base_dir) / "daily"
    daily_dir.mkdir(parents=True, exist_ok=True)
    files = sorted(daily_dir.glob("*.json"), reverse=True)
    keep = files[:keep_days]
    remove = files[keep_days:]
    for f in remove:
        f.unlink(missing_ok=True)
    kept_dates = [f.stem for f in keep]
    return sorted(kept_dates, reverse=True)


def write_index(base_dir: str | Path, dates: list[str], title: str) -> None:
    payload = {
        "title": title,
        "dates": dates,
        "latest": dates[0] if dates else None,
    }
    Path(base_dir, "index.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def write_search_index(base_dir: str | Path, dates: list[str]) -> None:
    base = Path(base_dir)
    daily_dir = base / "daily"
    rows: list[dict] = []
    for date in dates:
        daily_file = daily_dir / f"{date}.json"
        if not daily_file.exists():
            continue
        payload = json.loads(daily_file.read_text(encoding="utf-8"))
        for p in payload.get("papers", []):
            rows.append(
                {
                    "id": p.get("id"),
                    "title": p.get("title"),
                    "date": date,
                    "domain": p.get("domain", "general"),
                    "score": p.get("relevance_score", 0),
                }
            )
    (base / "search_index.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
