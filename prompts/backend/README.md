# Backend prompt templates

These files are editable backend prompt templates.
You can tune them without changing Python code.

## Files
- `analysis_system.txt`: system prompt for daily paper analysis
- `analysis_user.txt`: user prompt template for daily paper analysis
- `affiliation_cleanup_system.txt`: system prompt for affiliation cleanup
- `affiliation_cleanup_user.txt`: user prompt template for affiliation cleanup
- `followup_system.txt`: system prompt for CLI/backend follow-up answers
- `followup_user.txt`: user prompt template for CLI/backend follow-up answers
- `rerank_query.txt`: embedding / rerank query template used during paper ranking

## Placeholder syntax
Use `[[placeholder_name]]`.

Current placeholders include:
- `[[language]]`
- `[[title]]`
- `[[abstract]]`
- `[[authors_json]]`
- `[[authors_csv]]`
- `[[domain]]`
- `[[current_affiliations_json]]`
- `[[raw_affiliation_candidates_json]]`
- `[[research_context]]`
- `[[question]]`
- `[[keywords_csv]]`

## Important note
If you want the system to find papers more aligned with your interests, the most impactful files are usually:
- `rerank_query.txt`
- `analysis_system.txt`
- `analysis_user.txt`

The actual candidate pool is still constrained by your configured arXiv categories / keywords / rerank settings in `config/config.yaml`.
