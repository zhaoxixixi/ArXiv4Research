from __future__ import annotations

import unittest
from types import SimpleNamespace

from app.ai_client import analyze_paper, maybe_refine_affiliations_with_llm
from app.arxiv_client import _normalize_affiliation
from app.models import Paper


class _FakeCompletions:
    def __init__(self, content: str) -> None:
        self._content = content
        self.calls = 0

    def create(self, **_: object) -> SimpleNamespace:
        self.calls += 1
        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(content=self._content),
                )
            ]
        )


class _FakeClient:
    def __init__(self, content: str) -> None:
        self.chat = SimpleNamespace(completions=_FakeCompletions(content))


class AffiliationCleanupTests(unittest.TestCase):
    def test_programmatic_cleanup_removes_latex_markup_and_address_tail(self) -> None:
        raw = (
            r"\orgdiv Institute of Biomedicine, School of Medicine, "
            r"\orgname University of Eastern Finland, "
            r"\orgaddress \street Yliopistonranta 8, \postcode 70210, \country Finland"
        )
        cleaned = _normalize_affiliation(raw)
        self.assertEqual(
            cleaned,
            "Institute of Biomedicine, School of Medicine, University of Eastern Finland",
        )

    def test_llm_cleanup_runs_only_for_noisy_affiliations(self) -> None:
        raw = (
            r"\orgdiv Institute of Biomedicine, School of Medicine, "
            r"\orgname University of Eastern Finland"
        )
        paper = Paper(
            paper_id="2604.00065",
            title="Test paper",
            summary="Test summary",
            authors=["A. Author"],
            categories=["q-bio.BM"],
            published="2026-04-02T00:00:00Z",
            link="https://arxiv.org/abs/2604.00065",
            affiliations=[raw],
            affiliation_evidence=[raw],
        )
        client = _FakeClient(
            '{"affiliations": ["Institute of Biomedicine, School of Medicine, University of Eastern Finland"]}'
        )

        refined = maybe_refine_affiliations_with_llm(client=client, paper=paper, model="deepseek-chat", enabled=True)

        self.assertEqual(
            refined,
            ["Institute of Biomedicine, School of Medicine, University of Eastern Finland"],
        )
        self.assertEqual(client.chat.completions.calls, 1)

    def test_llm_cleanup_skips_clean_affiliations(self) -> None:
        paper = Paper(
            paper_id="2604.00066",
            title="Another test paper",
            summary="Test summary",
            authors=["B. Author"],
            categories=["q-bio.BM"],
            published="2026-04-02T00:00:00Z",
            link="https://arxiv.org/abs/2604.00066",
            affiliations=["University of Eastern Finland"],
            affiliation_evidence=["University of Eastern Finland"],
        )
        client = _FakeClient('{"affiliations": ["Should not be used"]}')

        refined = maybe_refine_affiliations_with_llm(client=client, paper=paper, model="deepseek-chat", enabled=True)

        self.assertEqual(refined, ["University of Eastern Finland"])
        self.assertEqual(client.chat.completions.calls, 0)

    def test_analysis_call_can_return_affiliations_together_with_summary(self) -> None:
        paper = Paper(
            paper_id="2604.00067",
            title="Cell segmentation paper",
            summary="A compact recursive model for single-cell segmentation.",
            authors=["A. Author", "B. Author"],
            categories=["q-bio.BM"],
            published="2026-04-02T00:00:00Z",
            link="https://arxiv.org/abs/2604.00067",
            affiliations=["University of Eastern Finland"],
            affiliation_evidence=[
                r"\orgdiv Institute of Biomedicine, School of Medicine, \orgname University of Eastern Finland"
            ],
        )
        client = _FakeClient(
            """
            {
              "affiliations": [
                "Institute of Biomedicine, School of Medicine, University of Eastern Finland"
              ],
              "zh": {
                "tldr": "中文摘要",
                "motivation": "中文动机",
                "method": "中文方法",
                "result": "中文结果",
                "help_to_user": "中文帮助",
                "idea_spark": {"transferable": true, "idea": "中文想法", "risk": "中文风险", "inspiration": "中文启发"}
              },
              "en": {
                "tldr": "English TLDR",
                "motivation": "English motivation",
                "method": "English method",
                "result": "English result",
                "help_to_user": "English help",
                "idea_spark": {"transferable": true, "idea": "English idea", "risk": "English risk", "inspiration": "English inspiration"}
              }
            }
            """
        )

        analysis, affiliations = analyze_paper(
            client=client,
            paper=paper,
            model="deepseek-chat",
            language="Chinese",
            temperature=0.2,
        )

        self.assertEqual(
            affiliations,
            ["Institute of Biomedicine, School of Medicine, University of Eastern Finland"],
        )
        self.assertEqual(analysis["tldr"], "中文摘要")
        self.assertEqual(analysis["bilingual"]["en"]["tldr"], "English TLDR")

    def test_analysis_call_keeps_summary_even_without_affiliations(self) -> None:
        paper = Paper(
            paper_id="2604.00068",
            title="Test paper without affiliation result",
            summary="Test summary",
            authors=["A. Author"],
            categories=["q-bio.BM"],
            published="2026-04-02T00:00:00Z",
            link="https://arxiv.org/abs/2604.00068",
        )
        client = _FakeClient(
            """
            {
              "zh": {"tldr": "只有摘要", "motivation": "", "method": "", "result": "", "help_to_user": "", "idea_spark": {}},
              "en": {"tldr": "summary only", "motivation": "", "method": "", "result": "", "help_to_user": "", "idea_spark": {}}
            }
            """
        )

        analysis, affiliations = analyze_paper(
            client=client,
            paper=paper,
            model="deepseek-chat",
            language="Chinese",
            temperature=0.2,
        )

        self.assertEqual(affiliations, [])
        self.assertEqual(analysis["tldr"], "只有摘要")


if __name__ == "__main__":
    unittest.main()
