# Implementation plan: ElevenLabs voice line + proactive calls

June's phone interface: inbound calls answered by an ElevenLabs agent over Twilio, server tool webhooks backed by our existing services, proactive outbound alert calls, and post-call persistence. Every decision below was settled in a design session on 2026-09-19; do not relitigate them mid-implementation.

**Read first:** `CONTEXT.md` (glossary — use its terms in code and comments), `docs/adr/0001-server-side-conversation-keyed-tool-gating.md`, `docs/adr/0002-single-agent-full-pin-gate-both-directions.md`.

**How to execute:** each milestone below is sized for one coding-agent task. Give the agent: this file, the milestone section, and the "Wire facts" + "Conventions" sections. Dependency graph:

```
M0 (human) ──────────────────────────────┐
M1 ─┬─ M2 ─┐                             │
    ├─ M3 ─┼─ M5 ─┬─ M7 (needs M0 done) ─┘
    └─ M4 ─┘      │
        M6 ───────┘   (M6 only needs M1 + this doc's contracts; can run parallel with M2–M5)
```

**Acceptance for every code milestone:** `pnpm check-types` passes, `pnpm test` passes, oxlint stays clean, no new dependencies (everything uses plain `fetch`, `node:crypto`, existing `zod`/`bcryptjs`/`drizzle`). Match surrounding code style (integer cents, ISO date strings, `@steelhacks-2026/*` imports, services take `db: Database` as first arg).

---

## Locked decisions (summary)

1. **PIN gating (ADR-0001):** sessions start unverified; every tool except `verify_pin` requires `call_session.verified`, checked server-side. 3 failed attempts → `pin_locked` activity (caretaker-visible), session locked for the rest of the call, no persistent lockout.
2. **Outbound calls have the same full PIN gate (ADR-0002).** One agent for both directions.
3. **Unknown caller:** polite refusal, June ends the call. No phone-based fallback login.
4. **Tool surface (exactly 9):** `verify_pin`, `get_balance`, `get_upcoming_bills`, `get_recent_transactions`, `check_affordability`, `get_budgets`, `propose_change`, `confirm_change`, `flag_transaction`. No `log_expense`, no `get_change_request_status`.
5. **Permission tiers unchanged:** voice changes go through the existing `changeRequests.propose`/`confirm` service; existing tier defaults stay as-is (budget_increase remains `instant_notify`).
6. **Alert dedupe — per-type semantic keys:**
   - `shortfall` → `${memberId}:shortfall:${nextIncomeDate ?? projectedDate}`
   - `bill_due_unfunded` → `${memberId}:bill:${recurringStreamId}:${dueDate}`
   - `unusual_txn` → `${memberId}:unusual:${transactionId}`
   - `deposit_arrived` → `${memberId}:deposit:${transactionId}`
7. **flag_transaction reuses the alert flow:** inserts `alert_sent` (`ruleType: "unusual_txn"`, the semantic dedupe key above, `channel: "call"`, `status: "skipped"` — member obviously already knows) + caretaker-visible `activity_log` (`type: "alert_sent"`) + `notifyCaretakers`. Shared dedupe key means June never proactively calls about a charge the member already reported.
8. **Post-call:** new `transcript` jsonb column on `call_session`; store summary + trimmed transcript; caretaker feed surfaces the summary only.
9. **Agent config as code:** `docs/agent-tools.json` + `docs/june-prompt.md` are source of truth; `sync-agent` script pushes both via the ElevenLabs API.
10. **Cron:** Vercel Hobby allows daily cron only → `vercel.json` daily crons + `CRON_SECRET`-protected endpoints hit manually (curl) during the demo.
11. **Demo caller ID:** seed reads optional `DEMO_MEMBER_PHONE` for Dot's `phoneE164`.

---

## Wire facts (verified against ElevenLabs docs, Sept 2026)

Product is "Agents Platform" but REST paths still use `/v1/convai/...`. Auth header for our API calls: `xi-api-key: <ELEVENLABS_API_KEY>`.

### Conversation initiation webhook (inbound Twilio calls)

ElevenLabs POSTs JSON to our URL: `{ caller_id, agent_id, called_number, call_sid, conversation_id }` (all strings). Expected 200 response:

```json
{
  "type": "conversation_initiation_client_data",
  "dynamic_variables": { "any": "string values" },
  "conversation_config_override": {
    "agent": { "first_message": "...", "prompt": { "prompt": "..." } }
  }
}
```

`dynamic_variables` must include **every** dynamic variable the agent prompt references. Each override field must be allow-listed in the agent's Security tab (M0). Note the double nesting for system-prompt overrides (`agent.prompt.prompt`); we only override `first_message`.

### Server tool webhooks

ElevenLabs calls the configured URL/method with our configured headers, path/query params substituted, and JSON body per `request_body_schema`. No response envelope is mandated — return plain JSON; the LLM reads it. Body param properties each have exactly one value source: `description` (LLM supplies), `dynamic_variable` (platform injects — we use `"system__conversation_id"`), or `constant_value`. Default `response_timeout_secs` 20 (range 5–300).

### Post-call webhook

