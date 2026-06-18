import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { verifyGitlabSignature } from "../src/webhook-signature.js";

function sign(id: string, timestamp: string, rawBody: string, signingToken: string): string {
  const message = `${id}.${timestamp}.${rawBody}`;
  const key = Buffer.from(signingToken.replace("whsec_", ""), "base64");
  const hmac = crypto.createHmac("sha256", key);
  hmac.update(message);
  return `v1,${hmac.digest("base64")}`;
}

test("verifyGitlabSignature accepts the current HMAC format", () => {
  const signingToken = `whsec_${Buffer.from("test-secret").toString("base64")}`;
  const signature = sign("webhook-1", "1710000000", "{\"ok\":true}", signingToken);

  assert.equal(
    verifyGitlabSignature("webhook-1", "1710000000", "{\"ok\":true}", signature, signingToken),
    true
  );
});

test("verifyGitlabSignature rejects a mismatched signature", () => {
  const signingToken = `whsec_${Buffer.from("test-secret").toString("base64")}`;
  const signature = sign("webhook-1", "1710000000", "{\"ok\":true}", signingToken);

  assert.equal(
    verifyGitlabSignature("webhook-1", "1710000001", "{\"ok\":true}", signature, signingToken),
    false
  );
});
