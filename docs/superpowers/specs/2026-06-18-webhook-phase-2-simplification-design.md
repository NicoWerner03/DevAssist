# Webhook Phase 2 Simplification Design

Date: 2026-06-18

## Goal

Simplify the Phase 1 module structure without changing external behavior. Phase 2 focuses on stronger internal types, clearer helper APIs, and small targeted simplifications that reduce ambiguity and make later architectural work safer.

Phase 2 follows Phase 1:

1. Phase 1 split `src/webhook.ts` into domain modules while preserving behavior.
2. Phase 2 keeps behavior stable while reducing `any`, clarifying interfaces, and simplifying helpers where type clarity makes the change low risk.
3. Phase 3 can later consider larger architectural changes such as service boundaries, dependency injection, or a typed GitLab adapter redesign.

## Current State

After Phase 1, `src/webhook.ts` is a thin facade around extracted modules:

- `src/message-detection.ts`
- `src/webhook-signature.ts`
- `src/types.ts`
- `src/image-references.ts`
- `src/vision.ts`
- `src/agent-analysis.ts`
- `src/publish-command.ts`

The project builds and tests pass, but several modules still rely on broad `any` shapes for GitLab issues, comments, webhook payloads, and Opencode response parts. `src/image-references.ts` is now the largest production module and contains complex logic for extraction, context matching, formatting, and reinsertion.

## Phase 2 Scope

Phase 2 is behavior-preserving.

In scope:

- Expand `src/types.ts` with shared domain types used by the extracted modules.
- Type the most important GitLab issue/comment/project/user shapes used in the app.
- Type the GitLab issue and note webhook payload shapes that `src/webhook.ts` actually reads.
- Type agent responses as a union of question and proposal responses.
- Replace high-impact `any` usage in `webhook.ts`, `agent-analysis.ts`, `publish-command.ts`, `image-references.ts`, `vision.ts`, and `gitlab.ts`.
- Type `gitlab.ts` return values and simulation state without changing `glab` command behavior.
- Apply small simplifications where stronger types make the existing logic easier to read.
- Add or adjust focused tests around type-driven helper behavior when needed.

Out of scope:

- New user-facing behavior.
- Command syntax changes.
- Prompt wording changes.
- Image placement algorithm changes.
- Replacing the `glab` command execution strategy.
- Introducing runtime validation libraries such as Zod.
- Large service classes, dependency injection, or a new adapter architecture.
- Reworking `src/index.ts` or `src/mock-test.ts` beyond any unavoidable type compatibility fix.

## Proposed Types

`src/types.ts` should become the shared domain type module.

Keep:

- `ImageReference`
- `ImageSource`

Add GitLab domain shapes that match fields the code actually uses:

- `GitlabUser`: at least `username`.
- `GitlabProject`: at least `id` and optional `web_url`.
- `GitlabIssue`: title, description, author, optional project/web URL metadata, and any fields used by image URL resolution.
- `GitlabComment`: id, body, author, optional `system`.

Add webhook payload shapes:

- `GitlabIssueWebhookPayload`: `object_kind: "issue"`, optional user, project, and issue object attributes read by `webhook.ts`.
- `GitlabNoteWebhookPayload`: `object_kind: "note"`, optional user, project, issue, and note object attributes read by `webhook.ts`.
- A union such as `GitlabWebhookPayload` for the values accepted by `handleGitlabWebhook`.

Add agent response shapes:

- `AgentQuestionResponse`: `hasQuestions: true` and `questions`.
- `AgentProposalResponse`: `hasQuestions: false`, `proposedTitle`, and `proposedDescription`.
- `AgentResponse` as their union.

These types should stay pragmatic. They should model the fields used by this app, not the entire GitLab API.

## Module Changes

`src/webhook.ts`

- Use a local request type for the raw body, such as `GitlabWebhookRequest`, instead of `(req as any).rawBody`.
- Narrow the payload to the issue/note shapes before reading nested fields.
- Keep routing behavior and response codes unchanged.

`src/agent-analysis.ts`

- Return `AgentResponse` from `parseAgentResponse`.
- Add a small narrowing/helper layer if needed to distinguish question vs. proposal responses.
- Replace `(p as any).text` with a local response-part type or helper that extracts text parts safely.
- Keep prompt text and posted comment bodies unchanged.

`src/publish-command.ts`

- Use `GitlabComment` for proposal lookup and cleanup.
- Keep proposal marker parsing and cleanup behavior unchanged.
- Keep explicit `botUsername` parameter.

`src/image-references.ts`

- Replace `any` issue/comment parameters with `GitlabIssue` and `GitlabComment`.
- Use explicit internal helper types only where they make extraction/reinsertion clearer.
- Keep extraction ordering, deduplication behavior, context matching, and image-section formatting unchanged.
- Consider changing type-only imports to `import type`.

`src/vision.ts`

- Replace `issue: any` with a narrow issue URL-resolution type or `GitlabIssue`.
- Replace response-part casts where practical.
- Keep image download, MIME fallback, size limit, Opencode prompt, and non-fatal warning behavior unchanged.

`src/gitlab.ts`

- Type mock issue and mock comments.
- Type exported return values such as `getIssue`, `getIssueComments`, `postIssueComment`, and `updateIssue`.
- Keep `runCommand`, temp payload files, `glab` endpoints, JSON parsing behavior, and simulation semantics unchanged.

## Data Flow

The runtime flow remains unchanged:

1. `webhook.ts` receives GitLab events and decides whether to ignore, analyze, or publish.
2. Payload handling becomes more explicit through TypeScript types, not through a new runtime validation library.
3. Analysis still loads issue/comments through `gitlab.ts`, enriches images, prompts Opencode, and posts either questions or a proposal.
4. Publish still finds the latest bot proposal, restores image references, updates the issue, and deletes helper comments.
5. Image reference extraction and vision enrichment keep their existing behavior and ordering.
6. GitLab access still flows through `src/gitlab.ts`.

External data can still be incomplete or unexpected. Phase 2 should not introduce new failure modes unless the current code would already fail.

## Testing

Required verification:

- `npm test`
- `npm run build`

Existing tests must continue to pass:

- Message detection
- Webhook signature verification
- Image reference extraction/reinsertion
- Vision no-client behavior
- Agent response parsing/question cleaning
- Publish screenshot preservation

Additional focused tests may be added for:

- Agent response narrowing between questions and proposals.
- Webhook payload helper behavior if routing reads are extracted.
- Image reference behavior only when a simplification touches that logic.

Tests should characterize behavior. They should not assert implementation details that would make later safe refactors harder.

## Migration Strategy

1. Extend `src/types.ts` with shared GitLab, webhook, and agent response types.
2. Type `src/gitlab.ts` return values and simulation state first, because other modules consume those values.
3. Update `image-references.ts` and `vision.ts` to consume typed issue/comment shapes.
4. Update `agent-analysis.ts` to use `AgentResponse` and typed text-part helpers.
5. Update `publish-command.ts` to use typed comments and issues.
6. Update `webhook.ts` payload/raw-body typing while preserving routing behavior.
7. Apply only small simplifications that fall out naturally from the new types.
8. Run full tests and build.

Each step should be small enough to review independently. Any broad redesign discovered during Phase 2 should be recorded for Phase 3 rather than implemented immediately.

