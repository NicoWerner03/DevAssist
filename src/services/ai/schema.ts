// Strict shape for the Dev-Assist structured ticket (per project description: "genau beschreibt wie das Json aussehen sollte")

export interface ImplementationTicket {
  title: string;
  goal: string;
  scope: string[];
  outOfScope: string[];
  userStories: string[];
  functionalRequirements: string[];
  technicalApproach: string[];
  implementationTasks: string[]; // ordered, concrete
  definitionOfDone: string[];
}

export interface RequirementAnalysis {
  summary: string;
  sourceBasis: 'acceptance_criteria' | 'ticket_text' | 'mixed';
  implementationTicket: ImplementationTicket;
  acceptanceCriteria: string[];
  technicalNotes: string[];
  openQuestions: string[];
  risks: string[];
  validationSteps: string[];
}

export const REQUIREMENT_ANALYSIS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'summary', 'sourceBasis', 'implementationTicket',
    'acceptanceCriteria', 'technicalNotes', 'openQuestions',
    'risks', 'validationSteps',
  ],
  properties: {
    summary: { type: 'string' },
    sourceBasis: { type: 'string', enum: ['acceptance_criteria', 'ticket_text', 'mixed'] },
    implementationTicket: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'goal', 'scope', 'outOfScope', 'userStories', 'functionalRequirements', 'technicalApproach', 'implementationTasks', 'definitionOfDone'],
      properties: {
        title: { type: 'string' },
        goal: { type: 'string' },
        scope: { type: 'array', items: { type: 'string' } },
        outOfScope: { type: 'array', items: { type: 'string' } },
        userStories: { type: 'array', items: { type: 'string' } },
        functionalRequirements: { type: 'array', items: { type: 'string' } },
        technicalApproach: { type: 'array', items: { type: 'string' } },
        implementationTasks: { type: 'array', items: { type: 'string' } },
        definitionOfDone: { type: 'array', items: { type: 'string' } },
      },
    },
    acceptanceCriteria: { type: 'array', items: { type: 'string' } },
    technicalNotes: { type: 'array', items: { type: 'string' } },
    openQuestions: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    validationSteps: { type: 'array', items: { type: 'string' } },
  },
};

export function validateRequirementAnalysis(obj: any): { valid: boolean; errors: string[]; value?: RequirementAnalysis } {
  const errors: string[] = [];
  if (!obj || typeof obj !== 'object') {
    return { valid: false, errors: ['root is not an object'] };
  }
  const required = REQUIREMENT_ANALYSIS_JSON_SCHEMA.required as string[];
  for (const k of required) {
    if (!(k in obj)) errors.push(`missing required field: ${k}`);
  }
  if (obj.implementationTicket && typeof obj.implementationTicket === 'object') {
    const itReq = REQUIREMENT_ANALYSIS_JSON_SCHEMA.properties.implementationTicket.required;
    for (const k of itReq) {
      if (!(k in obj.implementationTicket)) errors.push(`implementationTicket missing: ${k}`);
    }
  }
  return errors.length === 0
    ? { valid: true, errors: [], value: obj as RequirementAnalysis }
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
