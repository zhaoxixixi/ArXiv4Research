from __future__ import annotations

import unittest

from app.models import DomainBucket, Paper
from app.rerank import select_top_papers_balanced


def _paper(paper_id: str, domain: str, score: float) -> Paper:
    return Paper(
        paper_id=paper_id,
        title=f"{domain} paper {paper_id}",
        summary="summary",
        authors=["Author"],
        categories=[],
        published="2026-04-02T00:00:00Z",
        link=f"https://arxiv.org/abs/{paper_id}",
        domain=domain,
        relevance_score=score,
    )


class DomainBalancedSelectionTests(unittest.TestCase):
    def test_balanced_selection_keeps_domain_coverage_before_global_fill(self) -> None:
        domains = [
            DomainBucket(name="biology", priority=100, categories=[], keywords=[], filter_mode="hard"),
            DomainBucket(name="ai4science", priority=90, categories=[], keywords=[], filter_mode="hard"),
            DomainBucket(name="math-physics", priority=70, categories=[], keywords=[], filter_mode="soft"),
        ]
        ranked = [
            _paper("b1", "biology", 0.99),
            _paper("b2", "biology", 0.97),
            _paper("b3", "biology", 0.95),
            _paper("a1", "ai4science", 0.94),
            _paper("a2", "ai4science", 0.93),
            _paper("m1", "math-physics", 0.70),
        ]

        selected = select_top_papers_balanced(ranked, top_k=5, domains=domains)

        self.assertEqual(len(selected), 5)
        selected_domains = {paper.domain for paper in selected}
        self.assertEqual(selected_domains, {"biology", "ai4science", "math-physics"})

    def test_when_top_k_is_smaller_than_domain_count_priority_decides_base_coverage(self) -> None:
        domains = [
            DomainBucket(name="biology", priority=100, categories=[], keywords=[], filter_mode="hard"),
            DomainBucket(name="ai4science", priority=90, categories=[], keywords=[], filter_mode="hard"),
            DomainBucket(name="math-physics", priority=70, categories=[], keywords=[], filter_mode="soft"),
        ]
        ranked = [
            _paper("b1", "biology", 0.99),
            _paper("a1", "ai4science", 0.98),
            _paper("m1", "math-physics", 0.97),
        ]

        selected = select_top_papers_balanced(ranked, top_k=2, domains=domains)

        self.assertEqual([paper.paper_id for paper in selected], ["b1", "a1"])


if __name__ == "__main__":
    unittest.main()
