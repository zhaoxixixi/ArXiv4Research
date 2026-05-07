# ArXiv4Research

[![Daily Pipeline](https://github.com/zhaoxixixi/ArXiv4Research/actions/workflows/daily.yml/badge.svg)](https://github.com/zhaoxixixi/ArXiv4Research/actions/workflows/daily.yml)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE.txt)
[![Python 3.10+](https://img.shields.io/badge/python-3.10%2B-blue)](https://www.python.org/)

English | [中文](README_zh.md)

*Build your own domain-specific arXiv daily digest — define your research areas, and let the pipeline discover, rank, summarize, and publish papers automatically.*

<p align="center">
  <img src="docs/screenshots/main-page.svg" alt="ArXiv4Research main page" width="80%" />
</p>

<p align="center">
  <strong><a href="https://craft.hengrao.top/ArXiv4Research/">Live Demo</a></strong> — a production instance deployed by this project's GitHub Actions workflow, updated daily.
</p>

## Overview

ArXiv4Research turns arXiv into a personalized daily research feed. You define your domains (biology, AI4Science, security — whatever you care about), configure a few API keys, and the pipeline handles the rest:

1. **Discover** newly announced papers from arXiv's official category pages
2. **Filter and rank** them by relevance to your research using embeddings and optional reranking
3. **Generate bilingual AI summaries** — TL;DR, motivation, method, results, and research sparks
4. **Publish** a static website via GitHub Pages, updated daily on a schedule

The public site is read-only. Personalized features (custom Sparks, follow-up Q&A) run entirely in the visitor's browser using their own API keys — nothing is sent back to a server.

The frontend is fully responsive — the same clean reading experience on desktop, tablet, and mobile, with no zooming or horizontal scrolling required.

> [!IMPORTANT]
> This project is designed to be **forked and customized**. The default configuration reflects one researcher's interests (biology x AI). To build your own digest, you only need to edit one YAML file and set up GitHub Secrets.

## Quick Start (try it locally)

```bash
# Clone and install
git clone https://github.com/zhaoxixixi/ArXiv4Research.git
cd ArXiv4Research
pip install -r requirements.txt
cp config/config.example.yaml config/config.yaml

# Set your API keys
export OPENAI_API_KEY="your-chat-api-key"
export OPENAI_BASE_URL="https://api.deepseek.com/v1"
export EMBEDDING_API_KEY="your-embedding-key"
export EMBEDDING_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"

# Run once
python scripts/run_pipeline.py

# Preview the site
python -m http.server 8000
# Open http://localhost:8000/web/
```

The pipeline writes reports to `data/daily/` and generates `data/index.json`. The frontend in `web/` reads these files directly — no server needed.

## Make It Your Own

The entire pipeline is configured through `config/config.yaml`. To build a digest for **your** research area, you only need to change three things:

### 1. Define your domains

Each domain has arXiv categories, keywords for filtering, and a priority weight for balanced selection:

```yaml
retrieval:
  domains:
    - name: biology
      priority: 100          # higher = more quota in the daily selection
      filter_mode: hard      # "hard" = all keywords must match; "soft" = any keyword
      categories:            # arXiv category codes
        - q-bio.GN
        - q-bio.QM
        - physics.bio-ph
      keywords:              # keywords searched in title + abstract
        - single-cell
        - gene regulatory
        - biological network
      cross_keywords:        # bonus keywords for methodology papers in this domain
        - machine learning
        - deep learning

    - name: your-domain-here
      priority: 80
      filter_mode: soft
      categories:
        - cs.AI
        - cs.LG
      keywords:
        - your-topic
        - another-topic
```

Add as many domains as you need. See `config/config.example.yaml` for a full annotated example with 7 domains.

### 2. Write your research context

This is the natural-language description used for embedding-based ranking. Be specific about what kinds of papers interest you:

```yaml
relevance:
  research_context: >
    I study computational approaches to biological systems.
    I care most about method papers on neural operators,
    symbolic regression, and surrogate modeling that can
    transfer to single-cell or dynamical systems contexts.

  keywords:
    - neural operator
    - symbolic regression
    - single-cell
    - stochastic simulation
    # ... add your own
```

### 3. Choose your AI models

The pipeline uses OpenAI-compatible APIs, so any provider works (DeepSeek, OpenAI, Qwen, local vLLM):

```yaml
relevance:
  embedding_model: text-embedding-v4   # used for initial ranking

rerank:
  mode: embedding_plus_qwen3_rerank    # or "embedding_only" to skip reranking
  model: qwen3-rerank

analysis:
  model: deepseek-chat                 # generates paper summaries
  temperature: 0.2
```

Set the corresponding environment variables (`OPENAI_BASE_URL`, `EMBEDDING_BASE_URL`, `RERANK_BASE_URL`) to point to your providers of choice.

> [!TIP]
> Start with `rerank.mode: embedding_only` to keep things simple. Add reranking later when you have a feel for the output quality.

## How It Works

### Architecture

```
arXiv /recent pages          arXiv API                Your AI provider
       │                         │                         │
       ▼                         ▼                         ▼
┌──────────────┐   ┌─────────────────────┐   ┌─────────────────────┐
│ Announcement │──▶│  Paper discovery    │──▶│  Embedding + Rerank │
│ list parser  │   │  + metadata fetch   │   │  + AI analysis      │
└──────────────┘   └─────────────────────┘   └─────────────────────┘
                                                          │
                                                          ▼
                                                ┌─────────────────────┐
                                                │  Static JSON        │
                                                │  (data/daily/)      │
                                                └─────────┬───────────┘
                                                          │
                                                          ▼
                                                ┌─────────────────────┐
                                                │  Vanilla JS site    │
                                                │  (GitHub Pages)     │
                                                └─────────────────────┘
```

### Pipeline steps

| Step | What happens |
|------|-------------|
| **Discovery** | The announcement list mode reads `/list/<category>/recent` to find newly announced paper IDs. A fallback `api_strict_window` mode queries the arXiv API directly by date range. |
| **Metadata fetch** | Paper IDs are resolved in batches through the arXiv API (`id_list` queries). Each paper gets title, abstract, authors, categories, and a canonical HTTPS link. |
| **Domain classification** | Each paper is assigned to a domain based on its arXiv categories. Papers that don't match any domain keyword filter are dropped. |
| **Embedding rank** | A combined query (your research context + keywords) is embedded alongside paper title+abstract. Cosine similarity gives the base relevance score, which is boosted by domain priority. |
| **Optional rerank** | If `qwen3-rerank` is enabled, the top-N papers (controlled by `pool_size`) are re-scored for finer ordering. |
| **Balanced selection** | Papers are picked with quotas proportional to domain priorities, ensuring diversity across your research areas. |
| **AI analysis** | Each selected paper gets a structured bilingual summary: TL;DR, motivation, method, results, how-it-helps-you, and a research spark with actionable ideas. |
| **Site generation** | The pipeline writes daily JSON snapshots and search indexes. A vanilla-JS frontend renders them as filterable cards with detail modals, PDF viewer, and keyword statistics. |

### Two fetch modes

| Mode | How it works | Best for |
|------|-------------|----------|
| `announcement_list` (default) | Follows arXiv's official `/recent` pages, tracks progress by announcement date | Production use; matches arXiv's public rhythm |
| `api_strict_window` | Queries the arXiv API with a `submittedDate` window | Debugging, backfilling, comparing behavior |

> [!NOTE]
> `announcement_list` means "no new announcements → no update today." This is the intended behavior and avoids publishing near-empty reports.

## Deployment (GitHub Actions)

The included workflow publishes your digest on a schedule with zero hosting cost:

### 1. Fork the repository

### 2. Configure GitHub Pages

Go to **Settings → Pages** and set:
- **Source**: `Deploy from a branch`
- **Branch**: `gh-pages`, root folder

### 3. Add Secrets

In **Settings → Secrets and variables → Actions**, add:

| Secret | Description |
|--------|-------------|
| `OPENAI_API_KEY` | Your chat/completion API key |
| `OPENAI_BASE_URL` | Chat API base URL (e.g. `https://api.deepseek.com/v1`) |
| `EMBEDDING_API_KEY` | Embedding API key |
| `EMBEDDING_BASE_URL` | Embedding API base URL |
| `RERANK_API_KEY` | Rerank API key *(optional)* |
| `RERANK_BASE_URL` | Rerank API base URL *(optional)* |
| `DASHSCOPE_API_KEY` | Compatibility alias for embedding/rerank *(optional)* |
| `PAGES_DEPLOY_TOKEN` | Fine-grained PAT for pushing to `gh-pages` *(optional; falls back to `GITHUB_TOKEN`)* |

### 4. Edit the schedule

The workflow runs at [03:00 Asia/Shanghai](.github/workflows/daily.yml#L6). Adjust the cron line to your preferred timezone and frequency.

### 5. Trigger the first run

Go to **Actions → arxiv-research-daily → Run workflow**. After it completes, your site will be live at `https://<your-username>.github.io/ArXiv4Research/`.

> [!WARNING]
> Never commit API keys to the repository. The `.gitignore` excludes `.env`, `config/config.yaml`, and `data/`. All credentials go through **GitHub Secrets** for CI, or environment variables for local runs.

## Local Development

### Run the full pipeline

```bash
python scripts/run_pipeline.py --config config/config.yaml --data-dir data
```

### Build the deployable site bundle

```bash
python scripts/build_site.py --source-data data --output-dir build/site
python -m http.server 8000 --directory build/site
```

### Project structure

```
app/                          # Python pipeline
├── pipeline.py               # Main orchestrator
├── config.py                 # YAML config loader
├── models.py                 # Data classes (Paper, Config, DomainBucket)
├── rerank.py                 # Embedding ranking, reranking, balanced selection
├── arxiv_announcement_client.py  # /recent page parser
├── arxiv_api_client.py       # arXiv API client (search + id_list)
├── arxiv_transport.py        # HTTP layer with retry logic
├── fetch_state.py            # Incremental state tracking
├── storage.py                # JSON snapshot + index generation
├── sniffer.py                # Code-link detection (GitHub, HF, Colab)
├── ai/                       # AI analysis, embedding, rerank clients
└── arxiv_support/            # Metadata parsing, affiliation extraction
config/
├── config.example.yaml       # Annotated template (safe to commit)
└── config.yaml               # Your local config (gitignored)
prompts/backend/              # LLM prompt templates (.txt)
scripts/                      # CLI entry points
web/                          # Static frontend (vanilla JS + CSS)
├── index.html                # Daily report page
├── statistics.html           # Keyword statistics page
└── scripts/
    ├── shared/               # Theme, date, data helpers
    ├── paper-detail/         # Modal, local AI, cache, PDF viewer
    ├── app.js                # Daily report entry point
    └── statistics.js         # Statistics page entry point
data/                         # Generated output (gitignored)
```

### Tech stack

- **Pipeline**: Python 3.10+, `feedparser` for Atom, `pyyaml` for config, `openai` SDK for AI
- **Frontend**: Zero-dependency vanilla JS + CSS, modules communicate via `window.ARA`
- **AI models**: Any OpenAI-compatible provider (DeepSeek, Qwen, OpenAI, local vLLM)
- **Deployment**: GitHub Actions → GitHub Pages (`gh-pages` branch)

## Security

- **API keys** are read from environment variables locally and from GitHub Secrets in CI — never hardcoded
- **Browser-local settings** (visitor API keys, research context) stay in `localStorage` / `sessionStorage` and are never uploaded
- **`.env`**, **`config/config.yaml`**, and **`data/`** are gitignored to prevent accidental commits
- Report a vulnerability privately using [GitHub's security advisory](https://github.com/zhaoxixixi/ArXiv4Research/security/advisories/new) — do not open a public issue

See [SECURITY.md](.github/SECURITY.md) for the full policy.
