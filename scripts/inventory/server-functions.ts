// Inventory of the canonical dashboard's server functions (#2): every
// createServerFn in the pinned source, with its method, input and output,
// the backend endpoints it calls, the permission it enforces, and who calls
// it (and whether from a route loader). Read from the source with the
// TypeScript compiler, never by hand.
//
//   bun scripts/inventory/server-functions.ts <canonical frontend-next dir>
//
// The directory is the pinned tree, e.g. from
//   git -C APIARY archive 62ee45d arcane/home/honeypot-dashboard/frontend-next | tar -x -C /tmp/canon
// Writes docs/migration/server-functions.json and server-functions.md.
import { readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'

export type ServerFn = {
  id: string
  name: string
  file: string
  line: number
  method: 'GET' | 'POST'
  input: string
  output: string
  backend: string[]
  /** public: pre-authentication (src/lib/auth.ts); session: the global
   * middleware only; session+: also re-checked in the handler; admin: the
   * handler refuses anyone but an admin. */
  permission: 'public' | 'session' | 'session+' | 'admin'
  callers: Array<{ file: string; in: string }>
  loader: boolean
  /** The fields of the output type, as declared (one level into arrays of
   * a named type: `rows[].ip`). */
  fields: string[]
}

const root = process.argv[2]
if (import.meta.main && !root) {
  console.error('usage: bun scripts/inventory/server-functions.ts <canonical frontend-next dir>')
  process.exit(1)
}

function sources(dir: string): string[] {
  return readdirSync(dir).sort().flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith('.d.ts') && name !== 'routeTree.gen.ts' ? [path] : []
  })
}

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()

/** A backend path as written: template holes become `{…}`. */
function pathOf(arg: ts.Expression, file: ts.SourceFile): string | undefined {
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) return arg.text
  if (ts.isTemplateExpression(arg)) {
    const hole = (e: ts.Expression) => {
      const text = oneLine(e.getText(file)).replace(/encodeURIComponent\((.*)\)/, '$1')
      // A URLSearchParams spelled out is the query string.
      return /\.toString\(\)$/.test(text) ? 'query' : text.replace(/^(data|params|input)\./, '')
    }
    return arg.head.text + arg.templateSpans.map((s) => `{${hole(s.expression)}}${s.literal.text}`).join('')
  }
  return undefined
}

const BACKEND_CALLS = new Set(['serviceJSON', 'serviceJSONResult', 'serviceFetch'])

type Scan = { backend: Set<string>; admin: boolean; session: boolean; calls: Set<string> }

/** Backend calls, permission checks and same-file helper calls in a body. */
function scan(node: ts.Node, file: ts.SourceFile): Scan {
  const out: Scan = { backend: new Set(), admin: false, session: false, calls: new Set() }
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n)) {
      const callee = n.expression.getText(file)
      const name = callee.split('.').pop() ?? callee
      const first = n.arguments.at(0)
      if (BACKEND_CALLS.has(name) && first) {
        const path = pathOf(first, file) ?? `‹${oneLine(first.getText(file)).slice(0, 40)}›`
        const text = n.getText(file)
        const verb = name === 'serviceFetch' ? (/method:\s*'(\w+)'/.exec(text)?.[1] ?? 'GET') : 'GET'
        const mounted = /mounted:\s*true/.test(text) ? ' (mounted)' : ''
        out.backend.add(`${verb} ${path}${mounted}`)
      } else if (ts.isIdentifier(n.expression)) {
        out.calls.add(n.expression.text)
      }
      if (name === 'getSessionUser') out.session = true
    }
    if (ts.isBinaryExpression(n) && /role\s*!==?\s*'admin'/.test(n.getText(file))) out.admin = true
    ts.forEachChild(n, visit)
  }
  visit(node)
  return out
}

/** Follows calls to functions declared in the same file, a few levels deep. */
function scanDeep(node: ts.Node, file: ts.SourceFile, helpers: Map<string, ts.Node>, depth = 3, seen = new Set<string>()): Scan {
  const own = scan(node, file)
  if (depth === 0) return own
  for (const name of own.calls) {
    const helper = helpers.get(name)
    if (!helper || seen.has(name)) continue
    seen.add(name)
    const inner = scanDeep(helper, file, helpers, depth - 1, seen)
    inner.backend.forEach((b) => own.backend.add(b))
    own.admin ||= inner.admin
    own.session ||= inner.session
  }
  return own
}

