# Security Policy

## Supported Scope

Security-sensitive areas in this repository:

- **GitHub Actions workflows** — `.github/workflows/daily.yml` and `frontend-only.yml` handle API credentials and deployment tokens
- **`gh-pages` deployment** — the published site must not leak secrets or internal state
- **API key / token handling** — environment variables, GitHub Secrets, and browser-side local storage
- **Browser-side local settings** — visitor-provided API keys stored in `localStorage` or `sessionStorage`

The latest `main` branch and the currently deployed GitHub Pages site are the supported targets for security fixes.

## Reporting a Vulnerability

Please **do not open a public GitHub issue** for suspected security problems.

Instead, use **GitHub's private vulnerability reporting**:

- Go to [Security → Advisories → Report a vulnerability](https://github.com/zhaoxixixi/ArXiv4Research/security/advisories/new)
- If that page is unavailable, contact the maintainer privately before any public disclosure

When reporting, include:

- a short description of the issue
- affected file / workflow / page
- reproduction steps
- possible impact
- whether any secret, token, or user data may be exposed

## Sensitive Information Rules

Never post any of the following in public issues, pull requests, screenshots, or CI logs:

- API keys (any token starting with `sk-`, `hf_`, or similar prefixes)
- Access tokens (GitHub PATs, deployment tokens)
- `.env` file contents — even commented-out keys
- `Env/` directory contents — these files contain local runtime credentials
- `config/config.yaml` contents — may reveal model provider choices and research interests
- Browser `localStorage` or `sessionStorage` values copied from the live site
- Any URL containing embedded credentials (e.g. `https://token:x-access-token@...`)

> [!WARNING]
> `git remote add` commands with inline tokens (e.g. `https://x-access-token:...@github.com/...`) can leak credentials in CI logs if debug logging is enabled. The project workflows use this pattern; avoid copying it verbatim in public discussions.

## If You Accidentally Expose a Secret

1. **Revoke or rotate it immediately** — most API providers have a one-click key rotation button
2. **Remove it** from wherever it was posted (issue, PR, commit, screenshot)
3. **If it was committed**, contact the maintainer to discuss history cleanup — a force-push to `main` may be needed
4. **Notify the maintainer** privately so they can assess impact

> [!IMPORTANT]
> Even if you delete a secret from a commit and force-push, assume it has been scraped. GitHub webhooks, bots, and third-party mirrors may have already captured it. Rotation is always the correct first step.

## Security Best Practices for Your Fork

If you fork this repository to run your own arXiv digest:

- **Use GitHub Secrets** for all API keys — never put them in `config.yaml` or workflow files
- **Keep `config/config.yaml` gitignored** — the `.gitignore` already does this, do not remove that line
- **Do not commit `.env` or `Env/` files** — these are already gitignored, but double-check before `git add -A`
- **Restrict Actions permissions** — in fork settings, limit workflow token permissions to the minimum needed (`contents: write` for `gh-pages` deployment)
- **Rotate keys periodically** — especially if multiple collaborators have access to the repository
- **Use a fine-grained PAT** for `PAGES_DEPLOY_TOKEN` scoped only to the repository, rather than a classic token with broad access

## Fork PRs and Secrets

GitHub Actions in this repository use repository Secrets. **Pull requests from forks do not have access to these Secrets by default.** If you submit a PR that modifies a workflow, it will not be able to read the upstream Secrets during CI — this is intentional and prevents exfiltration attacks.

## Disclosure Expectations

This project aims to acknowledge and fix valid security issues in a reasonable time, but no formal SLA is guaranteed. Please allow time for triage and mitigation before public disclosure.
