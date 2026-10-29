// Runs after every build: fails the build (so nothing is deployed) if the files the public
// downloads contain a secret, a source map, or any browser setting other than the two public ones.
import fs from 'node:fs'
import path from 'node:path'

const dist = path.resolve(process.argv[2] ?? 'dist')

const SECRETS = [
  ['Stripe secret key', /\b[sr]k_(live|test)_[0-9A-Za-z]{10,}/],
  ['Stripe webhook secret', /\bwhsec_[0-9A-Za-z]{10,}/],
  ['Supabase secret key', /\bsb_secret_[0-9A-Za-z_-]{10,}/],
  ['Supabase service role key', /service_role/],
  ['Resend API key', /\bre_[0-9A-Za-z]{8,}_[0-9A-Za-z]{8,}/],
  ['Twilio account SID', /\bAC[0-9a-f]{32}\b/],
  ['Twilio key', /\bSK[0-9a-f]{32}\b/],
  ['Signed token (JWT)', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\./],
  ['Database address', /postgres(ql)?:\/\/[^\s"'`]+@/],
  ['Private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['AWS key', /\bAKIA[0-9A-Z]{16}\b/],
  ['GitHub token', /\bgh[pousr]_[0-9A-Za-z]{30,}/],
  ['Server-only setting name', /\b(STRIPE_SECRET_KEY|RESEND_API_KEY|TWILIO_AUTH_TOKEN|SUPABASE_SERVICE_ROLE_KEY)\b/],
]
// The only settings allowed in browser code: the Supabase address and its publishable key
const ALLOWED_ENV = new Set(['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'])

const problems = []
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) { walk(file); continue }
    const name = path.relative(dist, file)
    if (name.endsWith('.map')) { problems.push(`${name}: source map file`); continue }
    if (!/\.(js|mjs|css|html|json|txt|xml|svg|webmanifest)$/.test(name)) continue
    const text = fs.readFileSync(file, 'utf8')
    if (/sourceMappingURL=/.test(text)) problems.push(`${name}: points to a source map`)
    for (const [label, re] of SECRETS) if (re.test(text)) problems.push(`${name}: looks like a ${label}`)
    for (const m of text.matchAll(/\bVITE_[A-Z0-9_]+/g)) if (!ALLOWED_ENV.has(m[0])) problems.push(`${name}: browser setting ${m[0]}`)
  }
}

if (!fs.existsSync(dist)) { console.error(`check-bundle: ${dist} not found`); process.exit(1) }
walk(dist)
if (problems.length) {
  console.error('check-bundle: the build was stopped because the public files may expose secrets:')
  for (const p of [...new Set(problems)]) console.error('  - ' + p)
  process.exit(1)
}
console.log('check-bundle: no secrets or source maps in the public files')
