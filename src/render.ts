import type { App, TFile } from "obsidian";
import { ZoomLevel, ZOOM_PX_PER_DAY } from "./settings";
import { GanttTask, addDays, daysBetween, startOfDay } from "./tasks";
import {
	PriorityVisual,
	buildPriorityMap,
	buildStatusColorMap,
	priorityVisual,
} from "./tasknotesData";

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
	/** Nesting level for hierarchical (parent project) views. */
	depth?: number;
	/** Note backing this group; renders the header as a link when set. */
	file?: TFile;
	/** CSS color applied to this group's bars and header dot. */
	color?: string;
}

const GROUP_PALETTE = [
	"var(--color-blue)",
	"var(--color-orange)",
	"var(--color-purple)",
	"var(--color-cyan)",
	"var(--color-pink)",
	"var(--color-yellow)",
	"var(--color-green)",
	"var(--color-red)",
];

/**
 * Color every group (and its task rows) by nesting depth: depth 0, 1, 2…
 * each get a distinct palette color, so the hierarchy level reads at a glance.
 * Task bars themselves are colored by status, not by this.
 */
export function assignDepthColors(groups: GanttGroup[]): void {
	for (const group of groups) {
		group.color = GROUP_PALETTE[(group.depth ?? 0) % GROUP_PALETTE.length];
	}
}

export interface ChartOptions {
	pxPerDay: number;
	columns: Column[];
	emptyText?: string;
}

const NO_PROJECT = "(no project)";

export const DEFAULT_COLUMNS: Column[] = [
	{ label: "Task", width: 260, kind: "title", value: (t) => t.title },
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
			text:
				opts.emptyText ??
				"No tasks with usable dates found. Check the filters and the frontmatter field names in the TaskNotes Gantt settings.",
		});
		return;
	}

	const { pxPerDay, columns } = opts;
	const metaWidth = columns.reduce((sum, c) => sum + c.width, 0);
	const today = startOfDay(new Date());
	const statusColors = buildStatusColorMap(app);
	const priorityMap = buildPriorityMap(app);

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
			const nameCell = groupMeta.createDiv({ cls: "tg-cell tg-group-name" });
			nameCell.style.paddingLeft = `${8 + (group.depth ?? 0) * 20}px`;
			if (group.color) {
				const dot = nameCell.createSpan({ cls: "tg-group-dot" });
				dot.style.background = group.color;
			}
			const label = `${group.name} (${group.tasks.length})`;
			if (group.file) {
				const path = group.file.path;
				const link = nameCell.createEl("a", { cls: "tg-task-link", text: label });
				link.addEventListener("click", (evt) => {
					evt.preventDefault();
					app.workspace.openLinkText(path, "", evt.ctrlKey || evt.metaKey);
				});
			} else {
				nameCell.setText(label);
			}
			groupRow.createDiv({ cls: "tg-timeline" }).style.width = `${timelineWidth}px`;
		}
		for (const task of group.tasks) {
			renderTaskRow(app, table, task, columns, rangeStart, today, pxPerDay, timelineWidth, {
				depthColor: group.color,
				statusColors,
				priorityMap,
			});
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

interface RowVisuals {
	/** Row tint/accent color for the nesting depth. */
	depthColor?: string;
	/** TaskNotes status value -> color. */
	statusColors: Map<string, string>;
	/** TaskNotes priority value -> symbol/color. */
	priorityMap: Map<string, PriorityVisual>;
}

function renderTaskRow(
	app: App,
	table: HTMLElement,
	task: GanttTask,
	columns: Column[],
	rangeStart: Date,
	today: Date,
	pxPerDay: number,
	timelineWidth: number,
	visuals: RowVisuals
): void {
	const row = table.createDiv({ cls: "tg-row tg-task" });
	if (visuals.depthColor) {
		row.addClass("tg-has-depth");
		row.style.setProperty("--tg-depth", visuals.depthColor);
	}
	if (task.kind === "inline") row.addClass("tg-inline");

	const prio = priorityVisual(task.priority, visuals.priorityMap);

	// Open the note — at the task's line for inline checkbox tasks.
	const openTask = (evt: MouseEvent): void => {
		const mod = evt.ctrlKey || evt.metaKey;
		if (task.kind === "inline" && task.line != null) {
			void app.workspace.getLeaf(mod).openFile(task.file, { eState: { line: task.line } });
		} else {
			app.workspace.openLinkText(task.file.path, "", mod);
		}
	};

	const meta = row.createDiv({ cls: "tg-meta" });
	for (const col of columns) {
		const cell = meta.createDiv({ cls: `tg-cell${col.cls ? " " + col.cls : ""}` });
		cell.style.width = `${col.width}px`;
		if (col.kind === "title") {
			if (task.indent) cell.style.paddingLeft = `${8 + task.indent * 16}px`;
			if (task.kind === "inline") {
				cell.createSpan({ cls: "tg-checkbox", text: checkboxGlyph(task.statusKind) });
			}
			if (prio.symbol) {
				const sym = cell.createSpan({ cls: "tg-prio", text: prio.symbol });
				if (prio.color) sym.style.color = prio.color;
				sym.setAttr("aria-label", `Priority: ${task.priority}`);
				sym.setAttr("title", `Priority: ${task.priority}`);
			}
			const link = cell.createEl("a", { cls: "tg-task-link", text: col.value(task) });
			link.addEventListener("click", (evt) => {
				evt.preventDefault();
				openTask(evt);
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
	// Bar is colored by status, using the exact TaskNotes status color when available.
	const statusColor = visuals.statusColors.get(task.status.toLowerCase());
	if (statusColor) {
		bar.addClass("tg-bar-colored");
		bar.style.background = statusColor;
	}
	bar.setAttr(
		"aria-label",
		`${task.title}\n${formatDate(task.start)} → ${formatDate(task.end)}${
			task.endInferred ? " (end inferred)" : ""
		}\nStatus: ${task.status || "open"}${task.priority ? `\nPriority: ${task.priority}` : ""}`
	);
	bar.setAttr("title", bar.getAttr("aria-label") ?? "");
	if (width >= 60) {
		bar.createSpan({ cls: "tg-bar-label", text: task.title });
	}
	bar.addEventListener("click", openTask);
}

/** Glyph showing an inline task's checkbox state. */
function checkboxGlyph(kind: GanttTask["statusKind"]): string {
	switch (kind) {
		case "done":
			return "☑";
		case "cancelled":
			return "☒";
		case "in-progress":
			return "◐";
		default:
			return "☐";
	}
}
