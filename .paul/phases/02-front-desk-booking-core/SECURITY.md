# Security Verification — Phase 02, Plan 01 (Front-Desk Auth)

**Verified:** 2026-08-16
**Plan:** `.paul/phases/02-front-desk-booking-core/02-01-PLAN.md`
**Audit input:** `.paul/phases/02-front-desk-booking-core/02-01-AUDIT.md`
**Auditor:** gsd-security-auditor
**Method:** Live execution against real code + DB (not static review only) — server started in-process, HTTP requests fired at real routes, DB queried directly to confirm side effects (or absence of them). A prior `security-review` skill pass found zero HIGH/MEDIUM code-level vulnerabilities; this pass instead verifies that each mitigation the plan and audit *committed to* actually landed and *actually works*, not just that matching code exists.

**Verdict: SECURED — 10/10 committed mitigations closed.** Threat 2b (timing side-channel on the not-found login path) was found open in the initial pass, fixed by the coordinator, and independently re-verified here — the fix is genuine and effective, not just claimed. Every mitigation the plan and audit committed to is now in place and demonstrated working, not just described.

> **Revision note (2026-08-16, second pass):** Threat 2b was reopened and re-closed in this file. First pass found the dummy bcrypt hash in `src/routes/auth.ts` malformed (57 chars, ~1,300x timing differential vs. a real compare). The coordinator replaced it with a genuine 60-char cost-12 bcrypt hash (`DUMMY_HASH_FOR_TIMING_SAFETY`). This auditor independently re-measured timing, re-ran the build, and re-ran the smoke test from scratch (not by trusting the coordinator's report) before closing it below.

---

## Threat Verification

| # | Mitigation Committed | Disposition | Status | Evidence |
|---|---|---|---|---|
| 1 | JWT_SECRET ≥32 chars; `process.exit(1)` if missing or short | mitigate | **CLOSED** | `src/lib/auth.ts:6-12`. Live-tested both `JWT_SECRET=""` and `JWT_SECRET="tooshort"` — both printed the refusal message and exited with code 1. |
| 2a | Login returns byte-identical 401 body for wrong-password vs nonexistent-email | mitigate | **CLOSED** | `src/routes/auth.ts:36-46`, single `GENERIC_INVALID_CREDENTIALS` constant used on both paths. Confirmed by `smoke-test-auth.ts` (`wrongPwBody === noEmailBody`) — ran live, passed. |
| 2b | Timing-safety: dummy `bcrypt.compare` on not-found path so response time doesn't reveal whether the email exists | mitigate | **CLOSED** | Fixed in `src/routes/auth.ts:17-18` — `DUMMY_HASH_FOR_TIMING_SAFETY` is now a genuine, correctly-formatted 60-char cost-12 bcrypt hash (`$2b$12$OZuDUlsvTLmq02IlYSrm/uP8/4A2qg6y3U5gvPA0opFlaGTVAr5e6`), computed via `bcrypt.hashSync` and inlined as a constant. Independently re-measured: 8 trials averaged 262.3ms for the dummy path vs. 256.9ms for a real cost-12 compare — parity within normal jitter, no exploitable differential (down from the prior ~1,300x gap). See "Gap Found & Fixed" below for full history. |
| 3 | Rate limiting: 5 attempts / 15 min / IP via `express-rate-limit` on login route, 429 on exceed | mitigate | **CLOSED** | `src/routes/auth.ts:9-15,19`. Live-tested: fired 6 rapid requests at a real (in-process) server — attempts 1-5 returned 401, attempt 6 returned 429. `express-rate-limit@8.6.2` confirmed in `package.json`. |
| 4 | Auth middleware wraps `verifyToken` in try/catch, generic 401 on any failure, never calls `next()` on failure | mitigate | **CLOSED** | `src/middleware/auth.ts:13-28`. Missing header → 401, return (no `next()`). Try/catch around `verifyToken` → catch → 401, return (no `next()`). Confirmed live via `smoke-test-auth.ts`: no-token, malformed-token, and wrong-secret-signed-token all return 401. |
| 5 | Login route wraps DB/bcrypt calls in try/catch, generic 500 with no leaked detail on unexpected failure | mitigate | **CLOSED** | `src/routes/auth.ts:29-54`. Catch block logs `err.message` server-side only via `console.error`, response body is `{ error: "Internal server error" }` with no stack trace or DB detail. |
| 6 | `create-user.ts` rejects passwords <12 chars, no partial row created | mitigate | **CLOSED** | `src/scripts/create-user.ts:32-36` — length check runs before any Prisma call. Live-tested a 10-char password: rejected, exit code 1. Queried DB directly afterward for any row matching the test email — 0 rows found. |
| 7 | No plaintext password ever appears in logs or script output | mitigate | **CLOSED** | Grepped every `console.*` call in `src/`. None reference the `password` variable in `routes/auth.ts` or `scripts/create-user.ts`. `create-user.ts`'s success log only prints id/email/role/hotelId (`create-user.ts:53-54`); its error paths never include the password argument. |
| 8 | JWT payload contains only `userId`/`hotelId`/`role` — no extra PII | mitigate | **CLOSED** | `src/lib/auth.ts:15-19,21-27` — `AuthClaims` interface and `signToken` only accept/emit those three fields (plus JWT-standard `iat`/`exp`, which are not PII). `verifyToken` explicitly type-checks the payload has exactly those three string fields and throws otherwise. |
| 9 | Accepted-risk tradeoff (no instant JWT revocation before 12h expiry) documented, not silently absent | accept | **CLOSED** | Present in three places: `.paul/PROJECT.md` accepted-risk log (line 106, dated 2026-08-15, status "Active"), `.paul/STATE.md` decision log (lines 49-50), and `PLAN.md`'s `<boundaries>` section (line 170, "Accepted risk, on the record"). This is a properly recorded, disposition-tagged accepted risk, not an undocumented gap. |

## Gap Found & Fixed: Timing side-channel in the "identical response" mitigation (2b)

**Location:** `src/routes/auth.ts` (dummy hash constant, used at what is now line 45)

### First pass (found open)

```ts
const passwordMatches = user
  ? await bcrypt.compare(password, user.passwordHash)
  : await bcrypt.compare(password, "$2a$12$invalidinvalidinvalidinuInvalidHashPlaceholder0000");
```

The intent (correctly identified by the executor, though not explicit in PLAN.md text) is that a nonexistent-email request should still pay the same bcrypt cost as a real comparison, so an attacker can't distinguish "email exists, password wrong" from "email doesn't exist" by measuring response time — closing the gap that the identical-response-body mitigation (2a) doesn't cover on its own.

The placeholder string was malformed: a valid bcrypt hash is 60 characters (`$2a$12$` + 22-char salt + 31-char hash = 7 + 53); the string used was 57 characters — 3 short. bcryptjs detected the malformed salt and short-circuited instead of running the actual cost-12 algorithm.

Measured impact at that point (5 trials, standalone script against the real `bcryptjs` dependency in this project, in-process, not a synthetic estimate): malformed dummy averaged **0.2ms**, a real cost-12 hash averaged **262.6ms** — roughly a 1,300x timing differential, trivially observable including over a network with normal jitter. This directly undermined the "never revealing whether the email existed" guarantee AC-2 and the audit both called for — the body/status half held, the timing half did not. `smoke-test-auth.ts` didn't catch it because it only asserts response-body equality, not timing.

### Fix applied and independently re-verified (now closed)

The coordinator replaced the constant with a genuine, correctly-formatted hash:

```ts
const DUMMY_HASH_FOR_TIMING_SAFETY =
  "$2b$12$OZuDUlsvTLmq02IlYSrm/uP8/4A2qg6y3U5gvPA0opFlaGTVAr5e6";
```

This auditor independently re-verified the fix rather than accepting the coordinator's report at face value:
- Confirmed the constant is 60 characters and matches valid bcrypt format (`^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$`).
- Re-ran an independent timing script (8 trials, not reusing the coordinator's numbers): dummy path averaged **262.3ms**, a freshly-generated real cost-12 hash averaged **256.9ms** — parity within normal jitter, no exploitable differential.
- Re-ran `npm run build` — passes clean (`tsc` exit 0).
- Re-ran `npx tsx src/scripts/smoke-test-auth.ts` from scratch — all 12 checks pass, including AC-2's response-body-equality check, confirming no regression from the fix.

**Verdict on 2b: CLOSED.** The mitigation now does what it was designed to do — the not-found login path pays the same bcrypt cost as a real comparison, closing the timing side-channel.

## Additional checks performed

- **`.env` not committed:** `.env` is listed in `.gitignore` (line 3) and confirmed absent from `git ls-files`. `JWT_SECRET` exists as an env var only — never hardcoded in source. `.env.example` correctly ships a placeholder (empty value) with generation instructions, not a real secret.
- **Route wiring (`src/app.ts`):** `/health` and `POST /api/auth/login` are unauthenticated as required; `GET /api/me` is the only route wrapped with `requireAuth` in this plan's scope, matching the plan's boundary that no other route-level authorization was in scope.
- **Dependencies:** `bcryptjs@^3.0.3`, `jose@^6.2.9`, `express-rate-limit@^8.6.2` all present in `package.json` as declared by the plan (not just imported ad hoc).
- **Live smoke test:** `npx tsx src/scripts/smoke-test-auth.ts` run during this audit — all 12 checks passed (AC-1 through AC-4 covered with real HTTP calls against an ephemeral in-process server and real DB rows).
- **No SUMMARY.md yet:** `.paul/phases/02-front-desk-booking-core/02-01-SUMMARY.md` does not exist at time of this audit (only `02-01-PLAN.md` and `02-01-AUDIT.md` are present in the phase directory), so there is no `## Threat Flags` section to cross-reference. No unregistered flags to report as a result — this is a sequencing note, not a security gap.

## Unregistered Flags

None (no SUMMARY.md present yet — see note above).

---

## Recommendation

**Sign off.** All 10 committed mitigations are verified present and functioning, including the one gap (2b) found and fixed during this audit cycle. This plan's security commitments — as declared in PLAN.md and hardened by the 02-01-AUDIT.md enterprise-audit pass — were actually delivered, not just documented. The loop SPECIAL-FLOWS.md required before treating multi-tenant auth as done can close.

One outstanding non-security item: `.paul/phases/02-front-desk-booking-core/02-01-SUMMARY.md` should still be created per PLAN.md's `<output>` requirement — not a security gap, just unfinished process bookkeeping.

---

# Security Verification — Phase 02, Plan 02 (Calendar Grid Query API / Multi-Tenant Isolation)

**Verified:** 2026-08-18
**Plan:** `.paul/phases/02-front-desk-booking-core/02-02-PLAN.md`
**Audit input:** `.paul/phases/02-front-desk-booking-core/02-02-AUDIT.md`
**Auditor:** gsd-security-auditor
**Method:** Live execution against real code + real DB. Ran the project's own `smoke-test-calendar.ts` twice (both full passes, 16/16 checks). Also wrote and ran three disposable, self-contained probe scripts (`_audit-manual-probe.ts`, `_audit-probe2.ts`, `_audit-probe3.ts`) against an in-process ephemeral server to independently exercise attack paths and edge cases the smoke test doesn't cover — all deleted after use, confirmed via `git status` that no trace remains in the working tree. A prior `security-review` skill pass found zero HIGH/MEDIUM code-level vulnerabilities; this pass instead verifies that each mitigation the plan and audit *committed to* actually landed and *actually works* under live conditions, not just that matching code exists.

**Verdict: SECURED — 8/8 committed mitigations closed.** All eight mitigations named in the task brief were independently verified live, including one (`days[]` `seeded:false` completeness, and the ownership-check's own DB call being inside the try/catch) that the automated smoke test doesn't directly exercise and which required a dedicated probe to confirm rather than trusting code inspection alone.

---

## Threat / Mitigation Verification

| # | Mitigation Committed | Disposition | Status | Evidence |
|---|---|---|---|---|
| 1 | Both endpoints require a valid JWT via `requireAuth` — no route reachable without authentication | mitigate | **CLOSED** | `src/routes/roomTypes.ts:28` (`GET /`) and `:54` (`GET /:roomTypeId/calendar`) both wrap with `requireAuth`. Live-tested: no-Authorization-header on both endpoints → 401 (smoke test AC-5, and independently via probe: garbage/malformed JWT also → 401, confirming `src/middleware/auth.ts:13-28`'s try/catch-around-verify pattern holds here too). |
| 2 | `hotelId` used to scope every query comes ONLY from `req.auth.hotelId` — never from query param, path param, header, or body, on either endpoint | mitigate | **CLOSED** | `src/routes/roomTypes.ts:31` (`hotelId: req.auth!.hotelId` in list) and `:88` (same in ownership check). Grepped the file for every other reference to `hotelId` — none originate from `req.query`, `req.params`, `req.headers`, or `req.body`. **Live-tested, not just code-read:** fired a request at `GET /api/room-types?hotelId=<HotelB.id>` (query-param spoof) and again with header `X-Hotel-Id: <HotelB.id>` — both returned 200 with Hotel B's room type still absent from the response. Also fired the cross-tenant calendar request with a spoofed `&hotelId=<HotelA.id>` query param attached — still 404, confirming the spoofed param is silently ignored, not accidentally honored anywhere in the request pipeline. |
| 3 | The calendar endpoint's tenant-ownership check gates ALL data access — no `DailyInventory`/`RatePlanDailyRate` query can run before it passes | mitigate | **CLOSED** | `src/routes/roomTypes.ts:87-96` — `findFirst` ownership check runs first inside the try block; on `null` the handler `return`s at line 95 before reaching the `dateList`/`Promise.all` data-query block at lines 98-118. Confirmed structurally (single sequential `await` chain, no parallel dispatch before the ownership gate) and live: the cross-tenant and nonexistent-id probes both returned 404 with the grid-query body shape never appearing. |
| 4 | Cross-tenant `roomTypeId` access returns 404, byte-identical to a genuinely nonexistent `roomTypeId` | mitigate | **CLOSED** | `src/routes/roomTypes.ts:91-96` — single generic `{ error: "Room type not found" }` response, no branch distinguishing "doesn't exist" from "belongs to another hotel." `smoke-test-calendar.ts` asserts `crossTenantBody === nonexistentBody` byte-for-byte — **PASS**, verified live in two consecutive full runs. |
| 5 | Entire calendar handler body (ownership check through response) wrapped in one try/catch — audit-driven fix for a gap where the original draft only wrapped the later data-query steps | mitigate | **CLOSED** | `src/routes/roomTypes.ts:86` opens the `try` immediately before the ownership-check query (`:87`) and it doesn't close until the success response (`:155`), with the `catch` at `:156-159`. **Live-forced, not just read:** wrote a disposable probe that monkey-patched `prisma.roomType.findFirst` (the ownership-check call itself) to throw synchronously, then fired a real HTTP request at the calendar endpoint. Result: 500 with body `{"error":"Internal server error"}` — the simulated error string appeared only in the server-side `console.error` log, never in the HTTP response. This is the exact scenario the audit flagged as previously uncaught (a DB hiccup during the ownership-check step itself) and it now fails safely. |
| 6 | Date-range validation happens before any DB query: missing/malformed dates, round-trip-invalid dates (e.g. `2026-02-30`), `endDate < startDate`, ranges over 400 days — all rejected 400 | mitigate | **CLOSED** | `src/routes/roomTypes.ts:58-80` — all validation runs before the `try` block that contains the first DB call at `:87`; a malformed/invalid request never reaches the `try`. **Live-tested beyond the smoke test's own cases:** invalid month (`2026-13-01`) → 400; non-date string (`not-a-date`) → 400; empty `endDate` → 400; non-leap-year `2026-02-29` → 400 (round-trip check correctly rejects — 2026 is not a leap year); **and, as a precision check, a genuinely valid leap-year date `2024-02-29` → 200** (confirms the round-trip validation isn't over-strict and doesn't false-positive on legitimate leap days). Smoke test additionally confirms `2026-02-30` → 400, missing `startDate` → 400, backwards range → 400, 500+ day range → 400 — all passed in two consecutive runs. |
| 7 | `days[]` contains exactly one entry per calendar date in range — including unseeded dates, marked `seeded:false` rather than silently omitted | mitigate | **CLOSED** | `src/routes/roomTypes.ts:98-101` builds `dateList` by iterating every calendar date via `addDays`, independent of which `DailyInventory` rows exist; `:128-144` maps every entry in `dateList` to a `days[]` element regardless of Map hit/miss. **Gap in automated coverage found and independently closed by this audit:** `smoke-test-calendar.ts`'s own AC-3 check only exercises a date that Hotel A's fully-seeded room type already covers (`seeded === true`); it does not exercise the `seeded:false` path at all. Wrote a dedicated live probe: created a RoomType with **zero** `DailyInventory` rows (no seeding run), requested a 5-day range — response was 200, `days.length === 5` (exact match to requested range, none dropped), every entry `seeded:false` with `availableCount`/`bookedCount`/`heldCount`/`isClosed` all `null` and `rates: {}`. Confirms the audit-driven completeness fix works correctly under live conditions, not just by code inspection. |
| 8 | No unexpected error path leaks internal details (stack traces, Prisma error messages) — generic 500 only, real error logged server-side | mitigate | **CLOSED** | `src/routes/roomTypes.ts:48-51` (list) and `:156-159` (calendar) — both catch blocks call `console.error` with the real error server-side and respond with the fixed literal `{ error: "Internal server error" }`, matching 02-01's established pattern exactly. **Live-forced on both endpoints:** monkey-patched `prisma.roomType.findMany` (list) and `prisma.roomType.findFirst` (calendar's ownership-check call) to throw distinctive marker strings, fired real requests — both responses were 500 with the generic body only; the marker strings never appeared in either HTTP response, confirming no Prisma error detail or stack trace reaches the client on either endpoint. |

## Unregistered Flags

None. No `02-02-SUMMARY.md` exists yet at time of this audit (only `02-02-PLAN.md` and `02-02-AUDIT.md` are present in the phase directory), so there is no `## Threat Flags` section to cross-reference — a process-sequencing note, not a security gap, matching the same situation noted in the 02-01 pass above.

## Additional checks performed

- **`npm run build`** — passes clean (`tsc -p tsconfig.json`, exit 0), re-confirmed during this pass.
- **Regression check:** re-ran all three other existing smoke tests during this pass — `smoke-test-inventory.ts`, `smoke-test-booking.ts`, `smoke-test-auth.ts` — all passed in full, no regressions introduced by this plan's changes.
- **`src/app.ts` route wiring:** `roomTypesRouter` mounted at `/api/room-types` (`src/app.ts:15`); both of its routes carry their own `requireAuth` at the router level (not relying on a shared app-level gate that could be misconfigured), matching 02-01's per-route pattern.
- **No mutation risk:** confirmed both routes are `GET` only — no `POST`/`PUT`/`PATCH`/`DELETE` handlers exist in `roomTypes.ts`, consistent with the plan's read-only scope boundary.
- **Working-tree hygiene:** all three disposable probe scripts written for this audit were deleted immediately after use; `git status --short` re-checked afterward and shows no residual audit artifacts, only the pre-existing implementation diff.

---

## Recommendation

**Sign off.** All 8 mitigations named in this verification's scope are confirmed present in the code and independently demonstrated working under live HTTP traffic against a real database — including one gap in the automated smoke test's own coverage (the `seeded:false` completeness path) that this audit closed by writing a dedicated probe, and one mitigation (the ownership-check's own DB call being inside the try/catch) that was verified by actually forcing that specific call to throw, not merely by reading where the `try` keyword sits in the file. The query-level multi-tenant isolation this plan set out to prove — hotelId sourced exclusively from the verified JWT, cross-tenant access indistinguishable from nonexistent, spoofed hotelId inputs on query params/headers silently ignored — held up under direct adversarial probing, not just under its own smoke test's assumptions. This plan's security/isolation commitments were actually delivered. The loop SPECIAL-FLOWS.md required before treating this plan as done can close.

One outstanding non-security item, same class as noted for 02-01: `.paul/phases/02-front-desk-booking-core/02-02-SUMMARY.md` should still be created per PLAN.md's `<output>` requirement — not a security gap, just unfinished process bookkeeping.

---

# Security Verification — Phase 02, Plan 03 (Walk-in Booking Creation / Overbooking-Safe Transaction)

**Verified:** 2026-08-18
**Plan:** `.paul/phases/02-front-desk-booking-core/02-03-PLAN.md`
**Audit input:** `.paul/phases/02-front-desk-booking-core/02-03-AUDIT.md`
**Auditor:** gsd-security-auditor
**Method:** Live execution against real code + real DB. Ran the project's own `smoke-test-booking-flow.ts` (18/18 checks) and `smoke-test-booking-concurrency.ts` (50 concurrent requests, 6/6 checks) in full. Also wrote and ran one disposable, self-contained probe script (`_audit-probe-bookings.ts`, 32 checks) against an in-process ephemeral server with a real Postgres DB, independently exercising attack paths beyond both smoke tests' existing coverage — deleted after use, confirmed via `git status --short` that no trace remains in the working tree. A prior `security-review` skill pass found one real HIGH finding (Prisma filter-operator injection via unvalidated `guest.email`) which was fixed and given a regression test in the existing smoke test; this pass independently re-probes that fix with variant payloads rather than trusting the existing regression test alone, and separately verifies every mitigation the plan and audit *committed to* under live, adversarial conditions — not just that matching code exists.

**Verdict: SECURED — 14/14 committed mitigations closed.** All mitigations named in PLAN.md's audit-added task actions and 02-03-AUDIT.md's must-have/strongly-recommended findings were independently verified live, including the guest.email operator-injection fix (re-probed with 9 variant payload shapes beyond the existing regression test), the HOUSEKEEPING role gate (proven to never reach a DB call, not just to return 403), the ratePlanId-belongs-to-wrong-roomType 404 case (not previously smoke-tested, now proven byte-identical to a genuinely nonexistent id), and full-handler error-detail containment (forced live at two distinct points: the ownership-check query and the transaction itself).

---

## Threat Verification

| # | Mitigation Committed | Disposition | Status | Evidence |
|---|---|---|---|---|
| 1 | Endpoint requires valid JWT via `requireAuth` — no route reachable without authentication | mitigate | **CLOSED** | `src/routes/bookings.ts:40` (`bookingsRouter.post("/", requireAuth, ...)`). Live-tested: missing Authorization header → 401 (smoke test AC-6); a structurally-forged JWT (valid header/payload shape, invalid signature) → 401 (independent probe), matching `src/middleware/auth.ts:13-28`'s established try/catch-around-verify pattern. |
| 2 | Role gate: only `FRONT_DESK`/`HOTEL_ADMIN`/`SUPER_ADMIN` may create bookings; `HOUSEKEEPING` blocked before any other logic (AC-7, AUDIT.md must-have #2) | mitigate | **CLOSED** | `src/routes/bookings.ts:43-46` — `BOOKING_ROLES.has(role)` check is the first statement after destructuring `req.auth`, before body parsing or any DB call. Live-tested beyond the smoke test's status-code-only check: monkey-patched `prisma.roomType.findFirst` (the first DB call in the handler) to set a flag before delegating, then fired a real HOUSEKEEPING-role request — response was 403 **and the flag was never set**, proving the role gate genuinely short-circuits before touching the DB, not merely before returning a response. |
| 3 | Guest PII exact-match lookup: `guest.email` type-validated as `string \| undefined` before ever reaching a Prisma `where` filter — closes the filter-operator injection found by `security-review` (an unvalidated `{"not": null}`-shaped value would otherwise match an arbitrary existing Guest row) | mitigate | **CLOSED** | `src/routes/bookings.ts:63` — `(guest.email !== undefined && typeof guest.email !== "string")` rejects with 400 before any DB call. Independently re-probed live with 9 payload variants beyond the existing regression test: `{not:null}`, `{contains:""}`, array, nested object, number, boolean, explicit `null`, `{in:[]}`, `{startsWith:""}` — **all 9 rejected with 400**, none reached the Guest find-or-create query. |
| 4 | Raw per-date inventory UPDATE uses a Prisma tagged-template literal (auto-parameterized) — not string concatenation or `Prisma.raw` (AUDIT.md must-have #1) | mitigate | **CLOSED** | `src/routes/bookings.ts:174-181` — `` tx.$executeRaw`UPDATE "DailyInventory" SET ... WHERE ... AND "date" = ${dateObj} ...` `` uses genuine tagged-template interpolation (grepped: no `Prisma.raw`, `Prisma.sql`, or string concatenation anywhere in the file). Live-tested with a SQL-injection-shaped `roomTypeId` string (`"' OR '1'='1"`) — since `roomTypeId` only ever reaches Prisma's ORM `findFirst` filter (not the raw SQL, which only ever receives the already-validated `hotelId`/`roomTypeId`/`dateObj`/`quantity` from server state), the request cleanly 404'd rather than causing any anomalous query behavior. |
| 5 | Missing-`RatePlanDailyRate` guard: date range must have a full set of daily-rate rows or the request is rejected 409 before any mutation (AC-9, AUDIT.md must-have #3) | mitigate | **CLOSED** | `src/routes/bookings.ts:129-132` — `rateRows.length < dateList.length` check runs before the transaction opens. Verified live via `smoke-test-booking-flow.ts` AC-9 (a date-range with a deleted middle-date rate row → 409, zero Booking rows created) — re-ran during this pass, still passes. |
| 6 | Money arithmetic uses Prisma `Decimal` (`decimal.js` `.plus()`/`.times()`), never native JS `number`, for the running total (AUDIT.md must-have #4) | mitigate | **CLOSED** | `src/routes/bookings.ts:138-142` — `dateList.reduce((acc, date) => acc.plus(rateByDate.get(date)!), new Prisma.Decimal(0))` then `.times(quantity)`. Grepped the file for any `parseFloat`/`Number(...)` used in the total-computation path — none found; `Number(...)` only appears in the smoke test's own assertions, reading the final Decimal-computed value back for comparison. |
| 7 | Max stay length capped at 30 nights, rejected 400 before the transaction opens (AC-5, AUDIT.md must-have #5) | mitigate | **CLOSED** | `src/routes/bookings.ts:9,85-91`. Confirmed live via `smoke-test-booking-flow.ts` (45-night stay → 400) — re-ran during this pass, still passes. |
| 8 | Ownership check: `roomTypeId` AND `ratePlanId` must both belong to `req.auth.hotelId`, AND `ratePlanId` must belong to the specific `roomTypeId` requested — any failure returns the exact same byte-identical 404 used for a genuinely nonexistent id (AC-2) | mitigate | **CLOSED** | `src/routes/bookings.ts:101-115` — single shared `NOT_FOUND_BODY` constant (`:16`) used on all three failure branches (`roomType` not found/wrong-hotel, `ratePlan` not found/wrong-hotel, `ratePlan.roomTypeId` mismatch — enforced via the `roomTypeId` field in the `ratePlan` `findFirst` `where` clause at `:110`). **Live-tested the specific case PLAN.md flagged as not yet explicitly smoke-tested:** a real, hotel-A-owned `ratePlanId` belonging to a *different* room type than the requested `roomTypeId` → 404, response body byte-identical to a genuinely nonexistent `ratePlanId`'s 404. Also independently re-verified the already-smoke-tested cross-tenant case (Hotel B's real roomTypeId) → 404, byte-identical to nonexistent. |
| 9 | `hotelId` used for every check/mutation comes only from `req.auth.hotelId` (verified JWT claim) — never from the request body | mitigate | **CLOSED** | `src/routes/bookings.ts:41` — `const { role, hotelId, userId } = req.auth!;` is the only source of `hotelId` in the file; grepped for any other origin (`req.body.hotelId`, query, header) — none found. **Live-tested, not just code-read:** POSTed a valid Hotel-A booking with a spoofed `hotelId: <Hotel B's id>` field injected into the body — request succeeded (201) against Hotel A as normal, confirming the spoofed field is silently ignored, matching 02-02's proven pattern for this endpoint category. |
| 10 | Conditional atomic UPDATE (check-and-increment in one statement) prevents two concurrent requests from overselling the last room (AC-3) | mitigate | **CLOSED** | `src/routes/bookings.ts:172-183`. Proven live via `smoke-test-booking-concurrency.ts`, re-run in full during this pass: 50 concurrent requests for 1 available room → exactly 1×201, 49×409, 0 unexpected statuses; `DailyInventory.bookedCount === 1` afterward; CHECK constraint invariant (`bookedCount + heldCount <= availableCount`) held; exactly 1 Booking row created. |
| 11 | Multi-night bookings are all-or-nothing: throwing inside `prisma.$transaction` rolls back every date's increment already applied in that same attempt (AC-4) | mitigate | **CLOSED** | `src/routes/bookings.ts:182` (`if (affected !== 1) throw new SoldOutError();`) inside the `tx` callback. Proven live via `smoke-test-booking-flow.ts` AC-4, re-run during this pass: a 3-night request with a sold-out middle date → 409, and the first night's `bookedCount` confirmed back at 0 afterward (not left incremented). |
| 12 | Lightweight duplicate-submission dedupe: an identical booking (same hotelId/roomTypeId/dates/guest email) within a 30-second window is rejected 409 instead of creating a second Booking (AC-8, AUDIT.md strongly-recommended #1) | mitigate | **CLOSED** | `src/routes/bookings.ts:148-165`. Proven live via `smoke-test-booking-flow.ts` AC-8, re-run during this pass: identical back-to-back submissions → first 201, second 409, exactly 1 Booking row exists afterward. Disposition matches the plan's own scoping: an intentionally lightweight 30-second window, not a full idempotency-key system — documented as an accepted residual risk in PLAN.md's `<boundaries>`/AUDIT.md "risks remain if shipped" section, not silently absent. |
| 13 | Full handler body — role gate through the transaction — wrapped in one try/catch; unexpected errors return generic 500 with no leaked stack trace or internal detail | mitigate | **CLOSED** | `src/routes/bookings.ts:100-236` — single `try` opens before the ownership check (`:101`) and closes after the transaction (`:222`), `catch` at `:225-236` distinguishes only the two expected internal error types (`SoldOutError` → 409, `DuplicateSubmissionError` → 409) and falls through to a generic `{ error: "Internal server error" }` 500 for anything else, logging the real error server-side only via `console.error`. **Live-forced at two distinct points, not just read:** (a) monkey-patched `prisma.$transaction` itself to throw a distinctive marker string — response was 500 with the exact generic body, marker never appeared in the HTTP response (only in the server-side log); (b) separately monkey-patched `prisma.roomType.findFirst` (the ownership-check call, before the transaction even opens) to throw a different marker — response was 500 with the generic body, that marker also never leaked. Confirms the try/catch genuinely spans both the pre-transaction ownership check and the transaction itself, not just one or the other. |
| 14 | `RatePlan.minStay` unenforced and single-room-type-per-request are documented, deliberate scope limits — not silent gaps (AUDIT.md strongly-recommended #2, #3) | accept | **CLOSED** | `.paul/phases/02-front-desk-booking-core/02-03-PLAN.md` `<boundaries>` SCOPE LIMITS section (lines 221-222) explicitly documents both as deferred decisions with rationale, matching the audit's own "risks remain if shipped" disclosure. No code enforcement expected or claimed for either — verified only that the documentation exists and is visible, per this disposition's verification method. |

## Additional checks performed

- **`npm run build`** — passes clean (`tsc -p tsconfig.json`, exit 0), re-confirmed during this pass.
- **Both existing smoke tests re-run in full during this pass:** `smoke-test-booking-flow.ts` (18/18 checks) and `smoke-test-booking-concurrency.ts` (6/6 checks) — no regressions, both pass identically to their last recorded run.
- **Additional live-probed edge cases beyond the smoke tests' own coverage** (all from the disposable `_audit-probe-bookings.ts`, all passed): negative quantity → 400; zero quantity → 400; non-integer (`1.5`) quantity → 400; absurdly large quantity (999,999,999) against 1 available room → clean 409 (not 500, not a silent overselling 201); `roomTypeId` submitted as a non-string object (`{$ne: null}`) → 400, never reaches the ORM `where` clause as a raw object.
- **`src/app.ts` route wiring:** `bookingsRouter` mounted at `/api/bookings` (`src/app.ts:17`), auth applied per-route (`src/routes/bookings.ts:40`) rather than relying on a shared app-level gate, consistent with 02-01/02-02's per-route pattern.
- **Working-tree hygiene:** the one disposable probe script written for this audit (`src/scripts/_audit-probe-bookings.ts`) was deleted immediately after use; `git status --short src/scripts/` re-checked afterward and shows only the two pre-existing implementation smoke-test files as untracked (pending the coordinator's own commit), no residual audit artifacts.

## Unregistered Flags

None. No `02-03-SUMMARY.md` exists yet at time of this audit (only `02-03-PLAN.md` and `02-03-AUDIT.md` are present in the phase directory), so there is no `## Threat Flags` section to cross-reference — same process-sequencing situation noted for 02-01 and 02-02 above, not a security gap.

---

## Recommendation

**Sign off.** All 14 mitigations named in this verification's scope — 5 must-have + 3 strongly-recommended items from 02-03-AUDIT.md, the plan's own AC-2/AC-3/AC-4/AC-6/AC-7/AC-8/AC-9 mitigations, and the `security-review` skill's HIGH-severity guest.email filter-operator-injection fix — are confirmed present in the code and independently demonstrated working under live HTTP traffic against a real database, including three items that go beyond what either existing smoke test directly exercises: the HOUSEKEEPING role gate proven to never reach a DB call (not just to return 403), the ratePlanId-belongs-to-wrong-roomType 404 case (explicitly flagged in the task brief as not yet smoke-tested, now proven byte-identical to a genuinely nonexistent id), and the try/catch's error-detail containment forced live at two distinct failure points (the ownership-check query and the transaction itself) rather than only one. The guest.email injection fix was independently re-probed with 9 payload variants beyond the existing regression test's single case, and held in every variant. This plan's core goal — atomic, overbooking-safe walk-in booking creation — was proven live under real concurrent load and real adversarial input, not just reasoned about or trusted from prior reports.

One outstanding non-security item, same class as noted for 02-01 and 02-02: `.paul/phases/02-front-desk-booking-core/02-03-SUMMARY.md` should still be created per PLAN.md's `<output>` requirement — not a security gap, just unfinished process bookkeeping.
