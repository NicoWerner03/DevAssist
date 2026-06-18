import crypto from "crypto";
import logger from "./logger.js";

export function verifyGitlabSignature(
  id: string,
  timestamp: string,
  rawBody: string,
  signatureHeader: string,
  signingToken: string
): boolean {
  try {
    const message = `${id}.${timestamp}.${rawBody}`;
    const key = Buffer.from(signingToken.replace("whsec_", ""), "base64");
    const hmac = crypto.createHmac("sha256", key);
    hmac.update(message);
    const computedSignature = hmac.digest("base64");
    const expectedSignature = `v1,${computedSignature}`;
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expectedSignature));
  } catch (err) {
    logger.error("Error verifying GitLab webhook signature: " + (err as Error).message);
    return false;
  }
}
