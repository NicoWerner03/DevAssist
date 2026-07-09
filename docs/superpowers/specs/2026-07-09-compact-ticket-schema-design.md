# Compact Ticket Schema and Markdown Design

**Status:** Approved on 2026-07-09

## Context

Dev-Assist currently asks the AI for a broad requirement-analysis object and renders that object as a long Markdown document with many sections. The finished GitLab ticket should instead match the compact reference structure: Description, Acceptance Criteria, Technical Context & Logs, and Proposed Solution.

This change replaces the AI JSON contract itself. The renderer will no longer infer the four visible sections by merging numerous legacy fields.

## Goals

- Make the AI output correspond directly to the finished ticket structure.
- Render exactly four content sections in both the proposal preview and the published issue description.
- Keep the generated GitLab title and clarification workflow functional.
- Keep technical statements grounded in the issue, comments, provided logs, or repository summary.
- Preserve previously generated Markdown context files without requiring migration.

## Non-goals

- Changing the GitLab publish command or comment-cleanup workflow.
- Adding new ticket sections, labels, or configuration options.
- Migrating existing `context.md` files to the new layout.
- Changing the wording or layout of clarification comments.

## JSON Contract

The requirement analysis is replaced by this exact shape:

```json
{
  "title": "Add theme toggle",
  "description": [
    "Add a theme toggle to the top header.",
    "First-time visitors use their system preference."
  ],
  "acceptanceCriteria": [
    "The theme changes without reloading the page."
  ],
  "technicalContext": [
    "Reuse the existing styling system.",
    "No error logs were provided."
  ],
  "proposedSolution": [
    "Locate or extract the reusable header component.",
    "Implement theme selection and persistence."
  ],
  "openQuestions": []
}
```

All six properties are required and additional properties are rejected. `title` is a string. Every other property is an array of strings; empty arrays are valid.

### Field semantics

- `title`: concise GitLab issue title. It is stored in context metadata and is not repeated in the description body.
- `description`: ordered, self-contained paragraphs describing the goal, user value, functional behavior, and relevant scope.
- `acceptanceCriteria`: observable and testable completion conditions. Definition-of-done and validation details belong here when they describe externally verifiable results.
- `technicalContext`: factual constraints, relevant repository observations, supplied logs or errors, and material assumptions or risks. The AI must not invent current implementation details.
- `proposedSolution`: ordered, high-level implementation steps. Items must not contain their own numeric prefixes because the formatter adds numbering.
- `openQuestions`: unanswered functional or product questions used by the existing clarification workflow. Questions about discovering the current codebase remain prohibited.

## Rendering

The formatter produces this exact section order:

```markdown
## 📋 Description

First description paragraph.

Second description paragraph.

## 🎯 Acceptance Criteria

- First criterion
- Second criterion

## 📁 Technical Context & Logs

- Relevant fact or log

## 💡 Proposed Solution

1. First step
2. Second step
```

Description entries are separated by blank lines. Acceptance criteria and technical context use unordered lists. Proposed solution entries use an ordered list. Input items are trimmed, empty items are removed, and internal line breaks are collapsed so generated Markdown cannot create accidental nested structures.

When a visible field contains no usable items, its section contains `Not enough information available yet.` instead of a list or paragraph. The output contains no Dev-Assist context heading, summary wrapper, legacy subsections, title, or generated-by footer.

The proposal comment retains its existing approval instructions and then embeds the same four-section Markdown written to `context.md`. Publishing reads that Markdown unchanged, removes any legacy title wrapper when present, and updates the GitLab title from `context.json` metadata.

## Clarification Behavior

The clarification comment format remains unchanged. The processor continues to use `openQuestions` to choose between a clarification response and a proposal. If a proposal is allowed while one non-blocking question remains under the existing heuristic, that question is appended to Technical Context & Logs as `Open question: ...`; this prevents information loss while preserving exactly four visible headings.

Answered-question filtering continues to operate only on `openQuestions` and requires no new representation.

## Component Changes

- `src/services/ai/schema.ts`: replace the legacy nested interfaces and schema with the six-field contract; validate required properties, property types, array item types, and additional properties.
- `src/services/ai/instructions.ts`: replace the schema example and legacy field guidance; define the content and grounding rules for each new field.
- `src/services/ai/service.ts`: update mock output and raw-result candidate detection to recognize the new contract.
- `src/services/ai/formatter.ts`: render the four sections directly and read the top-level title in clarification comments.
- `src/services/processing/processor.ts`: read the top-level title for metadata and use a relevant field for completion logging.
- Static OpenCode analyzer guidance: align terminology with the new four-section ticket while continuing to defer to runtime instructions for the exact schema.
- Tests and fixtures: replace all legacy analysis objects and expectations.

The publisher and context metadata format do not require structural changes. Existing metadata already stores only the extracted title.

## Error Handling and Compatibility

AI responses using the old schema, missing required fields, containing unexpected fields, or containing non-string array entries are rejected with a schema error. Markdown-fence stripping and JSON parse diagnostics remain unchanged.

No stored AI JSON requires migration. Existing context files are Markdown and can still be published. Newly processed issues receive the compact format.

## Test Strategy

1. Schema tests accept the new exact object and reject the old shape, missing fields, unexpected fields, incorrect property types, and non-string list items.
2. Prompt tests assert that the new contract and field guidance reach the analyzer.
3. Formatter tests assert exact heading order, paragraph rendering, bullet rendering, ordered steps, placeholder behavior, and preservation of a remaining non-blocking question inside Technical Context & Logs.
4. Mock and OpenCode service tests use the new response shape and verify candidate extraction.
5. Processing tests verify that the top-level title is written to context metadata without appearing in the Markdown body.
6. The complete Node test suite and TypeScript build run before completion.

## Success Criteria

- The AI, mock provider, schema validator, formatter, processor, and tests use only the new contract.
- Proposal previews and newly published descriptions show exactly the four approved headings in the approved order.
- The GitLab issue title is updated from `title` without being duplicated in the description.
- No unresolved question is silently discarded.
- Existing Markdown context files remain publishable.
