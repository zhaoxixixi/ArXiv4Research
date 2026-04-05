from __future__ import annotations

import unittest
from unittest.mock import patch

from app import arxiv_transport


class _DummyHeaders:
    def __init__(self, charset: str = "utf-8") -> None:
        self._charset = charset

    def get_content_charset(self) -> str:
        return self._charset


class _DummyResponse:
    def __init__(self, body: bytes, charset: str = "utf-8") -> None:
        self._body = body
        self.headers = _DummyHeaders(charset)

    def read(self) -> bytes:
        return self._body

    def __enter__(self) -> "_DummyResponse":
        return self

    def __exit__(self, exc_type: object, exc: object, tb: object) -> bool:
        return False


class ArxivTransportTests(unittest.TestCase):
    def tearDown(self) -> None:
        arxiv_transport.reset_transport_state()

    def test_fetch_arxiv_text_decodes_html_response(self) -> None:
        with patch("app.arxiv_transport.fetch_arxiv_response", return_value=("你好".encode("utf-8"), "utf-8")):
            html = arxiv_transport.fetch_arxiv_text("https://arxiv.org/html/2604.00001")

        self.assertEqual(html, "你好")

    def test_shared_rate_limit_inserts_delay_between_consecutive_requests(self) -> None:
        arxiv_transport.reset_transport_state()
        responses = [_DummyResponse(b"first"), _DummyResponse(b"second")]

        with (
            patch("app.arxiv_transport.urlopen", side_effect=responses),
            patch("app.arxiv_transport.time.monotonic", side_effect=[5.0, 5.0, 6.0, 6.0]),
            patch("app.arxiv_transport.time.sleep") as mocked_sleep,
        ):
            arxiv_transport.fetch_arxiv_response("https://export.arxiv.org/api/query?search_query=cat:cs.LG")
            arxiv_transport.fetch_arxiv_response("https://arxiv.org/html/2604.00001")

        mocked_sleep.assert_called_once()
        self.assertAlmostEqual(mocked_sleep.call_args.args[0], arxiv_transport.ARXIV_POLITE_DELAY_SECONDS - 1.0)


if __name__ == "__main__":
    unittest.main()
