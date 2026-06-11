import type { App } from "obsidian";
import { ZoomLevel, ZOOM_PX_PER_DAY } from "./settings";
import { GanttTask, addDays, daysBetween, startOfDay } from "./tasks";

export interface RenderOptions {
	zoom: ZoomLevel;
	groupByProject: boolean;
	showCompleted: boolean;
	filterText: string;
}

const NO_PROJECT = "(no project)";

interface Column {
	label: string;
	cls: string;
	value: (t: GanttTask) => string;
}

const COLUMNS: Column[] = [
	{ label: "Task", cls: "tg-col-title", value: (t) => t.title },
	{ label: "Status", cls: "tg-col-status", value: (t) => t.status || "open" },
	{ label: "Priority", cls: "tg-col-priority", value: (t) => t.priority },
	{ label: "Start", cls: "tg-col-date", value: (t) => formatDate(t.start) },
	{ label: "End", cls: "tg-col-date", value: (t) => formatDate(t.end) },
];

function formatDate(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function monthLabel(d: Date): string {
	return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

export function renderGantt(
	app: App,
	containerEl: HTMLElement,
	allTasks: GanttTask[],
	opts: RenderOptions
): void {
	containerEl.empty();
	containerEl.addClass("tg-container");

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

	if (tasks.length === 0) {
		containerEl.createDiv({
			cls: "tg-empty",
			text: "No matching tasks found. Check the task tag and frontmatter field names in the plugin settings.",
		});
		return;
	}

	const pxPerDay = ZOOM_PX_PER_DAY[opts.zoom];
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
	for (const col of COLUMNS) {
		headMeta.createDiv({ cls: `tg-cell ${col.cls}`, text: col.label });
	}
	const headTimeline = header.createDiv({ cls: "tg-timeline tg-timeline-header" });
	headTimeline.style.width = `${timelineWidth}px`;
	renderTimeScale(headTimeline, rangeStart, totalDays, pxPerDay);

	// Group tasks by first project when requested.
	const groups = new Map<string, GanttTask[]>();
	if (opts.groupByProject) {
		for (const t of tasks) {
			const key = t.projects[0] ?? NO_PROJECT;
			const list = groups.get(key) ?? [];
			list.push(t);
			groups.set(key, list);
		}
	} else {
		groups.set("", tasks);
	}
	const groupNames = [...groups.keys()].sort((a, b) => {
		if (a === NO_PROJECT) return 1;
		if (b === NO_PROJECT) return -1;
		return a.localeCompare(b);
	});

	for (const groupName of groupNames) {
		if (groupName !== "") {
			const groupRow = table.createDiv({ cls: "tg-row tg-group" });
			const groupMeta = groupRow.createDiv({ cls: "tg-meta" });
			groupMeta.createDiv({
				cls: "tg-cell tg-group-name",
				text: `${groupName} (${groups.get(groupName)!.length})`,
			});
			groupRow.createDiv({ cls: "tg-timeline" }).style.width = `${timelineWidth}px`;
		}
		for (const task of groups.get(groupName)!) {
			renderTaskRow(app, table, task, rangeStart, today, pxPerDay, timelineWidth);
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
	rangeStart: Date,
	today: Date,
	pxPerDay: number,
	timelineWidth: number
): void {
	const row = table.createDiv({ cls: "tg-row tg-task" });

	const meta = row.createDiv({ cls: "tg-meta" });
	for (const col of COLUMNS) {
		const cell = meta.createDiv({ cls: `tg-cell ${col.cls}` });
		if (col.label === "Task") {
			const link = cell.createEl("a", { cls: "tg-task-link", text: task.title });
			link.addEventListener("click", (evt) => {
				evt.preventDefault();
				app.workspace.openLinkText(task.file.path, "", evt.ctrlKey || evt.metaKey);
			});
		} else if (col.label === "Status") {
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
