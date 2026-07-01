import type { Request, Response } from "express";
import type { OpencodeClient } from "@opencode-ai/sdk";
import type {
  GitlabIssueWebhookPayload,
  GitlabMergeRequestWebhookPayload,
  GitlabNoteWebhookPayload,
  GitlabWebhookPayload
} from "./types.js";
import { getGitlabUser } from "./gitlab.js";
import { runAnalysis } from "./agent-analysis.js";
import { isPublishCommand, mentionsDevAssist } from "./message-detection.js";
import { runPublishCommand } from "./publish-command.js";
import { refreshRepositorySummary } from "./repo-summary.js";
import { verifyGitlabSignature } from "./webhook-signature.js";
import logger from "./logger.js";

type GitlabWebhookRequest = Request<unknown, unknown, GitlabWebhookPayload> & {
  rawBody?: string;
};

function isIssueWebhookPayload(payload: GitlabWebhookPayload): payload is GitlabIssueWebhookPayload {
  return payload.object_kind === "issue";
}

function isNoteWebhookPayload(payload: GitlabWebhookPayload): payload is GitlabNoteWebhookPayload {
  return payload.object_kind === "note";
}

function isMergeRequestWebhookPayload(payload: GitlabWebhookPayload): payload is GitlabMergeRequestWebhookPayload {
  return payload.object_kind === "merge_request";
}

let botUsername: string = "";

export async function initBotUser() {
  try {
    botUsername = await getGitlabUser();
    logger.info(`Bot initialized with GitLab user: @${botUsername}`);
  } catch (err) {
    logger.error("Warning: Could not fetch GitLab bot username: " + (err as Error).message);
  }
}

export async function handleGitlabWebhook(
  req: GitlabWebhookRequest,
  res: Response,
  opencodeClient: OpencodeClient
) {
  const signingToken = process.env.GITLAB_WEBHOOK_SECRET;
  const signatureHeader = req.headers["webhook-signature"] as string | undefined;
  const webhookId = req.headers["webhook-id"] as string | undefined;
  const webhookTimestamp = req.headers["webhook-timestamp"] as string | undefined;

  if (signingToken && signatureHeader && webhookId && webhookTimestamp) {
    const rawBody = req.rawBody || JSON.stringify(req.body);
    const isValid = verifyGitlabSignature(webhookId, webhookTimestamp, rawBody, signatureHeader, signingToken);
    
    if (!isValid) {
      logger.warn(`[WEBHOOK] Unauthorized access attempt: Invalid webhook-signature`);
      return res.status(401).json({ error: "Unauthorized: Invalid Webhook Signature" });
    }
    logger.info(`[WEBHOOK] Webhook signature verified successfully`);
  } else {
    logger.debug(`[WEBHOOK] Bypassed signature validation (headers present: signature=${!!signatureHeader}, id=${!!webhookId}, timestamp=${!!webhookTimestamp})`);
  }

  const payload = req.body;
  logger.debug(`[WEBHOOK] Incoming GitLab payload: ${JSON.stringify(payload, null, 2)}`);

  if (!payload || !payload.object_kind) {
    logger.warn(`[WEBHOOK] Bad Request: Missing payload details or object_kind`);
    return res.status(400).json({ error: "Bad Request: Missing payload details" });
  }

  const eventUser = payload.user?.username;

  // Prevent infinite loops: the bot should never react to its own issue or note events.
  if (eventUser && botUsername && eventUser === botUsername) {
    logger.info(`Ignored: Event triggered by bot @${botUsername} itself`);
    return res.status(200).json({ message: "Ignored: Event triggered by bot itself" });
  }

  try {
    if (isIssueWebhookPayload(payload)) {
      const action = payload.object_attributes?.action;
      const title = payload.object_attributes?.title || "";
      const description = payload.object_attributes?.description || "";
      const issueIid = payload.object_attributes?.iid;
      const projectId = payload.project?.id || payload.object_attributes?.project_id;

      if (!issueIid || !projectId) {
        return res.status(400).json({ error: "Missing issue IID or Project ID" });
      }

      // We process issue events (open or update) if @dev-assist is mentioned in title/description
      const mentionsAssist = mentionsDevAssist(title) || mentionsDevAssist(description);
      if ((action === "open" || action === "update") && mentionsAssist) {
        // Skip if this is a publish command (handled via note/comments normally, but check just in case)
        if (isPublishCommand(description)) {
          await runPublishCommand(projectId, issueIid, botUsername, res, opencodeClient);
          return;
        }

        logger.info(`[WEBHOOK] Processing issue event [${action}] for Issue #${issueIid} in Project ${projectId}`);
        res.status(200).json({ message: "Analyzing issue..." });

        // Run analysis asynchronously to avoid GitLab webhook timeout
        runAnalysis(projectId, issueIid, payload.user?.username, opencodeClient, botUsername).catch(err => {
          logger.error(`[WEBHOOK] Error analyzing issue #${issueIid}: ` + err.message);
        });
        return;
      }

    } else if (isNoteWebhookPayload(payload)) {
      // Note (comment) events
      const noteableType = payload.object_attributes?.noteable_type;
      const noteText = payload.object_attributes?.note || "";
      const issueIid = payload.issue?.iid;
      const projectId = payload.project?.id;

      if (noteableType === "Issue" && issueIid && projectId) {
        if (mentionsDevAssist(noteText)) {
          if (isPublishCommand(noteText)) {
            logger.info(`[WEBHOOK] Received publish command for Issue #${issueIid} in Project ${projectId}`);
            res.status(200).json({ message: "Publishing ticket..." });

            runPublishCommand(projectId, issueIid, botUsername, undefined, opencodeClient).catch(err => {
              logger.error(`[WEBHOOK] Error publishing issue #${issueIid}: ` + err.message);
            });
            return;
          } else {
            logger.info(`[WEBHOOK] Received query comment for Issue #${issueIid} in Project ${projectId}`);
            res.status(200).json({ message: "Analyzing discussion..." });

            runAnalysis(projectId, issueIid, payload.user?.username, opencodeClient, botUsername).catch(err => {
              logger.error(`[WEBHOOK] Error analyzing comment for issue #${issueIid}: ` + err.message);
            });
            return;
          }
        }
      }
    } else if (isMergeRequestWebhookPayload(payload)) {
      // Regenerate the repository summary after a merge request is merged, so
      // subsequent dev-assist requests reflect the updated codebase.
      const action = payload.object_attributes?.action;
      const state = payload.object_attributes?.state;
      const isMerged = action === "merge" || state === "merged";

      if (isMerged) {
        logger.info(`[WEBHOOK] Merge request merged; refreshing repository summary.`);
        res.status(200).json({ message: "Refreshing repository summary..." });

        refreshRepositorySummary(opencodeClient).catch(err => {
          logger.error(`[WEBHOOK] Error refreshing repository summary after merge: ` + err.message);
        });
        return;
      }
    }

    // Default response for unhandled events
    return res.status(200).json({ message: "Event ignored" });
  } catch (error: unknown) {
    const message = (error as Error).message;
    logger.error("Webhook processing failed: " + message);
    return res.status(500).json({ error: message });
  }
}
