from __future__ import annotations

import json
import logging
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from openai import OpenAI

logger = logging.getLogger(__name__)

DEFAULT_RERANK_BASE_URL = "https://dashscope.aliyuncs.com/compatible-api/v1/reranks"
DEFAULT_EMBEDDING_BATCH_SIZE = 10


def build_openai_client() -> OpenAI:
    api_key = os.environ.get("OPENAI_API_KEY", "")
    base_url = os.environ.get("OPENAI_BASE_URL")
    if not api_key:
        raise ValueError("OPENAI_API_KEY is required.")
    kwargs = {"api_key": api_key}
    if base_url:
        kwargs["base_url"] = base_url
    return OpenAI(**kwargs)



def build_embedding_client() -> OpenAI:
    api_key = os.environ.get("EMBEDDING_API_KEY", "")
    base_url = os.environ.get("EMBEDDING_BASE_URL")
    if not api_key:
        raise ValueError("EMBEDDING_API_KEY is required.")
    if not base_url:
        raise ValueError("EMBEDDING_BASE_URL is required.")
    return OpenAI(api_key=api_key, base_url=base_url)



def get_rerank_credentials() -> tuple[str, str]:
    api_key = (
        os.environ.get("RERANK_API_KEY")
        or os.environ.get("EMBEDDING_API_KEY")
        or os.environ.get("DASHSCOPE_API_KEY")
        or ""
    )
    base_url = os.environ.get("RERANK_BASE_URL", DEFAULT_RERANK_BASE_URL)
    if not api_key:
        raise ValueError("RERANK_API_KEY or EMBEDDING_API_KEY or DASHSCOPE_API_KEY is required for rerank.")
    return api_key, base_url



def get_embeddings(embedding_client: OpenAI, texts: list[str], model: str) -> list[list[float]]:
    """Fetch embeddings in small batches compatible with DashScope limits."""

    batch_size = int(os.environ.get("EMBEDDING_BATCH_SIZE", str(DEFAULT_EMBEDDING_BATCH_SIZE)))
    if batch_size <= 0:
        batch_size = DEFAULT_EMBEDDING_BATCH_SIZE

    all_embeddings: list[list[float]] = []
    for index in range(0, len(texts), batch_size):
        batch = texts[index : index + batch_size]
        response = embedding_client.embeddings.create(model=model, input=batch)
        all_embeddings.extend([item.embedding for item in response.data])
    return all_embeddings



def rerank_documents(
    query: str,
    documents: list[str],
    model: str,
    *,
    top_n: int | None = None,
    instruct: str | None = None,
) -> list[dict]:
    api_key, base_url = get_rerank_credentials()
    payload: dict = {
        "model": model,
        "documents": documents,
        "query": query,
    }
    if top_n is not None:
        payload["top_n"] = top_n
    if instruct:
        payload["instruct"] = instruct

    request = Request(
        base_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=60) as response:
            body = response.read().decode("utf-8")
    except HTTPError as exc:
        message = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Rerank request failed with HTTP {exc.code}: {message[:240]}") from exc
    except URLError as exc:
        raise RuntimeError(f"Rerank request failed: {exc}") from exc

    data = json.loads(body)
    results = ((data.get("output") or {}).get("results")) or data.get("results") or []
    if not isinstance(results, list):
        logger.warning("Unexpected rerank response format: %s", data)
        return []
    return results


__all__ = [
    "build_embedding_client",
    "build_openai_client",
    "get_embeddings",
    "get_rerank_credentials",
    "rerank_documents",
]