/** The chain createServerFn(...).validator(...).handler(...) around a call. */
function chainOf(call: ts.CallExpression) {
  let top: ts.Node = call
  const links: Partial<Record<string, ts.CallExpression>> = {}
  while (ts.isPropertyAccessExpression(top.parent) && ts.isCallExpression(top.parent.parent)) {
    links[top.parent.name.text] = top.parent.parent
    top = top.parent.parent
  }
  return { top, links }
}

const ROUTE_OPTIONS = new Set(['loader', 'beforeLoad', 'loaderDeps', 'component', 'head', 'pendingComponent', 'errorComponent', 'notFoundComponent', 'validateSearch'])
const isFunction = (n: ts.Node | undefined) => !!n && (ts.isArrowFunction(n) || ts.isFunctionExpression(n))

/** Where a reference sits: the route option, or the nearest named function
 * (a component, hook or helper) it is inside. */
function contextOf(node: ts.Node, file: ts.SourceFile): { in: string; loader: boolean } {
  let loader = false
  let label = ''
  // Parents are typed as always present; the source file's is not.
  for (let n = node.parent as ts.Node | undefined; n; n = n.parent as ts.Node | undefined) {
    if ((ts.isPropertyAssignment(n) || ts.isMethodDeclaration(n)) && ROUTE_OPTIONS.has(n.name.getText(file))) {
      const key = n.name.getText(file)
      if (['loader', 'beforeLoad', 'loaderDeps'].includes(key)) loader = true
      label ||= key
    }
    if (ts.isFunctionDeclaration(n) && n.name) label ||= n.name.text
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && isFunction(n.initializer)) label ||= n.name.text
  }
  return { in: label || 'module', loader }
}

/** The names a file imports from each module it imports, resolved to
 * source paths relative to the tree: local name → [module, imported name]. */
function importsOf(file: ts.SourceFile, rel: string, known: Set<string>): Map<string, { module: string; name: string }> {
  const out = new Map<string, { module: string; name: string }>()
  const dir = rel.split('/').slice(0, -1)
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    const spec = statement.moduleSpecifier.text
    if (!spec.startsWith('.')) continue
    const parts = [...dir]
    for (const segment of spec.split('/')) {
      if (segment === '..') parts.pop()
      else if (segment !== '.') parts.push(segment)
    }
    const base = parts.join('/')
    const module = [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find((candidate) => known.has(candidate))
    const bindings = statement.importClause?.namedBindings
    if (!module || !bindings || !ts.isNamedImports(bindings)) continue
    for (const element of bindings.elements) out.set(element.name.text, { module, name: (element.propertyName ?? element.name).text })
  }
  return out
}

