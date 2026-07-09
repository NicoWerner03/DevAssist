# GPT-5.6 Luna High Configuration Design

## Goal

Dev Assist uses `openai/gpt-5.6-luna` with the OpenCode reasoning variant `high` for the local real-AI workflow. The repository examples document the same model and reasoning level as the project standard.

## Scope

- Set `AI_MODEL=openai/gpt-5.6-luna` and `AI_REASONING_EFFORT=high` in the local `.env` while preserving `AI_PROVIDER=opencode`.
- Set the same model and reasoning values in `.env.example` while preserving `AI_PROVIDER=mock` so the documented zero-key test setup continues to work.
- Replace obsolete model examples in `README.md` and explain that OpenCode receives `high` as the model variant.
- Do not hardcode the model in application source files or `opencode.json`.

## Runtime Behavior

The existing configuration flow remains unchanged: `src/config.ts` reads `AI_MODEL` and `AI_REASONING_EFFORT`; the analysis and repository-summary paths pass them to `opencode run` as `--model openai/gpt-5.6-luna` and `--variant high`. Environment variables remain the single source of truth and can still override the documented defaults.

## Error Handling

No new error path is introduced. Existing OpenCode process and output handling remains responsible for unavailable models, authentication failures, timeouts, and non-zero exit codes.

## Verification

- Confirm that the local `.env` resolves to the requested provider, model, and reasoning effort without printing unrelated secrets.
- Confirm that `.env.example` and `README.md` consistently document `openai/gpt-5.6-luna` and `high`.
- Run the relevant configuration and OpenCode runtime tests.
- Run the TypeScript build.
