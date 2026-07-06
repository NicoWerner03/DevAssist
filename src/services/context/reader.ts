import fs from 'fs/promises';
import path from 'path';
import { getConfig } from '../../config.js';
import logger from '../../utils/logger.js';

export interface ContextMetadata {
  title?: string;
}

export async function readContextFile(projectId: string | number, issueIid: string | number): Promise<string> {
  const cfg = getConfig();
  const file = path.resolve(process.cwd(), cfg.contextOutputDir, String(projectId), String(issueIid), 'context.md');
  const content = await fs.readFile(file, 'utf8');
  logger.info('Read context file', { path: file.replace(process.cwd(), '.') });
  return content;
}

export async function readContextMetadata(projectId: string | number, issueIid: string | number): Promise<ContextMetadata> {
  const cfg = getConfig();
  const file = path.resolve(process.cwd(), cfg.contextOutputDir, String(projectId), String(issueIid), 'context.json');

  try {
    const content = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(content);
    logger.info('Read context metadata file', { path: file.replace(process.cwd(), '.') });
    return parsed && typeof parsed === 'object' ? parsed as ContextMetadata : {};
  } catch (e: any) {
    if (e?.code === 'ENOENT') {
      logger.info('No context metadata file found; publishing description only', { path: file.replace(process.cwd(), '.') });
      return {};
    }

    logger.warn('Failed to read context metadata file; publishing description only', {
      path: file.replace(process.cwd(), '.'),
      error: e.message,
    });
    return {};
  }
}
