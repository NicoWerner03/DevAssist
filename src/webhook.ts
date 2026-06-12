import { Request, Response } from "express";
import { OpencodeClient } from "@opencode-ai/sdk";
import {
  getGitlabUser,
  getIssue,
  getIssueComments,
  postIssueComment,
  updateIssue,
  deleteIssueComment
} from "./gitlab.js";
import logger from "./logger.js";
import crypto from "crypto";

// Global cache for bot username
let botUsername: string = "";

// Helper to initialize the bot username
export async function initBotUser() {
  try {
    botUsername = await getGitlabUser();
    logger.info(`Bot initialized with GitLab user: @${botUsername}`);
  } catch (err) {
    logger.error("Warning: Could not fetch GitLab bot username: " + (err as Error).message);
  }
}

// Helper to clean markdown json blocks
function parseAgentResponse(rawText: string): any {
  let cleaned = rawText.trim();

  // Extract JSON from markdown code block if present
  const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/i;
  const match = cleaned.match(jsonBlockRegex);
  if (match) {
    cleaned = match[1];
  } else {
    // Check for generic code blocks
    const codeBlockRegex = /```\s*([\s\S]*?)\s*```/i;
    const genericMatch = cleaned.match(codeBlockRegex);
    if (genericMatch) {
      cleaned = genericMatch[1];
    }
  }

  try {
    return JSON.parse(cleaned.trim());
  } catch (err) {
    logger.error("Failed to parse JSON response from agent: " + rawText);
    throw new Error("Invalid JSON returned by agent.");
  }
}

