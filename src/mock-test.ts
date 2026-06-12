// Set simulation environment variable BEFORE importing other files
process.env.IS_SIMULATION = "true";

import "dotenv/config";
import express from "express";
import { createOpencode } from "@opencode-ai/sdk";
import * as gitlab from "./gitlab.js";
import { handleGitlabWebhook, initBotUser } from "./webhook.js";
import logger from "./logger.js";

const app = express();
app.use(express.json());

const PORT = 3001; // Separate port for simulation
const OPENCODE_PORT = 4097; // Separate port for simulation

async function runSimulation() {
  logger.info("Starting Webhook simulation...");

  const opencodeConfig: any = {};
  if (process.env.OPENCODE_MODEL) {
    opencodeConfig.model = process.env.OPENCODE_MODEL;
  }

  // 1. Start integrated Opencode server
  const { client, server: opencodeServer } = await createOpencode({
    port: OPENCODE_PORT,
    config: opencodeConfig,
  });

  await initBotUser(); // Sets botUsername to "dev-assist-bot"

  app.post("/webhook/gitlab", (req, res) => {
    handleGitlabWebhook(req, res, client);
  });

  const server = app.listen(PORT, async () => {
    logger.info(`Simulation server listening on port ${PORT}`);

    try {
      // Get current mock state from gitlab.ts to see what issue we are testing
      const issue = await gitlab.getIssue(12345, 1);
      logger.info(`Initial mock issue title: "${issue.title}"`);
      logger.info(`Initial mock issue description: "${issue.description}"`);

      // --- Scenario 1: Trigger issue analysis (Issue opened mentioning @dev-assist) ---
      logger.info(">>> Simulating Issue Open Webhook Event...");
      const issuePayload = {
        object_kind: "issue",
        user: { username: "nico03werner" },
        project: { id: 12345 },
        object_attributes: {
          action: "open",
          iid: 1,
          title: issue.title,
          description: issue.description
        }
      };

      const response = await fetch(`http://localhost:${PORT}/webhook/gitlab`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(issuePayload)
      });
      const resData = await response.json();
      logger.info("Webhook response: " + JSON.stringify(resData));

      // Wait for the async agent analysis to run
      logger.info("Waiting for agent to process Scenario 1...");
      await new Promise(r => setTimeout(r, 8000));

      let comments = await gitlab.getIssueComments(12345, 1);
      logger.info(`Current comments count: ${comments.length}`);

      // --- Scenario 1.5: Simulating User replying with details and triggering @dev-assist again ---
      logger.info(">>> Simulating User replying with missing information and mentioning @dev-assist...");
      const replyBody = "I am using Chrome on Windows 11. Steps to reproduce:\n1. Go to http://localhost:3000\n2. Click on 'Login with GitLab'\n3. The popup closes immediately and the network tab shows a 500 Internal Server Error.\nPlease analyze @dev-assist";
      
      comments.push({
        id: 2001,
        body: replyBody,
        author: { username: "nico03werner" }
      });

      const replyPayload = {
        object_kind: "note",
        user: { username: "nico03werner" },
        project: { id: 12345 },
        issue: { iid: 1 },
        object_attributes: {
          noteable_type: "Issue",
          note: replyBody
        }
      };

      const replyResponse = await fetch(`http://localhost:${PORT}/webhook/gitlab`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(replyPayload)
      });
      const replyResData = await replyResponse.json();
      logger.info("Reply Webhook response: " + JSON.stringify(replyResData));

      logger.info("Waiting for agent to process Scenario 1.5...");
      await new Promise(r => setTimeout(r, 8000));

      comments = await gitlab.getIssueComments(12345, 1);
      logger.info(`Current comments count after Scenario 1.5: ${comments.length}`);

      // --- Scenario 2: Trigger publish command comment ---
      if (comments.length > 0) {
        logger.info(">>> Simulating User Commenting '@dev-assist publish'...");
        
        // Add user comment to mock list
        comments.push({
          id: 9999,
          body: "@dev-assist publish",
          author: { username: "nico03werner" }
        });

        const commentPayload = {
          object_kind: "note",
          user: { username: "nico03werner" },
          project: { id: 12345 },
          issue: { iid: 1 },
          object_attributes: {
            noteable_type: "Issue",
            note: "@dev-assist publish"
          }
        };

        const commentResponse = await fetch(`http://localhost:${PORT}/webhook/gitlab`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(commentPayload)
        });
        const commentResData = await commentResponse.json();
        logger.info("Comment Webhook response: " + JSON.stringify(commentResData));

        // Wait for comments cleanup and update
        await new Promise(r => setTimeout(r, 4000));
        
        const finalIssue = await gitlab.getIssue(12345, 1);
        const finalComments = await gitlab.getIssueComments(12345, 1);

        logger.info(">>> Final Issue State after Publish:");
        logger.info("Title: " + finalIssue.title);
        logger.info("Description:\n" + finalIssue.description);
        logger.info("Remaining comments in thread (should be 0 or only system notes): " + finalComments.length);
      } else {
        logger.warn("No proposal comment was posted by the bot.");
      }

    } catch (err: any) {
      logger.error("Simulation error: " + err.message);
    } finally {
      server.close();
      opencodeServer.close();
      logger.info("Simulation finished. Servers closed.");
      process.exit(0);
    }
  });
}

runSimulation();
