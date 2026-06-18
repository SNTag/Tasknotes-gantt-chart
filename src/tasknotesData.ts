import type { App } from "obsidian";

/**
 * Reads colors/symbols straight from the user's TaskNotes configuration so the
 * chart matches what they see elsewhere. Falls back to sensible defaults when
 * TaskNotes isn't installed or a value isn't configured.
 *
 * TaskNotes stores `customStatuses` ({ value, color, isCompleted, ... }) and
 * `customPriorities` ({ value, color, weight, ... }) in its plugin settings.
 */

interface StatusConfig {
	value?: string;
	color?: string;
}

interface PriorityConfig {
	value?: string;
	color?: string;
	weight?: number;
}

/**
 * Minimal typed view of the (undocumented) plugin registry, used only to read
 * another installed plugin's settings without resorting to an `any` cast.
 */
interface PluginRegistry {
	plugins?: Record<string, { settings?: Record<string, unknown> } | undefined>;
}

function tasknotesSettings(app: App): Record<string, unknown> | null {
	// `app.plugins` is not part of the public API; access it through a narrow
	// typed view so the chart can mirror the user's TaskNotes color config.
	const registry = (app as App & { plugins?: PluginRegistry }).plugins;
	const tn = registry?.plugins?.tasknotes;
	return tn?.settings ?? null;
}

/** Map of lower-cased status value -> hex color, as configured in TaskNotes. */
export function buildStatusColorMap(app: App): Map<string, string> {
	const map = new Map<string, string>();
	const settings = tasknotesSettings(app);
	const statuses = (settings?.customStatuses as StatusConfig[] | undefined) ?? [];
	for (const st of statuses) {
		if (st?.value && st?.color) map.set(String(st.value).toLowerCase(), String(st.color));
	}
	return map;
}

export interface PriorityVisual {
	symbol: string;
	color?: string;
}

/** Symbols by common priority name; used directly and as a weight-bucket fallback. */
const NAME_SYMBOLS: Record<string, string> = {
	highest: "⏫",
	urgent: "⏫",
	critical: "⏫",
	high: "🔺",
	important: "🔺",
	medium: "🔸",
	normal: "🔸",
	moderate: "🔸",
	low: "🔻",
	lowest: "⏬",
	trivial: "⏬",
};

/** Five-step symbol ladder, highest urgency first, for weight-based fallback. */
const SYMBOL_LADDER = ["⏫", "🔺", "🔸", "🔻", "⏬"];

/**
 * Map of lower-cased priority value -> { symbol, color }. Symbols come from the
 * priority name when recognised, otherwise from the priority's weight rank
 * within the configured priorities.
 */
export function buildPriorityMap(app: App): Map<string, PriorityVisual> {
	const map = new Map<string, PriorityVisual>();
	const settings = tasknotesSettings(app);
	const priorities = (settings?.customPriorities as PriorityConfig[] | undefined) ?? [];

	const weights = priorities
		.map((p) => (typeof p.weight === "number" ? p.weight : null))
		.filter((w): w is number => w != null)
		.sort((a, b) => a - b);
	const minW = weights[0];
	const maxW = weights[weights.length - 1];

	for (const p of priorities) {
		if (!p?.value) continue;
		const key = String(p.value).toLowerCase();
		let symbol = NAME_SYMBOLS[key];
		if (!symbol && typeof p.weight === "number" && minW != null && maxW != null && maxW > minW) {
			const ratio = (p.weight - minW) / (maxW - minW); // 0 = lowest, 1 = highest
			const idx = Math.round((1 - ratio) * (SYMBOL_LADDER.length - 1));
			symbol = SYMBOL_LADDER[idx];
		}
		map.set(key, { symbol: symbol ?? "", color: p.color });
	}
	return map;
}

/** Resolve a task's priority to a symbol/color, using TaskNotes config then name defaults. */
export function priorityVisual(priority: string, map: Map<string, PriorityVisual>): PriorityVisual {
	const key = priority.toLowerCase().trim();
	if (!key) return { symbol: "" };
	const fromConfig = map.get(key);
	if (fromConfig) return fromConfig;
	return { symbol: NAME_SYMBOLS[key] ?? "" };
}