export function inventory(dir: string): ServerFn[] {
  const files = sources(join(dir, 'src'))
  // One program over the tree, so the checker can infer what each handler
  // returns. Packages are not installed there: their types read as any,
  // which only matters where a handler returns a package's type.
  const program = ts.createProgram(files, { jsx: ts.JsxEmit.Preserve, strict: true, noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, types: [] })
  const checker = program.getTypeChecker()
  const parsed = files.map((path) => ({ path, rel: relative(dir, path), file: program.getSourceFile(path)! }))
  const fns: Array<ServerFn & { node: ts.Node; handler?: ts.SignatureDeclaration }> = []

  /** What a handler resolves to, unwrapped from its Promise. */
  const resolved = (fn: ts.SignatureDeclaration): ts.Type | undefined => {
    const signature = checker.getSignatureFromDeclaration(fn)
    if (!signature) return undefined
    const type = checker.getReturnTypeOfSignature(signature)
    return checker.getAwaitedType(type) ?? type
  }
  const inferred = (fn: ts.SignatureDeclaration) => {
    const type = resolved(fn)
    return type ? oneLine(checker.typeToString(type, fn, ts.TypeFormatFlags.NoTruncation)).slice(0, 120) : '—'
  }
  /** Field paths of a type: object members, arrays as `name[]`, union
   * members merged, null dropped; nested objects one level deep. */
  const fieldsOf = (type: ts.Type, at: ts.Node, depth: number): string[] => {
    const plain = checker.getNonNullableType(type)
    if (plain.isUnion()) return [...new Set(plain.types.flatMap((t) => fieldsOf(t, at, depth)))]
    if (checker.isArrayType(plain)) {
      const element = checker.getTypeArguments(plain as ts.TypeReference).at(0)
      return element ? fieldsOf(element, at, depth).map((f) => `[].${f}`) : []
    }
    if (!(plain.flags & ts.TypeFlags.Object) || checker.getIndexInfosOfType(plain).length) return []
    return checker.getPropertiesOfType(plain).flatMap((prop) => {
      const propType = checker.getTypeOfSymbolAtLocation(prop, at)
      const inner = depth > 0 ? fieldsOf(propType, at, depth - 1) : []
      return inner.length ? inner.map((f) => (f.startsWith('[]') ? `${prop.name}${f}` : `${prop.name}.${f}`)) : [prop.name]
    })
  }

  for (const { rel, file } of parsed) {
    const helpers = new Map<string, ts.Node>()
    ts.forEachChild(file, (n) => {
      if (ts.isFunctionDeclaration(n) && n.name) helpers.set(n.name.text, n)
      if (ts.isVariableStatement(n)) for (const d of n.declarationList.declarations) if (ts.isIdentifier(d.name) && d.initializer) helpers.set(d.name.text, d.initializer)
    })
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'createServerFn') {
        const { top, links } = chainOf(n)
        const holder = top.parent
        const name = ts.isVariableDeclaration(holder) && ts.isIdentifier(holder.name) ? holder.name.text : ts.isPropertyAssignment(holder) ? holder.name.getText(file) : '(inline)'
        const options = n.arguments.at(0)
        const method = options && /method:\s*'POST'/.test(options.getText(file)) ? 'POST' : 'GET'
        const validator = links.validator ?? links.inputValidator
        const vfn = validator?.arguments.at(0)
        const input = vfn && (ts.isArrowFunction(vfn) || ts.isFunctionExpression(vfn)) && vfn.parameters.at(0)?.type ? oneLine(vfn.parameters.at(0)!.type!.getText(file)) : validator ? oneLine(validator.arguments.at(0)?.getText(file) ?? '').slice(0, 60) : '—'
        const handler = links.handler?.arguments.at(0)
        const fnNode = handler && (ts.isArrowFunction(handler) || ts.isFunctionExpression(handler)) ? handler : undefined
        const ret = fnNode?.type ? oneLine(fnNode.type.getText(file)).replace(/^Promise<(.*)>$/, '$1') : fnNode ? inferred(fnNode) : '—'
        const found = handler ? scanDeep(handler, file, helpers) : { backend: new Set<string>(), admin: false, session: false }
        const permission = rel === 'src/lib/auth.ts' ? 'public' : found.admin ? 'admin' : found.session ? 'session+' : 'session'
        fns.push({ id: `${rel}#${name}`, name, file: rel, line: file.getLineAndCharacterOfPosition(n.getStart(file)).line + 1, method, input, output: ret, backend: [...found.backend].sort(), permission, callers: [], loader: false, fields: [], node: holder, handler: fnNode })
      }
      ts.forEachChild(n, visit)
    }
    visit(file)
  }

  // Callers: every other reference to the function's name, in its own file
  // or in a file that imports it.
  const known = new Set(parsed.map((p) => p.rel))
  const importMaps = new Map(parsed.map(({ rel, file }) => [rel, importsOf(file, rel, known)]))
  for (const fn of fns) {
    if (fn.name === '(inline)') continue
    for (const { rel, file } of parsed) {
      // The local name this file knows the function by, if it can see it.
      const local = rel === fn.file ? fn.name : [...importMaps.get(rel)!].find(([, from]) => from.module === fn.file && from.name === fn.name)?.[0]
      if (!local) continue
      const visit = (n: ts.Node) => {
        if (ts.isIdentifier(n) && n.text === local && !(ts.isVariableDeclaration(n.parent) && n.parent.name === n) && !ts.isImportSpecifier(n.parent) && !ts.isExportSpecifier(n.parent) && !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n)) {
          const where = contextOf(n, file)
          if (!fn.callers.some((c) => c.file === rel && c.in === where.in)) fn.callers.push({ file: rel, in: where.in })
          fn.loader ||= where.loader
        }
        ts.forEachChild(n, visit)
      }
      visit(file)
    }
  }
  for (const fn of fns) {
    const type = fn.handler ? resolved(fn.handler) : undefined
    const fields = type && fn.handler ? fieldsOf(type, fn.handler, 2) : []
    fn.fields = fields.length > 60 ? [...fields.slice(0, 60), `… ${fields.length - 60} more`] : fields
  }
  return fns.map(({ node: _, handler: __, ...fn }) => fn).sort((a, b) => a.id.localeCompare(b.id))
}

