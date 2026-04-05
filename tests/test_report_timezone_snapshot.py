from __future__ import annotations

import json
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from app.models import Paper
from app.storage import write_daily_snapshot


class ReportTimezoneSnapshotTests(unittest.TestCase):
    def test_daily_snapshot_uses_local_report_date_and_keeps_utc_metadata(self) -> None:
        paper = Paper(
            paper_id="2604.12345",
            title="Test paper",
            summary="Test summary",
            authors=["Author"],
            categories=["q-bio.BM"],
            published="2026-04-02T00:00:00Z",
            link="https://arxiv.org/abs/2604.12345",
        )
        generated_at_local = datetime(2026, 4, 3, 6, 40, 0, tzinfo=ZoneInfo("Asia/Shanghai"))

        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = write_daily_snapshot(
                base_dir=tmpdir,
                papers=[paper],
                generated_at_local=generated_at_local,
                report_timezone="Asia/Shanghai",
            )
            payload = json.loads(Path(file_path).read_text(encoding="utf-8"))

        self.assertEqual(file_path.name, "2026-04-03.json")
        self.assertEqual(payload["date"], "2026-04-03")
        self.assertEqual(payload["generated_at_local"], "2026-04-03T06:40:00+08:00")
        self.assertEqual(payload["generated_at_utc"], "2026-04-02T22:40:00Z")
        self.assertEqual(payload["timezone"], "Asia/Shanghai")
        self.assertEqual(payload["count"], 1)

    def test_daily_snapshot_can_store_candidate_window_metadata(self) -> None:
        generated_at_local = datetime(2026, 4, 4, 6, 0, 0, tzinfo=ZoneInfo("Asia/Shanghai"))

        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = write_daily_snapshot(
                base_dir=tmpdir,
                papers=[],
                generated_at_local=generated_at_local,
                report_timezone="Asia/Shanghai",
                snapshot_metadata={
                    "source": "arxiv_api_strict_window",
                    "window_start": "2026-04-03T22:00:00Z",
                    "window_end": "2026-04-04T22:00:00Z",
                    "candidate_count_before_filter": 42,
                    "candidate_count_after_filter": 12,
                },
            )
            payload = json.loads(Path(file_path).read_text(encoding="utf-8"))

        self.assertEqual(payload["source"], "arxiv_api_strict_window")
        self.assertEqual(payload["window_start"], "2026-04-03T22:00:00Z")
        self.assertEqual(payload["window_end"], "2026-04-04T22:00:00Z")
        self.assertEqual(payload["candidate_count_before_filter"], 42)
        self.assertEqual(payload["candidate_count_after_filter"], 12)


if __name__ == "__main__":
    unittest.main()
