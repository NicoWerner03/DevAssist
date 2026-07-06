import { getConfig } from '../../config.js';

const DEFAULT_MENTION = '@dev-assist';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function trimFormattingPrefix(value: string): string {
  return value.replace(/^[\s*#_`~>+\-=|[\](){}<>!]*/, '').trim();
}

export interface MentionGate {
  mention: string;
  hasMention(text: string | undefined | null): boolean;
  stripMention(text: string | undefined | null): string;
}

export function createMentionGate(mention?: string): MentionGate {
  const m = mention || getConfig().devAssistMention || DEFAULT_MENTION;
  const mentionPattern = new RegExp(escapeRegExp(m) + '(?=$|[^\\w-])', 'i');
  const leadingPattern = new RegExp('^' + escapeRegExp(m) + '(?=$|[^\\w-])', 'i');

  function hasMention(text: string | undefined | null): boolean {
    const t = String(text || '').trim();
    if (!t) return false;

    return mentionPattern.test(t);
  }

  function stripMention(text: string | undefined | null): string {
    let t = String(text || '').trim();
    if (!t) return t;

    // Try the leading pattern first so the existing command style still works.
    let stripped = trimFormattingPrefix(t.replace(leadingPattern, ''));
    if (stripped !== t) return stripped;

    const match = t.match(mentionPattern);
    if (match?.index !== undefined) {
      return trimFormattingPrefix(t.slice(match.index + match[0].length));
    }

    return t;
  }

  return {
    mention: m,
    hasMention,
    stripMention,
  };
}

// Default singleton for convenience in routes/processing
export const mentionGate = createMentionGate();
