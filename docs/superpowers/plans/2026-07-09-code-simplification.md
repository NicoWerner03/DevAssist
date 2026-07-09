# Code Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove duplicated process/client infrastructure and obsolete code while preserving the tested Dev-Assist workflow.

**Architecture:** Shared helpers own stable command mechanics; ticket analysis, repository summarization, GitLab transport policy, and webhook orchestration retain their domain responsibilities. Refactors are introduced behind focused characterization tests.

**Tech Stack:** TypeScript, Node.js `node:test`, Express, `cross-spawn`, GitLab CLI/API

## Global Constraints

- Preserve current mention semantics and all existing HTTP behavior.
- Do not modify `doc/bachelorarbeit.tex` or `doc/bachelorarbeit.pdf`.
- Use test-first red/green cycles for new helpers and the `DEP0190` regression.
- Do not commit, stage, push, or publish without an explicit user request.

---

### Task 1: Shared OpenCode runtime

**Files:**
- Create: `src/services/ai/opencodeRuntime.ts`
- Modify: `src/services/ai/service.ts`
- Modify: `src/services/repositorySummary.ts`
- Modify: `tests/aiOpencode.test.ts`
- Create: `tests/opencodeRuntime.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `stripAnsi(text)`, `collectStrings(value)`, `findOpencodeBin()`, `getEffectiveModel(model)`, and `runCommand(bin, args, options)`.
- Consumes: existing AI timeout/model configuration and OpenCode CLI arguments.

- [x] Add tests for ANSI/string helpers, model normalization, and absence of `DEP0190` during the existing Windows-shim integration.
- [x] Run focused tests and confirm failure because the helper is missing and the warning is still emitted.
- [x] Add `cross-spawn`, implement the minimal helper, and switch both OpenCode callers to it.
- [x] Run `tests/opencodeRuntime.test.ts`, `tests/aiOpencode.test.ts`, and `tests/repositorySummary.test.ts` and confirm success without warnings.

### Task 2: Remove obsolete paths and configuration

**Files:**
- Modify: `src/app.ts`
- Modify: `src/config.ts`
- Modify: `src/server.ts`
- Modify: `src/services/ai/clarifications.ts`
- Modify: `src/services/ai/formatter.ts`
- Modify: `src/services/ai/service.ts`
- Modify: `src/services/processing/processor.ts`
- Modify: `src/services/repositorySummary.ts`
- Modify: `.env.example`
- Modify: `tsconfig.json`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Removes: `GITLAB_WRITE_BACK`, unused formatter/template/prompt exports, unused render context, and `@opencode-ai/sdk`.
- Produces: a build guarded by `noUnusedLocals` and `noUnusedParameters`.

- [x] Run the strict unused-symbol compiler command and retain its current failing output as the characterization baseline.
- [x] Remove only the confirmed unused/no-op symbols and dependency.
- [x] Enable unused-symbol compiler checks.
- [x] Run AI/config/formatter tests and `npm run build`.

### Task 3: Single webhook gate

**Files:**
- Modify: `src/routes/gitlabWebhooks.ts`
- Modify: `src/services/processing/processor.ts`
- Create: `tests/webhookRoute.test.ts`

**Interfaces:**
- Consumes: `ParsedWebhook.shouldProcess` and `ignoredReason`.
- Preserves: existing 202 ignore responses and asynchronous command dispatch.

- [x] Add route tests for all ignored webhook reasons.
- [x] Run the characterization tests and confirm the existing response contract passes before refactoring.
- [x] Consolidate the route ignore branch and reduce `processFromWebhook` to typed argument translation.
- [x] Run route and parser tests.

### Task 4: Shared glab mechanics

**Files:**
- Create: `src/services/gitlab/glab.ts`
- Modify: `src/services/gitlab/client.ts`
- Create: `tests/glab.test.ts`

**Interfaces:**
- Produces: normalized `glab api` arguments and JSON/text output conversion.
- Consumes: raw API argument arrays and optional configured hostname.

- [x] Add tests for project-path normalization, hostname sanitization, JSON output flags, and text passthrough.
- [x] Run the focused test and confirm failure because the helper is missing.
- [x] Implement the helper and replace `glabApi`/`glabApiRaw` with one runner.
- [x] Run focused tests and the complete GitLab test group.

### Task 5: Final verification

**Files:**
- Review all changed source, test, configuration, and package files.

**Interfaces:**
- Produces: a behavior-preserving, warning-free refactor ready for user review.

- [x] Run `npm test` and require 0 failures and no `DEP0190` warning.
- [x] Run `npm run build` and require exit code 0.
- [x] Run `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` and require exit code 0.
- [x] Inspect `git diff --check`, `git diff --stat`, and `git status --short`; confirm thesis files remain untouched by this task.