Header `elevenlabs-signature: t=<unix_seconds>,v0=<hex>`. Verify: reject if `t` older than 30 min; compute HMAC-SHA256 over `` `${t}.${rawBody}` `` with `ELEVENLABS_WEBHOOK_SECRET`, hex-encode, timing-safe compare against `v0=<hex>` part. Event types: `post_call_transcription` (has `data.conversation_id`, `data.transcript[]` with `{role: "agent"|"user", message, time_in_call_secs, ...}`, `data.analysis.transcript_summary`, `data.metadata.call_duration_secs`, dynamic vars under `data.conversation_initiation_client_data.dynamic_variables`), `post_call_audio` (ignore), `call_initiation_failure` (`failure_reason: "busy"|"no-answer"|"unknown"`). Always return 200 quickly (10+ consecutive failures auto-disables the webhook).

### Outbound call

`POST https://api.elevenlabs.io/v1/convai/twilio/outbound-call` body:

```json
{
  "agent_id": "...",
  "agent_phone_number_id": "...",
  "to_number": "+1...",
  "conversation_initiation_client_data": {
    "dynamic_variables": { "...": "..." },
    "conversation_config_override": { "agent": { "first_message": "..." } }
  }
}
```

200 response: `{ "success": bool, "message": str, "conversation_id": str|null, "callSid": str|null }` — note camelCase `callSid`. Because we pass initiation data here, **the init webhook does not fire for outbound calls** — we create the `call_session` at placement time.

### Tools / agent config API (used by the sync script)

- `GET /v1/convai/tools` → list; `POST /v1/convai/tools` body `{ "tool_config": {...} }` → `{ id, ... }`; `PATCH /v1/convai/tools/{tool_id}` same body.
- `GET /v1/convai/agents/{agent_id}`; `PATCH /v1/convai/agents/{agent_id}` with `{ "conversation_config": { "agent": { "prompt": { "prompt": "<system prompt>", "tool_ids": ["..."] }, "first_message": "...", "language": "en" } } }`. Fetch-then-merge: PATCH the whole `prompt` object, preserving fields you're not changing (e.g. `llm`). Inline `prompt.tools` is deprecated — use `tool_ids`.

---

## Conventions (all milestones)

- **Tool response contract:** every tool webhook returns HTTP 200 with either `{ "ok": true, ...fields }` or `{ "ok": false, "error": "<short sentence June can speak or act on>" }`. Never 4xx/5xx for business errors — the LLM handles them better as readable JSON.
- **Speech-ready money:** every dollar amount in tool responses is a string produced by `formatCentsForSpeech()` from `@steelhacks-2026/finance` (field suffix `_spoken`); include the raw `*_cents` integer alongside only when the agent might need to pass it back.
- **Secret header for init + tools routes:** `x-voice-secret: <ELEVENLABS_TOOL_SECRET>`, compared with `crypto.timingSafeEqual`. Wrong/missing secret → 401 (these are transport-auth failures, not business errors).
- **Session resolution:** tools receive `conversation_id` in the body via the platform-injected `system__conversation_id` dynamic variable — never as an LLM-supplied param. Resolve via `getSessionByConversationId`; no session → `{ ok: false, error: "No active call session." }`.
- **New env vars** (added in M1): `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_PHONE_NUMBER_ID`, `ELEVENLABS_TOOL_SECRET`, `ELEVENLABS_WEBHOOK_SECRET`, `CRON_SECRET`, `DEMO_MEMBER_PHONE`. All optional in the schema (so `pnpm dev` boots without them); routes that need a missing one return 500 with a clear message.

---

## M0 — Human provisioning checklist (you, not an agent)

Nothing is provisioned yet. Items marked ⏳ can happen while agents run M1–M6; items marked 🔚 need the deployed URL and the sync script, so they come after M5/M6 ship.

1. ⏳ **Secrets:** generate `ELEVENLABS_TOOL_SECRET` and `CRON_SECRET` (`openssl rand -hex 32` each); put them in `apps/web/.env`.
2. ⏳ **ElevenLabs account** (Creator tier or above recommended — Twilio integration requires a paid plan). Create an API key → `ELEVENLABS_API_KEY`.
3. ⏳ **Create the agent** in the ElevenLabs dashboard (blank is fine — the sync script will configure prompt/tools; pick the voice + set TTS speed ~0.9 in the dashboard). Record `ELEVENLABS_AGENT_ID`.
4. ⏳ **Twilio:** create account, buy a local number (~$1.15/mo + per-minute). Record Account SID + Auth Token.
5. ⏳ **Import the number into ElevenLabs:** dashboard → Phone Numbers → import with number + Twilio SID/token; assign the June agent for inbound. Record `ELEVENLABS_PHONE_NUMBER_ID` (visible in the dashboard/API).
6. ⏳ **`DEMO_MEMBER_PHONE`:** set to the E.164 of the phone you'll demo from (e.g. `+1412XXXXXXX`).
7. ⏳ **Deploy to Vercel** (repo already has `vercel.json` + `scripts/sync-vercel-env.ts`): `pnpm env:production` to push env, deploy, note the stable URL (`BASE_URL` below). For local-tunnel dev instead: `cloudflared tunnel --url http://localhost:3001` and use that URL.
8. 🔚 **Run `pnpm db:push` then `pnpm db:seed`** (after M1 merges — seed now uses `DEMO_MEMBER_PHONE`).
9. 🔚 **Run the sync script** (after M6): `pnpm --filter web sync:agent -- --base-url https://<BASE_URL>` — creates/updates the 9 tools and patches the agent prompt.
10. 🔚 **Dashboard-only wiring** (not exposed via the sync API):
    - Agent → Security tab: enable **"Fetch conversation initiation data"**, set URL `https://<BASE_URL>/api/elevenlabs/init`; enable the **first_message override** in the overrides allow-list.
    - Workspace → Webhooks: add post-call webhook `https://<BASE_URL>/api/elevenlabs/post-call`, event `post_call_transcription` + `call_initiation_failure`; record the signing secret → `ELEVENLABS_WEBHOOK_SECRET`; re-run `pnpm env:production`.
