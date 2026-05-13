from __future__ import annotations

import random
import unittest
from urllib.error import HTTPError
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

    def test_fetch_arxiv_response_raises_on_terminal_http_error(self) -> None:
        error = HTTPError(
            url="https://export.arxiv.org/api/query?search_query=cat:cs.LG",
            code=503,
            msg="service unavailable",
            hdrs=None,
            fp=None,
        )

        with (
            patch("app.arxiv_transport.urlopen", side_effect=error),
            patch("app.arxiv_transport.time.sleep"),
        ):
            with self.assertRaises(arxiv_transport.ArxivRequestError):
                arxiv_transport.fetch_arxiv_response("https://export.arxiv.org/api/query?search_query=cat:cs.LG")

    def test_fetch_arxiv_response_retries_timeout_error(self) -> None:
        responses = [TimeoutError("The read operation timed out"), _DummyResponse(b"retry-ok")]

        with (
            patch("app.arxiv_transport.urlopen", side_effect=responses),
            patch("app.arxiv_transport.time.monotonic", side_effect=[100.0, 100.0, 104.0, 104.0]),
            patch("app.arxiv_transport.time.sleep") as mocked_sleep,
            patch("app.arxiv_transport.random.uniform", return_value=0.75),
        ):
            body, charset = arxiv_transport.fetch_arxiv_response(
                "https://export.arxiv.org/api/query?search_query=cat:math.PR"
            )

        self.assertEqual(body, b"retry-ok")
        self.assertEqual(charset, "utf-8")
        # With bounded jitter: base_delay * (2^0) + 0.75 = 6.75
        mocked_sleep.assert_called_once_with(6.75)

    def test_fetch_arxiv_response_retries_429_with_rate_limit_budget(self) -> None:
        error = HTTPError(
            url="https://export.arxiv.org/api/query?id_list=2604.00001",
            code=429,
            msg="too many requests",
            hdrs={"Retry-After": "2"},
            fp=None,
        )

        with (
            patch("app.arxiv_transport.urlopen", side_effect=error) as mocked_urlopen,
            patch("app.arxiv_transport._enforce_polite_delay"),
            patch("app.arxiv_transport.time.monotonic", return_value=100.0),
            patch("app.arxiv_transport.time.sleep") as mocked_sleep,
            patch("app.arxiv_transport.random.uniform", return_value=0.0),
        ):
            with self.assertRaisesRegex(arxiv_transport.ArxivRequestError, "HTTP 429"):
                arxiv_transport.fetch_arxiv_response("https://export.arxiv.org/api/query?id_list=2604.00001")

        self.assertEqual(mocked_urlopen.call_count, arxiv_transport.ARXIV_MAX_RATE_LIMIT_RETRIES)
        self.assertEqual(mocked_sleep.call_count, arxiv_transport.ARXIV_MAX_RATE_LIMIT_RETRIES - 1)
        self.assertTrue(all(call.args[0] == 2.0 for call in mocked_sleep.call_args_list))

    def test_fetch_arxiv_response_recovers_after_429_retry(self) -> None:
        error = HTTPError(
            url="https://export.arxiv.org/api/query?id_list=2604.00001",
            code=429,
            msg="too many requests",
            hdrs={"Retry-After": "2"},
            fp=None,
        )
        responses = [error, _DummyResponse(b"retry-ok")]

        with (
            patch("app.arxiv_transport.urlopen", side_effect=responses) as mocked_urlopen,
            patch("app.arxiv_transport._enforce_polite_delay"),
            patch("app.arxiv_transport.time.monotonic", return_value=100.0),
            patch("app.arxiv_transport.time.sleep") as mocked_sleep,
            patch("app.arxiv_transport.random.uniform", return_value=0.0),
        ):
            body, charset = arxiv_transport.fetch_arxiv_response(
                "https://export.arxiv.org/api/query?id_list=2604.00001"
            )

        self.assertEqual(body, b"retry-ok")
        self.assertEqual(charset, "utf-8")
        self.assertEqual(mocked_urlopen.call_count, 2)
        mocked_sleep.assert_called_once_with(2.0)

    def test_fetch_arxiv_text_returns_empty_when_optional_html_fetch_fails(self) -> None:
        with patch(
            "app.arxiv_transport.fetch_arxiv_response",
            side_effect=arxiv_transport.ArxivRequestError("https://arxiv.org/html/2604.00001", "HTTP 404"),
        ):
            html = arxiv_transport.fetch_arxiv_text("https://arxiv.org/html/2604.00001")

        self.assertEqual(html, "")

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
