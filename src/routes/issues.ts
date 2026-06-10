import { Router } from 'express';
import logger from '../utils/logger';
import { processIssue } from '../services/processing/processor';
import { publishIssue } from '../services/processing/publisher';

export function createIssueRouter() {
  const router = Router();

  router.post('/:projectId/:issueIid/process', async (req, res) => {
    const { projectId, issueIid } = req.params;
    logger.info('Manual process requested', { projectId, issueIid });
    try {
      const result = await processIssue(projectId, issueIid);
      res.status(202).json({ accepted: true, action: 'process', projectId, issueIid, result: { postedNoteId: result.postedNoteId } });
    } catch (e: any) {
      logger.error('Manual process failed', { error: e.message, projectId, issueIid });
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/:projectId/:issueIid/publish', async (req, res) => {
    const { projectId, issueIid } = req.params;
    // Allow passing extra GitLab updates in the body, e.g.
    // { "state_event": "close", "add_labels": "ready,reviewed", "assignee_ids": [42] }
    const extraUpdates = req.body && typeof req.body === 'object' ? req.body : undefined;

    logger.info('Manual publish requested', { projectId, issueIid, extraUpdates: extraUpdates ? Object.keys(extraUpdates) : null });
    try {
      const result = await publishIssue(projectId, issueIid, extraUpdates);
      res.status(202).json({ accepted: true, action: 'publish', projectId, issueIid, result });
    } catch (e: any) {
      logger.error('Manual publish failed', { error: e.message, projectId, issueIid });
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
