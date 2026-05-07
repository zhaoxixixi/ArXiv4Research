# Contributing to ArXiv4Research

Thanks for considering a contribution. This project welcomes improvements that help researchers build their own arXiv digests.

## What to contribute

- **New domain examples** — share a domain config that worked well for your field
- **Bug fixes** — pipeline logic, frontend rendering, data edge cases
- **Documentation** — clearer setup guides, config explanations, troubleshooting tips
- **Frontend enhancements** — accessibility, mobile UX, theme improvements
- **Tests** — coverage for edge cases, new features, or regression guards

Not sure if something fits? Open an issue to discuss before writing code.

## Development setup

### Python pipeline

```bash
git clone https://github.com/zhaoxixixi/ArXiv4Research.git
cd ArXiv4Research
pip install -r requirements.txt
cp config/config.example.yaml config/config.yaml
```

Install test dependencies:

```bash
pip install pytest
```

### Frontend

```bash
npm install
```

## Running tests

```bash
# All tests
pytest

# Specific test file
pytest tests/test_arxiv_api_client.py

# With verbose output
pytest -v
```

Tests use mocked network calls where possible. Tests that hit real APIs require environment variables (`OPENAI_API_KEY`, etc.) and will be skipped otherwise.

## Code style

- **Python**: [Ruff](https://docs.astral.sh/ruff/) with settings in `pyproject.toml`. Run `ruff check app/ tests/` before committing.
- **JavaScript**: ESLint + Prettier. Run `npm run lint` and `npm run format` before committing.

## Pull request checklist

- [ ] Changes are focused — one logical change per PR
- [ ] Tests pass locally (`pytest`)
- [ ] Lint checks pass (`ruff check app/ tests/` and `npm run lint`)
- [ ] New config keys are documented in `config/config.example.yaml`
- [ ] New behavior is covered by tests where practical
- [ ] No secrets, tokens, or API keys anywhere in the changes
- [ ] Screenshots included for visible UI changes

## Reporting issues

When opening an issue, include:

- expected behavior vs. actual behavior
- reproduction steps
- sample arXiv paper ID or category if relevant
- screenshots for UI bugs
- relevant log output (redact any sensitive info first)

## Design principles

- **Static-first** — the site must work as pure static files served from any web server
- **No breaking schema changes** — daily JSON snapshots (`data/daily/*.json`) should remain backward-compatible, or include a migration plan
- **Config over code** — new behavior should be controlled through `config/config.yaml`, not hardcoded
- **Keep it reviewable** — small, focused PRs are easier to review and merge
