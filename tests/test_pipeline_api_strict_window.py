from __future__ import annotations

import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from app.arxiv_api_client import WindowFetchResult
from app.fetch_state import CandidateWindow, build_success_fetch_state, save_fetch_state
from app.models import Config, DomainBucket, Paper
from app.pipeline import run_pipeline


class _FixedDateTime(datetime):
    @classmethod
    def now(cls, tz: timezone | None = None) -> datetime:
        base = datetime(2026, 4, 4, 6, 0, 0, tzinfo=timezone.utc)
        if tz is None:
            return base
        return base.astimezone(tz)


def _paper() -> Paper:
    return Paper(
        paper_id="2604.30001",
        title="Neural operator for biology",
        summary="A transferable modeling method.",
        authors=["Author One"],
        categories=["cs.LG"],
        published="2026-04-04T05:00:00Z",
        link="https://arxiv.org/abs/2604.30001",
        domain="ai4science",
    )


def _config(source_mode: str = "api_strict_window") -> Config:
    domains = [
        DomainBucket(
            name="ai4science",
            priority=90,
            categories=["cs.LG"],
            keywords=["neural operator"],
            filter_mode="soft",
            cross_keywords=[],
        )
    ]
    return Config(
        title="ArXiv Research Assistant",
        top_k=10,
        keep_days=30,
        timezone="Asia/Shanghai",
        language="Chinese",
        prompt_dir="prompts/backend",
        source_mode=source_mode,
        api_sort_by="submittedDate",
        api_sort_order="descending",
        api_max_results_per_category=200,
        api_window_lookback_hours_if_no_state=72,
        fetch_state_path="fetch_state.json",
        max_feed_items_per_category=120,
        domains=domains,
        research_context="biology x ai",
        keywords=["neural operator"],
        embedding_model="text-embedding-v4",
        rerank_mode="embedding_only",
        rerank_model="qwen3-rerank",
        rerank_pool_size=50,
        rerank_instruct="rank well",
        analysis_model="deepseek-chat",
        analysis_temperature=0.2,
        affiliation_llm_fallback_enabled=True,
        affiliation_llm_fallback_model="deepseek-chat",
    )


class PipelineApiStrictWindowTests(unittest.TestCase):
    def test_pipeline_api_mode_writes_window_metadata_and_fetch_state(self) -> None:
        paper = _paper()

        with tempfile.TemporaryDirectory() as tmpdir:
            with (
                patch("app.pipeline.load_config", return_value=_config()),
                patch("app.pipeline.datetime", _FixedDateTime),
                patch(
                    "app.pipeline.fetch_window_by_categories",
                    return_value=WindowFetchResult(
                        papers=[paper],
                        candidate_count_before_filter=6,
                        candidate_count_after_filter=2,
                    ),
                ) as mocked_fetch,
                patch("app.pipeline.build_embedding_client", return_value=object()),
                patch("app.pipeline.build_openai_client", return_value=object()),
                patch("app.pipeline.rank_papers", side_effect=lambda **kwargs: kwargs["papers"]),
                patch("app.pipeline.select_top_papers_balanced", side_effect=lambda **kwargs: kwargs["ranked_papers"]),
                patch("app.pipeline.enrich_affiliations"),
                patch("app.pipeline.sniff_code_links", return_value={"url": "https://github.com/example/repo"}),
                patch(
                    "app.pipeline.analyze_paper",
                    return_value=(
                        {"zh": {"tldr": "中文"}, "en": {"tldr": "English"}},
                        ["Institute A"],
                    ),
                ),
            ):
                run_pipeline(config_path="ignored.yaml", data_dir=tmpdir)

            daily_payload = json.loads(Path(tmpdir, "daily", "2026-04-04.json").read_text(encoding="utf-8"))
            state_payload = json.loads(Path(tmpdir, "fetch_state.json").read_text(encoding="utf-8"))

        fetch_kwargs = mocked_fetch.call_args.kwargs
        self.assertEqual(fetch_kwargs["window_start"].isoformat(), "2026-04-01T06:00:00+00:00")
        self.assertEqual(fetch_kwargs["window_end"].isoformat(), "2026-04-04T06:00:00+00:00")
        self.assertEqual(daily_payload["source"], "arxiv_api_strict_window")
        self.assertEqual(daily_payload["window_start"], "2026-04-01T06:00:00Z")
        self.assertEqual(daily_payload["window_end"], "2026-04-04T06:00:00Z")
        self.assertEqual(daily_payload["candidate_count_before_filter"], 6)
        self.assertEqual(daily_payload["candidate_count_after_filter"], 2)
        self.assertEqual(daily_payload["count"], 1)
        self.assertEqual(state_payload["last_successful_cutoff"], "2026-04-04T06:00:00Z")
        self.assertEqual(state_payload["candidate_count_before_filter"], 6)
        self.assertEqual(state_payload["candidate_count_after_filter"], 2)

    def test_empty_window_still_writes_daily_snapshot_and_advances_boundary(self) -> None:
        previous_state = build_success_fetch_state(
            window=CandidateWindow(
                start=datetime(2026, 4, 2, 0, 0, tzinfo=timezone.utc),
                end=datetime(2026, 4, 3, 0, 0, tzinfo=timezone.utc),
            ),
            report_date_local="2026-04-03",
            updated_at_utc=datetime(2026, 4, 3, 0, 1, tzinfo=timezone.utc),
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            save_fetch_state(tmpdir, previous_state)
            with (
                patch("app.pipeline.load_config", return_value=_config()),
                patch("app.pipeline.datetime", _FixedDateTime),
                patch(
                    "app.pipeline.fetch_window_by_categories",
                    return_value=WindowFetchResult(
                        papers=[],
                        candidate_count_before_filter=0,
                        candidate_count_after_filter=0,
                    ),
                ) as mocked_fetch,
                patch("app.pipeline.build_embedding_client") as mocked_embedding_client,
                patch("app.pipeline.build_openai_client") as mocked_chat_client,
            ):
                run_pipeline(config_path="ignored.yaml", data_dir=tmpdir)

            daily_payload = json.loads(Path(tmpdir, "daily", "2026-04-04.json").read_text(encoding="utf-8"))
            state_payload = json.loads(Path(tmpdir, "fetch_state.json").read_text(encoding="utf-8"))

        fetch_kwargs = mocked_fetch.call_args.kwargs
        self.assertEqual(fetch_kwargs["window_start"].isoformat(), "2026-04-03T00:00:00+00:00")
        self.assertEqual(fetch_kwargs["window_end"].isoformat(), "2026-04-04T06:00:00+00:00")
        self.assertEqual(daily_payload["count"], 0)
        self.assertEqual(daily_payload["papers"], [])
        self.assertEqual(daily_payload["source"], "arxiv_api_strict_window")
        self.assertEqual(state_payload["last_successful_cutoff"], "2026-04-04T06:00:00Z")
        mocked_embedding_client.assert_not_called()
        mocked_chat_client.assert_not_called()


if __name__ == "__main__":
    unittest.main()
