from __future__ import annotations

import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.fetch_state import (
    CandidateWindow,
    build_candidate_window,
    build_success_fetch_state,
    load_fetch_state,
    save_fetch_state,
)


class FetchStateTests(unittest.TestCase):
    def test_first_run_window_uses_fallback_lookback_hours(self) -> None:
        now_utc = datetime(2026, 4, 4, 10, 0, tzinfo=timezone.utc)

        window = build_candidate_window(now_utc=now_utc, previous_state=None, lookback_hours_if_no_state=48)

        self.assertEqual(window.end, now_utc)
        self.assertEqual(window.start, now_utc - timedelta(hours=48))

    def test_next_window_uses_last_successful_cutoff(self) -> None:
        previous_state = build_success_fetch_state(
            window=CandidateWindow(
                start=datetime(2026, 4, 3, 0, 0, tzinfo=timezone.utc),
                end=datetime(2026, 4, 4, 0, 0, tzinfo=timezone.utc),
            ),
            report_date_local="2026-04-04",
        )
        now_utc = datetime(2026, 4, 4, 12, 0, tzinfo=timezone.utc)

        window = build_candidate_window(now_utc=now_utc, previous_state=previous_state, lookback_hours_if_no_state=72)

        self.assertEqual(window.start, previous_state.last_successful_cutoff)
        self.assertEqual(window.end, now_utc)

    def test_save_and_load_fetch_state_round_trip(self) -> None:
        state = build_success_fetch_state(
            window=CandidateWindow(
                start=datetime(2026, 4, 2, 12, 0, tzinfo=timezone.utc),
                end=datetime(2026, 4, 3, 12, 0, tzinfo=timezone.utc),
            ),
            report_date_local="2026-04-03",
            candidate_count_before_filter=25,
            candidate_count_after_filter=10,
            updated_at_utc=datetime(2026, 4, 3, 12, 5, tzinfo=timezone.utc),
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            path = save_fetch_state(tmpdir, state)
            payload = json.loads(Path(path).read_text(encoding="utf-8"))
            restored = load_fetch_state(tmpdir)

        self.assertEqual(payload["last_successful_cutoff"], "2026-04-03T12:00:00Z")
        self.assertIsNotNone(restored)
        assert restored is not None
        self.assertEqual(restored.report_date_local, "2026-04-03")
        self.assertEqual(restored.candidate_count_before_filter, 25)
        self.assertEqual(restored.candidate_count_after_filter, 10)
        self.assertEqual(restored.last_window_start, datetime(2026, 4, 2, 12, 0, tzinfo=timezone.utc))


if __name__ == "__main__":
    unittest.main()
