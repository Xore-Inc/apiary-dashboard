// The static catalog of honeypot sensors: what each one is, the columns and
// artefacts its event page shows, and the leaderboards and measures it
// feeds. Pure description, no data, so a sensor is described once.
import type { EventType, SensorFields, SensorReading } from '#/data/types'

/** A field, or the first of several names different versions use for it. */
export type FieldRef = string | string[]

export type SensorColumn = { header: string; field: FieldRef; mono?: boolean; badge?: 'danger' | 'warning' | 'success' | 'muted' | 'info' }

/** The static part of a sensor: everything the dashboard can say about its type without any traffic. */
export type SensorCatalogEntry = {
  id: string
  /** The family, as operators name it. */
  kind: string
  /** One phrase: what this sensor is and what it captures. */
  what: string
  protocols: string[]
  ports: Array<{ proto: 'tcp' | 'udp'; port: number }>
  ingress: Array<'portbridge' | 'traefik' | 'direct'>
  /** Columns beyond the time / source / port every sensor shares. */
  columns: SensorColumn[]
  /** The characteristic artefact: the thing worth running the sensor for. */
  artefacts: Array<{ label: string; field: FieldRef }>
  /** Leaderboards over its own fields. */
  tops: Array<{ label: string; field: FieldRef }>
  /** The quantities it exists to produce. */
  measures: Array<{ label: string; match: (fields: SensorFields, type: EventType) => boolean }>
}

const is = (type: EventType, ...types: EventType[]) => types.includes(type)
const has = (field: string) => (fields: SensorFields) => field in fields && fields[field] !== ''
const eq = (field: string, ...values: string[]) => (fields: SensorFields) => values.includes(String(fields[field]))

const CONPOT_SPEC = {
  kind: 'Conpot',
  what: 'Industrial control protocol: the request an attacker sent and the response the emulated device served',
  ingress: ['portbridge'] as SensorCatalogEntry['ingress'],
  columns: [
    { header: 'protocol', field: 'data_type', badge: 'info' as const },
    { header: 'event', field: 'event_type', mono: true },
  ],
  artefacts: [
    { label: 'Request', field: 'request' },
    { label: 'Response served', field: 'response' },
  ],
  tops: [
    { label: 'protocols', field: 'data_type' },
    { label: 'requests', field: 'event_type' },
  ],
  measures: [
    { label: 'connections', match: eq('event_type', 'NEW_CONNECTION') },
    { label: 'requests answered', match: has('request') },
  ],
}

