import assert from "node:assert/strict";
import test from "node:test";
import { cleanQuestions, isAgentQuestionResponse, parseAgentResponse } from "../src/agent-analysis.js";

test("parseAgentResponse parses JSON wrapped in a json markdown block", () => {
  assert.deepEqual(
    parseAgentResponse("```json\n{\"hasQuestions\":true,\"questions\":\"What happened?\"}\n```"),
    { hasQuestions: true, questions: "What happened?" }
  );
});

test("parseAgentResponse parses proposal JSON wrapped in a generic markdown block", () => {
  assert.deepEqual(
    parseAgentResponse(
      "```\n{\"hasQuestions\":false,\"proposedTitle\":\"Title\",\"proposedDescription\":\"Description\"}\n```"
    ),
    { hasQuestions: false, proposedTitle: "Title", proposedDescription: "Description" }
  );
});

test("parseAgentResponse rejects question responses with non-string questions", () => {
  assert.throws(
    () => parseAgentResponse("{\"hasQuestions\":true,\"questions\":42}"),
    /Invalid JSON returned by agent\./
  );
});

test("parseAgentResponse rejects proposal responses missing proposedDescription", () => {
  assert.throws(
    () => parseAgentResponse("{\"hasQuestions\":false,\"proposedTitle\":\"Title\"}"),
    /Invalid JSON returned by agent\./
  );
});

test("parseAgentResponse rejects non-object JSON", () => {
  assert.throws(
    () => parseAgentResponse("\"not an object\""),
    /Invalid JSON returned by agent\./
  );
});

test("isAgentQuestionResponse identifies parsed question responses", () => {
  const parsed = parseAgentResponse("```json\n{\"hasQuestions\":true,\"questions\":\"What happened?\"}\n```");

  assert.equal(isAgentQuestionResponse(parsed), true);
});

test("isAgentQuestionResponse rejects parsed proposal responses", () => {
  const parsed = parseAgentResponse(
    "```json\n{\"hasQuestions\":false,\"proposedTitle\":\"Title\",\"proposedDescription\":\"Description\"}\n```"
  );

  assert.equal(isAgentQuestionResponse(parsed), false);
});

test("cleanQuestions strips greeting text before the first real question", () => {
  assert.equal(
    cleanQuestions("Hi team,\nThanks for the report.\nWhat browser are you using?\n- Can you share logs?"),
    "What browser are you using?\n- Can you share logs?"
  );
});
