import assert from "node:assert/strict";
import test from "node:test";
import { isPublishCommand, mentionsDevAssist } from "../src/message-detection.js";

test("mentionsDevAssist matches @dev-assist case-insensitively", () => {
  assert.equal(mentionsDevAssist("please help @dev-assist"), true);
  assert.equal(mentionsDevAssist("please help @DEV-ASSIST"), true);
  assert.equal(mentionsDevAssist("please help dev-assist"), false);
});

test("isPublishCommand matches the existing publish substring", () => {
  assert.equal(isPublishCommand("@dev-assist publish"), true);
  assert.equal(isPublishCommand("please @dev-assist publish now"), true);
  assert.equal(isPublishCommand("@DEV-ASSIST PUBLISH"), true);
  assert.equal(isPublishCommand("@dev-assist analyze"), false);
});
