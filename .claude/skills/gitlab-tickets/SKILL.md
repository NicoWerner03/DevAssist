---
name: gitlab-tickets
description: >-
  Use when the user wants to fetch, view, list, search, or filter GitLab
  issues/tickets with glab, including requests like "Projekt: 599 Ticket: 15",
  "hol Ticket #42", "show issue", or "issues mit Label bug" for
  gitlab.dreso.com.
---

# GitLab Tickets (via glab)

Use the authenticated `glab` CLI to inspect GitLab issues and comments.

## Core Rules

- Target GitLab explicitly. This repo's remote points at GitHub, so `glab`
  cannot infer the GitLab project from the current directory.
- Check `glab auth status` if authentication is unclear. If login is required,
  ask the user to run `glab auth login` interactively.
- Read both the issue description and the comments before summarizing or using
  a ticket as task context.
- Treat a Dev-Assist proposal marked with `## Dev-Assist: Structured Proposal`
  as the source of truth for implementation work unless newer comments override
  it.
- Do not dump raw JSON unless the user asks for it.

## Numeric Project ID Requests

For requests in this shape:

```text
Projekt: 599
Ticket: 15
```

Interpret `599` as the numeric project ID and `15` as the issue IID.
`glab issue view --repo` does not accept numeric project IDs, so use the REST
API:

```bash
glab api "projects/599/issues/15" --hostname gitlab.dreso.com
glab api "projects/599/issues/15/notes" --hostname gitlab.dreso.com
```

General form:

```bash
glab api "projects/<project-id>/issues/<issue-iid>" --hostname gitlab.dreso.com
glab api "projects/<project-id>/issues/<issue-iid>/notes" --hostname gitlab.dreso.com
```

Project `599` is the default project for this workspace:
`dreso/education/evaluation/dev-assist`.

## Reading API Output

`glab api` has no built-in `--jq` flag, and standalone `jq` is not assumed to be
available. If the JSON is hard to read, redirect it to a temporary file inside
the project directory, read it, then remove it:

```powershell
glab api "projects/599/issues/15" --hostname gitlab.dreso.com > .ticket.json
Get-Content -LiteralPath .ticket.json
Remove-Item -LiteralPath .ticket.json
```

For a quick field peek, line-split the raw output and search for the field name
if shell tools are available.

## Determining the Target Repo/Project

Accepted forms:

- Numeric project ID, such as `599`: use REST API commands.
- `GROUP/PROJECT` or `GROUP/SUBGROUP/PROJECT`: use `glab issue list/view`
  with `--repo`.
- Full GitLab issue URL: pass the URL directly to `glab issue view`.

Discover projects the token can see:

```bash
glab api "projects?membership=true&per_page=50&order_by=last_activity_at" \
  --hostname gitlab.dreso.com | tr ',' '\n' | grep '"path_with_namespace"'
```

Map a numeric ID to its path:

```bash
glab api "projects/599" --hostname gitlab.dreso.com | tr ',' '\n' | grep path_with_namespace
```

## Listing Issues

`glab issue list` and `glab issue view` have a built-in `--jq`. These commands
need `--repo GROUP/PROJECT`, not a numeric project ID.

```bash
glab issue list --repo GROUP/PROJECT
glab issue list --repo GROUP/PROJECT --all
glab issue list --repo GROUP/PROJECT --closed
glab issue list --repo GROUP/PROJECT --assignee=@me
glab issue list --repo GROUP/PROJECT --label bug --label urgent
glab issue list --repo GROUP/PROJECT --milestone "Sprint 5"
glab issue list --repo GROUP/PROJECT --search "login timeout"
glab issue list --repo GROUP/PROJECT --output json \
  --jq '.[] | {iid, title, state, labels, assignees: [.assignees[].username], web_url}'
```

For numeric project IDs, list via the API:

```bash
glab api "projects/599/issues?state=opened&per_page=50" --hostname gitlab.dreso.com
```

Useful list flags: `--author`, `--not-label`, `--not-assignee`, `--issue-type`,
`--per-page`, `--page`, `--order`, and `--sort`.

## Viewing One Issue by Repo Path

```bash
glab issue view 42 --repo GROUP/PROJECT
glab issue view 42 --repo GROUP/PROJECT --comments
glab issue view 42 --repo GROUP/PROJECT --output json --jq '{iid,title,state,web_url}'
glab issue view https://gitlab.dreso.com/group/project/-/issues/42 --comments
```

## Raw API Notes

- Project paths used in API URLs must be URL-encoded: `/` becomes `%2F`, so
  `dreso/education/evaluation/dev-assist` becomes
  `dreso%2Feducation%2Fevaluation%2Fdev-assist`.
- For large paginated results, use `glab api "..." --paginate --output ndjson`.

## How to Respond

1. Parse "Projekt: X / Ticket: Y" as project ID X and issue IID Y, then fetch
   the issue and notes via API.
2. Run the narrowest command that answers the request.
3. Summarize IID, title, state, author, assignees, labels, description
   highlights, comments, acceptance criteria, technical context, and `web_url`
   when present.
4. Handle errors directly: `401/403` means auth or permission; `404` means wrong
   project ID/path, wrong issue IID, or missing permission.
