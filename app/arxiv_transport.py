from __future__ import annotations

import logging
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

logger = logging.getLogger(__name__)

ARXIV_USER_AGENT = "ArXiv4Research/0.1 (polite client)"
ARXIV_POLITE_DELAY_SECONDS = 3.2
ARXIV_RETRY_BASE_DELAY_SECONDS = 6.0
ARXIV_REQUEST_TIMEOUT_SECONDS = 20
ARXIV_MAX_RETRIES = 3

_last_arxiv_request_at = 0.0


def reset_transport_state() -> None:
    """Reset the in-process arXiv rate-limit clock, mainly for tests."""

    global _last_arxiv_request_at
    _last_arxiv_request_at = 0.0


def fetch_arxiv_response(url: str, accept: str = "*/*") -> tuple[bytes, str]:
    """Fetch raw bytes from arXiv with polite rate limiting and retry/backoff."""

    global _last_arxiv_request_at

    for attempt in range(ARXIV_MAX_RETRIES):
        elapsed = time.monotonic() - _last_arxiv_request_at
        if elapsed < ARXIV_POLITE_DELAY_SECONDS:
            time.sleep(ARXIV_POLITE_DELAY_SECONDS - elapsed)

        request = Request(
            url,
            headers={
                "User-Agent": ARXIV_USER_AGENT,
                "Accept": accept,
            },
        )

        try:
            with urlopen(request, timeout=ARXIV_REQUEST_TIMEOUT_SECONDS) as response:
                charset = response.headers.get_content_charset() or "utf-8"
                body = response.read()
                _last_arxiv_request_at = time.monotonic()
                return body, charset
        except HTTPError as exc:
            _last_arxiv_request_at = time.monotonic()
            should_retry = exc.code in {403, 408, 429, 500, 502, 503, 504} and attempt < ARXIV_MAX_RETRIES - 1
            if should_retry:
                time.sleep(ARXIV_RETRY_BASE_DELAY_SECONDS * (attempt + 1))
                continue
            logger.warning("arXiv request failed for %s: HTTP %s", url, exc.code)
            return b"", "utf-8"
        except URLError as exc:
            _last_arxiv_request_at = time.monotonic()
            if attempt < ARXIV_MAX_RETRIES - 1:
                time.sleep(ARXIV_RETRY_BASE_DELAY_SECONDS * (attempt + 1))
                continue
            logger.warning("arXiv request failed for %s: %s", url, exc)
            return b"", "utf-8"
        except Exception as exc:  # pragma: no cover - unexpected network failure path
            _last_arxiv_request_at = time.monotonic()
            logger.warning("Unexpected arXiv request failure for %s: %s", url, exc)
            return b"", "utf-8"

    return b"", "utf-8"


def fetch_arxiv_text(url: str) -> str:
    """Fetch text/HTML content from arXiv using the shared polite transport."""

    body, charset = fetch_arxiv_response(
        url,
        accept="text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    )
    if not body:
        return ""
    return body.decode(charset, errors="replace")
