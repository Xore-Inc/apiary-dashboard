// Which fields an admin config save sends (#306). The stored document sets
// some fields; the rest are at the backend's default. A save sends the
// stored ones plus the ones the operator changed, never a default as a
// typed-in 0 or empty string.

/** Fields whose value differs between the saved and the edited form. */
export function changedFields(saved: object, form: object): string[] {
  const a = saved as Record<string, unknown>
  const b = form as Record<string, unknown>
  return Object.keys({ ...a, ...b }).filter((key) => JSON.stringify(a[key]) !== JSON.stringify(b[key]))
}

/** The fields a save sends: stored ∪ changed. `undefined` stored (a tier
 * that stores whole sections) sends everything. */
export function stagedFields(saved: object, form: object, stored: readonly string[] | undefined): string[] | undefined {
  return stored ? [...new Set([...stored, ...changedFields(saved, form)])] : undefined
}

/** A field at the backend's default: not stored, not changed. */
export const isDefaultField = (field: string, saved: object, form: object, stored: readonly string[] | undefined): boolean =>
  Boolean(stored) && !stored!.includes(field) && !changedFields(saved, form).includes(field)
