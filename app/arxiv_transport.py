from __future__ import annotations

import logging
import random
import socket
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

logger = logging.getLogger(__name__)

ARXIV_USER_AGENT = "ArXiv4Research/0.1 (polite client; mailto:your-email@example.com)"
ARXIV_POLITE_DELAY_SECONDS = 3.5
ARXIV_RETRY_BASE_DELAY_SECONDS = 6.0
ARXIV_RATE_LIMIT_BASE_DELAY_SECONDS = 30.0
ARXIV_REQUEST_TIMEOUT_SECONDS = 60
ARXIV_MAX_RETRIES = 4
ARXIV_MAX_RATE_LIMIT_RETRIES = 6

_last_arxiv_request_at = 0.0


def _backoff_with_jitter(base_seconds: float, attempt: int) -> float:
    """Exponential backoff with full jitter to avoid thundering herd."""
    return base_seconds * (2 ** attempt) * random.random()


class ArxivRequestError(RuntimeError):
    """Raised when a polite arXiv request ultimately fails after retries."""

    def __init__(self, url: str, message: str) -> None:
        super().__init__(message)
        self.url = url


def reset_transport_state() -> None:
    """Reset the in-process arXiv rate-limit clock, mainly for tests."""

    global _last_arxiv_request_at
    _last_arxiv_request_at = 0.0


def _enforce_polite_delay() -> None:
    """Wait until the polite inter-request interval has elapsed."""
    global _last_arxiv_request_at
    elapsed = time.monotonic() - _last_arxiv_request_at
    if elapsed < ARXIV_POLITE_DELAY_SECONDS:
        time.sleep(ARXIV_POLITE_DELAY_SECONDS - elapsed)


def _parse_retry_after(headers: dict) -> float | None:
    """Parse a Retry-After header value into seconds."""
    for key in ("Retry-After", "retry-after"):
        value = headers.get(key)
        if value is None:
            continue
        try:
            return float(value)
        except (TypeError, ValueError):
            pass
        try:
            # HTTP-date format
            from email.utils import parsedate_to_datetime
            retry_dt = parsedate_to_datetime(str(value))
            if retry_dt is not None:
                delta = (retry_dt - __import__("datetime").datetime.now(retry_dt.tzinfo)).total_seconds()
                return max(0.0, delta)
        except Exception:
            pass
    return None


def fetch_arxiv_response(url: str, accept: str = "*/*") -> tuple[bytes, str]:
    """Fetch raw bytes from arXiv with polite rate limiting and retry/backoff."""

    global _last_arxiv_request_at

    for attempt in range(ARXIV_MAX_RETRIES):
        _enforce_polite_delay()

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
            code = int(exc.code)

            # 429 Rate Limited — use much longer backoff and check Retry-After
            if code == 429:
                rate_limit_attempt = attempt
                # Check if this is a repeated rate-limit (we already retried with long delays)
                retry_after = _parse_retry_after(dict(exc.hdrs) if exc.hdrs else {})
                if retry_after is not None and retry_after > 0:
                    delay = retry_after + random.uniform(0, 5)
                    logger.info("arXiv 429 Retry-After=%.0fs, waiting %.0fs", retry_after, delay)
                else:
                    delay = _backoff_with_jitter(ARXIV_RATE_LIMIT_BASE_DELAY_SECONDS, rate_limit_attempt)
                    logger.info("arXiv 429 rate limited (attempt %d), waiting %.0fs", rate_limit_attempt + 1, delay)

                if attempt < ARXIV_MAX_RATE_LIMIT_RETRIES - 1:
                    time.sleep(delay)
                    # Also reset _last_arxiv_request_at so polite delay applies on next attempt
                    _last_arxiv_request_at = time.monotonic()
                    continue

            # Other retryable errors
            should_retry = code in {403, 408, 500, 502, 503, 504} and attempt < ARXIV_MAX_RETRIES - 1
            if should_retry:
                delay = _backoff_with_jitter(ARXIV_RETRY_BASE_DELAY_SECONDS, attempt)
                logger.info("arXiv HTTP %d (attempt %d), retrying in %.0fs", code, attempt + 1, delay)
                time.sleep(delay)
                continue

            logger.warning("arXiv request failed for %s: HTTP %s", url, code)
            raise ArxivRequestError(url, f"HTTP {code}") from exc
        except URLError as exc:
            _last_arxiv_request_at = time.monotonic()
            if attempt < ARXIV_MAX_RETRIES - 1:
                delay = _backoff_with_jitter(ARXIV_RETRY_BASE_DELAY_SECONDS, attempt)
                time.sleep(delay)
                continue
            logger.warning("arXiv request failed for %s: %s", url, exc)
            raise ArxivRequestError(url, str(exc)) from exc
        except (TimeoutError, socket.timeout) as exc:
            _last_arxiv_request_at = time.monotonic()
            if attempt < ARXIV_MAX_RETRIES - 1:
                delay = _backoff_with_jitter(ARXIV_RETRY_BASE_DELAY_SECONDS, attempt)
                time.sleep(delay)
                continue
            logger.warning("arXiv request timed out for %s: %s", url, exc)
            raise ArxivRequestError(url, str(exc)) from exc
        except Exception as exc:  # pragma: no cover - unexpected network failure path
            _last_arxiv_request_at = time.monotonic()
            logger.warning("Unexpected arXiv request failure for %s: %s", url, exc)
            raise ArxivRequestError(url, str(exc)) from exc

    raise ArxivRequestError(url, "Request failed after retries")


def fetch_arxiv_text(url: str) -> str:
    """Fetch text/HTML content from arXiv using the shared polite transport."""

    try:
        body, charset = fetch_arxiv_response(
            url,
            accept="text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        )
    except ArxivRequestError:
        return ""
    if not body:
        return ""
    return body.decode(charset, errors="replace")
