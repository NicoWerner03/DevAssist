# AGENTS.md

Compact guidance for OpenCode sessions in this repo.

## Commands
- `npm run dev` — primary development command (tsx watch on `src/server.ts`)
- `npm run build` — TypeScript compile to `dist/`
- `npm run publish-issue -- <projectId>/<issueIid>` — manual publish step (e.g. `123/42`)
- No tests exist (`npm test` is a no-op)

## Architecture & entry points
- Pure Express webhook service (`src/server.ts` → `src/app.ts`)
- GitLab triggers only on **leading** `@dev-assist` (description or comment)
- Primary AI path: `AI_PROVIDER=opencode` using the `dev-assist-analyzer` agent defined in `opencode.json` (prompt lives at `.opencode/prompts/requirement-analysis.md`)
- GitLab auth: `glab` is the default (run `glab auth login` once); PAT fallback via `GITLAB_TOKEN`
- Context files written to `.dev-assist/issues/<projectId>/<issueIid>/context.md`

## Environment & config
- Copy `.env.example` → `.env` (required)
- `AI_PROVIDER=mock` works with zero keys for local testing
- All console output is the only logging (no file logs)

## Workflow notes
- `process` endpoint proposes structured ticket + writes context file
- `publish` endpoint deletes `@dev-assist` comments and replaces issue description
- Never run publish without a prior successful process step (context file must exist)
