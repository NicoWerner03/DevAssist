import fs from 'fs/promises';
import path from 'path';
import { getConfig } from '../../config.js';
import logger from '../../utils/logger.js';

export interface ContextMetadata {
  title?: string;
}

export async function writeContextFile(
  projectId: string | number,
  issueIid: string | number,
  content: string,
  metadata?: ContextMetadata
): Promise<string> {
  const cfg = getConfig();
  const dir = path.resolve(process.cwd(), cfg.contextOutputDir, String(projectId), String(issueIid));
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, 'context.md');
  await fs.writeFile(file, content, 'utf8');

  if (metadata && Object.keys(metadata).length > 0) {
    const metadataFile = path.join(dir, 'context.json');
    await fs.writeFile(metadataFile, JSON.stringify(metadata, null, 2), 'utf8');
    logger.info('Wrote context metadata file', { path: metadataFile.replace(process.cwd(), '.') });
  }

  logger.info('Wrote context file', { path: file.replace(process.cwd(), '.') });
  return file;
}
