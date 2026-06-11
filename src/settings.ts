export interface TasknotesGanttSettings {
	/** Frontmatter tag that marks a note as a task (without leading #). */
	taskTag: string;
	/** Restrict scanning to this folder ("" = whole vault). */
	taskFolder: string;
	/** Comma-separated frontmatter fields tried in order for the bar start date. */
	startFields: string;
	/** Comma-separated frontmatter fields tried in order for the bar end date. */
	endFields: string;
	/** Fallback fields for the start date when none of startFields exist. */
	createdFields: string;
	/** Fallback fields for the end date of completed tasks. */
	completedFields: string;
	/** Status values (comma-separated, lowercase) treated as done. */
	doneStatuses: string;
	/** Status values (comma-separated, lowercase) treated as cancelled. */
	cancelledStatuses: string;
	/** Default zoom level of the timeline. */
	defaultZoom: ZoomLevel;
	/** Group rows by their first project link. */
	groupByProject: boolean;
	/** Include tasks whose status is done/cancelled. */
	showCompleted: boolean;
}

export type ZoomLevel = "day" | "week" | "month";

export const ZOOM_PX_PER_DAY: Record<ZoomLevel, number> = {
	day: 36,
	week: 12,
	month: 4,
};

export const DEFAULT_SETTINGS: TasknotesGanttSettings = {
	taskTag: "task",
	taskFolder: "",
	startFields: "scheduled, start, startDate",
	endFields: "due, end, endDate, deadline",
	createdFields: "date created, dateCreated, created",
	completedFields: "completedDate, completed, date modified, dateModified",
	doneStatuses: "done, complete, completed",
	cancelledStatuses: "cancelled, canceled, dropped",
	defaultZoom: "week",
	groupByProject: true,
	showCompleted: true,
};

export function splitFieldList(value: string): string[] {
	return value
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}
