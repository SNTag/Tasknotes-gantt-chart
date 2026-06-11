import { Plugin, WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, TasknotesGanttSettings } from "./settings";
import { TasknotesGanttSettingTab } from "./settingsTab";
import { TasknotesGanttView, VIEW_TYPE_TASKNOTES_GANTT } from "./view";

export default class TasknotesGanttPlugin extends Plugin {
	settings: TasknotesGanttSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(VIEW_TYPE_TASKNOTES_GANTT, (leaf) => new TasknotesGanttView(leaf, this));

		this.addRibbonIcon("gantt-chart", "Open TaskNotes Gantt chart", () => {
			void this.activateView();
		});

		this.addCommand({
			id: "open-gantt",
			name: "Open Gantt chart",
			callback: () => void this.activateView(),
		});

		this.addSettingTab(new TasknotesGanttSettingTab(this.app, this));
	}

	async activateView(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_TASKNOTES_GANTT);
		let leaf: WorkspaceLeaf | null;
		if (existing.length > 0) {
			leaf = existing[0];
		} else {
			leaf = this.app.workspace.getLeaf("tab");
			await leaf.setViewState({ type: VIEW_TYPE_TASKNOTES_GANTT, active: true });
		}
		if (leaf) this.app.workspace.revealLeaf(leaf);
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
