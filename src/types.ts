export type GitlabId = string | number;

export type GitlabUser = {
  username: string;
};

export type GitlabProject = {
  id: GitlabId;
  web_url?: string;
};

export type GitlabIssue = {
  title: string;
  description: string;
  author: GitlabUser;
  web_url?: string;
  project?: {
    web_url?: string;
  };
};

export type GitlabComment = {
  id: number;
  body: string;
  author: GitlabUser;
  system?: boolean;
};

export type GitlabIssueWebhookPayload = {
  object_kind: "issue";
  user?: GitlabUser;
  project?: {
    id?: GitlabId;
  };
  object_attributes?: {
    action?: string;
    title?: string;
    description?: string;
    iid?: number;
    project_id?: GitlabId;
  };
};

export type GitlabNoteWebhookPayload = {
  object_kind: "note";
  user?: GitlabUser;
  project?: {
    id?: GitlabId;
  };
  issue?: {
    iid?: number;
  };
  object_attributes?: {
    noteable_type?: string;
    note?: string;
  };
};

export type GitlabKnownWebhookPayload =
  | GitlabIssueWebhookPayload
  | GitlabNoteWebhookPayload;

// Unknown GitLab webhook events are intentionally broad; use explicit type guards before reading issue/note-specific fields.
export type GitlabOtherWebhookPayload = {
  object_kind?: string;
  user?: GitlabUser;
  [key: string]: unknown;
};

export type GitlabWebhookPayload = GitlabKnownWebhookPayload | GitlabOtherWebhookPayload;

export type AgentQuestionResponse = {
  hasQuestions: true;
  questions: string;
};

export type AgentProposalResponse = {
  hasQuestions: false;
  proposedTitle: string;
  proposedDescription: string;
};

export type AgentResponse = AgentQuestionResponse | AgentProposalResponse;

export type OpencodeResponsePart = {
  type?: string;
  text?: string;
  [key: string]: unknown;
};

export type ImageReference = {
  url: string;
  markdown: string;
  source: string;
  context: string;
  visionSummary?: string;
};

export type ImageSource = {
  text: string;
  source: string;
};