11. 🔚 Verify Vercel cron registered (Settings → Cron Jobs). If the `services`-style `vercel.json` rejects `crons`, don't burn time — the demo uses the curl triggers anyway.

---

## M1 — Schema, env plumbing, seed (one agent)

**Depends on:** nothing. **Blocks:** everything else.

1. **`packages/db/src/schema/activity.ts`** — add to `callSession`:
   ```ts
   // Trimmed post-call transcript: [{ role, message, timeInCallSecs }]
   transcript: jsonb("transcript").$type<Array<{ role: "agent" | "user"; message: string | null; timeInCallSecs: number | null }>>(),
   ```
   (nullable, no default). Follow the existing `jsonb` usage in `changeRequest.payload` for style.
2. **`apps/web/.env.schema`** — add the 7 vars from Conventions, following the existing Varlock patterns in that file (sensitive ones like the existing `DATABASE_URL`; all optional / no default-required failures — mirror how `DATABASE_URL_DIRECT` is declared optional). Run `pnpm env:generate` to regenerate `apps/web/src/env.ts`.
3. **`turbo.json`** — add all 7 names to `globalEnv`.
4. **`apps/web/scripts/seed.ts`** — Dot's phone becomes `process.env.DEMO_MEMBER_PHONE?.trim() || "+14125550142"`; validate it matches `/^\+\d{8,15}$/` and throw with a clear message otherwise. (The seed already deletes-by-phone first — make sure the delete uses the _same resolved_ phone, and also delete the fallback number so switching `DEMO_MEMBER_PHONE` doesn't strand an old Dot: delete members by `inArray(phoneE164, [resolved, "+14125550142"])`.)
5. Run `pnpm db:push` if `DATABASE_URL` is available locally; otherwise state that M0 step 8 covers it.

**Acceptance:** check-types/test/lint green; `pnpm db:seed` works with and without `DEMO_MEMBER_PHONE` set.

---

## M2 — Call-session + PIN service (one agent, `packages/api`)

**Depends on:** M1. **Parallel with:** M3, M4.

Create **`packages/api/src/lib/phone.ts`**:

```ts
/** "+1 (412) 555-0142", "14125550142", "4125550142" → "+14125550142"; returns null if hopeless. */
export function normalizePhoneE164(raw: string): string | null;
```

US-biased: strip non-digits; 10 digits → prepend `+1`; 11 starting with 1 → prepend `+`; already `+` and 8–15 digits → keep. **Vitest:** `packages/api/src/lib/phone.test.ts` covering those cases + garbage input.

Create **`packages/api/src/services/call-sessions.ts`** (all take `db: Database` first, style-match `change-requests.ts`):

```ts
export const MAX_PIN_ATTEMPTS = 3;

export async function startInboundSession(
  db,
  input: {
    callerId: string;
    conversationId: string;
    twilioCallSid: string | null;
  },
): Promise<{ session: CallSessionRow; member: MemberRow | null }>;
// normalizePhoneE164(callerId) → member lookup by phoneE164 (null member for unknown callers).
// Insert call_session { direction: "inbound", memberId, elevenlabsConversationId, twilioCallSid, verified: false }.
// Idempotent on conversationId: if a session already exists for it, return the existing one.

export async function startOutboundSession(
  db,
  input: {
    memberId: string;
    conversationId: string;
    twilioCallSid: string | null;
  },
): Promise<CallSessionRow>; // direction "outbound", verified false

export async function getSessionByConversationId(
  db,
  conversationId: string,
): Promise<{ session: CallSessionRow; member: MemberRow | null } | null>;

export type PinResult =
  | { ok: true }
  | { ok: false; reason: "no_session" | "no_member" | "locked" }
  | { ok: false; reason: "wrong_pin"; attemptsRemaining: number };

export async function verifySessionPin(
  db,
  input: {
    conversationId: string;
    pin: string;
  },
): Promise<PinResult>;
// locked = !verified && pinAttempts >= MAX_PIN_ATTEMPTS (check BEFORE verifying).
// Success → set verified = true. Failure → increment pinAttempts; on the attempt that reaches
// MAX_PIN_ATTEMPTS, log activity { type: "pin_locked", visibleToCaretaker: true,
// summaryText: `${member.preferredName}'s phone line was locked after ${MAX_PIN_ATTEMPTS} failed PIN attempts.` }
// and call notifyCaretakers. Uses verifyPin from ../lib/pin.

