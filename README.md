# TaskNotes Gantt Chart

An Obsidian plugin that generates a **Gantt chart in a database view format** from your [TaskNotes](https://github.com/callumalpass/tasknotes)-style notes (one note per task, metadata in YAML frontmatter).

Each task row shows database columns (task, status, priority) pinned on the left, with a scrollable timeline of Gantt bars on the right. Tasks are grouped by their linked project.

## How it works

The plugin scans your vault for notes tagged with your task tag (default: `task`) and reads frontmatter like:

```yaml
---
title: Draft project proposal
date created: 2026-06-04T14:31:03-04:00
date modified: 2026-06-04T17:16:55-04:00
tags:
  - task
status: in-progress
priority: ""
projects:
  - "[[Notes/Example Project/Example Project Overview]]"
---
```

For each task it determines:

| Bar | Field(s) used (first match wins, configurable in settings) |
| --- | --- |
| **Start** | `scheduled`, `start`, `startDate` → falls back to `date created` / `dateCreated` |
| **End** | `due`, `end`, `endDate`, `deadline` → for done tasks falls back to `completedDate` / `date modified`; for open tasks the bar runs to **today** (drawn with a dashed edge to show the end is inferred) |
| **Group** | first entry in `projects` (wikilinks are resolved to a display name, e.g. `Example Project Overview`) |
| **Color** | `status` — open (gray), in-progress (blue), done (green), cancelled (faded); overdue tasks get a red outline |

## Scoping to a parent project (recursive)

You can point the chart at one parent note (e.g. `Example Project Overview`) and it will chart that project's whole subtree:

- Click **Parent note…** in the Gantt view toolbar and pick the note (the picker lists every note that is referenced as a project), or open the parent note and run the command **"Open Gantt chart for current note (as parent project)"**.
- The chart then walks the hierarchy recursively: tasks whose `projects` frontmatter links to the parent, sub-project notes that link to it, those sub-projects' tasks, and so on — down to the **Depth** selected in the toolbar (1–6, default in settings).
- Each project becomes an indented, clickable section header; tasks appear under the nearest project that links them. Every first-level sub-project gets a distinct color (header dot + task bars, inherited by its deeper sub-projects), while the parent's own tasks keep status-based colors. Projects with no tasks anywhere in their subtree are hidden. Cycles and duplicates are handled (a task is only listed once).
- Click ✕ on the parent chip to go back to charting all tasks.

Note that membership follows the TaskNotes model: a note is a child of a project when its **`projects` frontmatter** links to it. Plain `[[wikilinks]]` in a note's body do not create hierarchy edges.

## Using it as a Bases layout (database view)

On Obsidian 1.10+ the plugin registers a **"TaskNotes Gantt"** layout for [Bases](https://help.obsidian.md/bases), so it appears in the same Layout dropdown as Table, Cards, and the TaskNotes layouts:

1. Create or open a base (e.g. the one TaskNotes generates), or insert one in a note.
2. Open **Configure view → Layout** and pick **TaskNotes Gantt**.
3. The base drives everything database-style:
   - **Filters** decide which notes are charted (the task tag is not required here — your base's filters are trusted).
   - **Group by** (e.g. `projects`) becomes the row groups.
   - **Properties** (visible columns) become the table columns on the left.
   - **Sort** controls row order; a **Zoom** option (Day/Week/Month) is in the view options.

Dates for the bars are still resolved from frontmatter using the field mappings in the plugin settings (`scheduled`/`due` with created/modified fallbacks).

## Features

- **Database view layout** — sticky columns (Task / Status / Priority) plus timeline bars, grouped by project. The start and end dates remain visible on each bar's hover tooltip.
- **Toolbar** — text filter, Day/Week/Month zoom, group-by-project toggle, show/hide completed, manual refresh.
- **Live updates** — the chart refreshes automatically when your notes change.
- **Click to open** — clicking a task name or its bar opens the note (Ctrl/Cmd-click opens in a new tab).
- **Today marker** — a red vertical line marks the current date.
- **Configurable** — task tag, task folder, all frontmatter field names, and status values can be changed in the plugin settings, so it adapts to your TaskNotes configuration.

## Installation (manual)

1. Download `main.js`, `manifest.json`, and `styles.css` from this repository (or from the latest [release](../../releases)).
2. In your vault, create the folder `.obsidian/plugins/tasknotes-gantt/` and copy the three files into it.
3. In Obsidian, go to **Settings → Community plugins**, refresh the list of installed plugins, and enable **TaskNotes Gantt Chart**.
4. Open the chart from the ribbon icon or the command palette: **TaskNotes Gantt Chart: Open Gantt chart**.

### Installation via BRAT

If you use the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin, add this repository (`<github-username>/Tasknotes-gantt-chart`) as a beta plugin. (Requires a published release — see below.)

## Building from source

```bash
npm install
npm run build   # produces main.js
```

For development with rebuild-on-save: `npm run dev`.

## Releasing

Tag a version to trigger the GitHub Action that builds the plugin and attaches `main.js`, `manifest.json`, and `styles.css` to a draft release:

```bash
git tag 0.1.0
git push origin 0.1.0
```

## Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| Task tag | `task` | Frontmatter tag that marks a note as a task |
| Task folder | *(empty)* | Limit scanning to one folder |
| Start date fields | `scheduled, start, startDate` | Frontmatter keys for the bar start |
| End date fields | `due, end, endDate, deadline` | Frontmatter keys for the bar end |
| Created date fields | `date created, dateCreated, created` | Fallback start |
| Completed date fields | `completedDate, completed, date modified, dateModified` | Fallback end for done tasks |
| Done / Cancelled statuses | `done, complete, completed` / `cancelled, canceled, dropped` | Status classification |
| Default zoom | Week | Day / Week / Month |
| Group by project | On | Group rows under the first `projects` link |
| Show completed tasks | On | Include done/cancelled tasks |

## License

MIT
