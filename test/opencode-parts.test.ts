import assert from "node:assert/strict";
import test from "node:test";
import { joinTextParts } from "../src/opencode-parts.js";

test("joinTextParts joins only text parts in order", () => {
  assert.equal(
    joinTextParts([
      { type: "text", text: "first" },
      { type: "file", text: "ignored" },
      { type: "text", text: "second" }
    ]),
    "first\nsecond"
  );
});

test("joinTextParts preserves existing empty slot behavior for missing text", () => {
  assert.equal(
    joinTextParts([
      { type: "text" },
      { type: "text", text: "second" }
    ]),
    "\nsecond"
  );
});
