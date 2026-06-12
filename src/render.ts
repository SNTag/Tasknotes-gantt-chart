import type { App } from "obsidian";
import { ZoomLevel, ZOOM_PX_PER_DAY } from "./settings";
import { GanttTask, addDays, daysBetween, startOfDay } from "./tasks";

export interface RenderOptions {
	zoom: ZoomLevel;
	groupByProject: boolean;
	showCompleted: boolean;
	filterText: string;
}

export interface Column {
	label: string;
	width: number;
	kind: "title" | "status" | "text";
	cls?: string;
	value: (t: GanttTask) => string;
}

export interface GanttGroup {
	name: string;
	tasks: GanttTask[];
}

export interface ChartOptions {
	pxPerDay: number;
	columns: Column[];
}

const NO_PROJECT = "(no project)";

export const DEFAULT_COLUMNS: Column[] = [
	{ label: "Task", width: 220, kind: "title", value: (t) => t.title },
	{ label: "Status", width: 110, kind: "status", value: (t) => t.status || "open" },
	{ label: "Priority", width: 80, kind: "text", value: (t) => t.priority },
	{ label: "Start", width: 95, kind: "text", cls: "tg-col-date", value: (t) => formatDate(t.start) },
	{ label: "End", width: 95, kind: "text", cls: "tg-col-date", value: (t) => formatDate(t.end) },
];

