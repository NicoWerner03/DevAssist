import "dotenv/config";
import express from "express";
import { createOpencode } from "@opencode-ai/sdk";
import { handleGitlabWebhook, initBotUser } from "./webhook.js";
import logger from "./logger.js";
import { spawn, ChildProcess } from "child_process";

let tunnelProcess: ChildProcess | null = null;
let tunnelUrlLogged = false;

function startTunnel(port: number) {
  logger.info("Starting Cloudflare Tunnel...");
  tunnelProcess = spawn("cloudflared", ["tunnel", "--url", `http://localhost:${port}`]);

  const parseTunnelOutput = (output: string) => {
    if (tunnelUrlLogged) return;
    const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match) {
      const tunnelUrl = match[0];
      logger.info("================================================================");
      logger.info(`[Tunnel] Public Webhook URL: ${tunnelUrl}/webhook/gitlab`);
      logger.info("================================================================");
      tunnelUrlLogged = true;
    }
  };

  tunnelProcess.stdout?.on("data", (data) => {
    parseTunnelOutput(data.toString());
  });

  tunnelProcess.stderr?.on("data", (data) => {
    parseTunnelOutput(data.toString());
  });

  tunnelProcess.on("error", (err) => {
    logger.error(`Failed to start Cloudflare Tunnel: ${err.message}`);
  });

  tunnelProcess.on("close", (code) => {
    if (code !== null && code !== 0 && code !== 1) {
      logger.warn(`Cloudflare Tunnel process exited with code ${code}`);
    }
  });
}

const app = express();
app.use(express.json({
  verify: (req: any, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

// Request logging middleware using Winston
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    logger.info(`[HTTP] ${req.method} ${req.url} - ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const OPENCODE_PORT = process.env.OPENCODE_PORT ? parseInt(process.env.OPENCODE_PORT, 10) : 4096;
const OPENCODE_MODEL = process.env.OPENCODE_MODEL;

async function startServer() {
  logger.info("Starting integrated Opencode server...");
  
  const opencodeConfig: any = {};
  if (OPENCODE_MODEL) {
    opencodeConfig.model = OPENCODE_MODEL;
  }

  // 1. Start Opencode server and get the client
  const { client, server: opencodeServer } = await createOpencode({
    port: OPENCODE_PORT,
    config: opencodeConfig,
  });

  logger.info(`Opencode server is running at ${opencodeServer.url}`);
  if (OPENCODE_MODEL) {
    logger.info(`Configured default model: ${OPENCODE_MODEL}`);
  } else {
    logger.info("Using Opencode's system-default model.");
  }

  // 2. Fetch/Initialize the bot username
  await initBotUser();

  // 3. Register the webhook handler.
  //    Repository summaries are generated per project: lazily on the first issue
  //    analysis for a project and refreshed after every merged merge request.
  app.post("/webhook/gitlab", (req, res) => {
    handleGitlabWebhook(req, res, client);
  });

  app.get("/health", (req, res) => {
    res.status(200).json({ status: "healthy" });
  });

  // 4. Start the Express server
  const expressServer = app.listen(PORT, () => {
    logger.info(`GitLab Webhook Dev-Assist Server listening on port ${PORT}`);
    logger.info(`Webhook endpoint is: http://localhost:${PORT}/webhook/gitlab`);
    
    if (process.env.START_TUNNEL === "true") {
      startTunnel(PORT);
    }
  });

  // 5. Graceful shutdown handler
  const handleShutdown = () => {
    logger.info("Shutting down servers...");
    if (tunnelProcess) {
      logger.info("Stopping Cloudflare Tunnel...");
      tunnelProcess.kill();
    }
    expressServer.close(() => {
      logger.info("Express server stopped.");
      try {
        opencodeServer.close();
        logger.info("Opencode server stopped.");
      } catch (err) {
        logger.error("Error stopping Opencode server: " + (err as Error).message);
      }
      process.exit(0);
    });
  };

  process.on("SIGINT", handleShutdown);
  process.on("SIGTERM", handleShutdown);
}

startServer().catch((error) => {
  logger.error("Failed to start the application: " + error.message);
  process.exit(1);
});
