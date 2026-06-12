import type { App, TFile } from "obsidian";
import { TasknotesGanttSettings, splitFieldList } from "./settings";

export type StatusKind = "open" | "in-progress" | "done" | "cancelled" | "other";

export interface GanttTask {
	file: TFile;
	title: string;
	status: string;
	statusKind: StatusKind;
	priority: string;
	projects: string[];
	start: Date;
	end: Date;
	/** True when the end date was inferred (e.g. "today" for unfinished tasks). */
	endInferred: boolean;
}

export function startOfDay(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, days: number): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

export function daysBetween(a: Date, b: Date): number {
	return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);
}

/** Parse a frontmatter date value ("2026-06-04" or full ISO timestamp). */
function parseDate(value: unknown): Date | null {
	if (value == null) return null;
	const raw = String(value).trim();
	if (!raw) return null;
	const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (dateOnly) {
		return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
	}
	const parsed = new Date(raw);
	if (isNaN(parsed.getTime())) return null;
	return startOfDay(parsed);
}

function firstField(fm: Record<string, unknown>, fields: string[]): unknown {
	for (const field of fields) {
		if (fm[field] != null && fm[field] !== "") return fm[field];
	}
	return null;
}

function asArray(value: unknown): string[] {
	if (value == null) return [];
	if (Array.isArray(value)) return value.map((v) => String(v));
	return [String(value)];
}

/** Turn '[[Notes/Foo/Bar Overview]]' or '[[path|Alias]]' into a display name. */
export function projectDisplayName(raw: string): string {
	let name = raw.trim().replace(/^"+|"+$/g, "");
	const link = name.match(/^\[\[(.+?)\]\]$/);
	if (link) name = link[1];
	const aliasSplit = name.split("|");
	if (aliasSplit.length > 1) return aliasSplit[aliasSplit.length - 1].trim();
	const segments = name.split("/");
	return segments[segments.length - 1].trim();
}

function classifyStatus(status: string, settings: TasknotesGanttSettings): StatusKind {
	const s = status.toLowerCase().trim();
	if (!s || s === "open" || s === "todo" || s === "to-do" || s === "none") return "open";
	if (splitFieldList(settings.doneStatuses.toLowerCase()).includes(s)) return "done";
	if (splitFieldList(settings.cancelledStatuses.toLowerCase()).includes(s)) return "cancelled";
	if (s.includes("progress") || s === "doing" || s === "active") return "in-progress";
	return "other";
}

function hasTaskTag(fm: Record<string, unknown>, taskTag: string): boolean {
	const wanted = taskTag.replace(/^#/, "").toLowerCase();
	if (!wanted) return true;
	const tags = asArray(fm["tags"] ?? fm["tag"]);
	return tags.some((t) => {
		const tag = t.replace(/^#/, "").toLowerCase();
		return tag === wanted || tag.startsWith(wanted + "/");
	});
}

export function collectTasks(app: App, settings: TasknotesGanttSettings): GanttTask[] {
	const folder = settings.taskFolder.replace(/^\/+|\/+$/g, "");

	const tasks: GanttTask[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		if (folder && !(file.path === folder || file.path.startsWith(folder + "/"))) continue;
		const task = taskFromFile(app, file, settings, true);
		if (task) tasks.push(task);
	}

	tasks.sort((a, b) => a.start.getTime() - b.start.getTime() || a.title.localeCompare(b.title));
	return tasks;
}

/**
 * Parse one note's frontmatter into a GanttTask. Returns null when the note
 * is not a task (missing tag, when required) or has no usable dates.
 */
export function taskFromFile(
	app: App,
	file: TFile,
	settings: TasknotesGanttSettings,
	requireTag: boolean
): GanttTask | null {
	const startFields = splitFieldList(settings.startFields);
	const endFields = splitFieldList(settings.endFields);
	const createdFields = splitFieldList(settings.createdFields);
	const completedFields = splitFieldList(settings.completedFields);
	const today = startOfDay(new Date());

	const fm = app.metadataCache.getFileCache(file)?.frontmatter;
	if (!fm) return null;
	if (requireTag && !hasTaskTag(fm, settings.taskTag)) return null;

	const status = String(fm["status"] ?? "");
	const statusKind = classifyStatus(status, settings);

	let start = parseDate(firstField(fm, startFields));
	let end = parseDate(firstField(fm, endFields));
	let endInferred = false;
	if (!start) start = parseDate(firstField(fm, createdFields));
	if (!end) {
		endInferred = true;
		if (statusKind === "done" || statusKind === "cancelled") {
			end = parseDate(firstField(fm, completedFields)) ?? start;
		} else {
			end = today;
		}
	}
	if (!start && end) start = end;
	if (!start || !end) return null;
	if (end < start) end = start;

	return {
		file,
		title: String(fm["title"] ?? file.basename),
		status,
		statusKind,
		priority: String(fm["priority"] ?? "").replace(/^"+|"+$/g, ""),
		projects: asArray(fm["projects"] ?? fm["project"]).map(projectDisplayName),
		start,
		end,
		endInferred,
	};
}
