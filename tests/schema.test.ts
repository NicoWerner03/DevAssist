import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseAnalysisJson, validateRequirementAnalysis } from '../src/services/ai/schema';

const validAnalysis = {
  title: 'Add theme toggle',
  description: ['Add a theme toggle to the header.'],
  acceptanceCriteria: ['The theme changes without reloading.'],
  technicalContext: ['Use the existing styling system.'],
  proposedSolution: ['Add theme state handling.', 'Persist the selection.'],
  openQuestions: [],
};

describe('requirement analysis schema', () => {
  it('accepts the compact ticket contract', () => {
    const result = validateRequirementAnalysis(validAnalysis);
    assert.equal(result.valid, true);
    assert.deepEqual(result.value, validAnalysis);
  });

  it('rejects the legacy analysis contract', () => {
    const result = validateRequirementAnalysis({
      summary: 'Legacy',
      sourceBasis: 'ticket_text',
      implementationTicket: { title: 'Legacy title' },
      acceptanceCriteria: [],
      technicalNotes: [],
      openQuestions: [],
      risks: [],
      validationSteps: [],
    });
    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /missing required field: title/);
  });

  it('rejects unexpected properties', () => {
    const result = validateRequirementAnalysis({ ...validAnalysis, summary: 'Legacy' });
    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /unexpected field: summary/);
  });

  it('rejects incorrect property types', () => {
    const result = validateRequirementAnalysis({ ...validAnalysis, description: 'paragraph' });
    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /description must be an array/);
  });

  it('rejects non-string array items', () => {
    const result = validateRequirementAnalysis({ ...validAnalysis, proposedSolution: [1] });
    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /proposedSolution\[0\] must be a string/);
  });

  it('parses fenced compact JSON', () => {
    assert.deepEqual(parseAnalysisJson(`\`\`\`json\n${JSON.stringify(validAnalysis)}\n\`\`\``), validAnalysis);
  });
});
