import { mentionGate } from './mention';

export type DevAssistCommand = 'publish' | 'process';

export function parseDevAssistCommand(text: string | undefined | null): DevAssistCommand {
  const rest = mentionGate.stripMention(text).toLowerCase();
  if (rest.startsWith('publish')) return 'publish';
  return 'process';
}
