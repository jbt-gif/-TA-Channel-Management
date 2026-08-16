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