function verifyGitlabSignature(
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

function isBotMessage(payload: any): boolean {
  if (payload.object_kind === "note") {
    const noteText = payload.object_attributes?.note || "";
    return (
      noteText.includes("Proposal from @dev-assist") ||
      noteText.includes("thanks for opening this issue!")
    );
  }
  return false;
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

  // 1. Prevent infinite loops: ignore events triggered by the bot itself
  if (eventUser && botUsername && eventUser === botUsername) {
    if (isBotMessage(payload)) {
      logger.info(`Ignored: Event triggered by bot @${botUsername} itself`);
      return res.status(200).json({ message: "Ignored: Event triggered by bot itself" });
    }
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
      const mentionsAssist = title.includes("@dev-assist") || description.includes("@dev-assist");
      if ((action === "open" || action === "update") && mentionsAssist) {
        // Skip if this is a publish command (handled via note/comments normally, but check just in case)
        if (description.includes("@dev-assist publish")) {
          await runPublishCommand(projectId, issueIid, res);
          return;
        }

        logger.info(`[WEBHOOK] Processing issue event [${action}] for Issue #${issueIid} in Project ${projectId}`);
        res.status(200).json({ message: "Analyzing issue..." });

        // Run analysis asynchronously to avoid GitLab webhook timeout
        runAnalysis(projectId, issueIid, payload.user?.username, opencodeClient).catch(err => {
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
        if (noteText.includes("@dev-assist")) {
          if (noteText.includes("@dev-assist publish")) {
            logger.info(`[WEBHOOK] Received publish command for Issue #${issueIid} in Project ${projectId}`);
            res.status(200).json({ message: "Publishing ticket..." });

            runPublishCommand(projectId, issueIid).catch(err => {
              logger.error(`[WEBHOOK] Error publishing issue #${issueIid}: ` + err.message);
            });
            return;
          } else {
            logger.info(`[WEBHOOK] Received query comment for Issue #${issueIid} in Project ${projectId}`);
            res.status(200).json({ message: "Analyzing discussion..." });

            runAnalysis(projectId, issueIid, payload.user?.username, opencodeClient).catch(err => {
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
 * Runs the Opencode agent to analyze the issue context and write a proposal or ask questions.
 */
async function runAnalysis(projectId: string | number, issueIid: number, triggeringUser: string, opencodeClient: OpencodeClient) {
  // 1. Fetch latest issue details
  const issue = await getIssue(projectId, issueIid);

  // 2. Fetch all comments for context
  const comments = await getIssueComments(projectId, issueIid);

  // Format the discussion thread for the agent
  const commentContext = comments
    .filter(c => !c.system) // Skip system notes
    .map(c => `@${c.author.username}: ${c.body}`)
    .join("\n\n");

  const promptText = `
Hier ist das aktuelle GitLab-Ticket zur Analyse:

Titel: ${issue.title}
Beschreibung:
${issue.description}

Bisherige Kommentare / Diskussionsverlauf:
${commentContext || "(Bisher keine Kommentare)"}

Bitte überprüfe, ob genügend Kontext für Entwickler vorhanden ist (Reproduktionsschritte, Logs, Akzeptanzkriterien).
Antworte exakt im vorgegebenen JSON-Format.
`;

  logger.info(`[AGENT] Starting Opencode session for Issue #${issueIid}...`);
  const sessionRes = await opencodeClient.session.create();
  if (!sessionRes.data || !sessionRes.data.id) {
    throw new Error("Failed to create Opencode session: no session ID returned");
  }
  const sessionId = sessionRes.data.id;
  logger.debug(`[AGENT] Created Opencode session: ${sessionId}`);

  try {
    logger.info(`[AGENT] Sending prompt to Opencode (Session: ${sessionId}). Prompt context:\n${promptText}`);
    const promptRes = await opencodeClient.session.prompt({
      path: { id: sessionId },
      body: {
        agent: "dev-assist",
        parts: [{ type: "text", text: promptText }]
      }
    });

    logger.debug("DEBUG: promptRes is: " + JSON.stringify(promptRes, null, 2));

    if (!promptRes.data || !promptRes.data.parts) {
      throw new Error("Failed to get response from Opencode session: no parts returned.");
    }

    const textParts = promptRes.data.parts.filter(p => p.type === 'text');
    const replyText = textParts.map(p => (p as any).text).join('\n');
    logger.info(`[AGENT] Received reply from Opencode:\n${replyText}`);

    const parsed = parseAgentResponse(replyText);
    logger.debug(`[AGENT] Parsed response object: ${JSON.stringify(parsed, null, 2)}`);

    if (parsed.hasQuestions) {
      logger.info(`[AGENT] Agent returned questions for Issue #${issueIid}. Posting comment...`);
      const commentBody = `@${triggeringUser || issue.author.username} thanks for opening this issue! To help developers resolve it as quickly as possible, please provide the following details:\n\n${parsed.questions}`;
      await postIssueComment(projectId, issueIid, commentBody);
    } else {
      logger.info(`[AGENT] Agent generated proposal for Issue #${issueIid}. Posting proposal comment...`);
      const proposalBody = `### 🚀 Proposal from @dev-assist
I have gathered all the necessary details. Here is my structured proposal for the ticket:

**Proposed Title:**
<!-- proposed-title-start -->
${parsed.proposedTitle}
<!-- proposed-title-end -->

**Proposed Description:**
<!-- proposed-description-start -->
${parsed.proposedDescription}
<!-- proposed-description-end -->

---
*Write a comment with \`@dev-assist publish\` to apply these changes and clean up the discussion thread.*`;

      await postIssueComment(projectId, issueIid, proposalBody);
    }
  } finally {
    // Delete the temporary session to save resources
    await opencodeClient.session.delete({ path: { id: sessionId } }).catch(err => {
      logger.error(`Failed to delete session ${sessionId}: ` + err.message);
    });
  }
}

/**
 * Handles the '@dev-assist publish' command.
 * Updates the issue description and title, and deletes the conversation history.
 */
async function runPublishCommand(projectId: string | number, issueIid: number, res?: Response) {
  logger.info(`[WEBHOOK] Executing publish command for Issue #${issueIid}...`);

  // 1. Fetch comments
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
  const newDescription = descMatch[1].trim();

  // 4. Update the issue
  logger.info(`[WEBHOOK] Updating title and description for Issue #${issueIid}...`);
  await updateIssue(projectId, issueIid, newTitle, newDescription);

  // 5. Delete helper comments to clean up conversation
  logger.info(`[WEBHOOK] Cleaning up helper comments for Issue #${issueIid}...`);
  for (const comment of comments) {
    const isBotComment = comment.author?.username === botUsername;
    const mentionsAssist = comment.body.includes("@dev-assist");

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
