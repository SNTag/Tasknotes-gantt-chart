import { Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, TasknotesGanttSettings } from "./settings";
import { TasknotesGanttSettingTab } from "./settingsTab";
import { TasknotesGanttView, VIEW_TYPE_TASKNOTES_GANTT } from "./view";
import { GANTT_BASES_VIEW_ID, GanttBasesView, ganttBasesOptions } from "./basesView";

export default class TasknotesGanttPlugin extends Plugin {
	settings: TasknotesGanttSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(VIEW_TYPE_TASKNOTES_GANTT, (leaf) => new TasknotesGanttView(leaf, this));

		// Bases layout, available on Obsidian 1.10+ (where the Bases API exists).
		if (typeof this.registerBasesView === "function") {
			this.registerBasesView(GANTT_BASES_VIEW_ID, {
				name: "TaskNotes Gantt",
				icon: "gantt-chart",
				factory: (controller, containerEl) =>
					new GanttBasesView(controller, containerEl, this),
				options: () => ganttBasesOptions(),
			});
		}

		this.addRibbonIcon("gantt-chart", "Open TaskNotes Gantt chart", () => {
			void this.activateView();
		});

		this.addCommand({
			id: "open-gantt",
			name: "Open Gantt chart",
			callback: () => void this.activateView(),
		});

		this.addCommand({
			id: "open-gantt-for-current-note",
			name: "Open Gantt chart for current note (as parent project)",
			callback: async () => {
				const file = this.app.workspace.getActiveFile();
				const view = await this.activateView();
				if (view && file) view.setParent(file);
			},
		});

		this.addCommand({
			id: "copy-gantt-link",
			name: "Copy Gantt chart link for current note (as parent project)",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file) return false;
				if (!checking) {
					void navigator.clipboard.writeText(this.buildGanttUri(file));
					new Notice("TaskNotes Gantt: link copied to clipboard");
				}
				return true;
			},
		});

		// Links like obsidian://tasknotes-gantt?parent=Everyday[&depth=2] open the
		// standalone view scoped to that note. With no parent param, the note that
		// was active when the link was clicked becomes the parent. Usable as a
		// clickable link in any note.
		this.registerObsidianProtocolHandler("tasknotes-gantt", async (params) => {
			// Capture the active note first — opening the view changes the active file.
			const activeBefore = this.app.workspace.getActiveFile();
			const view = await this.activateView();
			if (!view) return;
			const parentName = (params.parent ?? params.parentNote ?? "").trim();
			let file: TFile | null;
			if (parentName) {
				file = this.resolveNote(parentName);
				if (!file) {
					new Notice(`TaskNotes Gantt: note "${parentName}" not found`);
					return;
				}
			} else {
				file = activeBefore;
				if (!file) return; // No parent given and no active note: just open the view.
			}
			const depth = params.depth ? Number(params.depth) : undefined;
			view.setParent(file, depth);
		});

		this.addSettingTab(new TasknotesGanttSettingTab(this.app, this));
	}

	/** Resolve a note name, wikilink, or path to a TFile (null if not found). */
	resolveNote(name: string): TFile | null {
		const cleaned = name.replace(/^\[\[|\]\]$/g, "").split("|")[0].trim();
		const byLink = this.app.metadataCache.getFirstLinkpathDest(cleaned, "");
		if (byLink instanceof TFile) return byLink;
		const byPath = this.app.vault.getAbstractFileByPath(cleaned);
		return byPath instanceof TFile ? byPath : null;
	}

	/** Build an obsidian:// link that opens this view scoped to the given note. */
	buildGanttUri(file: TFile): string {
		const vault = encodeURIComponent(this.app.vault.getName());
		const parent = encodeURIComponent(file.basename);
		return `obsidian://tasknotes-gantt?vault=${vault}&parent=${parent}`;
	}

	async activateView(): Promise<TasknotesGanttView | null> {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_TASKNOTES_GANTT);
		let leaf: WorkspaceLeaf | null;
		if (existing.length > 0) {
			leaf = existing[0];
		} else {
			leaf = this.app.workspace.getLeaf("tab");
			await leaf.setViewState({ type: VIEW_TYPE_TASKNOTES_GANTT, active: true });
		}
		if (!leaf) return null;
		this.app.workspace.revealLeaf(leaf);
		return leaf.view instanceof TasknotesGanttView ? leaf.view : null;
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_TASKNOTES_GANTT)) {
			const view = leaf.view;
			if (view instanceof TasknotesGanttView) view.refresh();
		}
	}
}
