import type { OpencodeClient } from "@opencode-ai/sdk";
import { getIssue, getIssueComments, postIssueComment } from "./gitlab.js";
import {
  appendMissingImageReferences,
  collectImageReferences,
  formatImageReferencesForPrompt,
  getIssueImageSources
} from "./image-references.js";
import logger from "./logger.js";
import { joinTextParts } from "./opencode-parts.js";
import type { AgentQuestionResponse, AgentResponse, OpencodeResponsePart } from "./types.js";
import { enrichImageReferencesWithVision } from "./vision.js";

export function parseAgentResponse(rawText: string): AgentResponse {
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
    return JSON.parse(cleaned.trim()) as AgentResponse;
  } catch (err) {
    logger.error("Failed to parse JSON response from agent: " + rawText);
    throw new Error("Invalid JSON returned by agent.");
  }
}

export function isAgentQuestionResponse(response: AgentResponse): response is AgentQuestionResponse {
  return response.hasQuestions;
}

/**
 * Cleans up common greetings and introductory remarks from the agent's questions field
 * to prevent duplicate greetings in the final posted comment.
 */
export function cleanQuestions(questions: string): string {
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

/**
 * Runs the Opencode agent to analyze the issue context and write a proposal or ask questions.
 */
export async function runAnalysis(
  projectId: string | number,
  issueIid: number,
  triggeringUser: string | undefined,
  opencodeClient: OpencodeClient,
  botUsername: string
): Promise<void> {
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

    const replyText = joinTextParts(promptRes.data.parts as OpencodeResponsePart[]);
    logger.info(`[AGENT] Received reply from Opencode:\n${replyText}`);

    const parsed = parseAgentResponse(replyText);
    logger.debug(`[AGENT] Parsed response object: ${JSON.stringify(parsed, null, 2)}`);

    if (isAgentQuestionResponse(parsed)) {
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
