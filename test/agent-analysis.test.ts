import assert from "node:assert/strict";
import test from "node:test";
import { cleanQuestions, parseAgentResponse } from "../src/agent-analysis.js";

test("parseAgentResponse parses JSON wrapped in a json markdown block", () => {
  assert.deepEqual(
    parseAgentResponse("```json\n{\"hasQuestions\":true,\"questions\":\"What happened?\"}\n```"),
    { hasQuestions: true, questions: "What happened?" }
  );
});

test("parseAgentResponse parses JSON wrapped in a generic markdown block", () => {
  assert.deepEqual(
    parseAgentResponse("```\n{\"hasQuestions\":false,\"proposedTitle\":\"Title\"}\n```"),
    { hasQuestions: false, proposedTitle: "Title" }
  );
});

test("cleanQuestions strips greeting text before the first real question", () => {
  assert.equal(
    cleanQuestions("Hi team,\nThanks for the report.\nWhat browser are you using?\n- Can you share logs?"),
    "What browser are you using?\n- Can you share logs?"
  );
});
