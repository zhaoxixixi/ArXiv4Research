from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from app.config import load_config


class ConfigSourceModeTests(unittest.TestCase):
    def test_load_config_defaults_to_api_strict_window(self) -> None:
        config_text = """
project:
  title: Test
  top_k: 5
  keep_days: 7
  timezone: Asia/Shanghai
  language: Chinese

retrieval:
  max_feed_items_per_category: 10
  domains: []

relevance:
  research_context: test
  keywords: []
  embedding_model: text-embedding-v4

analysis:
  model: deepseek-chat
  temperature: 0.2
"""
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "config.yaml"
            path.write_text(config_text, encoding="utf-8")
            cfg = load_config(path)

        self.assertEqual(cfg.source_mode, "api_strict_window")

    def test_load_config_rejects_legacy_rss_mode(self) -> None:
        config_text = """
project:
  title: Test
  top_k: 5
  keep_days: 7
  timezone: Asia/Shanghai
  language: Chinese

source:
  mode: rss_legacy

retrieval:
  max_feed_items_per_category: 10
  domains: []

relevance:
  research_context: test
  keywords: []
  embedding_model: text-embedding-v4

analysis:
  model: deepseek-chat
  temperature: 0.2
"""
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "config.yaml"
            path.write_text(config_text, encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "Unsupported source.mode"):
                load_config(path)


if __name__ == "__main__":
    unittest.main()
