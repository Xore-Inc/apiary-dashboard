// The API's side of APIARY#3213's three credential questions, as one phrase
// (#271). Ported from the legacy frontend-next `src/lib/credentialState.ts`
// (APIARY dfb90a5b), which was the only UI that rendered these facts.
//
// The backend stopped sending a password for `http-honeypot` and
// `cisco-asa-honeypot` and started sending three answers that used to be
// conflated into it: was a credential there, could we read it, and did
// anything authenticate. This module is where those become words. It is a
// pure function with no React in it so the vocabulary is testable on its
// own: the failure it guards against is "unknown" quietly rendering as
// "none", which looks correct on screen and is a lie about the attacker.
//
// Three rules, and they are the whole point:
//
//   1. `unknown` is never rendered as `absent`. The sensor reports unknown
//      when a channel that could have carried a credential was not read in
//      full. "We did not see one" and "we could not tell" are different
//      claims and the cell has to keep them apart.
//   2. The bait-credential indicator is an ATTEMPT against this fleet's own
//      fictional values. Not a vendor default list, not access, not a
//      bypass, not a CVE: it is worded as a match and nothing more.
//   3. An empty `credential_status` means the event predates the schema. The
//      API removed the password from it, so the cell must not then report
//      "no credential": that would be the service describing its own
//      redaction as an observation about the attack.

/** The `honeypot.credential_status` values the two decoys emit. */
export type CredentialStatus = 'absent' | 'present_unparsed' | 'extracted' | 'unknown'

/** The `honeypot.auth_outcome` values the two decoys emit. */
export type AuthOutcome = 'simulated' | 'real' | 'unknown'

/** The sensors whose documents carry the #3213 facts. Every other sensor
 * has none of these fields and renders no credential state at all. */
export const CREDENTIAL_FACT_SENSORS: readonly string[] = ['http-honeypot', 'cisco-asa-honeypot']

/** The subset of a sensor's `honeypot.*` object this module reads. */
export interface CredentialFacts {
  username?: string
  auth_type?: string
  credential_status?: string
  credential_present?: boolean | null
  credential_indicator_match?: boolean
  auth_outcome?: string
}

export interface CredentialState {
  /** The account half, when there was one. Never a secret. */
  account: string
  /** The whole cell. */
  label: string
  /** Tone to render with. */
  tone: 'muted' | 'warning' | 'danger'
  /** An attempt used this decoy's own bait credential. An attempt. */
  indicatorMatched: boolean
  /** The presence boolean exactly as the sensor reported it. `null` means the
   * sensor never said, which is NOT the same answer as `false`. */
  present: boolean | null
}

const STATUS_PHRASE: Record<string, string> = {
  absent: 'no credential',
  present_unparsed: 'credential present, not parsed',
  extracted: 'credential extracted',
  unknown: 'credential unknown',
}

const AUTH_PHRASE: Record<string, string> = {
  simulated: 'auth simulated',
  real: 'auth real',
  unknown: 'auth unknown',
}

/** Describes one request's credential outcome.
 *
 * Unknown status strings render as themselves rather than being swallowed by
 * a default: a sensor that grows a fifth state shows up on screen as the new
 * word, not as a blank cell that reads like "nothing happened". */
export function describeCredentialState(row: CredentialFacts): CredentialState {
  const account = row.username ?? ''
  const status = row.credential_status ?? ''
  const present = row.credential_present ?? null
  const indicatorMatched = row.credential_indicator_match === true
  const auth = row.auth_outcome ?? ''

  // Rule 3: a pre-schema document.
  const phrase = status === '' ? 'credentials removed' : (STATUS_PHRASE[status] ?? status)

  const parts = [account, phrase]
  if (indicatorMatched) parts.push('bait credential attempted')
  if (auth !== '') parts.push(AUTH_PHRASE[auth] ?? `auth ${auth}`)
  if (account !== '' && row.auth_type) parts.push(`via ${row.auth_type}`)

  return {
    account,
    label: parts.filter(Boolean).join(' · '),
    tone: indicatorMatched ? 'danger' : status === 'extracted' || status === 'present_unparsed' ? 'warning' : 'muted',
    indicatorMatched,
    present,
  }
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

/** The sensor's own `honeypot.*` object → the facts above, keeping only
 * values of the type the sensor writes. Anything else is dropped rather
 * than coerced: a number in `credential_status` is not a status. */
export function credentialFactsOf(fields: Record<string, unknown>): CredentialFacts {
  const present = fields.credential_present
  return {
    username: str(fields.username),
    auth_type: str(fields.auth_type),
    credential_status: str(fields.credential_status),
    credential_present: typeof present === 'boolean' ? present : null,
    credential_indicator_match: fields.credential_indicator_match === true,
    auth_outcome: str(fields.auth_outcome),
  }
}

/** The credential state of one event, or null for a sensor that does not
 * carry the #3213 facts (those render as they did before: nothing). */
export function credentialStateOf(event: { sensor: string; fields: Record<string, unknown> }): CredentialState | null {
  if (!CREDENTIAL_FACT_SENSORS.includes(event.sensor)) return null
  return describeCredentialState(credentialFactsOf(event.fields))
}
