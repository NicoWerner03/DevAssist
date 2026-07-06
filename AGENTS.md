# AGENTS.md

Compact guidance for OpenCode sessions in this repo.

## Commands
- `npm run dev` — primary development command (tsx watch on `src/server.ts`)
- `npm run build` — TypeScript compile to `dist/`
- `npm run publish-issue -- <projectId>/<issueIid> [actions]` - manual publish step (e.g. `123/42` or `123/42 close,ready`)
- `npm test` — node:test suite under `tests/`

## Architecture & entry points
- Pure Express webhook service (`src/server.ts` -> `src/app.ts`)
- GitLab triggers only when `@dev-assist` starts the first content line of the description or comment; leading whitespace and simple Markdown formatting are tolerated
- Primary AI path: `AI_PROVIDER=opencode` using the `opencode` CLI and the `dev-assist-analyzer` agent defined in `opencode.json`; detailed runtime instructions live in `src/services/ai/instructions.ts`
- GitLab auth: `glab` is the default (run `glab auth login` once); PAT fallback via `GITLAB_TOKEN`
- Context files written to `.dev-assist/issues/<projectId>/<issueIid>/context.md` plus `context.json` metadata when available

## Environment & config
- Copy `.env.example` → `.env` (required)
- `AI_PROVIDER=mock` works with zero keys for local testing; `AI_PROVIDER=opencode` uses the configured `opencode` CLI and `AI_MODEL`
- All console output is the only logging (no file logs)

## Workflow notes
- `process` endpoint proposes structured ticket + writes context files
- `publish` endpoint deletes Dev-Assist related comments and replaces issue title/description
- Never run publish without a prior successful process step (context files must exist)
