**GitPushAgent**

Purpose: Automatically detect local repository changes, create a commit, and push updates to the configured remote when allowed.

Usage:
- Run locally: `AUTO_PUSH=true npm run git-auto-push` (from repo root)
- Dry run (no push): `npm run git-auto-push`

Behavior:
- Checks `git status --porcelain` for changes.
- Stages all changes (`git add -A`) and commits with a timestamped message.
- Only pushes when `AUTO_PUSH=true` environment variable is set to avoid accidental pushes.

Security & Safety:
- The script does not manage credentials. Ensure `git` is configured (SSH key or credential helper) or set `GITHUB_TOKEN` in your environment if using an HTTPS flow managed by your environment.
- The agent is intentionally conservative: it will refuse to push unless `AUTO_PUSH=true`.

Integration ideas:
- Wire this into `AgentRunner` to push after audit entries are appended.
- Use `AUTO_PUSH` gating and an allow-list file to restrict which files are auto-committed.
