import { Request, Response } from "express";
import { OpencodeClient } from "@opencode-ai/sdk";
import {
  appendMissingImageReferences,
  collectImageReferences,
  formatImageReferencesForPrompt,
  getIssueImageSources,
  getMimeTypeFromUrl,
  looksLikeImageUrl
} from "./image-references.js";
import { type ImageReference } from "./types.js";
import {
  getGitlabUser,
  getIssue,
  getIssueComments,
  postIssueComment,
  updateIssue,
  deleteIssueComment
} from "./gitlab.js";
import { isPublishCommand, mentionsDevAssist } from "./message-detection.js";
import { verifyGitlabSignature } from "./webhook-signature.js";
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
 * Cleans up common greetings and introductory remarks from the agent's questions field
 * to prevent duplicate greetings in the final posted comment.
 */
function cleanQuestions(questions: string): string {
  if (!questions) return "";
  let cleaned = questions.trim();

  const lines = cleaned.split("\n");
  const cleanedLines: string[] = [];
  let foundStartOfQuestions = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      if (foundStartOfQuestions) {
        cleanedLines.push(lines[i]); // Preserve empty lines inside questions
      }
      continue;
    }

    if (!foundStartOfQuestions) {
      // Check if this line is a question or list item
      const isBullet = /^[*\-\d+\.]/.test(line);
      const isQuestionTopic = /^[a-zA-Z0-9\s&/\-_]+:/.test(line); // e.g. "Design & Theme Colors: ..."
      const startsWithQuestionWord = /^(What|How|Why|Who|Where|When|Which|Can|Could|Is|Are|Do|Does|Should|Would|Please list|Please share|Please provide a list)\b/i.test(line);

      // If it's a bullet, a topic, or starts with a question word, but is NOT a generic greeting
      const isGenericGreeting = /^(Hi|Hello|Thanks|Thank you|Dear|To help|Please provide the following|Could you please provide|To help our development team|Thank you for providing)/i.test(line);

      if ((isBullet || isQuestionTopic || startsWithQuestionWord) && !isGenericGreeting) {
        foundStartOfQuestions = true;
        cleanedLines.push(lines[i]);
      } else {
        logger.debug(`[CLEAN] Stripping greeting line: "${line}"`);
      }
    } else {
      cleanedLines.push(lines[i]);
    }
  }

  const result = cleanedLines.join("\n").trim();
  return result || cleaned;
}

