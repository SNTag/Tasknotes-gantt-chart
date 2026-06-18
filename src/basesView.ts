import { BasesView, TFile } from "obsidian";
import type { BasesAllOptions, BasesEntry, QueryController } from "obsidian";
import type TasknotesGanttPlugin from "./main";
import { ZoomLevel, ZOOM_PX_PER_DAY } from "./settings";
import {
	GanttTask,
	collectProjectTree,
	projectDisplayName,
	pruneEmptyGroups,
	taskFromFile,
} from "./tasks";
import {
	Column,
	DEFAULT_COLUMNS,
	GanttGroup,
	assignDepthColors,
	renderGroupedGantt,
} from "./render";

export const GANTT_BASES_VIEW_ID = "tasknotes-gantt";

/**
 * Bases layout ("database view") for the Gantt chart. Appears in the Bases
 * view selector next to Table, Cards, and the TaskNotes layouts.
 *
 * Two modes, chosen by the view options:
 *  - No parent note: the base's filters select notes, its group-by drives the
 *    row groups, and its visible properties become the table columns.
 *  - Parent note set: the chart walks that note's `projects` hierarchy up to the
 *    chosen depth (like the standalone view), restricted to notes that pass the
 *    base's filters. Rows are colored by depth.
 */
export class GanttBasesView extends BasesView {
	type = GANTT_BASES_VIEW_ID;
	private plugin: TasknotesGanttPlugin;
	private rootEl: HTMLElement;

	constructor(controller: QueryController, containerEl: HTMLElement, plugin: TasknotesGanttPlugin) {
		super(controller);
		this.plugin = plugin;
		this.rootEl = containerEl.createDiv({ cls: "tg-chart tg-bases" });
	}

	onDataUpdated(): void {
		const parent = this.parentNote();
		if (parent) {
			this.renderParentScoped(parent);
		} else {
			this.renderGrouped();
		}
	}

	/** Hierarchical mode: walk the parent note's project tree, filtered by the base. */
	private renderParentScoped(parent: TFile): void {
		const allowed = new Set(this.data.data.map((e) => e.file.path));
		const groups = collectProjectTree(
			this.app,
			this.plugin.settings,
			parent,
			this.depth()
		).map((group) => ({
			...group,
			tasks: group.tasks.filter((t) => allowed.has(t.file.path)),
		}));
		const pruned = pruneEmptyGroups(groups);
		assignDepthColors(pruned);
		renderGroupedGantt(this.app, this.rootEl, pruned, {
			pxPerDay: ZOOM_PX_PER_DAY[this.zoom()],
			columns: DEFAULT_COLUMNS,
			emptyText: `No tasks from this base fall under "${parent.basename}". Tasks belong to a project when their 'projects' frontmatter links to it (directly or through a sub-project within the depth limit).`,
		});
	}

	/** Flat mode: one group per the base's group-by value. */
	private renderGrouped(): void {
		const settings = this.plugin.settings;
		const groups: GanttGroup[] = [];
		const entryByPath = new Map<string, BasesEntry>();

		for (const group of this.data.groupedData) {
			const tasks: GanttTask[] = [];
			for (const entry of group.entries) {
				// The base's own filters already decide membership; don't require the task tag.
				const task = taskFromFile(this.app, entry.file, settings, false);
				if (!task) continue;
				tasks.push(task);
				entryByPath.set(entry.file.path, entry);
			}
			if (tasks.length === 0) continue;
			groups.push({ name: this.groupLabel(group.key), tasks });
		}

		renderGroupedGantt(this.app, this.rootEl, groups, {
			pxPerDay: ZOOM_PX_PER_DAY[this.zoom()],
			columns: this.buildColumns(entryByPath),
		});
	}

	private parentNote(): TFile | null {
		const value = this.config.get("parentNote");
		if (typeof value !== "string" || !value.trim()) return null;
		const path = value.replace(/^\[\[|\]\]$/g, "").split("|")[0].trim();
		const direct = this.app.vault.getAbstractFileByPath(path);
		if (direct instanceof TFile) return direct;
		const resolved = this.app.metadataCache.getFirstLinkpathDest(path, "");
		return resolved instanceof TFile ? resolved : null;
	}

	private depth(): number {
		const value = Number(this.config.get("depth"));
		if (Number.isFinite(value) && value >= 1) return Math.min(value, 6);
		return this.plugin.settings.maxDepth;
	}

	private zoom(): ZoomLevel {
		const value = this.config.get("zoom");
		if (value === "day" || value === "week" || value === "month") return value;
		return this.plugin.settings.defaultZoom;
	}

	private groupLabel(key: unknown): string {
		if (key == null) return "";
		const text = String(key);
		if (!text || text === "null") return "";
		return /^\[\[.*\]\]$/.test(text) ? projectDisplayName(text) : text;
	}

	/** Title column plus one column per visible property configured on the base. */
	private buildColumns(entryByPath: Map<string, BasesEntry>): Column[] {
		const columns: Column[] = [DEFAULT_COLUMNS[0]];
		for (const prop of this.config.getOrder()) {
			if (prop === "file.name") continue; // already covered by the title column
			const label = this.config.getDisplayName(prop);
			const isStatus = prop === "note.status" || label.toLowerCase() === "status";
			columns.push({
				label,
				width: isStatus ? 110 : 120,
				kind: isStatus ? "status" : "text",
				value: (task) => {
					const entry = entryByPath.get(task.file.path);
					const value = entry?.getValue(prop);
					if (value == null) return "";
					const text = value.toString();
					return /^\[\[.*\]\]$/.test(text) ? projectDisplayName(text) : text;
				},
			});
		}
		// Fall back to the built-in columns when no properties are configured.
		if (columns.length === 1) return DEFAULT_COLUMNS;
		return columns;
	}
}

export function ganttBasesOptions(): BasesAllOptions[] {
	return [
		{
			type: "file",
			key: "parentNote",
			displayName: "Parent note",
			placeholder: "Optional — scope to a project tree",
			filter: (file: TFile) => file.extension === "md",
		},
		{
			type: "dropdown",
			key: "depth",
			displayName: "Sub-project depth",
			default: "3",
			options: { "1": "1", "2": "2", "3": "3", "4": "4", "5": "5", "6": "6" },
		},
		{
			type: "dropdown",
			key: "zoom",
			displayName: "Zoom",
			default: "week",
			options: { day: "Day", week: "Week", month: "Month" },
		},
	];
}
