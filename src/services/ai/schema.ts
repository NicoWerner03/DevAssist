export interface RequirementAnalysis {
  title: string;
  description: string[];
  acceptanceCriteria: string[];
  technicalContext: string[];
  proposedSolution: string[];
  openQuestions: string[];
}

const REQUIRED_FIELDS = [
  'title',
  'description',
  'acceptanceCriteria',
  'technicalContext',
  'proposedSolution',
  'openQuestions',
] as const;

const ARRAY_FIELDS = [
  'description',
  'acceptanceCriteria',
  'technicalContext',
  'proposedSolution',
  'openQuestions',
] as const;

export const REQUIREMENT_ANALYSIS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [...REQUIRED_FIELDS],
  properties: {
    title: { type: 'string' },
    description: { type: 'array', items: { type: 'string' } },
    acceptanceCriteria: { type: 'array', items: { type: 'string' } },
    technicalContext: { type: 'array', items: { type: 'string' } },
    proposedSolution: { type: 'array', items: { type: 'string' } },
    openQuestions: { type: 'array', items: { type: 'string' } },
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function validateRequirementAnalysis(
  value: unknown,
): { valid: boolean; errors: string[]; value?: RequirementAnalysis } {
  if (!isRecord(value)) {
    return { valid: false, errors: ['root is not an object'] };
  }

  const errors: string[] = [];
  const allowedFields = new Set<string>(REQUIRED_FIELDS);

  for (const field of REQUIRED_FIELDS) {
    if (!(field in value)) errors.push(`missing required field: ${field}`);
  }
  for (const field of Object.keys(value)) {
    if (!allowedFields.has(field)) errors.push(`unexpected field: ${field}`);
  }

  if ('title' in value && typeof value.title !== 'string') {
    errors.push('title must be a string');
  }

  for (const field of ARRAY_FIELDS) {
    if (!(field in value)) continue;
    const items = value[field];
    if (!Array.isArray(items)) {
      errors.push(`${field} must be an array`);
      continue;
    }
    items.forEach((item, index) => {
      if (typeof item !== 'string') errors.push(`${field}[${index}] must be a string`);
    });
  }

  return errors.length === 0
    ? { valid: true, errors: [], value: value as unknown as RequirementAnalysis }
    : { valid: false, errors };
}

export function parseAnalysisJson(text: string): RequirementAnalysis {
  // Strip common ```json ... ``` fences
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  cleaned = cleaned.replace(/^```\s*/i, '').replace(/```$/i, '').trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e: any) {
    throw new Error(`Failed to parse JSON from AI response: ${e.message}\n--- raw (first 400 chars) ---\n${text.slice(0, 400)}`);
  }

  const { valid, errors, value } = validateRequirementAnalysis(parsed);
  if (!valid || !value) {
    throw new Error(`AI response did not match required schema: ${errors.join(', ')}`);
  }
  return value;
}
