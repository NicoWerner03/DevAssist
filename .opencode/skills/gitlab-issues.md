---
name: gitlab-issues
description: >
  Instructions for OpenCode agents on how to reliably fetch, read, comment on,
  and update GitLab issues using the official `glab` CLI or direct API.
  Use when the user mentions GitLab issues, tickets, "issue #123", "the ticket",
  "fetch the GitLab issue", or dev-assist processed tickets.
trigger: ["gitlab", "issue", "ticket", "glab", "@dev-assist", "fetch issue", "update ticket"]
---

# GitLab Issues Skill for OpenCode

**Core Rule:** Interact with GitLab primarily via the `glab` CLI, the official
GitLab CLI. This is the same mechanism used by dev-assist and uses the
developer's already-authenticated session.

Never scrape the web UI, never hardcode tokens unless explicitly asked, and
never assume you are authenticated through any other mechanism.

## 1. Prerequisites

```bash
glab --version
glab auth status
```

If not logged in:

```bash
glab auth login
# or for self-managed GitLab:
# glab auth login --hostname gitlab.company.com
```

The backend of this project also supports `GITLAB_USE_GLAB=true` with a
properly scoped `glab` token. Reporter or higher is recommended for reads;
Developer is needed for writes.

## 2. Resolve the Current GitLab Project

`glab` usually auto-detects the project when you are inside a Git working tree
whose remote points to GitLab.

When in doubt or when targeting a different project, pass `-R`:

```bash
glab repo view -F json
glab issue list -R acme/web-app
glab issue view 237 -R group/subgroup/project
```

Numeric project IDs are very reliable for low-level API calls. Obtain them via:

```bash
glab repo view -F json
```

## 3. Fetch or List Issues

List issues:

```bash
glab issue list
glab issue list --all
glab issue list -l "bug,frontend"
glab issue list --assignee=@me -s asc
glab issue list -R acme/web-app --state opened --per-page 50
```

List in JSON:

```bash
glab issue list -O json -R acme/web-app
glab issue list -O json --label ready --jq '.[].iid'
```

Best command for most "look at the ticket" requests:

```bash
glab issue view 237 --comments -F json
glab issue view 237 --comments
glab issue view 237 --comments --system-logs
```

Fetch comments separately when needed:

```bash
glab api projects/acme/web-app/issues/237/notes --output json
glab api projects/82888215/issues/237/notes --output json
```

## 4. Add Comments

```bash
glab issue note 237 -m "I've started implementation. Current status: ..."
```

Multi-line comment:

```bash
glab issue note 237 -m @'
Analysis complete.

## Open questions
- ...
'@
```

Raw API variant:

```bash
glab api projects/82888215/issues/237/notes -X POST --field "body=Your markdown comment here..." --output json
```

## 5. Update Issues

High-level commands:

```bash
glab issue update 237 --title "New clearer title" -R acme/web-app
glab issue update 237 --label "ready-for-dev,in-review"
glab issue update 237 --unlabel "draft"
glab issue update 237 -a "@me"
glab issue update 237 --assignee "+alice,-bob"
glab issue update 237 --description "New body..."
glab issue update 237 --state-event close
glab issue close 237
glab issue reopen 237
```

Advanced multi-field updates:

```bash
glab api projects/82888215/issues/237 \
  -X PUT \
  --field "description=Clean structured content here..." \
  --field "title=Implementation Ticket: ..." \
  --field "add_labels=ready,reviewed" \
  --field "state_event=close" \
  --output json
```

Common fields:

- `title`, `description`
- `add_labels`, `remove_labels`, `labels`
- `state_event` (`close`, `reopen`)
- `assignee_ids[]`
- `milestone_id`, `due_date`, `weight`

## 6. Full Context Pattern

```bash
REPO="acme/web-app"
IID=237

glab issue view $IID -R $REPO --comments -F json > issue-context.json
glab api projects/$REPO/issues/$IID --output json > issue-raw.json
```

Use these files for non-trivial reasoning or implementation work.

## 7. Common Workflows

### Implement what is described in an issue

1. Run `glab issue view <iid> --comments`.
2. Read the current description and comments.
3. If dev-assist posted or published a structured ticket, use that as the
   source of truth for requirements.
4. Ask clarifying questions on the issue via `glab issue note` if critical
   information is missing.
5. Implement.
6. Post a concise summary comment and optionally update labels or state.

### Work with dev-assist processed tickets

- Look for comments containing `## Dev-Assist:` or starting with `@dev-assist`.
- The final publish step usually replaces the issue description with a clean
  structured ticket and may delete old dev-assist conversation comments.
- You can safely add your own notes; dev-assist only cleans its own markers and
  comments that contain the `@dev-assist` mention during publish.

### Ask for clarification instead of guessing

```bash
glab issue note 237 -m @'
**Clarification needed**

- What should happen when X is empty?
- Should we support Y for existing data?

cc @product-owner
'@
```

## 8. Safety

- Always fetch fresh data before modifying an issue.
- Prefer posting a comment with your plan before making large description
  changes.
- Use JSON output (`-F json` / `-O json`) when parsing command results.
- Always pass `-R` when targeting a project from outside its directory.
- Do not delete other people's comments unless explicitly asked.
- For very large comments, write the body to a temp file and use
  `glab issue note <id> -F body.txt`.

## 9. Fallback: Direct REST

Only use direct REST when `glab` is not sufficient and a `GITLAB_TOKEN` with the
right scope is available:

```bash
curl --header "PRIVATE-TOKEN: $GITLAB_TOKEN" \
     "https://gitlab.com/api/v4/projects/82888215/issues/237/notes"
```

## 10. Quick Reference

| Action | Command |
| --- | --- |
| List open issues | `glab issue list` |
| List with labels | `glab issue list -l bug,ui` |
| Full issue + comments | `glab issue view 123 --comments` |
| Add a comment | `glab issue note 123 -m "text"` |
| Update title + labels | `glab issue update 123 --title ".." -l ready` |
| Close | `glab issue close 123` |
| Raw API call | `glab api projects/<id>/issues/123/... --output json` |
| Discover current project | `glab repo view -F json` |

When the user says "look at the GitLab issue", "check ticket #123", or
"dev-assist processed this", the first action should usually be:

```bash
glab issue view <number> --comments
```
