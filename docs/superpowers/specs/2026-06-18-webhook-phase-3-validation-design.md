# Webhook Phase 3 Validation Design

Date: 2026-06-18

## Goal

Phase 3 hardens the existing webhook flow without adding new user-facing behavior. It adds runtime validation for Opencode agent JSON responses and expands webhook edge-case tests around the behavior that already exists.

## Current State

Phase 1 split the original webhook module into focused modules. Phase 2 added shared TypeScript types and removed high-impact `any` usage from the webhook, GitLab, agent, image, vision, and publish paths.

The remaining risk is that some external inputs are still only type-asserted after parsing:

- `parseAgentResponse` parses JSON and casts it to `AgentResponse`.
- Webhook routing has typed payloads, but only one integration-style webhook test currently covers the publish path.

This means malformed agent output can reach downstream code as if it were valid, and several existing webhook responses are not locked by tests.

## Scope

In scope:

- Validate parsed agent JSON at runtime against the two response shapes the app already supports.
- Preserve the existing public `parseAgentResponse(rawText: string): AgentResponse` API.
- Preserve the existing generic error behavior for invalid agent output.
- Add focused tests for valid and invalid agent response shapes.
- Add focused webhook edge-case tests for existing behavior and response bodies.
- Keep test helpers local and lightweight.

Out of scope:

- New user-facing behavior.
- Prompt wording changes.
- GitLab command changes.
- Publish flow changes.
- Image reference or vision behavior changes.
- New runtime validation dependencies such as Zod.
- New service boundaries or dependency injection architecture.
- More granular error messages returned to users.

## Agent Response Validation

`parseAgentResponse` should keep the same responsibility: accept raw text from the agent, extract JSON from optional Markdown code blocks, parse the JSON, and return an `AgentResponse`.

After `JSON.parse`, it should validate that the parsed value is one of these shapes:

```ts
{ hasQuestions: true, questions: string }
```

or:

```ts
{ hasQuestions: false, proposedTitle: string, proposedDescription: string }
```

Validation should be implemented with small local type guards or helpers in `src/agent-analysis.ts`. It should not introduce a schema library.

Invalid JSON and invalid response shapes should both throw:

```ts
new Error("Invalid JSON returned by agent.")
```

The logger may keep the same failure message style. Phase 3 should not expose new error details to webhook callers.

## Webhook Edge-Case Tests

Add tests that lock the behavior already present in `handleGitlabWebhook`.

The tests should cover:

- Missing payload or missing `object_kind` returns status `400` with `{ error: "Bad Request: Missing payload details" }`.
- Issue webhook missing issue IID or project ID returns status `400` with `{ error: "Missing issue IID or Project ID" }`.
- Events from the bot user return status `200` with `{ message: "Ignored: Event triggered by bot itself" }`.
- Unhandled events return status `200` with `{ message: "Event ignored" }`.
- Note events that mention `@dev-assist` but are not publish commands respond with `{ message: "Analyzing discussion..." }` without waiting for async analysis.

Tests should not require real GitLab, real Opencode, network access, or new dependencies. They can use the existing simulation mode and simple local response/client stubs where needed.

## Behavior Preservation

Phase 3 must keep the current externally visible behavior stable:

- Same webhook status codes and response JSON for covered paths.
- Same generic agent parse error message.
- Same async behavior for analysis and publish paths.
- Same bot self-event ignore behavior.
- Same prompt text and proposal comment formatting.

Runtime validation may prevent malformed agent shapes from reaching downstream fields, but it should fail through the existing parse-error style rather than a new user-facing contract.

## Testing

Required verification:

- `npx tsx --test test/agent-analysis.test.ts`
- `npx tsx --test test/webhook.test.ts`
- `npm test`
- `npm run build`

The implementation should follow TDD:

1. Add failing parser validation tests.
2. Implement the minimal runtime guards.
3. Add failing webhook edge-case tests for existing behavior.
4. Make only minimal test-support or production changes needed to keep existing behavior testable.
5. Run full verification.

## Migration Strategy

1. Extend `test/agent-analysis.test.ts` with invalid-shape cases.
2. Add runtime response-shape validation inside `src/agent-analysis.ts`.
3. Extend `test/webhook.test.ts` with reusable response and client stubs.
4. Add webhook edge-case tests that assert existing response bodies.
5. Run full verification and review for behavior changes.

## Acceptance Criteria

- Valid question and proposal agent responses still parse.
- Invalid agent response shapes throw `"Invalid JSON returned by agent."`.
- Webhook edge-case tests cover the listed existing paths.
- No new dependencies are added.
- No prompt text, GitLab command, publish, image, vision, or webhook response behavior changes are introduced.
- `npm test` and `npm run build` pass.
