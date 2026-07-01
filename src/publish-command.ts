import type { OpencodeClient } from "@opencode-ai/sdk";
import type { Response } from "express";
import type { GitlabComment } from "./types.js";
import {
  deleteIssueComment,
  getIssue,
  getIssueComments,
  postIssueComment,
  updateIssue
} from "./gitlab.js";
import { collectImageReferences, appendMissingImageReferences, getIssueImageSources } from "./image-references.js";
import logger from "./logger.js";
import { mentionsDevAssist } from "./message-detection.js";
import { enrichImageReferencesWithVision } from "./vision.js";

/**
 * Handles the '@dev-assist publish' command.
 * Updates the issue description and title, and deletes the conversation history.
 */
export async function runPublishCommand(
  projectId: string | number,
  issueIid: number,
  botUsername: string,
  res?: Response,
  opencodeClient?: OpencodeClient
): Promise<void> {
  logger.info(`[WEBHOOK] Executing publish command for Issue #${issueIid}...`);

  // 1. Fetch issue details and comments
  const issue = await getIssue(projectId, issueIid);
  const comments = await getIssueComments(projectId, issueIid);

  // 2. Find the latest proposal comment posted by the bot
  let proposalComment: GitlabComment | null = null;

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
  const proposedDescription = appendMissingImageReferences(descMatch[1].trim(), imageReferences);
  const newDescription = [
    `**Projekt:** ${projectId}  `,
    `**Ticket:** ${issueIid}`,
    "",
    "---",
    "",
    proposedDescription
  ].join("\n");

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
