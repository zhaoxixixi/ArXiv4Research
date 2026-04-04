from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from app.ai_client import analyze_paper, followup_answer
from app.models import Paper
from app.prompts import render_prompt_template
from app.rerank import _build_query


class _CapturingCompletions:
    def __init__(self, content: str) -> None:
        self._content = content
        self.last_messages: list[dict[str, str]] = []

    def create(self, **kwargs: object) -> SimpleNamespace:
        self.last_messages = list(kwargs.get("messages", []))
        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(content=self._content),
                )
            ]
        )


class _CapturingClient:
    def __init__(self, content: str) -> None:
        self.chat = SimpleNamespace(completions=_CapturingCompletions(content))


class PromptExternalizationTests(unittest.TestCase):
    def test_render_prompt_template_replaces_placeholder_tokens(self) -> None:
        rendered = render_prompt_template(
            "Language=[[language]] / Title=[[title]] / Missing=[[missing]]",
            {"language": "Chinese", "title": "Test Paper"},
        )
        self.assertEqual(rendered, "Language=Chinese / Title=Test Paper / Missing=")

    def test_analyze_paper_uses_external_prompt_files(self) -> None:
        paper = Paper(
            paper_id="2604.10001",
            title="Prompt test paper",
            summary="A test abstract.",
            authors=["A. Author"],
            categories=["cs.LG"],
            published="2026-04-04T00:00:00Z",
            link="https://arxiv.org/abs/2604.10001",
        )
        client = _CapturingClient('{"zh": {"tldr": "ok"}, "en": {"tldr": "ok"}}')

        with tempfile.TemporaryDirectory() as tmpdir:
            prompt_dir = Path(tmpdir)
            (prompt_dir / "analysis_system.txt").write_text("CUSTOM ANALYSIS SYSTEM", encoding="utf-8")
            (prompt_dir / "analysis_user.txt").write_text(
                "LANG=[[language]]\nTITLE=[[title]]\nABSTRACT=[[abstract]]",
                encoding="utf-8",
            )
            analyze_paper(
                client=client,
                paper=paper,
                model="deepseek-chat",
                language="Chinese",
                temperature=0.2,
                prompt_dir=prompt_dir,
            )

        self.assertEqual(client.chat.completions.last_messages[0]["content"], "CUSTOM ANALYSIS SYSTEM")
        self.assertIn("LANG=Chinese", client.chat.completions.last_messages[1]["content"])
        self.assertIn("TITLE=Prompt test paper", client.chat.completions.last_messages[1]["content"])

    def test_followup_and_rerank_query_can_use_external_templates(self) -> None:
        paper = Paper(
            paper_id="2604.10002",
            title="Follow-up test paper",
            summary="Another abstract.",
            authors=["A. Author"],
            categories=["cs.LG"],
            published="2026-04-04T00:00:00Z",
            link="https://arxiv.org/abs/2604.10002",
        )
        client = _CapturingClient("answer")

        with tempfile.TemporaryDirectory() as tmpdir:
            prompt_dir = Path(tmpdir)
            (prompt_dir / "followup_system.txt").write_text("FOLLOWUP [[language]]", encoding="utf-8")
            (prompt_dir / "followup_user.txt").write_text(
                "CTX=[[research_context]]\nQ=[[question]]\nTITLE=[[title]]",
                encoding="utf-8",
            )
            (prompt_dir / "rerank_query.txt").write_text(
                "CTX=[[research_context]]\nKEYS=[[keywords_csv]]",
                encoding="utf-8",
            )

            followup_answer(
                client=client,
                model="deepseek-chat",
                temperature=0.2,
                language="Chinese",
                paper=paper,
                question="What should I test next?",
                research_context="biology x ai",
                prompt_dir=prompt_dir,
            )
            query = _build_query("biology x ai", ["single-cell", "diffusion"], prompt_dir=prompt_dir)

        self.assertEqual(client.chat.completions.last_messages[0]["content"], "FOLLOWUP Chinese")
        self.assertIn("Q=What should I test next?", client.chat.completions.last_messages[1]["content"])
        self.assertEqual(query, "CTX=biology x ai\nKEYS=single-cell, diffusion")


if __name__ == "__main__":
    unittest.main()
