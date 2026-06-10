import { mentionGate } from './mention';
import { parseDevAssistCommand, DevAssistCommand } from './commands';

export interface ParsedWebhook {
  kind: 'issue' | 'note' | 'other';
  projectId: number | string;
  issueIid: number | string;
  title?: string;
  description?: string;
  noteBody?: string;
  action?: string; // open, update, etc.
  raw: any;
  command: DevAssistCommand;
  shouldProcess: boolean; // true only if leading mention present
}

export function parseGitLabWebhook(body: any): ParsedWebhook {
  const kind = (body?.object_kind || body?.event_type || 'other') as ParsedWebhook['kind'];
  const project = body?.project || {};
  const projectId = project?.id ?? body?.project_id ?? 'unknown';

  let issueIid: number | string = 'unknown';
  let title: string | undefined;
  let description: string | undefined;
  let noteBody: string | undefined;
  let action: string | undefined;

  if (kind === 'issue' || body?.object_attributes?.iid) {
    const attrs = body.object_attributes || {};
    issueIid = attrs.iid ?? attrs.id ?? 'unknown';
    title = attrs.title;
    description = attrs.description;
    action = attrs.action;
  } else if (kind === 'note' || body?.object_kind === 'note') {
    const note = body?.object_attributes || {};
    const issue = body?.issue || {};
    issueIid = issue.iid ?? issue.id ?? 'unknown';
    title = issue.title;
    noteBody = note.note || note.body;
    action = note.action;
    // description may live on the parent issue in some payloads
    description = issue.description;
  }

  // hasMention is tolerant: it accepts @dev-assist if it is at the start of the
  // first content line of the description (Markdown formatting like **, ##, -, lists etc. is ignored).
  // This means: as long as "@dev-assist" appears near the beginning of the Issue description,
  // the webhook will NOT be ignored (user requirement).
  let hasMention = false;
  if (kind === 'issue' || body?.object_attributes?.iid) {
    hasMention = mentionGate.hasMention(description);
  } else if (kind === 'note' || body?.object_kind === 'note') {
    hasMention = mentionGate.hasMention(noteBody);
  } else {
    hasMention = mentionGate.hasMention(noteBody) || mentionGate.hasMention(description);
  }

  const textToCheck = noteBody || description || '';
  const command = hasMention ? parseDevAssistCommand(textToCheck) : 'process';

  return {
    kind: (kind === 'issue' || kind === 'note') ? kind : 'other',
    projectId,
    issueIid,
    title,
    description,
    noteBody,
    action,
    raw: body,
    command,
    shouldProcess: hasMention,
  };
}
