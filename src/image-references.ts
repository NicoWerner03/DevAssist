import { ImageReference, ImageSource } from "./types.js";

const IMAGE_URL_EXTENSION = /\.(?:png|jpe?g|gif|webp|bmp|svg|heic|heif|tiff?)(?:[?#].*)?$/i;

function stripTrailingUrlPunctuation(value: string): string {
  return value.replace(/[.,;:!?]+$/g, "");
}

function getMarkdownTargetUrl(target: string): string {
  const trimmed = target.trim();

  if (trimmed.startsWith("<")) {
    const closingIndex = trimmed.indexOf(">");
    if (closingIndex > 1) {
      return trimmed.slice(1, closingIndex).trim();
    }
  }

  const firstToken = trimmed.match(/^\S+/)?.[0] || trimmed;
  return firstToken.replace(/^<|>$/g, "");
}

export function looksLikeImageUrl(url: string): boolean {
  const cleanedUrl = stripTrailingUrlPunctuation(url).split("#")[0].split("?")[0];
  return IMAGE_URL_EXTENSION.test(cleanedUrl);
}

export function getMimeTypeFromUrl(url: string): string {
  const normalizedUrl = stripTrailingUrlPunctuation(url).split("#")[0].split("?")[0].toLowerCase();
  if (normalizedUrl.endsWith(".jpg") || normalizedUrl.endsWith(".jpeg")) return "image/jpeg";
  if (normalizedUrl.endsWith(".png")) return "image/png";
  if (normalizedUrl.endsWith(".gif")) return "image/gif";
  if (normalizedUrl.endsWith(".webp")) return "image/webp";
  if (normalizedUrl.endsWith(".bmp")) return "image/bmp";
  if (normalizedUrl.endsWith(".svg")) return "image/svg+xml";
  if (normalizedUrl.endsWith(".heic")) return "image/heic";
  if (normalizedUrl.endsWith(".heif")) return "image/heif";
  if (normalizedUrl.endsWith(".tif") || normalizedUrl.endsWith(".tiff")) return "image/tiff";
  return "image/png";
}

function normalizeImageContext(value: string): string {
  return value
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/<img\b[^>]*>/gi, " ")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/\bhttps?:\/\/[^\s<>()"']+/gi, " ")
    .replace(/\/uploads\/[^\s<>()"']+/gi, " ")
    .replace(/@dev-assist(?:\s+publish)?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateContext(value: string): string {
  const maxLength = 280;
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}

function getImageContext(text: string, matchIndex: number, matchLength: number): string {
  const lineStart = text.lastIndexOf("\n", matchIndex) + 1;
  const nextLineBreak = text.indexOf("\n", matchIndex + matchLength);
  const lineEnd = nextLineBreak === -1 ? text.length : nextLineBreak;

  const line = text.slice(lineStart, lineEnd);
  const matchStartInLine = matchIndex - lineStart;
  const matchEndInLine = matchStartInLine + matchLength;
  const sameLineContext = normalizeImageContext(`${line.slice(0, matchStartInLine)} ${line.slice(matchEndInLine)}`);

  if (sameLineContext) {
    return truncateContext(sameLineContext);
  }

  const previousLines = text
    .slice(0, lineStart)
    .split("\n")
    .map(normalizeImageContext)
    .filter(Boolean);
  const nextLines = text
    .slice(lineEnd)
    .split("\n")
    .map(normalizeImageContext)
    .filter(Boolean);

  return truncateContext([previousLines[previousLines.length - 1], nextLines[0]].filter(Boolean).join(" "));
}

function addImageReference(
  references: ImageReference[],
  seenReferences: Map<string, ImageReference>,
  markdown: string,
  url: string,
  source: string,
  context: string
): void {
  const cleanedUrl = stripTrailingUrlPunctuation(url.trim());
  if (!cleanedUrl) return;

  const normalizedUrl = cleanedUrl.toLowerCase();
  const existingReference = seenReferences.get(normalizedUrl);
  if (existingReference) {
    if (!existingReference.context && context) {
      existingReference.context = context;
      existingReference.source = source;
    }
    return;
  }

  const reference = {
    url: cleanedUrl,
    markdown: markdown.trim(),
    source,
    context
  };
  seenReferences.set(normalizedUrl, reference);
  references.push(reference);
}

function extractImageReferencesFromText(
  imageSource: ImageSource,
  references: ImageReference[],
  seenReferences: Map<string, ImageReference>
): void {
  const { text, source } = imageSource;

  const markdownImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  for (const match of text.matchAll(markdownImageRegex)) {
    const url = getMarkdownTargetUrl(match[2]);
    addImageReference(references, seenReferences, match[0], url, source, getImageContext(text, match.index || 0, match[0].length));
  }

  const htmlImageRegex = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  for (const match of text.matchAll(htmlImageRegex)) {
    const url = match[1];
    addImageReference(references, seenReferences, `![Image](${url})`, url, source, getImageContext(text, match.index || 0, match[0].length));
  }

  const markdownLinkRegex = /(^|[^!])\[([^\]]+)\]\(([^)]+)\)/g;
  for (const match of text.matchAll(markdownLinkRegex)) {
    const markdown = match[0].slice(match[1].length);
    const url = getMarkdownTargetUrl(match[3]);
    if (looksLikeImageUrl(url)) {
      addImageReference(references, seenReferences, markdown, url, source, getImageContext(text, (match.index || 0) + match[1].length, markdown.length));
    }
  }

  const directUrlRegex = /\bhttps?:\/\/[^\s<>()"']+/gi;
  for (const match of text.matchAll(directUrlRegex)) {
    const url = stripTrailingUrlPunctuation(match[0]);
    if (looksLikeImageUrl(url)) {
      addImageReference(references, seenReferences, `![Image](${url})`, url, source, getImageContext(text, match.index || 0, match[0].length));
    }
  }

  const gitlabUploadRegex = /\/uploads\/[^\s<>()"']+/gi;
  for (const match of text.matchAll(gitlabUploadRegex)) {
    const url = stripTrailingUrlPunctuation(match[0]);
    if (looksLikeImageUrl(url)) {
      addImageReference(references, seenReferences, `![Image](${url})`, url, source, getImageContext(text, match.index || 0, match[0].length));
    }
  }
}

export function collectImageReferences(sources: ImageSource[]): ImageReference[] {
  const references: ImageReference[] = [];
  const seenReferences = new Map<string, ImageReference>();

  for (const source of sources) {
    if (!source.text) continue;
    extractImageReferencesFromText(source, references, seenReferences);
  }

  return references;
}

function getCommentImageSource(comment: any): ImageSource {
  const username = comment.author?.username ? `@${comment.author.username}` : "unknown user";
  return {
    text: comment.body || "",
    source: `Comment by ${username}`
  };
}

export function getIssueImageSources(
  issue: any,
  comments: any[],
  botUsername: string,
  includeProposalCommentId?: number
): ImageSource[] {
  const userProvidedImageSources = comments
    .filter(c => {
      if (c.system) return false;
      if (includeProposalCommentId && c.id === includeProposalCommentId) return false;
      return !botUsername || c.author?.username !== botUsername;
    })
    .map(getCommentImageSource);

  return [
    { text: issue.description || "", source: "Issue description" },
    ...userProvidedImageSources
  ];
}

export function formatImageReferencesForPrompt(references: ImageReference[]): string {
  if (references.length === 0) return "(No image references found)";
  return references
    .map((reference, index) => {
      const context = reference.context || "No surrounding context provided.";
      const visionSummary = reference.visionSummary ? `\n   Visual summary: ${reference.visionSummary}` : "";
      return `${index + 1}. Source: ${reference.source}\n   Context: ${context}${visionSummary}\n   Image: ${reference.markdown}`;
    })
    .join("\n");
}

function formatImageReferenceBlock(reference: ImageReference, index: number, includeImage: boolean): string {
  const context = reference.context || "No surrounding context provided.";
  const visionSummary = reference.visionSummary ? `\n- Visual summary: ${reference.visionSummary}` : "";
  const imageLine = includeImage ? reference.markdown : `- Image: [link](${reference.url})`;
  return `#### Image ${index + 1}\n- Source: ${reference.source}\n- Context: ${context}${visionSummary}\n${imageLine}`;
}

function descriptionIncludesImage(description: string, reference: ImageReference): boolean {
  return description.includes(reference.url) || description.includes(reference.markdown);
}

function tokenizeContext(value: string): Set<string> {
  const tokens = normalizeImageContext(value)
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) || [];

  return new Set(tokens.filter(token => token.length > 2));
}

function findContextInsertionIndex(description: string, reference: ImageReference): number | null {
  const referenceTokens = tokenizeContext(reference.context);
  if (referenceTokens.size === 0) return null;

  const lines = description.matchAll(/[^\r\n]+/g);
  let bestMatch: { index: number; score: number; overlap: number } | null = null;

  for (const line of lines) {
    const lineText = line[0];
    const lineTokens = tokenizeContext(lineText);
    if (lineTokens.size === 0) continue;

    let overlap = 0;
    for (const token of lineTokens) {
      if (referenceTokens.has(token)) overlap++;
    }

    if (overlap === 0) continue;

    const coverage = overlap / Math.min(referenceTokens.size, lineTokens.size);
    const score = overlap + coverage;
    const insertionIndex = (line.index || 0) + lineText.length;

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { index: insertionIndex, score, overlap };
    }
  }

  if (!bestMatch) return null;

  const minimumOverlap = Math.min(3, referenceTokens.size);
  return bestMatch.overlap >= minimumOverlap ? bestMatch.index : null;
}

function insertImageReferenceAt(description: string, insertionIndex: number, reference: ImageReference): string {
  const before = description.slice(0, insertionIndex).trimEnd();
  const after = description.slice(insertionIndex).trimStart();

  if (!before) {
    return after ? `${reference.markdown}\n\n${after}` : reference.markdown;
  }

  if (!after) {
    return `${before}\n${reference.markdown}`;
  }

  return `${before}\n${reference.markdown}\n\n${after}`;
}

export function appendMissingImageReferences(description: string, references: ImageReference[]): string {
  let updatedDescription = description.trim();
  const missingReferenceBlocks = references
    .map((reference, index) => {
      const hasImage = descriptionIncludesImage(updatedDescription, reference);
      const hasSource = updatedDescription.includes(reference.source);
      const hasVisionSummary = !reference.visionSummary || updatedDescription.includes(reference.visionSummary);
      if (hasImage && hasSource && hasVisionSummary) return null;

      if (!hasImage) {
        const insertionIndex = findContextInsertionIndex(updatedDescription, reference);
        if (insertionIndex !== null) {
          updatedDescription = insertImageReferenceAt(updatedDescription, insertionIndex, reference);
          return null;
        }
      }

      return formatImageReferenceBlock(reference, index, !hasImage);
    })
    .filter((block): block is string => Boolean(block));

  if (missingReferenceBlocks.length === 0) return updatedDescription;

  const hasImageSection = /^###\s+(?:Images|Screenshots|Images \/ Screenshots|Screenshots \/ Images|Referenced Images)\s*$/im.test(updatedDescription);
  const imageMarkdown = missingReferenceBlocks.join("\n\n");

  if (!updatedDescription) {
    return `### Images / Screenshots\n${imageMarkdown}`;
  }

  if (hasImageSection) {
    return `${updatedDescription}\n\n${imageMarkdown}`;
  }

  return `${updatedDescription}\n\n### Images / Screenshots\n${imageMarkdown}`;
}