export async function recordPostCall(
  db,
  input: {
    conversationId: string;
    summaryText: string | null;
    transcript: Array<{
      role: "agent" | "user";
      message: string | null;
      timeInCallSecs: number | null;
    }> | null;
    endedAt: Date;
  },
): Promise<CallSessionRow | null>;
// Update session; then activity_log { type: session.direction === "inbound" ? "call_inbound" : "call_outbound",
// summaryText: summaryText ?? "June spoke with <preferredName>.", visibleToCaretaker: true }.
// Skip activity for unknown-caller sessions (memberId null → activity_log.memberId is notNull; just update endedAt).
// Idempotent: if endedAt already set, update transcript/summary but don't double-log activity.
```

**Acceptance:** phone tests pass; check-types/lint green. (DB-touching functions are exercised end-to-end in M7; don't build a DB mock.)

---

## M3 — Voice tool service layer (one agent, `packages/api`)

**Depends on:** M1. **Parallel with:** M2, M4.

Create **`packages/api/src/services/voice-tools.ts`** — one function per tool, taking `(db: Database, member: MemberRow, session: CallSessionRow, input)` where input applies. All money via `formatCentsForSpeech`; all responses follow the tool response contract. These are transport-agnostic (no Request/Response types) so M5 stays thin.

- `getBalance(db, member)` → from `memberSummary(db, member.id)`: `{ ok, available_spoken, safe_to_spend_spoken, shortfall_warning: string | null }` (warning like `"Heads up: you may be short about $40 before your next Social Security payment on <date>."` when `shortfall.willShortfall`).
- `getUpcomingBills(db, member)` → `{ ok, bills: Array<{ name, due_date, amount_spoken, covered }>, next_income: { name, date, amount_spoken } | null }` (reuse the `member.bills` router's underlying logic / `memberSummary` fields — extract a shared helper rather than duplicating).
- `getRecentTransactions(db, member, input: { limit?: number })` → zod `limit` int 1–10 default 5, non-pending first by date desc: `{ ok, transactions: Array<{ transaction_id, date, merchant, amount_spoken, direction: "out" | "in", pending }> }`. `transaction_id` is included so the agent can pass it to `flag_transaction`.
- `checkAffordability(db, member, input: { amount_dollars: number })` → zod positive number ≤ 100000; cents = `Math.round(amount_dollars * 100)`; build `CashFlowInput` the same way `memberSummary` does, call `canAfford` from `@steelhacks-2026/finance` → `{ ok, answer: "yes" | "yes_but_tight" | "no", explanation_spoken }` where the explanation stitches remaining-after + next income date into one sentence.
- `getBudgets(db, member)` → budgets joined with current-calendar-month spend (`sum(amountCents) where amountCents > 0 and category = budget.category and date >= first-of-month`): `{ ok, budgets: Array<{ category, monthly_limit_spoken, spent_so_far_spoken }> }`.
- `proposeChange(db, member, session, input: { change_type, payload })` → zod: `change_type` is the 6-value `change_type` enum; `payload` is `z.record(z.string(), z.unknown())` (deep validation happens inside `changeRequests.propose` via `parseChange` — surface its error message as `{ ok: false, error }`). Calls `changeRequests.propose(db, { memberId, changeType, payload, callSessionId: session.id })` → `{ ok, confirmation_id, summary, instruction: "Read the summary back to the member and call confirm_change only after they clearly say yes." }`.
- `confirmChange(db, session, input: { confirmation_id })` → `changeRequests.confirm(db, { confirmationId, callSessionId: session.id })`; map `ConfirmResult`: applied → `{ ok, status: "applied", spoken: "Done — <summaryText>" }`; awaiting_approval → `{ ok, status: "awaiting_approval", spoken: "I've sent that to <primary caretaker name or 'your caretaker'> to approve. It'll apply once they say yes." }`; rejection reasons → `{ ok: false, error }` with human sentences (`expired` → "That confirmation timed out — let's start the change again.", etc.).
- `flagTransaction(db, member, input: { transaction_id })` → verify the transaction exists AND `transaction.memberId === member.id` (else `{ ok: false, error: "I couldn't find that charge." }`); insert `alert_sent { ruleType: "unusual_txn", dedupeKey: `${member.id}:unusual:${transaction_id}`, channel: "call", status: "skipped" }` with `onConflictDoNothing` (already-flagged → still `ok: true`, idempotent); `activity.log` `{ type: "alert_sent", visibleToCaretaker: true, summaryText: "<preferredName> reported an unrecognized charge: <merchant>, <amount_spoken> on <date>.", metadata: { transactionId } }`; `notifyCaretakers(db, member.id, <same sentence>)` → `{ ok, spoken: "I've flagged that charge and let your family know. Don't share your PIN or card number with anyone who calls you." }`.

Export each tool's **zod input schema** alongside the function (M5 imports both). **Vitest** (`voice-tools.test.ts`): pure pieces only — the explanation/summary string builders and the `amount_dollars → cents` rounding (extract them as pure functions).

**Acceptance:** check-types/test/lint green.

---

## M4 — Alerts engine + outbound calls (one agent, `packages/api`)

**Depends on:** M1. **Parallel with:** M2, M3. (Imports `startOutboundSession` from M2 — if running truly in parallel, stub the import per M2's exact signature.)

**`packages/api/src/services/outbound-calls.ts`**:

```ts
export type ElevenLabsCallEnv = {
  ELEVENLABS_API_KEY: string;
  ELEVENLABS_AGENT_ID: string;
  ELEVENLABS_PHONE_NUMBER_ID: string;
};
export type PlaceCallFn = (input: {
  toNumber: string;
  dynamicVariables: Record<string, string>;
  firstMessage: string;
}) => Promise<{ conversationId: string | null; callSid: string | null }>;
export function createElevenLabsPlaceCall(env: ElevenLabsCallEnv): PlaceCallFn;
// plain fetch POST to /v1/convai/twilio/outbound-call per Wire facts; throw on !response.ok with body text.
```

`PlaceCallFn` is injected everywhere else so tests and dev runs never dial anyone.

**`packages/api/src/services/alerts.ts`** — split pure evaluation from IO, mirroring `computeCashPicture`:

```ts
export type AlertCandidate = {
  ruleType: AlertRuleType;
  dedupeKey: string;
  firstMessage: string; // outbound first_message override
  dynamicVariables: Record<string, string>; // call_reason, identified: "yes", member_preferred_name, call_direction: "outbound", alert_detail
};

