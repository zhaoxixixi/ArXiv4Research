from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path


@dataclass
class CandidateWindow:
    start: datetime
    end: datetime


@dataclass
class FetchState:
    last_successful_cutoff: datetime
    last_window_start: datetime
    last_window_end: datetime
    updated_at_utc: datetime
    source: str = "arxiv_api_strict_window"
    report_date_local: str | None = None
    candidate_count_before_filter: int | None = None
    candidate_count_after_filter: int | None = None


def _ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _to_iso_utc(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return _ensure_utc(dt).isoformat(timespec="seconds").replace("+00:00", "Z")


def _from_iso_utc(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    return datetime.fromisoformat(normalized).astimezone(timezone.utc)


def _resolve_state_path(base_dir: str | Path, state_path: str = "fetch_state.json") -> Path:
    return Path(base_dir) / state_path


def load_fetch_state(base_dir: str | Path, state_path: str = "fetch_state.json") -> FetchState | None:
    path = _resolve_state_path(base_dir, state_path)
    if not path.exists():
        return None

    payload = json.loads(path.read_text(encoding="utf-8"))
    cutoff = _from_iso_utc(payload.get("last_successful_cutoff"))
    window_start = _from_iso_utc(payload.get("last_window_start"))
    window_end = _from_iso_utc(payload.get("last_window_end"))
    updated_at = _from_iso_utc(payload.get("updated_at_utc"))

    if cutoff is None or window_start is None or window_end is None or updated_at is None:
        return None

    return FetchState(
        last_successful_cutoff=cutoff,
        last_window_start=window_start,
        last_window_end=window_end,
        updated_at_utc=updated_at,
        source=payload.get("source", "arxiv_api_strict_window"),
        report_date_local=payload.get("report_date_local"),
        candidate_count_before_filter=payload.get("candidate_count_before_filter"),
        candidate_count_after_filter=payload.get("candidate_count_after_filter"),
    )


def save_fetch_state(
    base_dir: str | Path,
    state: FetchState,
    state_path: str = "fetch_state.json",
) -> Path:
    path = _resolve_state_path(base_dir, state_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = asdict(state)
    payload["last_successful_cutoff"] = _to_iso_utc(state.last_successful_cutoff)
    payload["last_window_start"] = _to_iso_utc(state.last_window_start)
    payload["last_window_end"] = _to_iso_utc(state.last_window_end)
    payload["updated_at_utc"] = _to_iso_utc(state.updated_at_utc)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def build_candidate_window(
    now_utc: datetime,
    previous_state: FetchState | None,
    lookback_hours_if_no_state: int = 72,
) -> CandidateWindow:
    end = _ensure_utc(now_utc)
    if previous_state is not None:
        start = _ensure_utc(previous_state.last_successful_cutoff)
    else:
        start = end - timedelta(hours=max(0, int(lookback_hours_if_no_state)))

    if start > end:
        raise ValueError("candidate window start must not be later than end")

    return CandidateWindow(start=start, end=end)


def build_success_fetch_state(
    window: CandidateWindow,
    report_date_local: str | None = None,
    candidate_count_before_filter: int | None = None,
    candidate_count_after_filter: int | None = None,
    source: str = "arxiv_api_strict_window",
    updated_at_utc: datetime | None = None,
) -> FetchState:
    return FetchState(
        last_successful_cutoff=_ensure_utc(window.end),
        last_window_start=_ensure_utc(window.start),
        last_window_end=_ensure_utc(window.end),
        updated_at_utc=_ensure_utc(updated_at_utc or datetime.now(timezone.utc)),
        source=source,
        report_date_local=report_date_local,
        candidate_count_before_filter=candidate_count_before_filter,
        candidate_count_after_filter=candidate_count_after_filter,
    )
