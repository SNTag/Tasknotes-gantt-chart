import { BasesView } from "obsidian";
import type { BasesAllOptions, BasesEntry, QueryController } from "obsidian";
import type TasknotesGanttPlugin from "./main";
import { ZoomLevel, ZOOM_PX_PER_DAY } from "./settings";
import { GanttTask, projectDisplayName, taskFromFile } from "./tasks";
import { Column, DEFAULT_COLUMNS, GanttGroup, renderGroupedGantt } from "./render";

export const GANTT_BASES_VIEW_ID = "tasknotes-gantt";

/**
 * Bases layout ("database view") for the Gantt chart. Appears in the Bases
 * view selector next to Table, Cards, and the TaskNotes layouts. The base's
 * own filters decide which notes are included, its "group by" drives the row
 * groups, and its visible properties become the table columns.
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
			type: "dropdown",
			key: "zoom",
			displayName: "Zoom",
			default: "week",
			options: { day: "Day", week: "Week", month: "Month" },
		},
	];
}