export function evaluateAlertConditions(input: {
  memberId: string;
  preferredName: string;
  today: IsoDate;
  summary: Pick<
    MemberSummary,
    "availableBalanceCents" | "safeToSpendCents" | "shortfall" | "upcomingBills" | "nextIncome"
  >;
  upcomingBillStreams: Array<{
    id: string;
    name: string;
    averageAmountCents: number;
    nextExpectedDate: IsoDate | null;
  }>;
  recentTransactions: TransactionRow[]; // last 3 days, non-pending
  historyTransactions: TxnLike[]; // last 90 days, for isUnusualTransaction
  rules: Array<{ type: AlertRuleType; enabled: boolean; thresholdCents: number | null }>;
}): AlertCandidate[];
```

Rules (each only when its rule row is enabled):

- **shortfall:** `summary.shortfall.willShortfall` → key `${memberId}:shortfall:${summary.nextIncome?.date ?? summary.shortfall.date}`; first message: "Hi <name>, it's June with a heads-up about your money — but first, could you tell me your PIN?" (all four first messages follow this shape: name + reason category + PIN ask, **no amounts or merchant names pre-PIN**, per ADR-0002).
- **bill_due_unfunded:** for each bill stream with `nextExpectedDate` within 7 days where `availableBalanceCents < averageAmountCents` (+ bills due sooner) → key `${memberId}:bill:${stream.id}:${nextExpectedDate}`.
- **unusual_txn:** for each recent outflow, `isUnusualTransaction(txn, history, { largeFloorCents: rule.thresholdCents ?? 10_000 })` → key `${memberId}:unusual:${txn.id}`.
- **deposit_arrived:** recent transactions with `amountCents < 0` → key `${memberId}:deposit:${txn.id}`.
  `dynamicVariables.alert_detail` carries the full detail sentence (amounts/merchants) for June to disclose **after** PIN.

```ts
export function isWithinQuietHours(
  localTime: string /* "HH:MM" */,
  start: string,
  end: string,
): boolean;
// handles windows wrapping midnight (default 20:00–09:00)

