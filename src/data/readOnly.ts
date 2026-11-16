// The read-only rule: which queries are reads, and which writes read-only
// mode still allows. src/data/api.ts enforces it, since the backend has no
// read-only concept of its own; scripts/gen-queries.ts picks each server
// function's method from it.

/** Writes read-only mode still allows: turning it off, and one's own
 * preferences and problem reports. */
export const READ_ONLY_EXEMPT: ReadonlySet<string> = new Set(['saveConfigSection', 'rollbackConfig', 'savePreferences', 'submitProblemReport'])

export const isRead = (name: string) => /^(get|search|semanticSearch|preview|resolve|validate)/.test(name)
