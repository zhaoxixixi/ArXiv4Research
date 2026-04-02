from __future__ import annotations

import unittest
from types import SimpleNamespace

from app.ai_client import maybe_refine_affiliations_with_llm
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


if __name__ == "__main__":
    unittest.main()
