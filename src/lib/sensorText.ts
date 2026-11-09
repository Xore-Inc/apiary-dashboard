/** What the sensor detail header and summary say about a sensor, leaving out
 * what the backend does not know (#288). A sensor read from the live API has
 * no kind and no location; joining the blanks drew "· · tcp". */
export function sensorSubtitle(sensor: { kind: string; location: string; protocols: string[] }): string | undefined {
  const text = [sensor.kind, sensor.location, sensor.protocols.join(', ')].map((part) => part.trim()).filter(Boolean).join(' · ')
  return text || undefined
}

/** The description of what a sensor did, then the explanation of the
 * panel. An absent description leaves the explanation alone rather than a
 * bare ". " in front of it. */
export function sensorSummary(what: string, explanation: string): string {
  const lead = what.trim().replace(/\.+$/, '')
  return lead ? `${lead}. ${explanation}` : explanation
}