export function formatDate(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function monthLabel(d: Date): string {
	return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

/** Standalone-view entry point: filters and groups tasks, then draws the chart. */
export function renderGantt(
	app: App,
	containerEl: HTMLElement,
	allTasks: GanttTask[],
	opts: RenderOptions
): void {
	let tasks = allTasks;
	if (!opts.showCompleted) {
		tasks = tasks.filter((t) => t.statusKind !== "done" && t.statusKind !== "cancelled");
	}
	if (opts.filterText) {
		const needle = opts.filterText.toLowerCase();
		tasks = tasks.filter(
			(t) =>
				t.title.toLowerCase().includes(needle) ||
				t.status.toLowerCase().includes(needle) ||
				t.projects.some((p) => p.toLowerCase().includes(needle))
		);
	}

	let groups: GanttGroup[];
	if (opts.groupByProject) {
		const byProject = new Map<string, GanttTask[]>();
		for (const t of tasks) {
			const key = t.projects[0] ?? NO_PROJECT;
			const list = byProject.get(key) ?? [];
			list.push(t);
			byProject.set(key, list);
		}
		groups = [...byProject.keys()]
			.sort((a, b) => {
				if (a === NO_PROJECT) return 1;
				if (b === NO_PROJECT) return -1;
				return a.localeCompare(b);
			})
			.map((name) => ({ name, tasks: byProject.get(name)! }));
	} else {
		groups = [{ name: "", tasks }];
	}

	renderGroupedGantt(app, containerEl, groups, {
		pxPerDay: ZOOM_PX_PER_DAY[opts.zoom],
		columns: DEFAULT_COLUMNS,
	});
}

/** Draw the chart for pre-built groups with the given columns. */
export function renderGroupedGantt(
	app: App,
	containerEl: HTMLElement,
	groups: GanttGroup[],
	opts: ChartOptions
): void {
	containerEl.empty();
	containerEl.addClass("tg-container");

	const tasks = groups.flatMap((g) => g.tasks);
	if (tasks.length === 0) {
		containerEl.createDiv({
			cls: "tg-empty",
			text: "No tasks with usable dates found. Check the filters and the frontmatter field names in the TaskNotes Gantt settings.",
		});
		return;
	}

	const { pxPerDay, columns } = opts;
	const metaWidth = columns.reduce((sum, c) => sum + c.width, 0);
	const today = startOfDay(new Date());

	let min = tasks[0].start;
	let max = tasks[0].end;
	for (const t of tasks) {
		if (t.start < min) min = t.start;
		if (t.end > max) max = t.end;
	}
	if (today < min) min = today;
	if (today > max) max = today;
	const rangeStart = addDays(min, -3);
	const rangeEnd = addDays(max, 7);
	const totalDays = daysBetween(rangeStart, rangeEnd) + 1;
	const timelineWidth = totalDays * pxPerDay;

	const scroller = containerEl.createDiv({ cls: "tg-scroller" });
	const table = scroller.createDiv({ cls: "tg-table" });

	// Header row: database columns + timeline scale.
	const header = table.createDiv({ cls: "tg-row tg-header" });
	const headMeta = header.createDiv({ cls: "tg-meta" });
	for (const col of columns) {
		const cell = headMeta.createDiv({ cls: "tg-cell", text: col.label });
		cell.style.width = `${col.width}px`;
	}
	const headTimeline = header.createDiv({ cls: "tg-timeline tg-timeline-header" });
	headTimeline.style.width = `${timelineWidth}px`;
	renderTimeScale(headTimeline, rangeStart, totalDays, pxPerDay);

	for (const group of groups) {
		if (group.name !== "") {
			const groupRow = table.createDiv({ cls: "tg-row tg-group" });
			const groupMeta = groupRow.createDiv({ cls: "tg-meta" });
			groupMeta.style.width = `${metaWidth}px`;
			groupMeta.createDiv({
				cls: "tg-cell tg-group-name",
				text: `${group.name} (${group.tasks.length})`,
			});
			groupRow.createDiv({ cls: "tg-timeline" }).style.width = `${timelineWidth}px`;
		}
		for (const task of group.tasks) {
			renderTaskRow(app, table, task, columns, rangeStart, today, pxPerDay, timelineWidth);
		}
	}
}

function renderTimeScale(
	el: HTMLElement,
	rangeStart: Date,
	totalDays: number,
	pxPerDay: number
): void {
	const months = el.createDiv({ cls: "tg-scale-months" });
	const ticks = el.createDiv({ cls: "tg-scale-ticks" });

	let cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
	const rangeEnd = addDays(rangeStart, totalDays - 1);
	while (cursor <= rangeEnd) {
		const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
		const fromDay = Math.max(0, daysBetween(rangeStart, cursor));
		const toDay = Math.min(totalDays, daysBetween(rangeStart, next));
		const label = months.createDiv({ cls: "tg-month", text: monthLabel(cursor) });
		label.style.left = `${fromDay * pxPerDay}px`;
		label.style.width = `${(toDay - fromDay) * pxPerDay}px`;
		cursor = next;
	}

	// Day numbers at day zoom, week start dates at week zoom, nothing at month zoom.
	if (pxPerDay >= 20) {
		for (let i = 0; i < totalDays; i++) {
			const day = addDays(rangeStart, i);
			const tick = ticks.createDiv({ cls: "tg-tick", text: String(day.getDate()) });
			tick.style.left = `${i * pxPerDay}px`;
			tick.style.width = `${pxPerDay}px`;
			if (day.getDay() === 0 || day.getDay() === 6) tick.addClass("tg-weekend");
		}
	} else if (pxPerDay >= 8) {
		for (let i = 0; i < totalDays; i++) {
			const day = addDays(rangeStart, i);
			if (day.getDay() !== 1) continue;
			const tick = ticks.createDiv({ cls: "tg-tick", text: String(day.getDate()) });
			tick.style.left = `${i * pxPerDay}px`;
			tick.style.width = `${7 * pxPerDay}px`;
		}
	}
}

function renderTaskRow(
	app: App,
	table: HTMLElement,
	task: GanttTask,
	columns: Column[],
	rangeStart: Date,
	today: Date,
	pxPerDay: number,
	timelineWidth: number
): void {
	const row = table.createDiv({ cls: "tg-row tg-task" });

	const meta = row.createDiv({ cls: "tg-meta" });
	for (const col of columns) {
		const cell = meta.createDiv({ cls: `tg-cell${col.cls ? " " + col.cls : ""}` });
		cell.style.width = `${col.width}px`;
		if (col.kind === "title") {
			const link = cell.createEl("a", { cls: "tg-task-link", text: col.value(task) });
			link.addEventListener("click", (evt) => {
				evt.preventDefault();
				app.workspace.openLinkText(task.file.path, "", evt.ctrlKey || evt.metaKey);
			});
		} else if (col.kind === "status") {
			cell.createSpan({
				cls: `tg-status-pill tg-status-${task.statusKind}`,
				text: col.value(task),
			});
		} else {
			cell.setText(col.value(task));
		}
	}

	const timeline = row.createDiv({ cls: "tg-timeline" });
	timeline.style.width = `${timelineWidth}px`;

	const todayLine = timeline.createDiv({ cls: "tg-today" });
	todayLine.style.left = `${(daysBetween(rangeStart, today) + 0.5) * pxPerDay}px`;

	const left = daysBetween(rangeStart, task.start) * pxPerDay;
	const width = Math.max((daysBetween(task.start, task.end) + 1) * pxPerDay, 5);
	const overdue =
		!task.endInferred &&
		task.statusKind !== "done" &&
		task.statusKind !== "cancelled" &&
		task.end < today;
	const bar = timeline.createDiv({
		cls: `tg-bar tg-status-${task.statusKind}${task.endInferred ? " tg-bar-inferred" : ""}${
			overdue ? " tg-overdue" : ""
		}`,
	});
	bar.style.left = `${left}px`;
	bar.style.width = `${width}px`;
	bar.setAttr(
		"aria-label",
		`${task.title}\n${formatDate(task.start)} → ${formatDate(task.end)}${
			task.endInferred ? " (end inferred)" : ""
		}\nStatus: ${task.status || "open"}`
	);
	bar.setAttr("title", bar.getAttr("aria-label") ?? "");
	if (width >= 60) {
		bar.createSpan({ cls: "tg-bar-label", text: task.title });
	}
	bar.addEventListener("click", (evt) => {
		app.workspace.openLinkText(task.file.path, "", evt.ctrlKey || evt.metaKey);
	});
}
