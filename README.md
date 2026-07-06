# dev-assist

Pure API service that listens to GitLab webhooks and helps turn rough issues into well-structured, developer-ready tickets using `@dev-assist`.

Everything (webhooks, AI calls, GitLab operations, file writes, publish steps) is logged to the console.

## Workflow (exactly as specified)

1. Issue is created or a comment is added on GitLab.
2. GitLab webhook (or manual trigger) notifies dev-assist.
3. If the first content line of the description or comment starts with `@dev-assist`, the tool reacts. Leading whitespace and simple Markdown markers such as `##`, `-`, or `**` are tolerated.
4. **Optimal case** (enough information): dev-assist posts a **proposal comment** showing how the structured ticket will look.
5. User replies with `@dev-assist publish`:
   - All `@dev-assist` conversation comments are deleted.
   - The issue title and description are replaced with the clean, standardized structure.
6. If information is missing: dev-assist asks clarifying questions in comments until it has enough, then proposes again.

The resulting tickets always follow the same reliable structure. The detailed analysis rules live in `src/services/ai/instructions.ts`, and the runtime output is validated against `src/services/ai/schema.ts`.

## Tech

- TypeScript, Express
- GitLab webhooks + `glab` (primary, often no `GITLAB_TOKEN` needed in `.env`) or PAT fallback
- AI via `AI_PROVIDER=mock` for local testing or `AI_PROVIDER=opencode` for real analysis through the `opencode` CLI and the `dev-assist-analyzer` agent
- Provider and model are configured through `.env`; `opencode.json` defines the analyzer and repository-summary agents.
- All secrets in `.env`
- Local context bridge: `.dev-assist/issues/<projectId>/<issueIid>/context.md` plus `context.json` metadata

## Quickstart (mock mode – no keys required)

```powershell
# 1. Copy env and adjust
Copy-Item .env.example .env

# 2. Run in mock mode (instant structured output)
npm run dev
```

In another terminal / PowerShell:

```powershell
# Health
curl http://localhost:5000/health

# Simulate an issue webhook (PowerShell)
$body = @{
  object_kind = "issue"
  project = @{ id = 123; path_with_namespace = "mygroup/myproject" }
  object_attributes = @{
    iid = 42
    title = "Improve login"
    description = "@dev-assist Users should be able to log in with passkeys. Currently only password + 2FA."
    action = "open"
  }
  user = @{ username = "alice" }
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri http://localhost:5000/webhooks/gitlab/issues `
  -Method Post -ContentType 'application/json' -Body $body
```

Watch the console – every step is logged.

Context files will appear under `.dev-assist/issues/123/42/` (`context.md` and, when metadata is available, `context.json`).
When `AI_PROVIDER=opencode`, the first process run for a GitLab project also generates a repository summary from GitLab metadata, languages, file tree, and key root files. It is cached in memory and written to `.dev-assist/repo-summary-<projectId>.md`.

To simulate publish, send a note webhook containing `@dev-assist publish` (or use the manual endpoint / script later).

## Real GitLab (recommended glab path – no PAT in the service)

```powershell
# One-time on the machine that will run dev-assist
glab auth login
# For self-managed:
# glab auth login --hostname gitlab.mycompany.com

# In .env
GITLAB_USE_GLAB=true
GITLAB_GLAB_HOSTNAME=          # only for self-managed
GITLAB_WEBHOOK_SIGNING_SECRET=your-secret-from-gitlab
AI_PROVIDER=mock               # or opencode
```

Expose the service (for GitLab to reach it):

- Recommended: Cloudflare Tunnel (`cloudflared tunnel --url http://localhost:5000`)
- Or set `START_TUNNEL=true` in `.env` to start that tunnel automatically with `npm run dev`.
- Add the resulting `https://...trycloudflare.com/webhooks/gitlab/issues` (or your permanent hostname) as a webhook in the GitLab project (Issues and Note events, Secret = the signing secret).

## Using Real AI

The current real-AI path is `AI_PROVIDER=opencode`.

1. Install and configure the `opencode` CLI for the provider/model you want to use.
2. Set the provider in `.env`:
   ```
   AI_PROVIDER=opencode
   AI_MODEL=xai/grok-3-latest
   AI_TIMEOUT_MS=120000
   ```
3. Keep `AI_PROVIDER=mock` for local tests without external keys or model calls.

## opencode CLI + Agent

This project uses opencode primarily for the ticket analysis step.

- `opencode.json` lives at the project root.
- The agents defined here are `dev-assist-analyzer` and `repo-summary` (see `opencode.json`).
- Its lightweight base prompt lives at `.opencode/prompts/requirement-analysis.md`.
- The repository summary prompt lives at `.opencode/prompts/repo-summary.md`.
- The complete, up-to-date rules and JSON schema instructions are sent at runtime from `src/services/ai/instructions.ts`.
- OpenCode skills live under `.opencode/skills/`; the GitLab issue workflow skill is `.opencode/skills/gitlab-issues.md`.

Set `AI_PROVIDER=opencode` plus a working `opencode` CLI and its required provider credentials to let dev-assist use this agent for refining issues.

**Note:** The generated `.dev-assist/issues/.../context.md` files are meant to be consumed by separate opencode setups in your actual development repositories (with their own agents for planning, implementing, reviewing etc.). This project only maintains the analyzer needed for the `@dev-assist` refinement workflow.

## Manual triggers (useful during development)

```powershell
# Process an existing issue (creates proposal + context files)
curl -X POST http://localhost:5000/api/issues/123/42/process

# Publish (reads context files, cleans comments, updates issue title/description)
curl -X POST http://localhost:5000/api/issues/123/42/publish

# Or via npm script (after build or with tsx)
npm run publish-issue -- 123/42
# Optional actions: close/reopen and labels
npm run publish-issue -- 123/42 close,ready-for-dev
```

## Project structure (kept deliberately small)

```
src/
  config.ts
  server.ts
  app.ts
  cli/
    publish-issue.ts # manual publish entry point
  routes/
    health.ts
    gitlabWebhooks.ts
    issues.ts
  services/
    gitlab/          # mention, parser, auth, commands, cleanup, clients (glab + token)
    ai/              # service + shared instructions + schema + formatter (+ opencode path)
    processing/      # processor + publisher
    context/         # writer + reader for .dev-assist/... files
  utils/
    logger.ts        # Everything is logged to the console
.opencode/           # agent config, prompts and skills for opencode
```

## Important notes from the spec

- Only `@dev-assist` at the start of the first content line triggers processing. Basic Markdown formatting before the mention is tolerated.
- The exact JSON shape and detailed analysis rules live in `src/services/ai/instructions.ts` and `src/services/ai/schema.ts`; the opencode prompt is intentionally lightweight.
- glab is the common "no extra token" path.
- After publish the conversation comments that involved `@dev-assist` are removed and the issue title/description become a clean, structured ticket.

See `descriptions/project_description.txt` for the original German requirements.

## Development

```powershell
npm run dev          # tsx watch
# edit code, console shows everything
```

## Future

- Direct OpenAI-compatible providers can be added later; currently implemented providers are `mock` and `opencode`.
- The same context files + opencode agents/skills are used by developers for actual implementation work after the ticket has been published.

Happy structuring!
