from __future__ import annotations

import re

from .models import Paper


GITHUB_RE = re.compile(r"https?://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+")
HF_RE = re.compile(r"https?://huggingface\.co/[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)?")
COLAB_RE = re.compile(r"https?://colab\.research\.google\.com/[^\s)]+")


def sniff_code_links(paper: Paper) -> dict:
    text = f"{paper.title}\n{paper.summary}"
    github = GITHUB_RE.findall(text)
    hf = HF_RE.findall(text)
    colab = COLAB_RE.findall(text)
    return {
        "has_code": bool(github or hf or colab),
        "github": github,
        "huggingface": hf,
        "colab": colab,
    }

