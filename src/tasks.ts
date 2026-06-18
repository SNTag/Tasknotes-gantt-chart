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
	/** "note" = whole-note task (frontmatter); "inline" = checkbox task in a note body. */
	kind?: "note" | "inline";
	/** Body line of an inline task, so clicking opens the note at that line. */
	line?: number;
	/** Extra nesting level for rendering (inline tasks sit under their source note). */
	indent?: number;
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

/** Extract the link target from '[[path]]' / '[[path|Alias]]'. Null for plain text. */
export function extractLinkPath(raw: string): string | null {
	const name = raw.trim().replace(/^"+|"+$/g, "");
	const link = name.match(/^\[\[(.+?)\]\]$/);
	if (!link) return null;
	return link[1].split("|")[0].split("#")[0].trim();
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

export interface ProjectGroup {
	name: string;
	depth: number;
	file?: TFile;
	tasks: GanttTask[];
}

/**
 * Map of note path -> notes whose `projects` frontmatter links to it.
 * These edges define the project hierarchy walked by collectProjectTree.
 */
export function buildProjectChildrenIndex(app: App): Map<string, TFile[]> {
	const childrenOf = new Map<string, TFile[]>();
	for (const file of app.vault.getMarkdownFiles()) {
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		if (!fm) continue;
		for (const raw of asArray(fm["projects"] ?? fm["project"])) {
			const linkpath = extractLinkPath(raw);
			if (!linkpath) continue;
			const dest = app.metadataCache.getFirstLinkpathDest(linkpath, file.path);
			if (!dest) continue;
			const list = childrenOf.get(dest.path) ?? [];
			list.push(file);
			childrenOf.set(dest.path, list);
		}
	}
	return childrenOf;
}

/** Notes that are used as a project by at least one other note. */
export function collectProjectParents(app: App): TFile[] {
	const index = buildProjectChildrenIndex(app);
	const parents: TFile[] = [];
	for (const path of index.keys()) {
		const file = app.vault.getAbstractFileByPath(path);
		if (file && "basename" in file) parents.push(file as TFile);
	}
	parents.sort((a, b) => a.path.localeCompare(b.path));
	return parents;
}

/**
 * Walk the project hierarchy starting at `parent`, collecting every note that
 * points to it (directly or through sub-projects) via the `projects` field.
 * Returns one group per project in depth-first order; tasks appear under the
 * nearest project that links them.
 */
export function collectProjectTree(
	app: App,
	settings: TasknotesGanttSettings,
	parent: TFile,
	maxDepth: number
): ProjectGroup[] {
	return pruneEmptyGroups(collectProjectTreeRaw(app, settings, parent, maxDepth));
}

/**
 * Same as collectProjectTree but without pruning empty groups, so callers that
 * add inline tasks afterwards (which can populate otherwise-empty project notes)
 * can prune once at the end.
 */
export function collectProjectTreeRaw(
	app: App,
	settings: TasknotesGanttSettings,
	parent: TFile,
	maxDepth: number
): ProjectGroup[] {
	const childrenOf = buildProjectChildrenIndex(app);
	const groups: ProjectGroup[] = [];
	const expanded = new Set<string>();
	const emitted = new Set<string>();

	const groupName = (file: TFile): string => {
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		return String(fm?.["title"] ?? file.basename);
	};

	const walk = (file: TFile, depth: number): void => {
		if (expanded.has(file.path)) return;
		expanded.add(file.path);

		const tasks: GanttTask[] = [];
		const subProjects: TFile[] = [];
		for (const child of childrenOf.get(file.path) ?? []) {
			const task = taskFromFile(app, child, settings, true);
			if (task && !emitted.has(child.path)) {
				tasks.push(task);
				emitted.add(child.path);
			}
			const hasChildren = (childrenOf.get(child.path) ?? []).length > 0;
			if (hasChildren && depth < maxDepth && !expanded.has(child.path)) {
				subProjects.push(child);
			}
		}
		tasks.sort((a, b) => a.start.getTime() - b.start.getTime() || a.title.localeCompare(b.title));
		groups.push({ name: groupName(file), depth, file, tasks });
		for (const sub of subProjects) walk(sub, depth + 1);
	};

	walk(parent, 0);
	return groups;
}

/** Map a checkbox character to a status string + kind. */
function statusFromCheckbox(ch: string): { status: string; kind: StatusKind } {
	switch (ch) {
		case " ":
			return { status: "open", kind: "open" };
		case "/":
			return { status: "in-progress", kind: "in-progress" };
		case "-":
			return { status: "cancelled", kind: "cancelled" };
		default:
			// Per Obsidian, any non-space character marks a completed task.
			return { status: "done", kind: "done" };
	}
}

/** Extract Dataview inline fields ([key:: value] or (key:: value)) from a line. */
export function parseDataviewFields(line: string): Record<string, string> {
	const out: Record<string, string> = {};
	const re = /[[(]([^[\]()]+?)::\s*([^[\]()]*?)[\])]/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(line)) !== null) {
		out[m[1].trim().toLowerCase()] = m[2].trim();
	}
	return out;
}

