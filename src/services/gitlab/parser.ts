import { mentionGate } from './mention.js';
import { parseDevAssistCommand, DevAssistCommand } from './commands.js';
import { getConfig } from '../../config.js';
import { isDevAssistGeneratedNote } from './cleanup.js';

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
  shouldProcess: boolean;
  ignoredReason?: 'no-mention' | 'self-authored' | 'dev-assist-generated';
}

function normalizeUsername(value: unknown): string {
  return String(value || '').replace(/^@+/, '').trim().toLowerCase();
}

function webhookAuthorUsername(body: any): string {
  return String(body?.user?.username || body?.user_username || '');
}

function isSelfAuthoredNote(kind: ParsedWebhook['kind'], body: any): boolean {
  if (kind !== 'note' && body?.object_kind !== 'note') return false;

  const botUsername = normalizeUsername(getConfig().devAssistBotUsername);
  const authorUsername = normalizeUsername(webhookAuthorUsername(body));
  return Boolean(botUsername && authorUsername && botUsername === authorUsername);
}

function isGeneratedDevAssistNote(kind: ParsedWebhook['kind'], body: any): boolean {
  if (kind !== 'note' && body?.object_kind !== 'note') return false;

  return isDevAssistGeneratedNote(body?.object_attributes || {});
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

  // @dev-assist can be placed anywhere in the issue title, description, or
  // comment body. For note events, only the note body triggers processing so
  // regular follow-up comments on an already-mentioned issue do not retrigger it.
  let hasMention = false;
  if (kind === 'issue' || body?.object_attributes?.iid) {
    hasMention = mentionGate.hasMention(title) || mentionGate.hasMention(description);
  } else if (kind === 'note' || body?.object_kind === 'note') {
    hasMention = mentionGate.hasMention(noteBody);
  } else {
    hasMention = mentionGate.hasMention(title) || mentionGate.hasMention(noteBody) || mentionGate.hasMention(description);
  }

  const selfAuthored = isSelfAuthoredNote(kind, body);
  const devAssistGenerated = isGeneratedDevAssistNote(kind, body);

  const textToCheck = noteBody || description || '';
  const command = hasMention ? parseDevAssistCommand(textToCheck) : 'process';
  const shouldProcess = hasMention && !selfAuthored && !devAssistGenerated;
  const ignoredReason = shouldProcess
    ? undefined
    : selfAuthored
      ? 'self-authored'
      : devAssistGenerated
        ? 'dev-assist-generated'
        : 'no-mention';

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
    shouldProcess,
    ignoredReason,
  };
}
