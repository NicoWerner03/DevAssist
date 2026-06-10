import { getConfig } from '../../config';
import logger from '../../utils/logger';
import { createGitLabClient } from '../gitlab/client';
import { createAiService } from '../ai/service';
import { renderClarificationComment, renderRequirementAnalysis } from '../ai/formatter';
import { writeContextFile } from '../context/writer';
import { mentionGate } from '../gitlab/mention';

const gitlab = createGitLabClient();
const ai = createAiService();

export async function processIssue(projectId: string | number, issueIid: string | number, extraText?: string) {
  const log = logger.withContext({ projectId, issueIid, phase: 'process' });
  log.info('Starting process');

  let issue: any = { title: 'Unknown (fetch failed)', description: extraText || '' };
  let notes: any[] = [];

  try {
    issue = await gitlab.getIssue(projectId, issueIid);
    notes = await gitlab.listNotes(projectId, issueIid);
  } catch (e: any) {
    log.warn('Failed to fetch full context from GitLab via glab (common when local glab token has no API access to the project). Proceeding with data from the webhook payload only for the analyzer.', { error: e.message });
  }

  // Build a compact context for the AI (fallback to webhook data if fetch failed)
  const ctx = {
    project: { id: projectId },
    issue: { ...issue, iid: issueIid },
    comments: notes,
    rawText: extraText,
  };

  log.info('Starting AI analysis — this step can take 30-120+ seconds (opencode + model call). Set LOG_LEVEL=debug for more detail.');
  let analysis: any;
  try {
    analysis = await ai.analyzeTicket(ctx);
  } catch (aiErr: any) {
    log.error('AI analysis failed completely', { error: aiErr.message });
    try {
      await gitlab.createNote(projectId, issueIid, `## Dev-Assist: Analysis Error\n\nI encountered an error while trying to analyze this issue:\n\`\`\`\n${aiErr.message}\n\`\`\`\nPlease check the logs or try again.`);
    } catch (postErr: any) {
      log.error('Failed to post analysis error note to GitLab', { error: postErr.message });
    }
    throw aiErr;
  }
  log.info('AI analysis complete', { summaryLen: analysis.summary?.length || 0 });

  // Decide response style based on how many concrete open questions remain.
  // The AI is now instructed (in its prompt) to produce a proposal as soon as the core goal + requirements are clear,
  // and to put remaining details into openQuestions instead of asking for exhaustive current implementation details.
  const openQs = (analysis.openQuestions || []).filter((q: string) => q && q.trim().length > 5);
  const needsClarification = openQs.length >= 2;   // heuristic: several real questions left

  const fullContext = renderRequirementAnalysis(analysis, { project: ctx.project, issue: ctx.issue });

  let commentToPost: string;
  if (needsClarification) {
    commentToPost = renderClarificationComment(analysis);
  } else {
    // Post the full structured proposal directly as the comment (instead of short teaser)
    // so the complete ticket is visible immediately, prepended with a clear call-to-action.
    commentToPost = [
      '## Dev-Assist: Structured Proposal',
      '',
      'I have generated a structured proposal for this ticket/issue based on the details provided.',
      '',
      'If you approve of these details, reply with **`@dev-assist publish`** to apply it. The conversation comments will then be cleaned up automatically.',
      '',
      '---',
      '',
      fullContext
    ].join('\n');
  }

  if (needsClarification) {
    log.info('Analysis produced significant open questions — posting clarification request instead of publishable proposal');
  }

  // Post the response (either a clarification request or the full proposal)
  let postedNoteId: string | number | undefined;
  try {
    const posted = await gitlab.createNote(projectId, issueIid, commentToPost);
    postedNoteId = posted?.id;
    log.info('Response comment posted to GitLab', { noteId: postedNoteId, type: needsClarification ? 'clarification' : 'full proposal' });
  } catch (e: any) {
    log.warn('Failed to post response comment via glab (analysis still succeeded).', { error: e.message });
  }

  // Write the bridge file
  const filePath = await writeContextFile(projectId, issueIid, fullContext, {
    title: analysis.implementationTicket?.title,
  });

  log.info('Process finished (AI response posted; post may have failed if glab has no write access)');
  return { analysis, contextFile: filePath, postedNoteId };
}

export async function processFromWebhook(parsed: any) {
  // parsed comes from parser.ts
  const projectId = parsed.projectId;
  const issueIid = parsed.issueIid;
  const extra = parsed.noteBody || parsed.description || '';

  // Re-apply the gate (defense in depth).
  // We use the tolerant hasMention (supports mention in first content line of description)
  // so @dev-assist at/near the start of an issue description is not ignored.
  const hasLeadingMention = parsed.shouldProcess ||
    mentionGate.hasMention(parsed.noteBody) ||
    mentionGate.hasMention(parsed.description);

  if (!hasLeadingMention) {
    logger.info('Webhook ignored – no leading mention', { projectId, issueIid });
    return { ignored: true };
  }

  return processIssue(projectId, issueIid, extra);
}
