# dev-assist

Pure API service that listens to GitLab webhooks and helps turn rough issues into well-structured, developer-ready tickets using `@dev-assist`.

Everything (webhooks, AI calls, GitLab operations, file writes, publish steps) is logged to the console.

## Workflow (exactly as specified)

1. Issue is created or a comment is added on GitLab.
2. GitLab webhook (or manual trigger) notifies dev-assist.
3. If the description or comment body **starts with** `@dev-assist`, the tool reacts.
4. **Optimal case** (enough information): dev-assist posts a **proposal comment** showing how the structured ticket will look.
5. User replies with `@dev-assist publish`:
   - All `@dev-assist` conversation comments are deleted.
   - The issue description is replaced with the clean, standardized structure.
6. If information is missing: dev-assist asks clarifying questions in comments until it has enough, then proposes again.

The resulting tickets always follow the **same reliable structure** (JSON schema is described precisely inside the prompt / opencode agent).

## Tech

- TypeScript, Express
- GitLab webhooks + `glab` (primary, often no `GITLAB_TOKEN` needed in `.env`) or PAT fallback
- AI via **opencode.ai SDK + agents/skills** (primary) or direct OpenAI-compatible providers
- Current model: Grok (xAI). Easy to switch.
- All secrets in `.env`
- Local context bridge: `.dev-assist/issues/<projectId>/<issueIid>/context.md`

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

A context file will appear under `.dev-assist/issues/123/42/context.md`.

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
AI_PROVIDER=mock               # or xai / opencode
```

Expose the service (for GitLab to reach it):

- Recommended: Cloudflare Tunnel (`cloudflared tunnel --url http://localhost:5000`)
- Add the resulting `https://...trycloudflare.com/webhooks/gitlab/issues` (or your permanent hostname) as a webhook in the GitLab project (Issues and Note events, Secret = the signing secret).

## Using real AI (Grok / xAI)

1. Get key at https://console.x.ai
2. In .env:
   ```
   AI_PROVIDER=xai
   AI_API_KEY=your-api-key
   AI_MODEL=xai/grok-3-latest   # or whatever you prefer
   ```
3. Or use `AI_PROVIDER=opencode` + proper `opencode.json` (see below).

## opencode.ai SDK + Agents & Skills

This project uses opencode primarily for the ticket analysis step.

- `opencode.json` lives at the project root.
- The only agent defined here is `dev-assist-analyzer` (see `opencode.json`).
- Its prompt lives at `.opencode/prompts/requirement-analysis.md` — this is where the exact JSON schema + rules are described (as required by the original project spec).
- OpenCode skills live under `.opencode/skills/`; the GitLab issue workflow skill is `.opencode/skills/gitlab-issues.md`.

Set `AI_PROVIDER=opencode` (plus a working `opencode` CLI + `AI_API_KEY`) to let dev-assist use this agent for refining issues.

**Note:** The generated `.dev-assist/issues/.../context.md` files are meant to be consumed by separate opencode setups in your actual development repositories (with their own agents for planning, implementing, reviewing etc.). This project only maintains the analyzer needed for the `@dev-assist` refinement workflow.

## Manual triggers (useful during development)

```powershell
# Process an existing issue (creates proposal + context file)
curl -X POST http://localhost:5000/api/issues/123/42/process

# Publish (reads context file, cleans comments, updates issue)
curl -X POST http://localhost:5000/api/issues/123/42/publish

# Or via npm script (after build or with tsx)
npm run publish-issue -- 123/42
```

## Project structure (kept deliberately small)

```
src/
  config.ts
  server.ts
  app.ts
  routes/
    health.ts
    gitlabWebhooks.ts
    issues.ts
  services/
    gitlab/          # mention, parser, auth, commands, cleanup, clients (glab + token)
    ai/              # service + prompts + schema + formatter (+ opencode path)
    processing/      # processor + publisher
    context/         # writer + reader for .dev-assist/... files
  utils/
    logger.ts        # Everything is logged to the console
.opencode/           # agents, prompts, skills, commands for opencode
```

## Important notes from the spec

- Only leading `@dev-assist` triggers processing.
- The exact JSON shape + rules live in the prompt / opencode agent definition.
- glab is the common "no extra token" path.
- After publish the conversation comments that involved `@dev-assist` are removed and the issue becomes a clean, structured ticket.

See `describtions/project_describtion.txt` for the original German requirements.

## Development

```powershell
npm run dev          # tsx watch
# edit code, console shows everything
```

## Future

- Easy to add OpenAI-compatible providers.
- The same context files + opencode agents/skills are used by developers for actual implementation work after the ticket has been published.

Happy structuring!
