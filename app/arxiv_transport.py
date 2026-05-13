from __future__ import annotations

import logging
import os
import random
import socket
import time
from datetime import datetime
from email.utils import parsedate_to_datetime
from http.client import HTTPMessage
from typing import Mapping
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

logger = logging.getLogger(__name__)

def _env_float(name: str, default: float) -> float:
    try:
        return max(0.0, float(os.environ.get(name, default)))
    except (TypeError, ValueError):
        return default


def _env_int(name: str, default: int) -> int:
    try:
        return max(1, int(os.environ.get(name, default)))
    except (TypeError, ValueError):
        return default


ARXIV_USER_AGENT = os.environ.get(
    "ARXIV_USER_AGENT",
    "ArXiv4Research/0.1 (polite client; mailto:hengrao02@outlook.com)",
)
ARXIV_POLITE_DELAY_SECONDS = _env_float("ARXIV_POLITE_DELAY_SECONDS", 3.5)
ARXIV_RETRY_BASE_DELAY_SECONDS = _env_float("ARXIV_RETRY_BASE_DELAY_SECONDS", 6.0)
ARXIV_RATE_LIMIT_BASE_DELAY_SECONDS = _env_float("ARXIV_RATE_LIMIT_BASE_DELAY_SECONDS", 30.0)
ARXIV_REQUEST_TIMEOUT_SECONDS = _env_float("ARXIV_REQUEST_TIMEOUT_SECONDS", 60.0)
ARXIV_MAX_RETRIES = _env_int("ARXIV_MAX_RETRIES", 4)
ARXIV_MAX_RATE_LIMIT_RETRIES = _env_int("ARXIV_MAX_RATE_LIMIT_RETRIES", 6)
ARXIV_MAX_RETRY_AFTER_SECONDS = _env_float("ARXIV_MAX_RETRY_AFTER_SECONDS", 300.0)

_last_arxiv_request_at = 0.0


def _backoff_with_jitter(base_seconds: float, attempt: int) -> float:
    """Exponential backoff with bounded jitter."""

    exponential = base_seconds * (2 ** attempt)
    return exponential + random.uniform(0.0, base_seconds)


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


def _parse_retry_after(headers: Mapping[str, str] | HTTPMessage | None) -> float | None:
    """Parse a Retry-After header value into seconds."""
    if headers is None:
        return None

    for key in ("Retry-After", "retry-after"):
        value = headers.get(key)
        if value is None:
            continue
        try:
            return min(max(0.0, float(value)), ARXIV_MAX_RETRY_AFTER_SECONDS)
        except (TypeError, ValueError):
            pass
        try:
            retry_dt = parsedate_to_datetime(str(value))
            if retry_dt is not None:
                delta = (retry_dt - datetime.now(retry_dt.tzinfo)).total_seconds()
                return min(max(0.0, delta), ARXIV_MAX_RETRY_AFTER_SECONDS)
        except Exception:
            pass
    return None


def _sleep_before_retry(delay_seconds: float, reason: str, attempt: int, max_attempts: int) -> None:
    logger.info(
        "arXiv request retrying after %s (attempt %d/%d), waiting %.1fs",
        reason,
        attempt + 1,
        max_attempts,
        delay_seconds,
    )
    time.sleep(delay_seconds)


def fetch_arxiv_response(url: str, accept: str = "*/*") -> tuple[bytes, str]:
    """Fetch raw bytes from arXiv with polite rate limiting and retry/backoff."""

    global _last_arxiv_request_at

    last_error_message = "Request failed after retries"

    for attempt in range(ARXIV_MAX_RATE_LIMIT_RETRIES):
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
            last_error_message = f"HTTP {code}"

            if code == 429:
                retry_after = _parse_retry_after(exc.headers)
                if retry_after is not None and retry_after > 0:
                    delay = retry_after + random.uniform(0.0, 5.0)
                else:
                    delay = _backoff_with_jitter(ARXIV_RATE_LIMIT_BASE_DELAY_SECONDS, attempt)

                if attempt < ARXIV_MAX_RATE_LIMIT_RETRIES - 1:
                    _sleep_before_retry(delay, "HTTP 429", attempt, ARXIV_MAX_RATE_LIMIT_RETRIES)
                    _last_arxiv_request_at = time.monotonic()
                    continue
                logger.warning("arXiv request failed for %s: HTTP %s", url, code)
                raise ArxivRequestError(url, f"HTTP {code}") from exc

            should_retry = code in {403, 408, 500, 502, 503, 504} and attempt < ARXIV_MAX_RETRIES - 1
            if should_retry:
                delay = _backoff_with_jitter(ARXIV_RETRY_BASE_DELAY_SECONDS, attempt)
                _sleep_before_retry(delay, f"HTTP {code}", attempt, ARXIV_MAX_RETRIES)
                continue

            logger.warning("arXiv request failed for %s: HTTP %s", url, code)
            raise ArxivRequestError(url, f"HTTP {code}") from exc
        except URLError as exc:
            _last_arxiv_request_at = time.monotonic()
            last_error_message = str(exc)
            if attempt < ARXIV_MAX_RETRIES - 1:
                delay = _backoff_with_jitter(ARXIV_RETRY_BASE_DELAY_SECONDS, attempt)
                _sleep_before_retry(delay, "URL error", attempt, ARXIV_MAX_RETRIES)
                continue
            logger.warning("arXiv request failed for %s: %s", url, exc)
            raise ArxivRequestError(url, str(exc)) from exc
        except (TimeoutError, socket.timeout) as exc:
            _last_arxiv_request_at = time.monotonic()
            last_error_message = str(exc)
            if attempt < ARXIV_MAX_RETRIES - 1:
                delay = _backoff_with_jitter(ARXIV_RETRY_BASE_DELAY_SECONDS, attempt)
                _sleep_before_retry(delay, "timeout", attempt, ARXIV_MAX_RETRIES)
                continue
            logger.warning("arXiv request timed out for %s: %s", url, exc)
            raise ArxivRequestError(url, str(exc)) from exc
        except Exception as exc:  # pragma: no cover - unexpected network failure path
            _last_arxiv_request_at = time.monotonic()
            logger.warning("Unexpected arXiv request failure for %s: %s", url, exc)
            raise ArxivRequestError(url, str(exc)) from exc

    raise ArxivRequestError(url, last_error_message)


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
