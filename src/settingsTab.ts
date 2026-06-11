import { App, PluginSettingTab, Setting } from "obsidian";
import type TasknotesGanttPlugin from "./main";
import { DEFAULT_SETTINGS, ZoomLevel } from "./settings";

export class TasknotesGanttSettingTab extends PluginSettingTab {
	private plugin: TasknotesGanttPlugin;

	constructor(app: App, plugin: TasknotesGanttPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Task tag")
			.setDesc("Frontmatter tag that marks a note as a task (without #).")
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.taskTag)
					.setValue(this.plugin.settings.taskTag)
					.onChange(async (value) => {
						this.plugin.settings.taskTag = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Task folder")
			.setDesc("Only scan notes inside this folder. Leave empty to scan the whole vault.")
			.addText((text) =>
				text
					.setPlaceholder("e.g. Tasks")
					.setValue(this.plugin.settings.taskFolder)
					.onChange(async (value) => {
						this.plugin.settings.taskFolder = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl).setName("Date fields").setHeading();

		const fieldSetting = (
			name: string,
			desc: string,
			key: "startFields" | "endFields" | "createdFields" | "completedFields"
		) => {
			new Setting(containerEl)
				.setName(name)
				.setDesc(desc + " Comma-separated frontmatter keys, tried in order.")
				.addText((text) =>
					text
						.setPlaceholder(DEFAULT_SETTINGS[key])
						.setValue(this.plugin.settings[key])
						.onChange(async (value) => {
							this.plugin.settings[key] = value;
							await this.plugin.saveSettings();
						})
				);
		};

		fieldSetting("Start date fields", "Where a task's bar begins.", "startFields");
		fieldSetting("End date fields", "Where a task's bar ends (e.g. due date).", "endFields");
		fieldSetting(
			"Created date fields",
			"Fallback start when no start date is set.",
			"createdFields"
		);
		fieldSetting(
			"Completed date fields",
			"Fallback end for done tasks with no end date.",
			"completedFields"
		);

		new Setting(containerEl).setName("Statuses").setHeading();

		new Setting(containerEl)
			.setName("Done statuses")
			.setDesc("Comma-separated status values treated as done.")
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.doneStatuses)
					.setValue(this.plugin.settings.doneStatuses)
					.onChange(async (value) => {
						this.plugin.settings.doneStatuses = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Cancelled statuses")
			.setDesc("Comma-separated status values treated as cancelled.")
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.cancelledStatuses)
					.setValue(this.plugin.settings.cancelledStatuses)
					.onChange(async (value) => {
						this.plugin.settings.cancelledStatuses = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl).setName("View defaults").setHeading();

		new Setting(containerEl)
			.setName("Default zoom")
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({ day: "Day", week: "Week", month: "Month" })
					.setValue(this.plugin.settings.defaultZoom)
					.onChange(async (value) => {
						this.plugin.settings.defaultZoom = value as ZoomLevel;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Group by project")
			.setDesc("Group rows under their first linked project.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.groupByProject).onChange(async (value) => {
					this.plugin.settings.groupByProject = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Show completed tasks")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showCompleted).onChange(async (value) => {
					this.plugin.settings.showCompleted = value;
					await this.plugin.saveSettings();
				})
			);
	}
}
