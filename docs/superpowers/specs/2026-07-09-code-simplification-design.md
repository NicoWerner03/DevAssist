# Code Simplification Design

## Goal

Reduce duplicated infrastructure and remove obsolete code without changing the currently tested GitLab workflow or mention semantics.

## Considered approaches

1. **Dead-code cleanup only:** lowest risk, but leaves the two largest duplication hotspots untouched.
2. **Targeted shared helpers plus cleanup (selected):** centralize only proven duplicate OpenCode and `glab` mechanics, keep domain-specific parsing local, and remove unused paths.
3. **Broader dependency-injection rewrite:** would make orchestration easier to unit-test, but adds abstractions and exceeds the requested simplification scope.

## Design

- Add one OpenCode runtime helper for ANSI cleanup, recursive string extraction, executable/model resolution, and cross-platform process execution.
- Use `cross-spawn` directly so Windows `.cmd` shims work without Node's deprecated `shell: true` plus argument-array combination.
- Keep ticket-analysis and repository-summary output parsing in their current modules because their schemas differ.
- Add one small `glab` helper for argument normalization, hostname handling, and JSON/text response conversion; keep transport policy in the GitLab client.
- Treat `ParsedWebhook.shouldProcess` as the single gate in the route. The processor wrapper only translates parsed data into `processIssue` arguments.
- Delete compiler-confirmed unused declarations, runtime-unreachable code, no-op `GITLAB_WRITE_BACK`, unused formatter/template exports, and the unused OpenCode SDK dependency.
- Enable TypeScript unused-symbol checks to prevent the same drift from returning.

## Compatibility boundaries

- Preserve all existing HTTP response bodies and status codes.
- Preserve current behavior that recognizes `@dev-assist` anywhere in supported issue/comment text.
- Preserve mock and OpenCode AI provider behavior, including session-export fallback.
- Preserve GitLab CLI/PAT transport selection and JSON/raw file responses.
- Do not touch the user's existing thesis-document changes.

## Verification

- Add a regression assertion that OpenCode integration emits no `DEP0190` warning.
- Add focused tests for shared OpenCode and `glab` helpers before implementing them.
- Run focused tests after each refactor, then `npm test`, `npm run build`, and the stricter unused-symbol compiler check.