export async function runAlertsForMember(
  db,
  placeCall: PlaceCallFn,
  memberId: string,
  now = new Date(),
): Promise<{ evaluated: number; placed: number; skipped: number; deduped: number; failed: number }>;
```

`runAlertsForMember` flow per candidate: (1) insert `alert_sent` `{ status: "queued", channel: "call" }` with `onConflictDoNothing` on `dedupeKey` — no inserted row → `deduped`, stop. (2) `memberSettings.reminderMode !== "call"` → status `skipped`. (3) quiet hours: `todayInTimezone`/local HH:MM in `member.timezone` vs settings → `skipped`. (4) calls today: count `alert_sent` for member with status in (`placed`,`answered`,`unanswered`) and `sentAt` today (member tz) ≥ `maxCallsPerDay` → `skipped`. (5) `placeCall(...)` → `startOutboundSession` with returned `conversationId` → update alert to `{ status: "placed", callSessionId }` + activity `{ type: "alert_sent", visibleToCaretaker: true, summaryText }`; on throw → `failed`.

```ts
export async function runAlertsForAllMembers(db, placeCall, now?): Promise<Record<string, ReturnType-shape>>;
```

**Wire the dev router** (`packages/api/src/routers/dev.ts`): implement `dev.runAlerts` (replace NOT_IMPLEMENTED) → `runAlertsForMember` with the real `createElevenLabsPlaceCall` built from env — **env access:** extend `Context` (packages/api/src/context.ts) with optional `elevenLabsEnv?: ElevenLabsCallEnv`, populated in `apps/web/src/context.ts` from `ENV` (coordinate with M5 if parallel; it's a 3-line change — whoever lands first adds it). Missing env → `ORPCError("PRECONDITION_FAILED", ...)`. Resolve `dev.injectTransaction`'s `TODO(milestone 9)`: after sync, call `runAlertsForMember` and include its counts in the response.

**Vitest** (`alerts.test.ts`): `evaluateAlertConditions` (each rule fires/respects enabled/threshold; dedupe keys exact) and `isWithinQuietHours` (inside, outside, wrapping midnight, boundary minutes).

**Acceptance:** check-types/test/lint green; no real HTTP in tests.

---

## M5 — HTTP routes in `apps/web` (one agent)

**Depends on:** M2, M3, M4. Routes use the existing TanStack Start pattern (see `apps/web/src/routes/api/auth/$.ts`): `createFileRoute("/api/...")({ server: { handlers: { POST } } })`. Build context pieces from `apps/web/src/services.ts` (`db`) and `ENV`.

**`apps/web/src/lib/voice.ts`** helpers:

```ts
export function requireToolSecret(request: Request): Response | null;
// null = authorized. Compares header "x-voice-secret" to ENV.ELEVENLABS_TOOL_SECRET via
// crypto.timingSafeEqual on sha256 digests (constant-time regardless of length). Missing env → 500. Mismatch → 401.

export function verifyElevenLabsSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowSecs = Date.now() / 1000,
): boolean;
// parse "t=...,v0=..."; reject t older than 1800s; HMAC-SHA256 hex over `${t}.${rawBody}`; timing-safe compare.
```

**`apps/web/src/routes/api/elevenlabs/init.ts`** — POST. `requireToolSecret` → zod parse `{ caller_id: z.string(), agent_id: z.string(), called_number: z.string().optional(), call_sid: z.string().optional(), conversation_id: z.string() }` → `startInboundSession(db, ...)` → 200:

```json
{
  "type": "conversation_initiation_client_data",
  "dynamic_variables": {
    "identified": "yes" | "no",
    "member_preferred_name": "<preferredName or empty string>",
    "call_direction": "inbound",
    "call_reason": "member_inquiry",
    "alert_detail": ""
  },
  "conversation_config_override": { "agent": { "first_message": "<see below>" } }
}
```

Identified: `"Hello <preferredName>! This is June. Before we talk about your money, could you tell me your PIN?"`. Unknown: `"Hello, this is June. I'm sorry, but I don't recognize this phone number, and I can only talk with family members who are set up with me. Please ask your family to help set you up. Goodbye for now."` (prompt instructs `end_call` when `identified` is `"no"`). **Every dynamic variable the prompt references must be present in both this response and the outbound placement (M4's `dynamicVariables`)** — keep the two key sets identical.

**`apps/web/src/routes/api/elevenlabs/tools/$tool.ts`** — POST. `requireToolSecret` → registry:

```ts
const tools: Record<
  string,
  {
    requiresVerified: boolean;
    run: (body: unknown, ctx: { db; session; member }) => Promise<object>;
  }
