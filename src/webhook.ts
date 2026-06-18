import { Request, Response } from "express";
import { OpencodeClient } from "@opencode-ai/sdk";
import {
  appendMissingImageReferences,
  collectImageReferences,
  getIssueImageSources
} from "./image-references.js";
import {
  getGitlabUser,
  getIssue,
  getIssueComments,
  postIssueComment,
  updateIssue,
  deleteIssueComment
} from "./gitlab.js";
import { runAnalysis } from "./agent-analysis.js";
import { isPublishCommand, mentionsDevAssist } from "./message-detection.js";
import { verifyGitlabSignature } from "./webhook-signature.js";
import { enrichImageReferencesWithVision } from "./vision.js";
import logger from "./logger.js";

let botUsername: string = "";

export async function initBotUser() {
  try {
    botUsername = await getGitlabUser();
    logger.info(`Bot initialized with GitLab user: @${botUsername}`);
  } catch (err) {
    logger.error("Warning: Could not fetch GitLab bot username: " + (err as Error).message);
  }
}

export async function handleGitlabWebhook(req: Request, res: Response, opencodeClient: OpencodeClient) {
  const signingToken = process.env.GITLAB_WEBHOOK_SECRET;
  const signatureHeader = req.headers["webhook-signature"] as string | undefined;
  const webhookId = req.headers["webhook-id"] as string | undefined;
  const webhookTimestamp = req.headers["webhook-timestamp"] as string | undefined;

  if (signingToken && signatureHeader && webhookId && webhookTimestamp) {
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);
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
    if (payload.object_kind === "issue") {
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
          await runPublishCommand(projectId, issueIid, res, opencodeClient);
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

    } else if (payload.object_kind === "note") {
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

            runPublishCommand(projectId, issueIid, undefined, opencodeClient).catch(err => {
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
    }

    // Default response for unhandled events
    return res.status(200).json({ message: "Event ignored" });
  } catch (error: any) {
    logger.error("Webhook processing failed: " + error.message);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Handles the '@dev-assist publish' command.
 * Updates the issue description and title, and deletes the conversation history.
 */
async function runPublishCommand(projectId: string | number, issueIid: number, res?: Response, opencodeClient?: OpencodeClient) {
  logger.info(`[WEBHOOK] Executing publish command for Issue #${issueIid}...`);

  // 1. Fetch issue details and comments
  const issue = await getIssue(projectId, issueIid);
  const comments = await getIssueComments(projectId, issueIid);

  // 2. Find the latest proposal comment posted by the bot
  let proposalComment: any = null;

  for (let i = comments.length - 1; i >= 0; i--) {
    const comment = comments[i];
    if (comment.author?.username === botUsername && comment.body.includes("proposed-description-start")) {
      proposalComment = comment;
      break;
    }
  }

  if (!proposalComment) {
    logger.warn(`[WEBHOOK] No proposal found for Issue #${issueIid}`);
    const errMsg = `Oops! I couldn't find an active proposal. Please mention @dev-assist first to generate a proposal.`;
    await postIssueComment(projectId, issueIid, errMsg);
    if (res) res.status(404).json({ error: "Proposal not found" });
    return;
  }

  // 3. Extract title and description
  const bodyText = proposalComment.body;
  const titleMatch = bodyText.match(/<!-- proposed-title-start -->\s*([\s\S]*?)\s*<!-- proposed-title-end -->/);
  const descMatch = bodyText.match(/<!-- proposed-description-start -->\s*([\s\S]*?)\s*<!-- proposed-description-end -->/);

  if (!titleMatch || !descMatch) {
    logger.error(`[WEBHOOK] Failed to parse proposal comment for Issue #${issueIid}`);
    const errMsg = `Error reading the proposal. The proposal seems to be incomplete or corrupted.`;
    await postIssueComment(projectId, issueIid, errMsg);
    if (res) res.status(400).json({ error: "Failed to parse proposal" });
    return;
  }

  const newTitle = titleMatch[1].trim();
  const imageReferences = collectImageReferences(getIssueImageSources(issue, comments, botUsername, proposalComment.id));
  await enrichImageReferencesWithVision(imageReferences, issue, opencodeClient);
  const newDescription = appendMissingImageReferences(descMatch[1].trim(), imageReferences);

  // 4. Update the issue
  logger.info(`[WEBHOOK] Updating title and description for Issue #${issueIid}...`);
  await updateIssue(projectId, issueIid, newTitle, newDescription);

  // 5. Delete helper comments to clean up conversation
  logger.info(`[WEBHOOK] Cleaning up helper comments for Issue #${issueIid}...`);
  for (const comment of comments) {
    const isBotComment = comment.author?.username === botUsername;
    const mentionsAssist = mentionsDevAssist(comment.body || "");

    if (isBotComment || mentionsAssist) {
      logger.info(`[WEBHOOK] Deleting comment #${comment.id}...`);
      await deleteIssueComment(projectId, issueIid, comment.id).catch(err => {
        logger.error(`[WEBHOOK] Failed to delete comment #${comment.id}: ` + err.message);
      });
    }
  }

  if (res) {
    res.status(200).json({ message: "Successfully published and cleaned conversation" });
  }
  logger.info(`[WEBHOOK] Successfully published Issue #${issueIid}`);
}
