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
from app.pipeline import _select_affiliation_enrichment_targets, run_pipeline


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


def _config(
    source_mode: str = "api_strict_window",
    affiliation_web_fetch_top_per_domain: int = 5,
) -> Config:
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
        affiliation_web_fetch_top_per_domain=affiliation_web_fetch_top_per_domain,
        affiliation_llm_fallback_enabled=True,
        affiliation_llm_fallback_model="deepseek-chat",
    )


class PipelineApiStrictWindowTests(unittest.TestCase):
    def test_affiliation_enrichment_targets_are_capped_to_top_five_per_domain(self) -> None:
        papers = [
            Paper(
                paper_id=f"bio-{index}",
                title=f"Biology {index}",
                summary="summary",
                authors=["Author"],
                categories=["q-bio.GN"],
                published="2026-04-04T05:00:00Z",
                link=f"https://arxiv.org/abs/bio-{index}",
                domain="biology",
                relevance_score=100 - index,
            )
            for index in range(6)
        ] + [
            Paper(
                paper_id=f"ai-{index}",
                title=f"AI {index}",
                summary="summary",
                authors=["Author"],
                categories=["cs.LG"],
                published="2026-04-04T05:00:00Z",
                link=f"https://arxiv.org/abs/ai-{index}",
                domain="ai4science",
                relevance_score=90 - index,
            )
            for index in range(3)
        ]

        selected = _select_affiliation_enrichment_targets(papers, max_per_domain=5)

        self.assertEqual([paper.paper_id for paper in selected[:5]], ["bio-0", "bio-1", "bio-2", "bio-3", "bio-4"])
        self.assertEqual([paper.paper_id for paper in selected[5:]], ["ai-0", "ai-1", "ai-2"])
        self.assertNotIn("bio-5", [paper.paper_id for paper in selected])

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
                patch("app.pipeline.enrich_affiliations") as mocked_enrich_affiliations,
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
        self.assertEqual(mocked_enrich_affiliations.call_args.args[0], [paper])

    def test_pipeline_skips_affiliation_fetch_when_config_disables_it(self) -> None:
        paper = _paper()

        with tempfile.TemporaryDirectory() as tmpdir:
            with (
                patch(
                    "app.pipeline.load_config",
                    return_value=_config(affiliation_web_fetch_top_per_domain=0),
                ),
                patch("app.pipeline.datetime", _FixedDateTime),
                patch(
                    "app.pipeline.fetch_window_by_categories",
                    return_value=WindowFetchResult(
                        papers=[paper],
                        candidate_count_before_filter=1,
                        candidate_count_after_filter=1,
                    ),
                ),
                patch("app.pipeline.build_embedding_client", return_value=object()),
                patch("app.pipeline.build_openai_client", return_value=object()),
                patch("app.pipeline.rank_papers", side_effect=lambda **kwargs: kwargs["papers"]),
                patch("app.pipeline.select_top_papers_balanced", side_effect=lambda **kwargs: kwargs["ranked_papers"]),
                patch("app.pipeline.enrich_affiliations") as mocked_enrich_affiliations,
                patch("app.pipeline.sniff_code_links", return_value={"url": "https://github.com/example/repo"}),
                patch(
                    "app.pipeline.analyze_paper",
                    return_value=({"zh": {"tldr": "中文"}, "en": {"tldr": "English"}}, []),
                ),
            ):
                run_pipeline(config_path="ignored.yaml", data_dir=tmpdir)

        mocked_enrich_affiliations.assert_not_called()

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

    def test_fetch_failure_does_not_write_snapshot_or_advance_fetch_state(self) -> None:
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
            original_state = Path(tmpdir, "fetch_state.json").read_text(encoding="utf-8")

            with (
                patch("app.pipeline.load_config", return_value=_config()),
                patch("app.pipeline.datetime", _FixedDateTime),
                patch("app.pipeline.fetch_window_by_categories", side_effect=RuntimeError("fetch failed")),
            ):
                with self.assertRaisesRegex(RuntimeError, "fetch failed"):
                    run_pipeline(config_path="ignored.yaml", data_dir=tmpdir)

            self.assertFalse(Path(tmpdir, "daily", "2026-04-04.json").exists())
            self.assertEqual(Path(tmpdir, "fetch_state.json").read_text(encoding="utf-8"), original_state)

    def test_single_paper_analysis_failure_falls_back_and_pipeline_continues(self) -> None:
        first_paper = _paper()
        second_paper = Paper(
            paper_id="2604.30002",
            title="Symbolic regression for biology",
            summary="A second transferable modeling method.",
            authors=["Author Two"],
            categories=["cs.LG"],
            published="2026-04-04T05:10:00Z",
            link="https://arxiv.org/abs/2604.30002",
            domain="ai4science",
        )

        def fake_analyze_paper(**kwargs: object) -> tuple[dict, list[str]]:
            paper = kwargs["paper"]
            assert isinstance(paper, Paper)
            if paper.paper_id == "2604.30001":
                raise RuntimeError("LLM temporarily unavailable")
            return (
                {
                    "tldr": "English summary",
                    "motivation": "",
                    "method": "",
                    "result": "",
                    "help_to_user": "",
                    "idea_spark": {"transferable": False, "idea": "", "risk": "", "inspiration": ""},
                    "keywords_raw": [],
                    "keywords_normalized": [],
                    "bilingual": {
                        "zh": {
                            "tldr": "中文摘要",
                            "motivation": "",
                            "method": "",
                            "result": "",
                            "help_to_user": "",
                            "idea_spark": {"transferable": False, "idea": "", "risk": "", "inspiration": ""},
                        },
                        "en": {
                            "tldr": "English summary",
                            "motivation": "",
                            "method": "",
                            "result": "",
                            "help_to_user": "",
                            "idea_spark": {"transferable": False, "idea": "", "risk": "", "inspiration": ""},
                        },
                    },
                },
                ["Institute B"],
            )

        with tempfile.TemporaryDirectory() as tmpdir:
            with (
                patch("app.pipeline.load_config", return_value=_config()),
                patch("app.pipeline.datetime", _FixedDateTime),
                patch(
                    "app.pipeline.fetch_window_by_categories",
                    return_value=WindowFetchResult(
                        papers=[first_paper, second_paper],
                        candidate_count_before_filter=8,
                        candidate_count_after_filter=2,
                    ),
                ),
                patch("app.pipeline.build_embedding_client", return_value=object()),
                patch("app.pipeline.build_openai_client", return_value=object()),
                patch("app.pipeline.rank_papers", side_effect=lambda **kwargs: kwargs["papers"]),
                patch("app.pipeline.select_top_papers_balanced", side_effect=lambda **kwargs: kwargs["ranked_papers"]),
                patch("app.pipeline.enrich_affiliations"),
                patch("app.pipeline.sniff_code_links", return_value={"has_code": False}),
                patch("app.pipeline.analyze_paper", side_effect=fake_analyze_paper),
                patch("app.pipeline.maybe_refine_affiliations_with_llm", return_value=[]),
            ):
                run_pipeline(config_path="ignored.yaml", data_dir=tmpdir)

            daily_payload = json.loads(Path(tmpdir, "daily", "2026-04-04.json").read_text(encoding="utf-8"))

        self.assertEqual(daily_payload["count"], 2)
        first_saved, second_saved = daily_payload["papers"]
        self.assertEqual(first_saved["id"], "2604.30001")
        self.assertEqual(first_saved["ai"]["tldr"], "A transferable modeling method.")
        self.assertEqual(second_saved["id"], "2604.30002")
        self.assertEqual(second_saved["ai"]["bilingual"]["zh"]["tldr"], "中文摘要")
        self.assertEqual(second_saved["affiliations"], ["Institute B"])

    def test_affiliation_cleanup_failure_keeps_analysis_result(self) -> None:
        paper = _paper()

        with tempfile.TemporaryDirectory() as tmpdir:
            with (
                patch("app.pipeline.load_config", return_value=_config()),
                patch("app.pipeline.datetime", _FixedDateTime),
                patch(
                    "app.pipeline.fetch_window_by_categories",
                    return_value=WindowFetchResult(
                        papers=[paper],
                        candidate_count_before_filter=5,
                        candidate_count_after_filter=1,
                    ),
                ),
                patch("app.pipeline.build_embedding_client", return_value=object()),
                patch("app.pipeline.build_openai_client", return_value=object()),
                patch("app.pipeline.rank_papers", side_effect=lambda **kwargs: kwargs["papers"]),
                patch("app.pipeline.select_top_papers_balanced", side_effect=lambda **kwargs: kwargs["ranked_papers"]),
                patch("app.pipeline.enrich_affiliations"),
                patch("app.pipeline.sniff_code_links", return_value={"has_code": False}),
                patch(
                    "app.pipeline.analyze_paper",
                    return_value=(
                        {
                            "tldr": "Primary summary",
                            "motivation": "",
                            "method": "",
                            "result": "",
                            "help_to_user": "",
                            "idea_spark": {"transferable": False, "idea": "", "risk": "", "inspiration": ""},
                            "keywords_raw": [],
                            "keywords_normalized": [],
                            "bilingual": {
                                "zh": {
                                    "tldr": "中文摘要",
                                    "motivation": "",
                                    "method": "",
                                    "result": "",
                                    "help_to_user": "",
                                    "idea_spark": {"transferable": False, "idea": "", "risk": "", "inspiration": ""},
                                },
                                "en": {
                                    "tldr": "English summary",
                                    "motivation": "",
                                    "method": "",
                                    "result": "",
                                    "help_to_user": "",
                                    "idea_spark": {"transferable": False, "idea": "", "risk": "", "inspiration": ""},
                                },
                            },
                        },
                        [],
                    ),
                ),
                patch(
                    "app.pipeline.maybe_refine_affiliations_with_llm",
                    side_effect=RuntimeError("cleanup failed"),
                ),
            ):
                run_pipeline(config_path="ignored.yaml", data_dir=tmpdir)

            daily_payload = json.loads(Path(tmpdir, "daily", "2026-04-04.json").read_text(encoding="utf-8"))

        self.assertEqual(daily_payload["count"], 1)
        saved_paper = daily_payload["papers"][0]
        self.assertEqual(saved_paper["ai"]["tldr"], "Primary summary")
        self.assertEqual(saved_paper["affiliations"], [])


if __name__ == "__main__":
    unittest.main()
