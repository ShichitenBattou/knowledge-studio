---
name: github-context
description: GitHub repository and user context for PR creation
metadata:
  type: reference
---

## Repository Information

- Owner: ShichitenBattou
- Repository: knowledge-studio
- Default Base Branch: master
- Repository URL: https://github.com/ShichitenBattou/knowledge-studio

## Current User

- GitHub Username: ShichitenBattou
- Email: pockorcky@gmail.com

## PR Creation Notes

- The `mcp__github__create_pull_request` tool does not have a `reviewers` parameter
- Reviewers must be added via `gh pr edit` or `mcp__github__update_pull_request` after PR creation
- "Copilot" is not a valid GitHub user login and cannot be added as a reviewer via standard GitHub API
- Use actual GitHub usernames when adding reviewers
- Always include `Closes #<ISSUE_NUMBER>` in the PR body for automatic issue closure

## ADR Index Files

ADR index.json files follow this pattern:

- File location: `docs/adr/<YYYYMMDD>_<summary>.index.json`
- Required fields: `adrFile`, `title`, `status`, `summary`, `relatedFiles`
- Example: `/home/pocko/Projects/knowledge-studio/docs/adr/20260609_introduce_formatter_linter.index.json`