const PERMISSION: Record<ServerFn['permission'], string> = {
  public: 'public: works before sign-in (the root guard resolves the session with it)',
  session: 'session: the global middleware (same-origin check, then a session)',
  'session+': 'session+: the global middleware, and the handler checks the session again',
  admin: 'admin: the global middleware, and the handler refuses anyone but an admin',
}

export function renderInventory(fns: ServerFn[], sliceOf: (fn: ServerFn) => string = () => '—', ownersOf: (fn: ServerFn) => string[] = () => []): string {
  const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/</g, '&lt;')
  const byFile = new Map<string, ServerFn[]>()
  for (const f of fns) byFile.set(f.file, [...(byFile.get(f.file) ?? []), f])
  const count = (p: ServerFn['permission']) => fns.filter((f) => f.permission === p).length
  const lines = [
    '# Server functions',
    '',
    `Every \`createServerFn\` of the canonical dashboard (\`Xore/APIARY@62ee45d\`), read from the source by \`scripts/inventory/server-functions.ts\`. Data: \`server-functions.json\`. The rewrite deliberately consolidates route-local functions behind \`src/data/queries.ts\`; **Rewrite owner** names the destination seam and type mapper. Every query has a live adapter: \`LIVE\` in \`src/data/api.ts\` implements the whole contract.`,
    '',
    `**${fns.length} functions** in ${byFile.size} files: ${fns.filter((f) => f.method === 'GET').length} GET, ${fns.filter((f) => f.method === 'POST').length} POST; ${fns.filter((f) => f.loader).length} called from a route loader.`,
    '',
    '**Security owner.** Every function runs behind the global function middleware in `src/start.ts`: a same-origin check (CSRF, #3109), then a session (`sessionGate.server.ts`); only `src/lib/auth.ts` is exempt from the session part. On top of that:',
    '',
    ...(['public', 'session', 'session+', 'admin'] as const).map((p) => `- ${PERMISSION[p]} (${count(p)})`),
    '',
  ]
  const uncalled = fns.filter((f) => f.callers.length === 0)
  if (uncalled.length) {
    lines.push('## Findings', '', 'Declared but called from nowhere in the source, so not carried over unless a caller turns up:', '', ...uncalled.map((f) => `- \`${f.file}#${f.name}\` (L${f.line})`), '')
  }
  for (const [file, list] of byFile) {
    lines.push(`## \`${file}\``, '', '| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |', '|---|---|---|---|---|---|---|---|')
    for (const f of list) {
      const callers = f.callers.map((c) => `${c.file === f.file ? '' : `\`${c.file.replace(/^src\//, '')}\` `}${c.in}`).join('; ')
      lines.push(`| \`${cell(f.name)}\` (L${f.line}) | ${f.method} | ${cell(f.input)} → ${cell(f.output)} | ${f.backend.map((b) => `\`${cell(b)}\``).join('<br>') || '—'} | ${f.permission} | ${cell(callers) || '—'}${f.loader ? ' **(loader)**' : ''} | ${ownersOf(f).map((owner) => `\`${owner}\``).join('<br>') || '—'} | ${sliceOf(f)} |`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

if (import.meta.main) {
  const fns = inventory(root)
  const out = join(import.meta.dirname, '..', '..', 'docs/migration')
  writeFileSync(join(out, 'server-functions.json'), `${JSON.stringify(fns, null, 2)}\n`)
  writeFileSync(join(out, 'server-functions.md'), renderInventory(fns))
  console.log(`${fns.length} server functions in ${new Set(fns.map((f) => f.file)).size} files`)
}
