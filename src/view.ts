import { FuzzySuggestModal, ItemView, TFile, WorkspaceLeaf, debounce } from "obsidian";
import type { App } from "obsidian";
import type TasknotesGanttPlugin from "./main";
import { ZOOM_PX_PER_DAY, ZoomLevel } from "./settings";
import { GanttTask, collectProjectParents, collectProjectTree, collectTasks, pruneEmptyGroups } from "./tasks";
import { DEFAULT_COLUMNS, assignDepthColors, renderGantt, renderGroupedGantt } from "./render";

export const VIEW_TYPE_TASKNOTES_GANTT = "tasknotes-gantt-view";

export class TasknotesGanttView extends ItemView {
	private plugin: TasknotesGanttPlugin;
	private chartEl: HTMLElement | null = null;
	private parentChipEl: HTMLElement | null = null;
	private zoom: ZoomLevel;
	private groupByProject: boolean;
	private showCompleted: boolean;
	private filterText = "";
	private parentFile: TFile | null = null;
	private maxDepth: number;

	constructor(leaf: WorkspaceLeaf, plugin: TasknotesGanttPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.zoom = plugin.settings.defaultZoom;
		this.groupByProject = plugin.settings.groupByProject;
		this.showCompleted = plugin.settings.showCompleted;
		this.maxDepth = plugin.settings.maxDepth;
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

	/** Scope the chart to one parent project note (null shows all tasks). */
	setParent(file: TFile | null): void {
		this.parentFile = file;
		this.updateParentChip();
		this.refresh();
	}

	private buildToolbar(bar: HTMLElement): void {
		const parentBtn = bar.createEl("button", { text: "Parent note…", cls: "tg-parent-btn" });
		parentBtn.addEventListener("click", () => {
			new ParentNoteModal(this.app, (file) => this.setParent(file)).open();
		});
		this.parentChipEl = bar.createDiv({ cls: "tg-parent-chip" });
		this.updateParentChip();

		const depthSelect = bar.createEl("select", {
			cls: "dropdown tg-depth",
			attr: { "aria-label": "Sub-project depth" },
		});
		for (let depth = 1; depth <= 6; depth++) {
			depthSelect.createEl("option", { text: `Depth ${depth}`, attr: { value: String(depth) } });
		}
		depthSelect.value = String(Math.min(Math.max(this.maxDepth, 1), 6));
		depthSelect.addEventListener("change", () => {
			this.maxDepth = Number(depthSelect.value);
			this.refresh();
		});

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

	private updateParentChip(): void {
		const chip = this.parentChipEl;
		if (!chip) return;
		chip.empty();
		if (!this.parentFile) {
			chip.createSpan({ cls: "tg-parent-none", text: "All tasks" });
			return;
		}
		chip.createSpan({ cls: "tg-parent-name", text: this.parentFile.basename });
		const clear = chip.createSpan({ cls: "tg-parent-clear", text: "✕" });
		clear.setAttr("aria-label", "Clear parent note");
		clear.addEventListener("click", () => this.setParent(null));
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

	private matchesFilters(task: GanttTask): boolean {
		if (
			!this.showCompleted &&
			(task.statusKind === "done" || task.statusKind === "cancelled")
		) {
			return false;
		}
		if (this.filterText) {
			const needle = this.filterText.toLowerCase();
			return (
				task.title.toLowerCase().includes(needle) ||
				task.status.toLowerCase().includes(needle) ||
				task.projects.some((p) => p.toLowerCase().includes(needle))
			);
		}
		return true;
	}

	refresh(): void {
		if (!this.chartEl) return;

		if (this.parentFile) {
			const groups = collectProjectTree(
				this.app,
				this.plugin.settings,
				this.parentFile,
				this.maxDepth
			).map((group) => ({ ...group, tasks: group.tasks.filter((t) => this.matchesFilters(t)) }));
			const pruned = pruneEmptyGroups(groups);
			assignDepthColors(pruned);
			renderGroupedGantt(this.app, this.chartEl, pruned, {
				pxPerDay: ZOOM_PX_PER_DAY[this.zoom],
				columns: DEFAULT_COLUMNS,
				emptyText: `No tasks found under "${this.parentFile.basename}". Tasks belong to a project when their 'projects' frontmatter links to it (directly or through a sub-project within the depth limit).`,
			});
			return;
		}

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
		this.parentChipEl = null;
	}
}

/** Fuzzy picker over notes that are referenced as a project by other notes. */
class ParentNoteModal extends FuzzySuggestModal<TFile> {
	private items: TFile[];
	private onChoose: (file: TFile) => void;

	constructor(app: App, onChoose: (file: TFile) => void) {
		super(app);
		this.onChoose = onChoose;
		this.items = collectProjectParents(app);
		if (this.items.length === 0) this.items = app.vault.getMarkdownFiles();
		this.setPlaceholder("Choose a parent project note…");
	}

	getItems(): TFile[] {
		return this.items;
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	onChooseItem(file: TFile): void {
		this.onChoose(file);
	}
}
