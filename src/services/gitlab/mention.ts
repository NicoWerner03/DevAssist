import { getConfig } from '../../config.js';

const DEFAULT_MENTION = '@dev-assist';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface MentionGate {
  mention: string;
  hasMention(text: string | undefined | null): boolean;
  stripMention(text: string | undefined | null): string;
}

export function createMentionGate(mention?: string): MentionGate {
  const m = mention || getConfig().devAssistMention || DEFAULT_MENTION;
  const pattern = new RegExp('^' + escapeRegExp(m) + '(?:\\b|$|[^\\w])', 'i');

  function hasMention(text: string | undefined | null): boolean {
    const t = String(text || '').trim();
    if (!t) return false;

    // Strict leading match
    if (pattern.test(t)) return true;

    // Fallback: full startsWith after trim
    const lower = t.toLowerCase();
    const mLower = m.toLowerCase();
    if (lower.startsWith(mLower)) return true;

    // Tolerant for issue descriptions (user request):
    // As long as @dev-assist appears at the beginning of the first *content* line,
    // formatting (**, ##, -, `, etc.) or leading whitespace/newlines should be ignored.
    // "Hauptsache es steht @dev-assist" am Anfang der Beschreibung.
    const lines = t.split(/\r?\n/);
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // Strip common leading Markdown formatting characters so that
      // "**@dev-assist**", "## @dev-assist", "- @dev-assist", "`@dev-assist`" etc. still count.
      const cleaned = trimmedLine.replace(/^[\s*#_`~>+\-=|[\](){}<>!]+/, '').trim();

      if (cleaned.toLowerCase().startsWith(mLower)) return true;

      // Only consider the first non-empty line
      break;
    }

    return false;
  }

  function stripMention(text: string | undefined | null): string {
    let t = String(text || '').trim();
    if (!t) return t;

    // Try the main pattern first
    let stripped = t.replace(pattern, '').trim();
    if (stripped !== t) return stripped;

    const lower = t.toLowerCase();
    const mLower = m.toLowerCase();

    // Fallback full start
    if (lower.startsWith(mLower)) {
      return t.slice(m.length).trim();
    }

    // Tolerant stripping for formatted mentions (e.g. "**@dev-assist** publish")
    const lines = t.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      const cleaned = trimmedLine.replace(/^[\s*#_`~>+\-=|[\](){}<>!]+/, '').trim();

      if (cleaned.toLowerCase().startsWith(mLower)) {
        // Remove the mention (and preceding formatting) from this line
        // Keep the rest of the original line's content after the mention
        const mentionWithFormatting = trimmedLine.match(new RegExp('^[\\s*#_`~>+\-=|[\\](){}<>!]*' + escapeRegExp(m), 'i'));
        if (mentionWithFormatting) {
          const rest = line.replace(mentionWithFormatting[0], '');
          lines[i] = rest;
          return lines.join('\n').trim();
        }
      }
      break; // only process first content line
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
