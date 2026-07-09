# GPT-5.6 Luna High Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configure the local real-AI workflow and repository examples to use `openai/gpt-5.6-luna` with OpenCode variant `high`.

**Architecture:** Keep environment variables as the single source of truth. Update the tracked local configuration and public examples only; the existing TypeScript runtime continues to translate `AI_MODEL` and `AI_REASONING_EFFORT` into OpenCode's `--model` and `--variant` arguments.

**Tech Stack:** dotenv environment files, OpenCode CLI, Markdown, TypeScript, Node.js test runner

## Global Constraints

- Preserve `AI_PROVIDER=opencode` in `.env`.
- Preserve `AI_PROVIDER=mock` in `.env.example` so zero-key local tests remain available.
- Use the exact model identifier `openai/gpt-5.6-luna` and exact reasoning value `high`.
- Do not change `src/` files or `opencode.json`.
- Preserve all pre-existing workspace changes; in `.env.example`, stage only the model/reasoning hunk and leave the unrelated `GITLAB_WRITE_BACK` removal unstaged.

---

### Task 1: Configure and document GPT-5.6 Luna High

**Files:**

- Modify: `.env:3-5`
- Modify: `.env.example:7-13`
- Modify: `README.md:90-101`
- Test: `tests/config.test.ts`
- Test: `tests/opencodeRuntime.test.ts`

**Interfaces:**

- Consumes: `AI_PROVIDER`, `AI_MODEL`, `AI_REASONING_EFFORT`, and `AI_TIMEOUT_MS` through the existing `getConfig()` flow.
- Produces: OpenCode invocations with `--model openai/gpt-5.6-luna --variant high` when `AI_PROVIDER=opencode`; no new TypeScript interface is introduced.

- [ ] **Step 1: Verify that the installed OpenCode CLI exposes the requested model**

Run:

```powershell
opencode models openai | Select-String '^openai/gpt-5\.6-luna$'
```

Expected: one output line containing exactly `openai/gpt-5.6-luna` and exit code `0`.

- [ ] **Step 2: Update the local runtime configuration**

Change only the AI model/reasoning entries in `.env` so its AI block contains:

```dotenv
AI_MODEL=openai/gpt-5.6-luna
AI_PROVIDER=opencode
AI_REASONING_EFFORT=high
AI_TIMEOUT_MS=120000
```

Preserve every other `.env` entry byte-for-byte.

- [ ] **Step 3: Update the public environment example**

Make the AI block in `.env.example` read:

```dotenv
# AI_PROVIDER=mock runs without external keys.
# AI_PROVIDER=opencode uses the local opencode CLI and the configured model.
AI_PROVIDER=mock
AI_MODEL=openai/gpt-5.6-luna
AI_TIMEOUT_MS=120000
AI_REASONING_EFFORT=high
```

Do not modify the pre-existing unrelated removal of `GITLAB_WRITE_BACK=true`.

- [ ] **Step 4: Update the real-AI README instructions**

Replace the numbered content under `## Using Real AI` with:

````markdown
The current real-AI path is `AI_PROVIDER=opencode`.

1. Install and configure the `opencode` CLI with access to the OpenAI provider.
2. Set the provider, model, and reasoning variant in `.env`:
   ```dotenv
   AI_PROVIDER=opencode
   AI_MODEL=openai/gpt-5.6-luna
   AI_REASONING_EFFORT=high
   AI_TIMEOUT_MS=120000
   ```
3. OpenCode receives these values as `--model openai/gpt-5.6-luna` and `--variant high` for both issue analysis and repository summaries.
4. Keep `AI_PROVIDER=mock` for local tests without external keys or model calls.
````

- [ ] **Step 5: Verify configuration and documentation consistency without exposing unrelated environment values**

Run:

```powershell
Get-Content .env | Where-Object { $_ -match '^AI_(PROVIDER|MODEL|REASONING_EFFORT)=' }
rg -n "AI_MODEL=openai/gpt-5\.6-luna|AI_REASONING_EFFORT=high|variant high" .env.example README.md
rg -n "xai/grok-3-latest" .env .env.example README.md
```

Expected:

```text
AI_MODEL=openai/gpt-5.6-luna
AI_PROVIDER=opencode
AI_REASONING_EFFORT=high
```

The second command reports the new values in both tracked examples. The third command returns no matches and exit code `1`, which is the normal ripgrep result for no matches.

- [ ] **Step 6: Run focused tests**

Run:

```powershell
npx tsx --test tests/config.test.ts tests/opencodeRuntime.test.ts
```

Expected: exit code `0` with zero failed tests.

- [ ] **Step 7: Run the TypeScript build**

Run:

```powershell
npm run build
```

Expected: exit code `0` with no TypeScript diagnostics.

- [ ] **Step 8: Stage only the requested changes and commit**

Run:

```powershell
git add -- .env README.md
git add -p -- .env.example
git diff --cached --check
git diff --cached -- .env .env.example README.md
```

For `git add -p`, answer `y` only for the hunk containing `AI_MODEL=openai/gpt-5.6-luna` and `AI_REASONING_EFFORT=high`; answer `n` for the pre-existing hunk that removes `GITLAB_WRITE_BACK=true`.

Expected: the cached diff contains only the requested model, reasoning, and README changes; `git diff --cached --check` reports no errors.

Commit:

```powershell
git commit -m "chore: use GPT-5.6 Luna with high reasoning"
```

Expected: one commit containing only `.env`, the selected `.env.example` hunk, and `README.md`.
