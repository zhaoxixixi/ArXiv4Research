# Security Policy

## Supported Scope

This repository is maintained as a small personal project.

Security-sensitive areas include:

- GitHub Actions workflow configuration
- deployment to `gh-pages`
- handling of API keys / tokens / repository secrets
- browser-side local storage settings for user-provided API credentials

The latest `main` branch and the currently deployed GitHub Pages site are the primary supported targets for security fixes.

## Reporting a Vulnerability

Please **do not open a public GitHub issue** for suspected security problems.

Instead, use one of these private channels:

1. **GitHub Private Vulnerability Reporting / Security Advisory** for this repository, if enabled
2. Otherwise, contact the maintainer privately before any public disclosure

When reporting, please include:

- a short description of the issue
- affected file / workflow / page
- reproduction steps
- possible impact
- whether any secret, token, or user data may be exposed

## Sensitive Information Rules

Please never post any of the following in public issues, pull requests, screenshots, or logs:

- API keys
- access tokens
- `.env` contents
- repository secrets
- browser local-storage values copied from the site

If you accidentally expose a secret:

1. revoke or rotate it immediately
2. remove it from the repository / workflow / screenshot
3. notify the maintainer privately

## Disclosure Expectations

The project aims to acknowledge and fix valid security issues in a reasonable time, but no formal SLA is guaranteed.

Please allow time for triage and mitigation before public disclosure.
