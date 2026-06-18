import { OpencodeClient } from "@opencode-ai/sdk";
import { getMimeTypeFromUrl, looksLikeImageUrl } from "./image-references.js";
import logger from "./logger.js";
import { ImageReference } from "./types.js";

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

export async function enrichImageReferencesWithVision(
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
