from __future__ import annotations

import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from app.arxiv_announcement_client import AnnouncementFetchResult
from app.fetch_state import build_announcement_fetch_state, save_fetch_state
from app.models import Config, DomainBucket, Paper
from app.pipeline import run_pipeline


class _FixedDateTime(datetime):
    @classmethod
    def now(cls, tz: timezone | None = None) -> datetime:
        base = datetime(2026, 4, 7, 6, 0, 0, tzinfo=timezone.utc)
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
        published="2026-04-06T05:00:00Z",
        link="https://arxiv.org/abs/2604.30001",
        domain="ai4science",
    )



def _config() -> Config:
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
        source_mode="announcement_list",
        announcement_lookback_days_if_no_state=7,
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
        affiliation_web_fetch_top_per_domain=5,
        affiliation_llm_fallback_enabled=True,
        affiliation_llm_fallback_model="deepseek-chat",
    )


class PipelineAnnouncementListTests(unittest.TestCase):
    def test_pipeline_announcement_mode_writes_metadata_and_fetch_state(self) -> None:
        paper = _paper()

        with tempfile.TemporaryDirectory() as tmpdir:
            with (
                patch("app.pipeline.load_config", return_value=_config()),
                patch("app.pipeline.datetime", _FixedDateTime),
                patch(
                    "app.pipeline.fetch_announcements_by_categories",
                    return_value=AnnouncementFetchResult(
                        papers=[paper],
                        candidate_count_before_filter=6,
                        candidate_count_after_filter=2,
                        announcement_dates=["2026-04-06", "2026-04-03"],
                        latest_announcement_date="2026-04-06",
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
                    return_value=({"zh": {"tldr": "中文"}, "en": {"tldr": "English"}}, ["Institute A"]),
                ),
            ):
                run_pipeline(config_path="ignored.yaml", data_dir=tmpdir)

            daily_payload = json.loads(Path(tmpdir, "daily", "2026-04-07.json").read_text(encoding="utf-8"))
            state_payload = json.loads(Path(tmpdir, "fetch_state.json").read_text(encoding="utf-8"))

        fetch_kwargs = mocked_fetch.call_args.kwargs
        self.assertEqual(fetch_kwargs["last_processed_announcement_date"], None)
        self.assertEqual(fetch_kwargs["lookback_days_if_no_state"], 7)
        self.assertEqual(daily_payload["source"], "arxiv_announcement_list")
        self.assertEqual(daily_payload["announcement_dates"], ["2026-04-06", "2026-04-03"])
        self.assertEqual(daily_payload["latest_announcement_date"], "2026-04-06")
        self.assertEqual(daily_payload["candidate_count_before_filter"], 6)
        self.assertEqual(daily_payload["candidate_count_after_filter"], 2)
        self.assertEqual(daily_payload["count"], 1)
        self.assertEqual(state_payload["last_processed_announcement_date"], "2026-04-06")
        self.assertEqual(state_payload["candidate_count_before_filter"], 6)
        self.assertEqual(state_payload["candidate_count_after_filter"], 2)

    def test_empty_announcement_increment_keeps_boundary_and_writes_empty_snapshot(self) -> None:
        previous_state = build_announcement_fetch_state(
            last_processed_announcement_date="2026-04-06",
            report_date_local="2026-04-06",
            updated_at_utc=datetime(2026, 4, 6, 0, 1, tzinfo=timezone.utc),
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            save_fetch_state(tmpdir, previous_state)
            with (
                patch("app.pipeline.load_config", return_value=_config()),
                patch("app.pipeline.datetime", _FixedDateTime),
                patch(
                    "app.pipeline.fetch_announcements_by_categories",
                    return_value=AnnouncementFetchResult(
                        papers=[],
                        candidate_count_before_filter=0,
                        candidate_count_after_filter=0,
                        announcement_dates=[],
                        latest_announcement_date=None,
                    ),
                ) as mocked_fetch,
                patch("app.pipeline.build_embedding_client") as mocked_embedding_client,
                patch("app.pipeline.build_openai_client") as mocked_chat_client,
            ):
                run_pipeline(config_path="ignored.yaml", data_dir=tmpdir)

            daily_payload = json.loads(Path(tmpdir, "daily", "2026-04-07.json").read_text(encoding="utf-8"))
            state_payload = json.loads(Path(tmpdir, "fetch_state.json").read_text(encoding="utf-8"))

        fetch_kwargs = mocked_fetch.call_args.kwargs
        self.assertEqual(fetch_kwargs["last_processed_announcement_date"].isoformat(), "2026-04-06")
        self.assertEqual(daily_payload["count"], 0)
        self.assertEqual(daily_payload["papers"], [])
        self.assertEqual(daily_payload["source"], "arxiv_announcement_list")
        self.assertEqual(daily_payload["announcement_dates"], [])
        self.assertEqual(state_payload["last_processed_announcement_date"], "2026-04-06")
        mocked_embedding_client.assert_not_called()
        mocked_chat_client.assert_not_called()


if __name__ == "__main__":
    unittest.main()