>;
```

Flow: unknown `$tool` → 404. Parse body JSON; `conversation_id` (zod) → `getSessionByConversationId`; none → `{ ok: false, error: "No active call session." }`. `verify_pin` (requiresVerified false) → `verifySessionPin`, map `PinResult` to speakable JSON (`wrong_pin` → `{ ok: false, error: "That PIN isn't right. You have N tries left." }`, `locked` → `{ ok: false, error: "Too many failed tries. For your safety I can't help on this call. Your family has been notified. Goodbye." }`). All others: `!session.verified` → `{ ok: false, error: "The member isn't verified yet — ask for their PIN and call verify_pin first." }`; `!member` → same-shape error; then zod-parse tool input (schemas imported from `voice-tools.ts`) and call the M3 function. zod failure → `{ ok: false, error: "<flattened message>" }`. Wrap everything in try/catch → `{ ok: false, error: "Something went wrong on my end." }` (log the real error).

**`apps/web/src/routes/api/elevenlabs/post-call.ts`** — POST. Read `await request.text()` FIRST (HMAC needs the raw body), verify signature with `ENV.ELEVENLABS_WEBHOOK_SECRET` (fail → 401), then JSON.parse + loose zod (`z.looseObject`-style: only pluck what we use). `post_call_transcription` → `recordPostCall(db, { conversationId: data.conversation_id, summaryText: data.analysis?.transcript_summary ?? null, transcript: (data.transcript ?? []).map(t => ({ role: t.role, message: t.message ?? null, timeInCallSecs: t.time_in_call_secs ?? null })), endedAt: new Date() })`; additionally, if that session has an `alert_sent` row (`callSessionId = session.id`) with status `placed` → set `answered`. `call_initiation_failure` → find session by `data.conversation_id`; linked alert → status `unanswered` (`"busy"|"no-answer"`) or `failed`; if `memberSettings.notifyCaretakerOnUnanswered` → `notifyCaretakers(db, memberId, "<preferredName> didn't answer June's call about <ruleType>.")`. Unknown event types → ignore. **Always 200.**

**`apps/web/src/routes/api/cron/alerts.ts`** and **`api/cron/approvals.ts`** — GET + POST (Vercel cron sends GET). Auth: `Authorization: Bearer ${ENV.CRON_SECRET}` exact match (timing-safe), else 401. Alerts → `runAlertsForAllMembers(db, createElevenLabsPlaceCall(env))` → JSON counts. Approvals → `changeRequests.processTimeouts(db)` → JSON counts.

**Context wiring:** add `elevenLabsEnv` to `createContext` in `apps/web/src/context.ts` (see M4).

**`vercel.json` (root):** add

```json
"crons": [
  { "path": "/api/cron/alerts", "schedule": "0 13 * * *" },
  { "path": "/api/cron/approvals", "schedule": "0 13 * * *" }
]
```

Known risk: this repo uses the `services`-style config; if Vercel rejects `crons` at the root, note it in the PR and move on — demo uses curl.

**Acceptance:** check-types/lint green; `pnpm dev` boots; manual smoke: `curl -X POST localhost:3001/api/elevenlabs/tools/get_balance -H "x-voice-secret: <secret>" -d '{"conversation_id":"nope"}' -H "content-type: application/json"` → `{"ok":false,"error":"No active call session."}`; cron route with wrong bearer → 401.

---

## M6 — Agent config as code + sync script (one agent)

**Depends on:** M1 (env names) + the contracts in this document. **Parallel with:** M2–M5.

**`docs/agent-tools.json`** — `{ "tools": [ ...9 tool_config objects... ] }`. Template placeholders `{{BASE_URL}}` and `{{TOOL_SECRET}}` are substituted by the sync script (the committed file contains no secrets). Every tool: `"type": "webhook"`, `response_timeout_secs: 20`, `api_schema.url: "{{BASE_URL}}/api/elevenlabs/tools/<name>"`, `method: "POST"`, `request_headers: { "x-voice-secret": "{{TOOL_SECRET}}" }`, and `request_body_schema.properties.conversation_id = { "type": "string", "dynamic_variable": "system__conversation_id" }` (required). Full example for one tool; the rest follow the parameter table:

```json
{
  "type": "webhook",
  "name": "verify_pin",
  "description": "Verify the member's spoken PIN. MUST succeed before any other tool is used. Ask the member to say their PIN, then call this with the digits.",
  "response_timeout_secs": 20,
  "api_schema": {
    "url": "{{BASE_URL}}/api/elevenlabs/tools/verify_pin",
    "method": "POST",
    "request_headers": { "x-voice-secret": "{{TOOL_SECRET}}" },
    "request_body_schema": {
      "type": "object",
      "required": ["conversation_id", "pin"],
      "properties": {
        "conversation_id": { "type": "string", "dynamic_variable": "system__conversation_id" },
        "pin": {
          "type": "string",
          "description": "The PIN digits the member spoke, digits only, e.g. \"1234\"."
        }
      }
    }
  }
}
```

LLM-supplied params per tool (each gets a `description`; everything else is just `conversation_id`):

| tool                      | extra params                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verify_pin`              | `pin: string`                                                                                                                                                                                                                                                                                                                                                                                |
| `get_balance`             | —                                                                                                                                                                                                                                                                                                                                                                                            |
| `get_upcoming_bills`      | —                                                                                                                                                                                                                                                                                                                                                                                            |
| `get_recent_transactions` | `limit?: integer` "How many to list, 1–10. Default 5."                                                                                                                                                                                                                                                                                                                                       |
| `check_affordability`     | `amount_dollars: number` "The amount in dollars the member asked about, e.g. 60 for sixty dollars."                                                                                                                                                                                                                                                                                          |
| `get_budgets`             | —                                                                                                                                                                                                                                                                                                                                                                                            |
| `propose_change`          | `change_type: string` with `"enum": ["budget_update","reminder_mode_update","quiet_hours_update","alert_rule_toggle","safety_buffer_update"]`; `payload: object` — description documents each shape exactly as `payloadSchemas` in `packages/api/src/services/change-rules.ts` defines them (e.g. budget_update: `{ "category": "groceries", "monthlyLimitCents": 30000 }` — note **cents**) |
| `confirm_change`          | `confirmation_id: string` "The confirmation_id returned by propose_change, verbatim."                                                                                                                                                                                                                                                                                                        |
| `flag_transaction`        | `transaction_id: string` "The transaction_id from get_recent_transactions for the charge the member doesn't recognize."                                                                                                                                                                                                                                                                      |

