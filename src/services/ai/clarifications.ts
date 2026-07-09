import { mentionGate } from '../gitlab/mention.js';
import { RequirementAnalysis } from './schema.js';

interface PriorClarificationAnswer {
  questions: string[];
  reply: string;
  replyAuthor: string;
}

const DEV_ASSIST_CLARIFICATION_RE = /Dev-Assist:\s*More information needed/i;
const DEV_ASSIST_MARKER_RE = /(^|\n)\s*#{1,6}\s*Dev-Assist:/i;
const QUESTION_BULLET_RE = /^\s*(?:[-*]|\d+[.)])\s+(.+\?)\s*$/;
const MAX_REPLY_CHARS = 3000;

const STOP_WORDS = new Set([
  'about',
  'after',
  'again',
  'also',
  'and',
  'any',
  'are',
  'before',
  'can',
  'could',
  'does',
  'for',
  'from',
  'have',
  'how',
  'into',
  'its',
  'not',
  'only',
  'or',
  'should',
  'that',
  'the',
  'there',
  'this',
  'to',
  'when',
  'where',
  'which',
  'with',
  'would',
]);

function commentBody(comment: any): string {
  return String(comment?.body || comment?.note || '').trim();
}

function commentAuthor(comment: any): string {
  return String(comment?.author?.username || comment?.author?.name || 'user');
}

function isDevAssistGeneratedComment(body: string): boolean {
  return DEV_ASSIST_MARKER_RE.test(body);
}

function extractQuestions(body: string): string[] {
  return body
    .split(/\r?\n/)
    .map((line) => line.match(QUESTION_BULLET_RE)?.[1]?.trim())
    .filter((question): question is string => Boolean(question));
}

function truncate(value: string, maxChars: number): string {
  return value.length > maxChars ? `${value.slice(0, maxChars)}...` : value;
}

export function extractPriorClarificationAnswers(comments: any[] | undefined): PriorClarificationAnswer[] {
  if (!Array.isArray(comments) || comments.length === 0) return [];

  const answers: PriorClarificationAnswer[] = [];
  let pendingQuestions: string[] = [];

  for (const comment of comments) {
    const body = commentBody(comment);
    if (!body) continue;

    if (isDevAssistGeneratedComment(body)) {
      pendingQuestions = DEV_ASSIST_CLARIFICATION_RE.test(body) ? extractQuestions(body) : [];
      continue;
    }

    if (!pendingQuestions.length) continue;
    if (!mentionGate.hasMention(body)) continue;

    answers.push({
      questions: pendingQuestions,
      reply: truncate(body, MAX_REPLY_CHARS),
      replyAuthor: commentAuthor(comment),
    });
  }

  return answers;
}

export function renderPriorClarificationAnswersForPrompt(comments: any[] | undefined): string | undefined {
  const answers = extractPriorClarificationAnswers(comments);
  if (!answers.length) return undefined;

  const lines = [
    'These Dev-Assist questions already received user replies. Treat each reply as an answer, even if the reply says "no info" or gives no additional detail. Do not ask these answered questions again; carry unknown values forward as "(not specified in the ticket)" or "(to be confirmed)".',
  ];

  answers.forEach((answer, index) => {
    lines.push('');
    lines.push(`### Answered clarification ${index + 1} (${answer.replyAuthor})`);
    lines.push('Previously asked questions:');
    for (const question of answer.questions) {
      lines.push(`- ${question}`);
    }
    lines.push('User reply:');
    lines.push(answer.reply);
  });

  return lines.join('\n');
}

function tokenizeQuestion(question: string): Set<string> {
  const tokens = question
    .toLowerCase()
    .match(/[a-z0-9]+/g) || [];

  return new Set(tokens.filter((token) => token.length > 2 && !STOP_WORDS.has(token)));
}

function questionSimilarity(a: string, b: string): number {
  const aTokens = tokenizeQuestion(a);
  const bTokens = tokenizeQuestion(b);
  const smallerSize = Math.min(aTokens.size, bTokens.size);
  if (smallerSize === 0) return 0;

  let intersection = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) intersection++;
  }

  return intersection / smallerSize;
}

function isAnsweredQuestion(question: string, answeredQuestions: string[]): boolean {
  return answeredQuestions.some((answeredQuestion) => questionSimilarity(question, answeredQuestion) >= 0.55);
}

export function removeAnsweredOpenQuestions(
  analysis: RequirementAnalysis,
  comments: any[] | undefined,
): RequirementAnalysis {
  const answeredQuestions = extractPriorClarificationAnswers(comments).flatMap((answer) => answer.questions);
  if (!answeredQuestions.length || !Array.isArray(analysis.openQuestions)) return analysis;

  const openQuestions = analysis.openQuestions.filter((question) => !isAnsweredQuestion(question, answeredQuestions));
  if (openQuestions.length === analysis.openQuestions.length) return analysis;

  return {
    ...analysis,
    openQuestions,
  };
}
