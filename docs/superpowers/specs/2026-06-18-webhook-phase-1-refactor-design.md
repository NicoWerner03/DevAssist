# Webhook Phase 1 Refactor Design

Date: 2026-06-18

## Goal

Refactor `src/webhook.ts` structurally without intentional behavior changes. The public exports `initBotUser` and `handleGitlabWebhook` stay stable so callers in `src/index.ts`, `src/mock-test.ts`, and existing tests do not need a behavioral migration.

This is phase 1 of a staged refactor:

1. Split `src/webhook.ts` into clear domain modules while preserving behavior.
2. Simplify duplicated or unnecessarily complex logic after the structure is safer.
3. Consider a larger architecture cleanup once responsibilities and tests are clearer.

## Current Problem

`src/webhook.ts` currently mixes several responsibilities in one large file:

- GitLab webhook signature validation.
- Incoming event routing for issue and note events.
- `@dev-assist` command detection.
- Opencode analysis session orchestration.
- Prompt construction and agent response parsing.
- Image reference extraction, context matching, formatting, and reinsertion.
- Image download and Opencode vision enrichment.
- Publish command handling, proposal parsing, issue update, and helper comment cleanup.

The main issue is not only file length. The deeper issue is that unrelated responsibilities are coupled, making changes risky and making isolated tests harder to add.

## Phase 1 Scope

Phase 1 focuses only on `src/webhook.ts`.

In scope:

- Move cohesive blocks of logic into new modules.
- Keep `src/webhook.ts` as the public facade and thin webhook orchestrator.
- Preserve external behavior, response codes, log intent, async handling, and GitLab side effects.
- Keep GitLab API access in `src/gitlab.ts`.
- Keep existing tests passing.
- Add small focused tests only if extraction creates a useful stable seam for pure helper logic.

Out of scope:

- Reworking `src/index.ts`, `src/mock-test.ts`, or `src/gitlab.ts`.
- Changing command syntax or GitLab webhook semantics.
- Replacing the `glab` based GitLab adapter.
- Introducing dependency injection, classes, or a service container.
- Changing prompt behavior intentionally.
- Large test harness rewrites.

## Proposed Module Boundaries

`src/webhook.ts`

- Remains the public facade.
- Exports `initBotUser` and `handleGitlabWebhook`.
- Owns high-level request handling: signature gate, basic payload validation, self-event ignore, event type routing, immediate webhook responses.
- Delegates business logic to extracted modules.

`src/webhook-signature.ts`

- Owns webhook signature validation.
- Computes and compares GitLab webhook HMAC signatures.
- Exposes a small helper that `webhook.ts` can call before processing payloads.

`src/message-detection.ts`

- Owns text command detection.
- Provides helpers for `@dev-assist` mention detection and publish command detection.

`src/image-references.ts`

- Owns image reference extraction and formatting.
- Handles Markdown images, HTML images, Markdown links to image URLs, direct image URLs, GitLab `/uploads/...` paths, surrounding context extraction, deduplication, and reinsertion into proposed descriptions.
- Exposes the helpers needed by analysis and publish flows.

`src/vision.ts`

- Owns image download and Opencode vision enrichment.
- Resolves relative GitLab image URLs, applies maximum image size limits, determines MIME types, sends image prompts to Opencode, and stores concise visual summaries on image references.
- Keeps vision failures non-fatal.

`src/agent-analysis.ts`

- Owns the normal `@dev-assist` analysis flow.
- Fetches the issue and comments, builds the discussion and image context, prompts Opencode, parses the response, cleans question text, and posts either clarification questions or a proposal.

`src/publish-command.ts`

- Owns the `@dev-assist publish` flow.
- Finds the latest bot proposal, extracts proposed title and description, restores missing image references, updates the issue, and deletes helper comments.

`src/types.ts`

- Holds shared lightweight types such as `ImageReference` and `ImageSource` if they are used across multiple extracted modules.

## Data Flow

The runtime flow stays the same:

1. `handleGitlabWebhook` receives the Express request and response.
2. It validates the webhook signature when signing data is configured and present.
3. It validates the payload shape and ignores events created by the bot itself.
4. For issue events that mention `@dev-assist`, it either dispatches publish handling or starts issue analysis.
5. For note events on issues that mention `@dev-assist`, it either dispatches publish handling or starts discussion analysis.
6. Normal analysis calls into `agent-analysis.ts`, which uses `image-references.ts` and `vision.ts`.
7. Publish handling calls into `publish-command.ts`, which also uses `image-references.ts` and `vision.ts`.
8. GitLab reads and writes continue to go through `src/gitlab.ts`.

Webhook responses remain quick. Long-running analysis and publish work continues asynchronously where it does today.

## Error Handling

Phase 1 keeps error behavior unchanged:

- Invalid signatures return `401`.
- Missing required payload details return `400`.
- Unhandled events return `200` with an ignored message.
- Synchronous webhook processing failures return `500`.
- Async analysis and publish failures are logged without making GitLab wait for long-running work.
- Vision/image failures remain warnings and do not fail the whole analysis or publish flow.
- Temporary Opencode sessions are still deleted in `finally` blocks.

## Testing And Verification

Required verification for phase 1:

- `npm test`
- `npm run build`

The existing publish screenshot preservation test must continue to pass. If pure helper functions become exported with stable module boundaries, focused unit tests may be added for image reference extraction or proposal image reinsertion, but only when they support behavior preservation.

## Migration Strategy

1. Extract shared types first if needed.
2. Extract command detection and signature validation because they have small dependency surfaces.
3. Extract image reference helpers as one cohesive module.
4. Extract vision helpers after image reference types are stable.
5. Extract analysis and publish flows.
6. Reduce `src/webhook.ts` to the facade/orchestrator.
7. Run tests and build after each meaningful extraction step.

The implementation should move code mechanically where possible and avoid opportunistic cleanup. Any simplification that changes behavior belongs in phase 2.

