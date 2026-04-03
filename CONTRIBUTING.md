# Contributing to ArXiv4Research

Thanks for considering a contribution.

## Development principles

- Keep the site fully static and GitHub Pages friendly.
- Do not change pipeline behavior unless the issue explicitly requires it.
- Prefer small, reviewable pull requests.
- Preserve existing JSON schema and public page behavior unless a migration is planned.

## Local setup

```bash
git clone https://github.com/zhaoxixixi/ArXiv4Research.git
cd ArXiv4Research
pip install -r requirements.txt
cp config/config.example.yaml config/config.yaml
```

For frontend formatting and linting:

```bash
npm install
npm run lint
```

## Pull request checklist

- Update or add a plan/worklog entry when the change is non-trivial.
- Run relevant checks locally.
- Keep secrets out of the repository.
- Add screenshots for visible UI changes when possible.
- Document new config keys or workflow behavior in `README.md`.

## Reporting issues

When opening an issue, please include:

- expected behavior
- actual behavior
- reproduction steps
- sample date / paper id if relevant
- screenshots for UI bugs
