---
name: gitlab-tickets
description: >-
  Fetch and inspect GitLab tickets (issues) via the `glab` CLI. Use when the
  user wants to list, view, search, or filter GitLab issues/tickets — e.g.
  "Projekt: 599 Ticket: 15", "hol Ticket #42", "zeig mir meine GitLab-Tickets",
  "welche offenen Issues gibt es", "issues mit Label bug". Works against
  gitlab.dreso.com.
---

# GitLab Tickets (via glab)

Fetch tickets (GitLab "issues") using the authenticated `glab` CLI.

## Primary request form: "Projekt: <id> / Ticket: <iid>"

The user usually asks in this exact shape:

```
Projekt: 599
Ticket: 15
```

Here `599` is the numeric **project ID** and `15` is the issue **IID**.
**`glab issue view --repo` does NOT accept numeric project IDs** (only
`GROUP/PROJECT`). So for this form always use the REST API:

```bash
# The ticket itself
glab api "projects/599/issues/15" --hostname gitlab.dreso.com

# Its comments / discussion notes
glab api "projects/599/issues/15/notes" --hostname gitlab.dreso.com
```

Generalized: `glab api "projects/<PROJECT_ID>/issues/<TICKET_IID>" --hostname gitlab.dreso.com`

### Reading the JSON output

- `glab api` has **no `--jq` flag**, and standalone `jq` is **not installed**
  here. Do not pipe to `jq`.
- The JSON is one long line. To read it with the Read tool, redirect it to a
  file **inside the project directory** (the Read tool can't see bash `/tmp`),
  then delete it:
  ```bash
  glab api "projects/599/issues/15" --hostname gitlab.dreso.com \
    > "C:/_dev/Projekte/DevAssist/.ticket.json"
  # → Read C:\_dev\Projekte\DevAssist\.ticket.json, then:
  rm -f "C:/_dev/Projekte/DevAssist/.ticket.json"
  ```
- For a quick field peek without a file: `... | tr ',' '\n' | grep '"title"'`.

Project `599` = `dreso/education/evaluation/dev-assist`, the default project for
this workspace.

## Prerequisites & context

- `glab` is authenticated against **gitlab.dreso.com** (check with
  `glab auth status`). If not logged in, tell the user to run it themselves via
  `! glab auth login` (interactive).
- **This repo's git remote points at GitHub, not GitLab.** So `glab` cannot
  infer the project from the current directory — always target the project
  explicitly (numeric ID via API, or `--repo GROUP/PROJECT` for porcelain
  commands).

## Determining the target repo/project

Forms accepted:
- Numeric **project ID** (e.g. `599`) → REST API only (see above).
- `--repo GROUP/PROJECT` or `GROUP/SUBGROUP/PROJECT` → porcelain commands.
- Full project URL, or a ticket URL passed directly to `view`.

Discover projects the token can see (no external `jq` — grep the raw output):

```bash
glab api "projects?membership=true&per_page=50&order_by=last_activity_at" \
  --hostname gitlab.dreso.com | tr ',' '\n' | grep '"path_with_namespace"'
```

Map a numeric ID to its path: `glab api "projects/599" --hostname gitlab.dreso.com | tr ',' '\n' | grep path_with_namespace`

## Listing tickets

`glab issue list` and `glab issue view` DO have a **built-in `--jq`** (they
embed jq) — use that, not an external `jq`. These need `--repo GROUP/PROJECT`,
not a numeric ID.

```bash
# Open issues (default)
glab issue list --repo GROUP/PROJECT

# All / only closed
glab issue list --repo GROUP/PROJECT --all
glab issue list --repo GROUP/PROJECT --closed

# Assigned to me
glab issue list --repo GROUP/PROJECT --assignee=@me

# Filter by label(s) / milestone
glab issue list --repo GROUP/PROJECT --label bug --label urgent
glab issue list --repo GROUP/PROJECT --milestone "Sprint 5"

# Full-text search
glab issue list --repo GROUP/PROJECT --search "login timeout"

# Structured output
glab issue list --repo GROUP/PROJECT --output json \
  --jq '.[] | {iid, title, state, labels, assignees: [.assignees[].username], web_url}'
```

By numeric project ID, list via the API instead:
```bash
glab api "projects/599/issues?state=opened&per_page=50" --hostname gitlab.dreso.com
```

Useful list flags: `--author`, `--not-label`, `--not-assignee`,
`--issue-type issue|incident|test_case`, `--per-page N`, `--page N`,
`--order created_at|updated_at|priority|due_date`, `--sort asc|desc`.

## Viewing a single ticket (by GROUP/PROJECT)

```bash
glab issue view 42 --repo GROUP/PROJECT              # basic
glab issue view 42 --repo GROUP/PROJECT --comments   # with discussion
glab issue view 42 --repo GROUP/PROJECT --output json --jq '{iid,title,state,web_url}'
glab issue view https://gitlab.dreso.com/group/project/-/issues/42 --comments
```

## Raw API notes

- Project path (not ID) must be URL-encoded: `/` → `%2F`, so
  `dreso/education/evaluation/dev-assist` →
  `dreso%2Feducation%2Fevaluation%2Fdev-assist`.
- Large paginated results: `glab api "..." --paginate --output ndjson`.

## How to respond

1. Parse "Projekt: X / Ticket: Y" → project ID X, ticket IID Y → fetch via API.
2. Run the narrowest command that answers the request.
3. Summarize for the user: iid, title, state, author/assignee, labels,
   description highlights, and the `web_url` to click through. For a full ticket
   also include acceptance criteria / technical context if present. Don't dump
   raw JSON unless asked.
4. Errors: `401/403` → auth/permission (`glab auth status`); `404` → wrong
   project ID/path or ticket number.