**`docs/june-prompt.md`** — June's full system prompt. Required content: (1) persona — warm, patient, unrushed; short sentences; one question at a time; never use banking jargon; numbers come out like "about a hundred and thirty dollars" (tools pre-format — speak `*_spoken` values verbatim, never do arithmetic yourself, never invent a number that didn't come from a tool). (2) Identity flow — `{{identified}}` is "no": apologize per the refusal script and use the `end_call` system tool; otherwise greet `{{member_preferred_name}}` and require PIN verification via `verify_pin` before ANY other tool; on `locked`, say goodbye kindly and `end_call`. (3) Change flow — gather the change conversationally, call `propose_change`, read the returned summary back, and only after an unambiguous yes call `confirm_change`; explain "waiting for approval" outcomes gently. (4) Outbound — `{{call_direction}}` is "outbound": open per `{{call_reason}}` (`shortfall_warning` / `bill_due_unfunded` / `unusual_transaction` / `deposit_arrived`), but disclose `{{alert_detail}}` **only after** PIN verification. (5) Safety — never ask for card numbers/SSN; remind about scams when a charge is flagged; if the member sounds confused or distressed, suggest calling their family. References only these dynamic variables: `identified`, `member_preferred_name`, `call_direction`, `call_reason`, `alert_detail` (must stay in sync with init route + outbound placement).

**`apps/web/scripts/sync-agent.ts`** (runs like `seed.ts`, via varlock; add `"sync:agent": "varlock run -- tsx scripts/sync-agent.ts"` to `apps/web/package.json` scripts):

1. Read env `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_TOOL_SECRET`; base URL from `--base-url` argv flag, else `BETTER_AUTH_URL`. Fail fast with named missing vars.
2. Load `../../docs/agent-tools.json` + `../../docs/june-prompt.md` (paths relative to `apps/web/scripts/`); substitute `{{BASE_URL}}`/`{{TOOL_SECRET}}`.
3. `GET /v1/convai/tools` → match by `tool_config.name`; `PATCH` existing / `POST` new (`{ "tool_config": ... }`); collect all 9 ids.
4. `GET /v1/convai/agents/{id}` → merge → `PATCH` with `conversation_config.agent.prompt = { ...existing prompt fields, prompt: <june-prompt.md content>, tool_ids: [ids] }` and `conversation_config.agent.first_message` = the identified-caller greeting (dashboard fallback; init webhook overrides per call).
5. Print a table: tool name → id → created/updated; agent patch status; and remind about the M0 step-10 dashboard-only settings.

**Acceptance:** check-types/lint green; `pnpm --filter web sync:agent -- --base-url https://example.com` with fake creds fails fast with a clear HTTP error (proving arg/env plumbing), and `docs/agent-tools.json` parses + contains exactly 9 tools whose names match the M5 registry keys.

---

## M7 — End-to-end verification + demo runbook (human + one agent for fixes)

**Depends on:** everything, including M0.

Local loop (before trusting Vercel): `pnpm dev` + `cloudflared tunnel --url http://localhost:3001`, run `sync:agent --base-url <tunnel>`, point the two dashboard webhooks (init, post-call) at the tunnel.

Scenario checklist — run each, fix, re-run:

1. **Inbound happy path:** call from `DEMO_MEMBER_PHONE`. June greets "Dot", asks PIN. Say a wrong PIN (expect "N tries left"), then `1234`. Ask "what's my balance?" → spoken amounts match `pnpm db:studio` values. Ask "can I afford a sixty dollar dinner?" → sensible answer.
2. **Lockout:** call, fail PIN 3×. June ends assistance; `activity_log` has `pin_locked`; caretaker feed (dashboard) shows it.
3. **Unknown caller:** call from another phone → polite refusal, call ends; `call_session` row with null member exists.
4. **Change flow:** "raise my grocery budget to three hundred dollars" → June reads back → yes → applied (tier `instant_notify`) + `notifyCaretakers` console line; budget row updated.
5. **Flag:** "there's a charge I don't recognize" → June lists recent transactions → flag one → `alert_sent` row `skipped` with `<memberId>:unusual:<txnId>`, activity visible, caretaker notified.
6. **Proactive call:** as Maria (dashboard/dev tools), `dev.injectTransaction` with `amountCents: 25000, merchantName: "QuickCash Gift Cards"` → outbound call arrives → PIN → June describes the charge, offers to flag. `alert_sent` goes `queued→placed→answered`; second `dev.runAlerts` → `deduped`, no second call.
7. **Cron + post-call:** `curl -H "Authorization: Bearer $CRON_SECRET" https://<BASE_URL>/api/cron/approvals`; after any call ends, `call_session` gains `summaryText` + `transcript` within ~a minute, and the summary shows in the caretaker activity feed.
8. **Quiet hours:** set quiet hours to now via caretaker settings, `dev.runAlerts` with a fresh condition → status `skipped`. Reset after.

Then repeat 1, 6, 7 against the Vercel deployment (re-run `sync:agent` with the prod URL and re-point the dashboard webhooks). Record the winning 3-minute demo order: (1) inbound balance + affordability, (2) budget raise + dashboard ping, (3) inject fraud txn → June calls the phone live, (4) caretaker feed recap.

---

## Out of scope (explicitly)

Plaid (milestone 8 elsewhere), SMS channel (`reminderMode: "sms"` treated as skip), `log_expense` / `get_change_request_status` tools, persistent PIN lockout, caretaker-visible full transcripts, streaming dashboard updates (polling stays), quiet-hours "hold and call later" (skipped alerts stay skipped — the condition re-fires only if its dedupe key changes).
