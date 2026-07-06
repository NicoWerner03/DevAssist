// Manual publish helper
// Usage examples:
//   npx tsx src/cli/publish-issue.ts 82888215/7
//   npx tsx src/cli/publish-issue.ts 82888215/7 close,ready   (will close + add labels)
//
// The second argument (optional) is a comma-separated list of actions:
//   close          -> state_event=close
//   reopen         -> state_event=reopen
//   <label>        -> add_labels=<label>
//   ready,reviewed -> add_labels=ready,reviewed
import 'dotenv/config';
import { publishIssue } from '../services/processing/publisher.js';
import { logger } from '../utils/logger.js';

const arg = process.argv[2];
const actionsArg = process.argv[3];

if (!arg || !arg.includes('/')) {
  logger.error('Usage: npm run publish-issue -- <projectId>/<issueIid> [actions]');
  logger.error('  e.g.  npx tsx src/cli/publish-issue.ts 82888215/7');
  logger.error('  e.g.  npx tsx src/cli/publish-issue.ts 82888215/7 close,ready');
  process.exit(1);
}

const [projectId, issueIid] = arg.split('/');

const extraUpdates: Record<string, any> = {};
if (actionsArg) {
  const parts = actionsArg.split(',').map((s) => s.trim()).filter(Boolean);
  const labelsToAdd: string[] = [];

  for (const p of parts) {
    if (p === 'close') extraUpdates.state_event = 'close';
    else if (p === 'reopen') extraUpdates.state_event = 'reopen';
    else labelsToAdd.push(p);
  }

  if (labelsToAdd.length > 0) {
    extraUpdates.add_labels = labelsToAdd;
  }
}

logger.info('Manual publish requested', { projectId, issueIid, extraUpdates });

publishIssue(projectId, issueIid, Object.keys(extraUpdates).length ? extraUpdates : undefined)
  .then((result) => {
    logger.info('Publish completed', result);
    process.exit(0);
  })
  .catch((e: any) => {
    logger.error('Publish failed', { error: e.message });
    process.exit(1);
  });