/** Strip the checkbox marker and Dataview fields to get a clean task title. */
function inlineTaskTitle(line: string): string {
	return line
		.replace(/^\s*[-*+]\s+\[.\]\s*/, "")
		.replace(/[[(][^[\]()]+?::\s*[^[\]()]*?[\])]/g, "")
		.replace(/\s{2,}/g, " ")
		.trim();
}

/**
 * Parse inline checkbox tasks ("- [ ] …") from a note body. Dates come from
 * Dataview inline fields, reusing the configured field names as Dataview keys.
 * An inline task is only returned when it has a scheduled/start date.
 */
export async function collectInlineTasksFromFile(
	app: App,
	settings: TasknotesGanttSettings,
	file: TFile
): Promise<GanttTask[]> {
	const items = app.metadataCache.getFileCache(file)?.listItems;
	if (!items) return [];
	const taskItems = items.filter((i) => i.task !== undefined);
	if (taskItems.length === 0) return [];

	const content = await app.vault.cachedRead(file);
	const lines = content.split("\n");
	const startFields = splitFieldList(settings.startFields).map((f) => f.toLowerCase());
	const endFields = splitFieldList(settings.endFields).map((f) => f.toLowerCase());
	const completedFields = splitFieldList(settings.completedFields).map((f) => f.toLowerCase());
	const today = startOfDay(new Date());

	const out: GanttTask[] = [];
	for (const item of taskItems) {
		const lineNo = item.position.start.line;
		const raw = lines[lineNo] ?? "";
		const fields = parseDataviewFields(raw);

		const start = parseDate(firstField(fields, startFields));
		if (!start) continue; // Require a scheduled/start date.

		let { status, kind } = statusFromCheckbox(item.task ?? " ");
		if (fields["status"]) {
			status = fields["status"];
			kind = classifyStatus(status, settings);
		}

		let end = parseDate(firstField(fields, endFields));
		let endInferred = false;
		if (!end) {
			endInferred = true;
			end =
				kind === "done" || kind === "cancelled"
					? parseDate(firstField(fields, completedFields)) ?? start
					: today;
		}
		if (end < start) end = start;

		out.push({
			file,
			title: inlineTaskTitle(raw) || "(untitled task)",
			status,
			statusKind: kind,
			priority: fields["priority"] ?? "",
			projects: [],
			start,
			end,
			endInferred,
			kind: "inline",
			line: lineNo,
			indent: 1,
		});
	}
	return out;
}

/**
 * Add each note's inline checkbox tasks as rows under that note: the group's
 * own (overview) note first, then each note-task row's inline children right
 * after it. Each note is scanned at most once.
 */
export async function augmentGroupsWithInlineTasks(
	app: App,
	settings: TasknotesGanttSettings,
	groups: ProjectGroup[]
): Promise<ProjectGroup[]> {
	const scanned = new Set<string>();
	const inlineFor = async (file: TFile): Promise<GanttTask[]> => {
		if (scanned.has(file.path)) return [];
		scanned.add(file.path);
		return collectInlineTasksFromFile(app, settings, file);
	};

	const result: ProjectGroup[] = [];
	for (const group of groups) {
		const tasks: GanttTask[] = [];
		if (group.file) tasks.push(...(await inlineFor(group.file)));
		for (const task of group.tasks) {
			tasks.push(task);
			tasks.push(...(await inlineFor(task.file)));
		}
		result.push({ ...group, tasks });
	}
	return result;
}

/** Drop projects that contain no tasks anywhere in their subtree. */
export function pruneEmptyGroups(groups: ProjectGroup[]): ProjectGroup[] {
	const keep = new Array(groups.length).fill(false);
	for (let i = groups.length - 1; i >= 0; i--) {
		if (groups[i].tasks.length > 0) {
			keep[i] = true;
			continue;
		}
		for (let j = i + 1; j < groups.length && groups[j].depth > groups[i].depth; j++) {
			if (keep[j]) {
				keep[i] = true;
				break;
			}
		}
	}
	return groups.filter((_, i) => keep[i]);
}
