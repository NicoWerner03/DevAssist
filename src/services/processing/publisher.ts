import logger from '../../utils/logger';
import { createGitLabClient } from '../gitlab/client';
import { readContextFile, readContextMetadata } from '../context/reader';
import { filterDeletableNotes } from '../gitlab/cleanup';

const gitlab = createGitLabClient();

function extractTitleFromMarkdown(markdown: string): string | undefined {
  const headingMatch = markdown.match(/(?:^|\n)### Title\s*\n+([\s\S]*?)(?=\n### |\n## |$)/i);
  if (headingMatch?.[1]?.trim()) {
    return headingMatch[1].trim();
  }

  const inlineMatch = markdown.match(/(?:^|\n)\*\*Title:\*\*\s*(.+)(?:\n|$)/i);
  if (inlineMatch?.[1]?.trim()) {
    return inlineMatch[1].trim();
  }

  return undefined;
}

function renderPublishedDescription(markdown: string): string {
  return markdown
    .replace(/\n## Ticket\s*\n+\| Field \| Value \|\s*\n\| --- \| --- \|\s*\n(?:\|.*\|\s*\n)+/i, '\n')
    .replace(/\n### Title\s*\n+[\s\S]*?(?=\n### Goal\b)/i, '\n')
    .replace(/\n\*\*Title:\*\*[^\n]*\n+/i, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n';
}

export async function publishIssue(
  projectId: string | number,
  issueIid: string | number,
  extraUpdates?: Record<string, any>
) {
  const log = logger.withContext({ projectId, issueIid, phase: 'publish' });
  log.info('Starting publish');

  // 1. Read the previously written structured context
  const fullMarkdown = await readContextFile(projectId, issueIid);
  const metadata = await readContextMetadata(projectId, issueIid);
  const descriptionMarkdown = renderPublishedDescription(fullMarkdown);

  // 2. Load current notes and decide what to delete
  const notes = await gitlab.listNotes(projectId, issueIid);
  const deletable = filterDeletableNotes(notes);
  log.info('Deletable notes identified', { count: deletable.length });

  // 3. Delete them (best effort – continue on individual failures)
  let deleted = 0;
  const deletedIds: number[] = [];
  for (const n of deletable) {
    try {
      await gitlab.deleteNote(projectId, issueIid, n.id);
      deleted++;
      deletedIds.push(n.id);
      log.debug('Deleted note', { id: n.id });
    } catch (e: any) {
      log.warn('Failed to delete note (continuing)', { id: n.id, error: e.message });
    }
  }
  log.info('Cleanup complete', { deleted, deletedIds });

  // 4. Update the issue with the clean structured content.
  // The generated ticket title belongs in GitLab's issue title, not in the description body.
  const title = metadata.title?.trim() || extractTitleFromMarkdown(fullMarkdown);
  const baseUpdates: Record<string, any> = { description: descriptionMarkdown };
  if (title) {
    baseUpdates.title = title;
  }

  await gitlab.updateIssue(projectId, issueIid, baseUpdates);
  log.info('Issue updated with structured content', { titleUpdated: Boolean(title) });

  // 5. Optional additional updates (state_event=close, add_labels, remove_labels, assignee_ids, etc.)
  //    This is where you can now do things like:
  //      publishIssue(pid, iid, { state_event: 'close', add_labels: 'ready-for-dev' })
  if (extraUpdates && Object.keys(extraUpdates).length > 0) {
    try {
      const updated = await gitlab.updateIssue(projectId, issueIid, extraUpdates);
      log.info('Additional issue updates applied', {
        fields: Object.keys(extraUpdates),
        newState: (updated as any)?.state || null,
      });
    } catch (e: any) {
      log.warn('Failed to apply extra updates (description + cleanup still succeeded)', {
        error: e.message,
        updates: extraUpdates,
      });
    }
  }

  log.info('Publish finished successfully');
  return { deleted, deletedIds };
}
