import { ItemView, WorkspaceLeaf, debounce } from "obsidian";
import type TasknotesGanttPlugin from "./main";
import { ZoomLevel } from "./settings";
import { collectTasks } from "./tasks";
import { renderGantt } from "./render";

export const VIEW_TYPE_TASKNOTES_GANTT = "tasknotes-gantt-view";

export class TasknotesGanttView extends ItemView {
	private plugin: TasknotesGanttPlugin;
	private chartEl: HTMLElement | null = null;
	private zoom: ZoomLevel;
	private groupByProject: boolean;
	private showCompleted: boolean;
	private filterText = "";

	constructor(leaf: WorkspaceLeaf, plugin: TasknotesGanttPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.zoom = plugin.settings.defaultZoom;
		this.groupByProject = plugin.settings.groupByProject;
		this.showCompleted = plugin.settings.showCompleted;
	}

	getViewType(): string {
		return VIEW_TYPE_TASKNOTES_GANTT;
	}

	getDisplayText(): string {
		return "TaskNotes Gantt";
	}

	getIcon(): string {
		return "gantt-chart";
	}

	async onOpen(): Promise<void> {
		const root = this.contentEl;
		root.empty();
		root.addClass("tg-view");

		this.buildToolbar(root.createDiv({ cls: "tg-toolbar" }));
		this.chartEl = root.createDiv({ cls: "tg-chart" });
		this.refresh();

		const delayedRefresh = debounce(() => this.refresh(), 1000, true);
		this.registerEvent(this.app.metadataCache.on("resolved", delayedRefresh));
		this.registerEvent(this.app.metadataCache.on("changed", delayedRefresh));
		this.registerEvent(this.app.vault.on("delete", delayedRefresh));
		this.registerEvent(this.app.vault.on("rename", delayedRefresh));
	}

	private buildToolbar(bar: HTMLElement): void {
		const filter = bar.createEl("input", {
			cls: "tg-filter",
			attr: { type: "search", placeholder: "Filter tasks…" },
		});
		filter.addEventListener("input", () => {
			this.filterText = filter.value;
			this.refresh();
		});

		const zoomSelect = bar.createEl("select", { cls: "dropdown tg-zoom" });
		for (const level of ["day", "week", "month"] as ZoomLevel[]) {
			zoomSelect.createEl("option", {
				text: level.charAt(0).toUpperCase() + level.slice(1),
				attr: { value: level },
			});
		}
		zoomSelect.value = this.zoom;
		zoomSelect.addEventListener("change", () => {
			this.zoom = zoomSelect.value as ZoomLevel;
			this.refresh();
		});

		const groupToggle = this.makeToggle(bar, "Group by project", this.groupByProject, (v) => {
			this.groupByProject = v;
			this.refresh();
		});
		groupToggle.addClass("tg-toolbar-toggle");

		const doneToggle = this.makeToggle(bar, "Show completed", this.showCompleted, (v) => {
			this.showCompleted = v;
			this.refresh();
		});
		doneToggle.addClass("tg-toolbar-toggle");

		const refreshBtn = bar.createEl("button", { text: "Refresh", cls: "tg-refresh" });
		refreshBtn.addEventListener("click", () => this.refresh());
	}

	private makeToggle(
		parent: HTMLElement,
		label: string,
		initial: boolean,
		onChange: (value: boolean) => void
	): HTMLElement {
		const wrapper = parent.createEl("label", { cls: "tg-toggle" });
		const box = wrapper.createEl("input", { attr: { type: "checkbox" } });
		box.checked = initial;
		box.addEventListener("change", () => onChange(box.checked));
		wrapper.createSpan({ text: label });
		return wrapper;
	}

	refresh(): void {
		if (!this.chartEl) return;
		const tasks = collectTasks(this.app, this.plugin.settings);
		renderGantt(this.app, this.chartEl, tasks, {
			zoom: this.zoom,
			groupByProject: this.groupByProject,
			showCompleted: this.showCompleted,
			filterText: this.filterText,
		});
	}

	async onClose(): Promise<void> {
		this.chartEl = null;
	}
}
