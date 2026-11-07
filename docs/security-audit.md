# Security audit

**Audited:** commit `ebca330` (the code before these fixes), November 2026.
**Method:** six phases — map, hunt, challenge, record, verify, report — following
the structure Cloudflare published for its open-source security-audit skill. The
skill itself was not fetched into this environment, so this applies the published
method, not its exact prompts.

Every finding below that is marked confirmed has a test in
`test/security/audit.test.ts` that failed against the audited code and passes
against the fix (15 of 18 tests failed before; the other 3 are controls proving
the fixes do not break normal use).

## 1. Map — what can be reached from outside

| Surface | Auth before | Input |
|---|---|---|
| `GET /api/cron/preload` | bearer, **only if `CRON_SECRET` set** | header |
| `POST /api/preload/plan` | none | JSON body, any size |
| `GET, POST /api/rooms/[id]/events` | none | room id, JSON body, any size |
| `GET /api/rooms/[id]/stream` (SSE) | none | room id, `Last-Event-ID` |
| `POST /api/rooms/[id]/simulate` | none | room id, `actor` |
| `GET /api/policy` | none, read-only | — |
| `/_next/image` (framework) | none | `url`, `w`, `q` |
| `/embed/[handle]` | framed anywhere by design | handle, query options |
| Browser: `window.open(payLink)` | — | creator-supplied URL |
| `.github/workflows/preload-cron.yml` | `permissions: {}` | repository secrets |

## 2–3. Findings — hunted, then challenged

### Confirmed and fixed

| ID | Severity | Finding | Fix |
|---|---|---|---|
| F6 | **Critical** | Next.js 15.5.27 is affected by GHSA-2464-fhr4-w9xw, an unauthenticated RCE in the image optimiser. The app never uses `next/image`, but `/_next/image` was live: it answered 400 (parsed the request), not 404. Same release: GHSA-p3m5-59mp-jv5r (High, Server Actions DoS). Build-time: `source-map-js` GHSA-68fv-2mgg-jv7q (High). | Next 15.5.29; `source-map-js` pinned `^1.2.2`; `images.unoptimized` — `/_next/image` now returns 404. `pnpm audit --prod`: no known vulnerabilities. |
| F1 | **High** once a queue and gateway are configured | The preload cron **failed open**: with no `CRON_SECRET` it served anyone, listing queued item titles and, with a gateway, dispatching the queue on every call — as often as anyone liked, against real budgets. `.env.example` said Vercel sets the secret itself; it does not, which makes the open state the likely one. The comparison was not constant-time, and dispatches carried no idempotency key, so a retried cron, or the daily Vercel cron and the hourly workflow in the same window, could run the same work twice. | Refuses with 503 until `CRON_SECRET` is set; constant-time comparison; `idempotency-key: preload:<item>:<window hour>` on every dispatch; corrected `.env.example` and README. |
| F2 | **Medium** | Rooms could be used to exhaust an instance's memory. Every request created a room for any id it named — reads included — with no limit on how many; event payloads, `actor` and `runId` had no size limit; bodies were read whole at any size. | Room ids must be short plain names (else 404); reading never creates a room; at most 200 rooms per instance, evicting the idlest unwatched one; payloads ≤ 16 KB, identity fields ≤ 128 chars; bodies ≤ 256 KB, refused while streaming rather than after. |
| F3 | **Medium–Low** | `POST /api/preload/plan` accepted any size of queue, unauthenticated, and plans in items × candidates time. 5,000 items with *no* candidates already took 344 ms. | Bodies ≤ 256 KB (streamed); ≤ 500 items, 200 candidates, 200 nodes; 413 otherwise. |
| F5 | **Low** | The embed snippet interpolated the "your deployment" value as typed into an `<iframe src="…">`. Self-inflicted only (the creator types it and pastes it into their own site). | The value is parsed and reduced to its origin; an invalid one says so and the snippet uses a placeholder. |

### Hardened — exploitability not confirmed (needs validation)

| ID | Finding | What the challenge showed | Change |
|---|---|---|---|
| F4 | A creator's payment link went to `window.open` unvalidated, so a `javascript:` or `data:` URL would reach a browser. | In Chromium, a `javascript:` link opened with `noopener` did **not** run (proof of concept: the popup stayed `about:blank`). Firefox and Safari were not available to test. In this build a profile lives only in its creator's browser, so there is no path from one person to another today; once profiles are served by the gateway there will be. | `https:` only — no credentials, host required — checked where it is typed (with a message) and again where it is opened. |

### Accepted for the preview — must change before production

- **Rooms have no authentication.** Anyone can publish into any room and put any
  name in `actor`; `/simulate` is an unauthenticated three-second function, which
  is cheap to call and costs compute. There is no identity system in this preview
  to check against. Production needs membership-checked writes, `actor` taken from
  the session rather than the body, and rate limits backed by a shared store.
- **No Content-Security-Policy for scripts.** Rendering is safe as written — React
  escapes every value, and the only two `dangerouslySetInnerHTML` uses are static
  theme scripts — but there is no second line of defence. A nonce-based CSP needs
  middleware and should land before the app handles a real key.
- **No rate limiting** on any route. That is a platform or edge concern (WAF, or
  limits backed by Redis) rather than something one instance can enforce.

### Rejected — challenged, and did not hold

- **SSE frame injection.** The event type is an allow-listed value, the id is a
  number, and the data is JSON-encoded, which escapes newlines; a frame cannot be
  forged.
- **Prototype pollution through payloads.** Payloads are stored as parsed JSON and
  never merged into another object.
- **XSS through supporter names, messages or replies.** React escapes them; there
  is no HTML sink in their path.
- **The GitHub workflow.** `permissions: {}`, secrets passed as environment
  variables, no untrusted event data in the shell.
- **Committed secrets.** None in tracked files (a scan for common key formats;
  `.env.example` holds names only).
- **SSRF in the cron.** Every URL it fetches comes from environment variables.
- **The theme scripts.** They accept only `light` or `dark` from storage or the
  query string.
- **A policy-guard bypass through `/api/preload/plan`.** Its output is advisory;
  it executes nothing. The guard that matters runs in the gateway, at dispatch.

## 5. Verification

- `test/security/audit.test.ts`: 18 tests; 15 failed against the audited code and
  all 18 pass after the fixes.
- Against a production build:

  | Probe | Before | After |
  |---|---|---|
  | `GET /_next/image?url=/icon.svg&w=64&q=75` | 400 (optimiser live) | 404 |
  | `GET /api/cron/preload`, no secret configured | ran | 503 |
  | `GET /api/rooms/UPPER/events` | created a room | 404 |
  | `GET /api/rooms/fresh-probe/events` | created a room | empty, nothing created |
  | `POST /api/preload/plan`, 1 MB body | read and planned | 413 |

## Not covered

The gateway, the vault and the node agent are not in this repository, so the
guard at dispatch, credential storage and node signing were not audited here.