const DEFAULT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function truncateVisionSummary(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  const maxLength = 320;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function getProjectWebUrl(issue: any): string | null {
  if (issue.project?.web_url) return issue.project.web_url;
  if (process.env.GITLAB_PROJECT_URL) return process.env.GITLAB_PROJECT_URL;

  const issueUrl = issue.web_url || "";
  const match = issueUrl.match(/^(.+?)\/-\/issues\/\d+/);
  return match?.[1] || null;
}

function resolveImageUrl(url: string, issue: any): string | null {
  if (/^https?:\/\//i.test(url)) return url;

  const projectWebUrl = getProjectWebUrl(issue);
  if (projectWebUrl && url.startsWith("/uploads/")) {
    return `${projectWebUrl.replace(/\/$/, "")}${url}`;
  }

  const baseUrl = projectWebUrl || issue.web_url || process.env.GITLAB_BASE_URL;
  if (!baseUrl) {
    return null;
  }

  try {
    return new URL(url, baseUrl).href;
  } catch {
    return null;
  }
}

function getVisionMaxImageBytes(): number {
  const parsedMaxBytes = Number.parseInt(process.env.OPENCODE_VISION_MAX_IMAGE_BYTES || "", 10);
  return Number.isFinite(parsedMaxBytes) && parsedMaxBytes > 0 ? parsedMaxBytes : DEFAULT_MAX_IMAGE_BYTES;
}

function getGitlabImageFetchHeaders(): Record<string, string> {
  const token = process.env.GITLAB_TOKEN || process.env.GITLAB_ACCESS_TOKEN || process.env.GL_TOKEN;
  if (!token) return {};
  return { "PRIVATE-TOKEN": token };
}

async function downloadImageAsDataUrl(reference: ImageReference, issue: any, maxImageBytes: number): Promise<string | null> {
  const resolvedUrl = resolveImageUrl(reference.url, issue);
  if (!resolvedUrl) {
    logger.warn(`[VISION] Skipping image without resolvable URL: ${reference.url}`);
    return null;
  }

  const response = await fetch(resolvedUrl, { headers: getGitlabImageFetchHeaders() });
  if (!response.ok) {
    throw new Error(`Failed to download image (${response.status} ${response.statusText}) from ${resolvedUrl}`);
  }

  const contentType = response.headers.get("content-type")?.split(";")[0].trim() || getMimeTypeFromUrl(reference.url);
  if (!contentType.startsWith("image/") && !looksLikeImageUrl(reference.url)) {
    throw new Error(`Downloaded resource is not an image: ${contentType}`);
  }

  const imageBuffer = Buffer.from(await response.arrayBuffer());
  if (imageBuffer.byteLength > maxImageBytes) {
    logger.warn(`[VISION] Skipping image larger than ${maxImageBytes} bytes: ${reference.url}`);
    return null;
  }

  const mimeType = contentType.startsWith("image/") ? contentType : getMimeTypeFromUrl(reference.url);
  return `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
}

async function analyzeImageWithOpencode(
  reference: ImageReference,
  dataUrl: string,
  opencodeClient: OpencodeClient
): Promise<string | null> {
  const prompt = [
    "Analyze this screenshot or image for a software development ticket.",
    "Return one concise English sentence that captures the visible UI state, error message, log, or artifact relevant to debugging.",
    "Do not invent details that are not visible.",
    "Return only the sentence, without Markdown formatting or extra commentary.",
    `Source: ${reference.source}`,
    `User-provided context: ${reference.context || "No surrounding context provided."}`
  ].join("\n");

  const sessionRes = await opencodeClient.session.create();
  if (!sessionRes.data || !sessionRes.data.id) {
    throw new Error("Failed to create Opencode vision session: no session ID returned");
  }

  const sessionId = sessionRes.data.id;
  try {
    const promptRes = await opencodeClient.session.prompt({
      path: { id: sessionId },
      body: {
        parts: [
          { type: "text", text: prompt },
          {
            type: "file",
            mime: getMimeTypeFromDataUrl(dataUrl),
            filename: reference.url.split("/").pop()?.split("?")[0] || "image",
            url: dataUrl
          }
        ]
      }
    });

    if (!promptRes.data || !promptRes.data.parts) {
      throw new Error("Failed to get response from Opencode vision session: no parts returned.");
    }

    const textParts = promptRes.data.parts.filter(p => p.type === "text");
    const outputText = textParts.map(p => (p as any).text).join("\n").trim();
    return outputText ? truncateVisionSummary(outputText) : null;
  } finally {
    await opencodeClient.session.delete({ path: { id: sessionId } }).catch(err => {
      logger.error(`Failed to delete vision session ${sessionId}: ` + err.message);
    });
  }
}

function getMimeTypeFromDataUrl(dataUrl: string): string {
  const match = dataUrl.match(/^data:([^;]+);base64,/);
  return match?.[1] || "image/png";
}

async function enrichImageReferencesWithVision(
  references: ImageReference[],
  issue: any,
  opencodeClient?: OpencodeClient
): Promise<void> {
  if (!opencodeClient || references.length === 0 || process.env.IS_SIMULATION === "true") {
    return;
  }

  const maxImageBytes = getVisionMaxImageBytes();

  for (const reference of references) {
    if (reference.visionSummary) continue;

    try {
      const dataUrl = await downloadImageAsDataUrl(reference, issue, maxImageBytes);
      if (!dataUrl) continue;

      const visionSummary = await analyzeImageWithOpencode(reference, dataUrl, opencodeClient);
      if (visionSummary) {
        reference.visionSummary = visionSummary;
      }
    } catch (error) {
      logger.warn(`[VISION] Failed to analyze image ${reference.url}: ` + (error as Error).message);
    }
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

  const imageReferences = collectImageReferences(getIssueImageSources(issue, comments, botUsername));
  await enrichImageReferencesWithVision(imageReferences, issue, opencodeClient);

  const promptText = `
Here is the current GitLab issue for analysis:

Title: ${issue.title}
Description:
${issue.description}

Previous comments / discussion history:
${commentContext || "(No comments yet)"}

Image references posted in the issue or discussion:
${formatImageReferencesForPrompt(imageReferences)}

Please check if there is enough context for developers (reproduction steps, logs, acceptance criteria).
If image references are listed, include every one in proposedDescription at the most relevant place in the ticket text, using the provided context and visual summary to choose the location. Use a "### Images / Screenshots" section only for images that do not have a natural place in the description, and keep the exact Markdown image/link so they remain visible after the discussion comments are cleaned up.
Respond exactly in the specified JSON format.
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
      const cleanedQuestions = cleanQuestions(parsed.questions);
      const commentBody = `@${triggeringUser || issue.author.username} thanks for opening this issue! To help developers resolve it as quickly as possible, please provide the following details:\n\n${cleanedQuestions}`;
      await postIssueComment(projectId, issueIid, commentBody);
    } else {
      logger.info(`[AGENT] Agent generated proposal for Issue #${issueIid}. Posting proposal comment...`);
      const proposedDescription = appendMissingImageReferences(parsed.proposedDescription, imageReferences);
      const proposalBody = `### Proposal from @dev-assist
I have gathered all the necessary details. Here is my structured proposal for the ticket:

**Proposed Title:**
<!-- proposed-title-start -->
${parsed.proposedTitle}
<!-- proposed-title-end -->

**Proposed Description:**
<!-- proposed-description-start -->
${proposedDescription}
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