export const SENSOR_SPECS: SensorCatalogEntry[] = [
  {
    id: 'cowrie',
    kind: 'Cowrie',
    what: 'SSH and telnet sessions: the credentials tried and the commands run',
    protocols: ['ssh', 'telnet'],
    ports: [
      { proto: 'tcp', port: 2222 },
      { proto: 'tcp', port: 2223 },
    ],
    ingress: ['portbridge'],
    columns: [
      { header: 'event', field: 'eventid', mono: true },
      { header: 'protocol', field: 'protocol' },
      { header: 'what happened', field: 'message' },
    ],
    artefacts: [{ label: 'Session line', field: 'message' }],
    tops: [
      { label: 'usernames', field: 'username' },
      { label: 'passwords', field: 'password' },
      { label: 'commands', field: 'input' },
      { label: 'client versions', field: 'version' },
    ],
    measures: [
      { label: 'login attempts', match: (_, t) => is(t, 'login.failed', 'login.success') },
      { label: 'successful logins', match: (_, t) => t === 'login.success' },
      { label: 'commands run', match: (_, t) => t === 'command.input' },
      { label: 'files downloaded', match: (_, t) => t === 'file.download' },
    ],
  },
  {
    id: 'multipot',
    kind: 'Multipot',
    what: 'Low-interaction catch-all: the bytes a client sent before anything answered',
    protocols: ['vnc', 'pop3', 'imap', 'docker', 'elasticsearch', 'socks5'],
    ports: [
      { proto: 'tcp', port: 5900 },
      { proto: 'tcp', port: 110 },
      { proto: 'tcp', port: 143 },
      { proto: 'tcp', port: 2375 },
      { proto: 'tcp', port: 9200 },
      { proto: 'tcp', port: 1080 },
    ],
    ingress: ['portbridge'],
    columns: [
      { header: 'event', field: 'event', mono: true },
      { header: 'protocol', field: 'proto', badge: 'info' },
      { header: 'client', field: 'client' },
    ],
    artefacts: [{ label: 'Captured bytes', field: 'data' }],
    tops: [
      { label: 'protocols', field: 'proto' },
      { label: 'client banners', field: 'client' },
      { label: 'passwords', field: 'password' },
    ],
    measures: [
      { label: 'handshakes', match: eq('event', 'handshake') },
      { label: 'auth attempts', match: eq('event', 'auth_attempt') },
      { label: 'commands', match: eq('event', 'command', 'http_request') },
    ],
  },
  {
    id: 'dionaea',
    kind: 'Dionaea',
    what: 'Service emulation: SMB, FTP, MSSQL, MySQL, SIP and PPTP exchanges, and the malware they drop',
    protocols: ['smb', 'sip', 'ftp', 'mssql', 'pptp', 'msrpc', 'mysql'],
    ports: [
      { proto: 'tcp', port: 445 },
      { proto: 'udp', port: 5060 },
      { proto: 'tcp', port: 21 },
      { proto: 'tcp', port: 1433 },
      { proto: 'tcp', port: 1723 },
      { proto: 'tcp', port: 135 },
      { proto: 'tcp', port: 3306 },
    ],
    ingress: ['portbridge'],
    columns: [
      { header: 'what', field: 'origin', mono: true },
      { header: 'protocol', field: ['connection.protocol'], badge: 'info' },
    ],
    artefacts: [{ label: 'Captured exchange', field: ['ftp', 'credentials', 'file', 'connection'] }],
    tops: [
      { label: 'services', field: 'connection.protocol' },
      { label: 'usernames', field: 'canonical_user' },
      { label: 'events', field: 'origin' },
    ],
    measures: [
      { label: 'SMB sessions', match: (f) => (f.connection as { protocol?: string } | undefined)?.protocol === 'smbd' },
      { label: 'logins tried', match: has('credentials') },
      { label: 'binaries captured', match: (_, t) => t === 'file.download' },
    ],
  },
  {
    id: 'cisco-asa-honeypot',
    kind: 'Cisco ASA',
    what: 'HTTP requests against an emulated Cisco ASA VPN portal, plus IKE on UDP 500',
    protocols: ['https', 'ike'],
    ports: [
      { proto: 'tcp', port: 8443 },
      { proto: 'udp', port: 500 },
    ],
    ingress: ['portbridge'],
    columns: [
      { header: 'request', field: ['path', 'url'], mono: true },
      { header: 'event', field: 'event', mono: true },
      { header: 'user agent', field: 'user_agent' },
    ],
    artefacts: [{ label: 'Headers', field: 'headers' }],
    tops: [
      { label: 'paths', field: 'path' },
      { label: 'user agents', field: 'user_agent' },
    ],
    measures: [
      { label: 'portal requests', match: eq('proto', 'https') },
      { label: 'IKE exchanges', match: eq('proto', 'ike') },
    ],
  },
  {
    ...CONPOT_SPEC,
    id: 'conpot',
    protocols: ['snmp', 'modbus', 's7comm', 'enip', 'bacnet', 'ipmi'],
    ports: [
      { proto: 'udp', port: 161 },
      { proto: 'tcp', port: 502 },
      { proto: 'tcp', port: 102 },
      { proto: 'tcp', port: 44818 },
      { proto: 'udp', port: 47808 },
      { proto: 'udp', port: 623 },
    ],
  },
  {
    id: 'sentrypeer',
    kind: 'SentryPeer',
    what: 'SIP / VoIP fraud probing: the SIP request exactly as it arrived',
    protocols: ['sip'],
    ports: [{ proto: 'udp', port: 5060 }],
    ingress: ['portbridge'],
    columns: [
      { header: 'method', field: 'sip_method', mono: true },
      { header: 'called number', field: 'called_number', mono: true },
      { header: 'user agent', field: ['sip_user_agent', 'user_agent'] },
    ],
    artefacts: [{ label: 'SIP message', field: 'sip_message' }],
    tops: [
      { label: 'methods', field: 'sip_method' },
      { label: 'called numbers', field: 'called_number' },
      { label: 'user agents', field: 'sip_user_agent' },
    ],
    measures: [
      { label: 'SIP requests', match: has('sip_method') },
      { label: 'call attempts (INVITE)', match: eq('sip_method', 'INVITE') },
    ],
  },
  {
    ...CONPOT_SPEC,
    id: 'conpot-kamstrup',
    what: 'Kamstrup smart-meter emulation: meter register reads and management-protocol commands',
    protocols: ['kamstrup_protocol', 'kamstrup_management_protocol'],
    ports: [
      { proto: 'tcp', port: 1025 },
      { proto: 'tcp', port: 50100 },
    ],
  },
  {
    id: 'hellpot',
    kind: 'HellPot',
    what: 'Tarpit: how long a crawler stayed and how many bytes it swallowed',
    protocols: ['http'],
    ports: [{ proto: 'tcp', port: 8090 }],
    ingress: ['traefik'],
    columns: [
      { header: 'request', field: ['path', 'URL'], mono: true },
      { header: 'bytes sent', field: 'BYTES' },
      { header: 'held for', field: 'DURATION' },
      { header: 'user agent', field: ['user_agent', 'USERAGENT'] },
    ],
    artefacts: [{ label: 'What the sensor recorded', field: 'message' }],
    tops: [
      { label: 'paths', field: 'path' },
      { label: 'user agents', field: 'user_agent' },
    ],
    measures: [
      { label: 'crawlers trapped', match: eq('message', 'NEW') },
      { label: 'sessions ended', match: has('BYTES') },
    ],
  },
  {
    ...CONPOT_SPEC,
    id: 'conpot-s7-1200',
    what: 'Siemens S7-1200 PLC emulation: S7comm and Modbus against a small controller',
    protocols: ['modbus', 's7comm'],
    ports: [
      { proto: 'tcp', port: 1502 },
      { proto: 'tcp', port: 1102 },
    ],
  },
  {
    ...CONPOT_SPEC,
    id: 'conpot-guardian',
    what: 'Guardian AST tank-gauge emulation: the fuel inventory commands a scanner sends',
    protocols: ['guardian_ast'],
    ports: [{ proto: 'tcp', port: 10001 }],
  },
  {
    ...CONPOT_SPEC,
    id: 'conpot-s7-1500',
    what: 'Siemens S7-1500 PLC emulation: S7comm and Modbus against a large controller',
    protocols: ['modbus', 's7comm'],
    ports: [
      { proto: 'tcp', port: 2502 },
      { proto: 'tcp', port: 2102 },
    ],
  },
  {
    ...CONPOT_SPEC,
    id: 'conpot-iec104',
    what: 'IEC 60870-5-104 substation emulation: telecontrol start/stop and interrogation commands',
    protocols: ['iec104'],
    ports: [{ proto: 'tcp', port: 2404 }],
  },
  {
    id: 'http-honeypot',
    kind: 'HTTP honeypot',
    what: 'Web honeypot behind the reverse proxy: landing pages, logins and exploit paths, with tarpitting',
    protocols: ['http'],
    ports: [{ proto: 'tcp', port: 8080 }],
    ingress: ['traefik'],
    columns: [
      { header: 'request', field: 'path', mono: true },
      { header: 'category', field: 'category', badge: 'info' },
      { header: 'status', field: 'status' },
      { header: 'user agent', field: 'user_agent' },
    ],
    artefacts: [{ label: 'Headers', field: 'headers' }],
    tops: [
      { label: 'paths', field: 'path' },
      { label: 'categories', field: 'category' },
      { label: 'hosts', field: 'host' },
    ],
    measures: [
      { label: 'requests', match: has('path') },
      { label: 'login attempts', match: eq('category', 'login') },
      { label: 'exploit attempts', match: eq('category', 'exploit') },
      { label: 'tarpitted', match: (f) => f.tarpitted === true },
    ],
  },
  {
    id: 'beelzebub',
    kind: 'Beelzebub',
    what: 'Multi-protocol deception: what the emulated service was asked for',
    protocols: ['http', 'ssh', 'tcp'],
    ports: [
      { proto: 'tcp', port: 8081 },
      { proto: 'tcp', port: 2224 },
      { proto: 'tcp', port: 3307 },
    ],
    ingress: ['portbridge'],
    columns: [
      { header: 'protocol', field: 'protocol', badge: 'info' },
      { header: 'request', field: 'path', mono: true },
      { header: 'status', field: 'status' },
    ],
    artefacts: [{ label: 'What the sensor recorded', field: 'event' }],
    tops: [
      { label: 'protocols', field: 'protocol' },
      { label: 'requests', field: 'path' },
    ],
    measures: [
      { label: 'HTTP requests', match: eq('protocol', 'HTTP') },
      { label: 'SSH commands', match: eq('protocol', 'SSH') },
    ],
  },
  {
    id: 'endlessh',
    kind: 'Endlessh',
    what: 'SSH tarpit: how long a client was held on a banner that never ends',
    protocols: ['ssh'],
    ports: [{ proto: 'tcp', port: 2222 }],
    ingress: ['portbridge'],
    columns: [
      { header: 'event', field: 'event', mono: true },
      { header: 'held for', field: 'held_ms' },
      { header: 'banner lines', field: 'lines' },
    ],
    artefacts: [],
    tops: [{ label: 'events', field: 'event' }],
    measures: [
      { label: 'clients trapped', match: eq('event', 'connect') },
      { label: 'clients released', match: eq('event', 'disconnect') },
    ],
  },
  {
    id: 'rdp-honeypot',
    kind: 'RDP honeypot',
    what: 'RDP: the credentials offered and the security protocols requested',
    protocols: ['rdp'],
    ports: [{ proto: 'tcp', port: 3389 }],
    ingress: ['portbridge'],
    columns: [
      { header: 'event', field: 'event', mono: true },
      { header: 'username', field: ['canonical_user', 'username'], mono: true },
      { header: 'password', field: 'canonical_pass', mono: true },
      { header: 'requested protocols', field: 'requested_protocols' },
    ],
    artefacts: [{ label: 'Captured exchange', field: 'data' }],
    tops: [
      { label: 'cookie usernames', field: 'username' },
      { label: 'requested protocols', field: 'requested_protocols' },
    ],
    measures: [
      { label: 'RDP connections', match: eq('event', 'connect') },
      { label: 'usernames offered', match: has('username') },
    ],
  },
  {
    id: 'tanner',
    kind: 'Snare/Tanner',
    what: 'Web application honeypot: requests classified by attack type (LFI, RFI, SQLi, XSS, command execution)',
    protocols: ['http'],
    ports: [{ proto: 'tcp', port: 80 }],
    ingress: ['traefik'],
    columns: [
      { header: 'request', field: 'path', mono: true },
      { header: 'detection', field: 'detection.name', badge: 'warning' },
      { header: 'status', field: 'status' },
    ],
    artefacts: [
      { label: 'Headers', field: 'headers' },
      { label: 'POST data', field: 'post_data' },
      { label: 'Cookies', field: 'cookies' },
      { label: 'Detection payload', field: 'detection' },
    ],
    tops: [
      { label: 'paths', field: 'path' },
      { label: 'detections', field: 'detection.name' },
      { label: 'user agents', field: 'headers.user-agent' },
    ],
    measures: [
      { label: 'requests', match: has('path') },
      { label: 'attacks detected', match: (f) => (f.detection as { name?: string } | undefined)?.name !== 'index' },
    ],
  },
  {
    id: 'citrix-honeypot',
    kind: 'Citrix ADC',
    what: 'HTTP requests against an emulated Citrix ADC gateway, including CVE-2019-19781 path traversal scans',
    protocols: ['https'],
    ports: [{ proto: 'tcp', port: 443 }],
    ingress: ['portbridge'],
    columns: [
      { header: 'request', field: ['path', 'url'], mono: true },
      { header: 'event', field: 'event', mono: true },
      { header: 'user agent', field: 'user_agent' },
    ],
    artefacts: [{ label: 'Headers', field: 'headers' }],
    tops: [
      { label: 'paths', field: 'path' },
      { label: 'JA4 fingerprints', field: 'canonical_fingerprint' },
    ],
    measures: [
      { label: 'requests', match: has('path') },
      { label: 'CVE-2019-19781 scans', match: (f) => String(f.path).includes('/vpns/') },
    ],
  },
  {
    id: 'api-honeypot',
    kind: 'API honeypot',
    what: 'Fake API surface: the calls made against it and the status each got',
    protocols: ['http'],
    ports: [{ proto: 'tcp', port: 8082 }],
    ingress: ['traefik'],
    columns: [
      { header: 'request', field: 'path', mono: true },
      { header: 'method', field: 'method', mono: true },
      { header: 'status', field: 'status' },
      { header: 'user agent', field: 'user_agent' },
    ],
    artefacts: [{ label: 'Headers', field: 'headers' }],
    tops: [
      { label: 'endpoints', field: 'path' },
      { label: 'user agents', field: 'user_agent' },
    ],
    measures: [
      { label: 'API calls', match: has('path') },
      { label: 'unauthorized (401/403)', match: (f) => f.status === 401 || f.status === 403 },
    ],
  },
  {
    id: 'dnp3',
    kind: 'DNP3',
    what: 'DNP3: the function codes requested against the emulated outstation',
    protocols: ['dnp3'],
    ports: [{ proto: 'tcp', port: 20000 }],
    ingress: ['portbridge'],
    columns: [
      { header: 'event', field: 'event', mono: true },
      { header: 'function', field: 'function', mono: true },
      { header: 'application function', field: 'app_function', mono: true },
    ],
    artefacts: [{ label: 'Raw frame', field: 'frame_hex' }],
    tops: [
      { label: 'link functions', field: 'function' },
      { label: 'application functions', field: 'app_function' },
    ],
    measures: [
      { label: 'frames', match: eq('event', 'frame') },
      { label: 'malformed frames', match: eq('event', 'malformed_frame') },
      { label: 'operate commands', match: (f) => String(f.app_function ?? '').includes('operate') },
    ],
  },
  {
    id: 'dns-honeypot',
    kind: 'DNS honeypot',
    what: 'DNS: the names queried and the record types asked for',
    protocols: ['dns'],
    ports: [
      { proto: 'udp', port: 53 },
      { proto: 'tcp', port: 53 },
    ],
    ingress: ['portbridge'],
    columns: [
      { header: 'query', field: 'query', mono: true },
      { header: 'type', field: 'qtype', badge: 'info' },
      { header: 'transport', field: 'proto' },
      { header: 'recursion', field: 'rd' },
    ],
    artefacts: [],
    tops: [
      { label: 'names', field: 'query' },
      { label: 'record types', field: 'qtype' },
    ],
    measures: [
      { label: 'queries', match: eq('event', 'query') },
      { label: 'ANY queries (amplification)', match: (f) => f.qtype === 255 },
    ],
  },
  {
    id: 'elasticpot',
    kind: 'Elasticpot',
    what: 'Elasticsearch emulation: the queries and URLs attackers sent',
    protocols: ['http'],
    ports: [{ proto: 'tcp', port: 9201 }],
    ingress: ['portbridge'],
    columns: [
      { header: 'url', field: 'url', mono: true },
      { header: 'event', field: 'eventid', mono: true },
    ],
    artefacts: [
      { label: 'Request', field: 'request' },
      { label: 'What the sensor recorded', field: 'message' },
    ],
    tops: [{ label: 'URLs', field: 'url' }],
    measures: [
      { label: 'recon requests', match: eq('eventid', 'elasticpot.recon') },
      { label: 'attacks', match: eq('eventid', 'elasticpot.attack') },
    ],
  },
  {
    id: 'mailoney',
    kind: 'Mailoney',
    what: 'SMTP: the envelopes and messages spammers and relay testers send',
    protocols: ['smtp'],
    ports: [{ proto: 'tcp', port: 25 }],
    ingress: ['portbridge'],
    columns: [
      { header: 'event', field: 'event', mono: true },
      { header: 'AUTH login', field: 'auth_user', mono: true },
      { header: 'command or message', field: ['command', 'body_preview'], mono: true },
      { header: 'size', field: 'body_size' },
    ],
    artefacts: [{ label: 'SMTP exchange', field: ['command', 'body_preview'] }],
    tops: [
      { label: 'senders', field: 'mail_from' },
      { label: 'recipients', field: 'rcpt_to' },
      { label: 'AUTH logins', field: 'auth_user' },
    ],
    measures: [
      { label: 'envelopes', match: eq('event', 'envelope') },
      { label: 'messages', match: eq('event', 'mail-body') },
      { label: 'AUTH PLAIN logins', match: (f) => f.logged_in === true },
    ],
  },
  {
    id: 'dicompot',
    kind: 'DICOMpot',
    what: 'DICOM: which application entities tried to talk to the emulated imaging node',
    protocols: ['dicom'],
    ports: [{ proto: 'tcp', port: 11112 }],
    ingress: ['portbridge'],
    columns: [
      { header: 'event', field: 'event', mono: true },
      { header: 'calling AE', field: 'calling_ae', mono: true },
      { header: 'called AE', field: 'called_ae', mono: true },
    ],
    artefacts: [],
    tops: [
      { label: 'operations', field: 'event' },
      { label: 'calling AEs', field: 'calling_ae' },
    ],
    measures: [
      { label: 'associations', match: eq('event', 'associate') },
      { label: 'queries (C-FIND)', match: eq('event', 'c_find') },
      { label: 'stores (C-STORE)', match: eq('event', 'c_store') },
    ],
  },
  {
    id: 'galah',
    kind: 'Galah',
    what: 'LLM-generated web responses: the full request received and the response served back',
    protocols: ['http'],
    ports: [
      { proto: 'tcp', port: 8888 },
      { proto: 'tcp', port: 8890 },
    ],
    ingress: ['portbridge'],
    columns: [
      { header: 'request', field: 'path', mono: true },
      { header: 'source', field: 'responseMetadata.generationSource', badge: 'info' },
      { header: 'user agent', field: 'user_agent' },
    ],
    artefacts: [
      { label: 'Request', field: 'httpRequest' },
      { label: 'Response served', field: 'httpResponse' },
    ],
    tops: [
      { label: 'paths', field: 'path' },
      { label: 'response source', field: 'responseMetadata.generationSource' },
    ],
    measures: [
      { label: 'responses generated', match: (f) => (f.responseMetadata as { generationSource?: string } | undefined)?.generationSource === 'llm' },
      { label: 'served from cache', match: (f) => (f.responseMetadata as { generationSource?: string } | undefined)?.generationSource === 'cache' },
    ],
  },
  {
    id: 'canarytokens',
    kind: 'Canarytokens',
    what: 'Canarytokens: which planted token fired, and what the trigger carried',
    protocols: ['http', 'dns'],
    ports: [],
    ingress: ['traefik'],
    columns: [
      { header: 'token type', field: 'token_type', badge: 'warning' },
      { header: 'channel', field: 'channel' },
      { header: 'memo', field: 'memo' },
    ],
    artefacts: [
      { label: 'Trigger data', field: 'src_data' },
      { label: 'Additional data', field: 'additional_data' },
    ],
    tops: [{ label: 'token types', field: 'token_type' }],
    measures: [{ label: 'tokens fired', match: has('token_type') }],
  },
  {
    id: 'suricata',
    kind: 'Suricata IDS',
    what: 'Network IDS on the edge: signature alerts over the traffic the portbridge forwards',
    protocols: ['tcp', 'udp'],
    ports: [],
    ingress: ['direct'],
    columns: [
      { header: 'signature', field: 'alert.signature' },
      { header: 'category', field: 'alert.category', badge: 'warning' },
      { header: 'protocol', field: 'app_proto', badge: 'info' },
    ],
    artefacts: [{ label: 'Alert', field: 'alert' }],
    tops: [
      { label: 'signatures', field: 'alert.signature' },
      { label: 'categories', field: 'alert.category' },
    ],
    measures: [
      { label: 'alerts', match: has('alert') },
      { label: 'exploit signatures', match: (f) => String((f.alert as { signature?: string } | undefined)?.signature ?? '').startsWith('ET EXPLOIT') },
    ],
  },
]

/** The catalog entry for one sensor, by its id. */
export const specOf = (sensor: string): SensorCatalogEntry | undefined => SENSOR_SPECS.find((s) => s.id === sensor)

/** How to read one sensor's own fields, for pages that show a single event. */
export function readingOf(sensor: string): SensorReading {
  const spec = specOf(sensor)
  return spec ? { what: spec.what, columns: spec.columns, artefacts: spec.artefacts } : { what: '', columns: [], artefacts: [] }
}
