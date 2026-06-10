import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderClarificationComment, renderRequirementAnalysis } from '../src/services/ai/formatter';
import { RequirementAnalysis } from '../src/services/ai/schema';

describe('Markdown Formatter Service', () => {
  const baseAnalysis: RequirementAnalysis = {
    summary: 'A test feature',
    sourceBasis: 'ticket_text',
    implementationTicket: {
      title: 'Implementation Title',
      goal: 'Goal of feature',
      scope: ['scope 1', 'scope 2'],
      outOfScope: ['out 1'],
      userStories: ['As a developer...'],
      functionalRequirements: ['req 1'],
      technicalApproach: ['approach 1'],
      implementationTasks: ['1. task 1'],
      definitionOfDone: ['dod 1'],
    },
    acceptanceCriteria: ['criteria 1'],
    technicalNotes: ['note 1'],
    openQuestions: ['question 1', 'question 2'],
    risks: ['risk 1'],
    validationSteps: ['validation 1'],
  };

  it('renders clarification comments with open questions', () => {
    const comment = renderClarificationComment(baseAnalysis);
    assert.match(comment, /## Dev-Assist: More information needed/);
    assert.match(comment, /- question 1/);
    assert.match(comment, /- question 2/);
    assert.match(comment, /Current best guess for title: Implementation Title/);
  });

  it('renders clarification comments with fallback text when questions are missing', () => {
    const analysisWithoutQuestions = {
      ...baseAnalysis,
      openQuestions: [],
    };
    const comment = renderClarificationComment(analysisWithoutQuestions);
    assert.match(comment, /There are several unclear areas regarding the requirements/);
  });

  it('renders full requirement analysis document', () => {
    const doc = renderRequirementAnalysis(baseAnalysis);
    assert.match(doc, /# Dev-Assist Context/);
    assert.match(doc, /## Summary\n\nA test feature/);
    assert.match(doc, /### Goal\n\nGoal of feature/);
    assert.match(doc, /- scope 1\n- scope 2/);
    assert.match(doc, /- criteria 1/);
  });

  it('substitutes weak or missing list sections with placeholder text', () => {
    const analysisWithWeakData = {
      ...baseAnalysis,
      implementationTicket: {
        ...baseAnalysis.implementationTicket,
        scope: ['placeholder', 'unknown', 'to be confirmed'],
      },
    };
    const doc = renderRequirementAnalysis(analysisWithWeakData);
    assert.match(doc, /### Scope\nNot enough information available yet\./);
  });

  it('handles non-array values gracefully for list fields', () => {
    const analysisWithBadScope = {
      ...baseAnalysis,
      implementationTicket: {
        ...baseAnalysis.implementationTicket,
        scope: 'not-an-array' as any,
      },
    };
    const doc = renderRequirementAnalysis(analysisWithBadScope);
    assert.match(doc, /### Scope\nNot enough information available yet\./);
  });
});
