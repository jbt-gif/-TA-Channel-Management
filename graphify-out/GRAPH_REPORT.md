# Graph Report - OTA System Project  (2026-08-16)

## Corpus Check
- 41 files · ~29,495 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 352 nodes · 379 edges · 26 communities
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.65)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ce3f4c4d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- prisma.ts
- scripts
- PH Channel Manager
- compilerOptions
- routes/auth.ts
- 01-03-PLAN.md
- 01-02-PLAN.md
- 02-01-PLAN.md
- PAUL Session Handoff
- Phase 1 Plan 01: Data Model Foundation Summary
- "Hotel"
- 01-01-PLAN.md
- Phase 1 Plan 02: Daily Inventory + Seed Worker Summary
- Phase 1 Plan 03: Booking, Payment & Channel Mapping Summary
- Phase Details
- Enterprise Plan Audit Report
- Enterprise Plan Audit Report
- Enterprise Plan Audit Report
- Enterprise Plan Audit Report
- Project State
- Integrations
- ARCHITECTURE.md
- Specialized Flows
- dependencies

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 14 edges
2. `"Hotel"` - 12 edges
3. `PH Channel Manager` - 12 edges
4. `prisma` - 10 edges
5. `Phase 1 Plan 01: Data Model Foundation Summary` - 10 edges
6. `Phase 1 Plan 02: Daily Inventory + Seed Worker Summary` - 10 edges
7. `Phase 1 Plan 03: Booking, Payment & Channel Mapping Summary` - 9 edges
8. `scripts` - 8 edges
9. `PAUL Session Handoff` - 8 edges
10. `Phase Details` - 8 edges

## Surprising Connections (you probably didn't know these)
- `"DailyInventory"` --references--> `"Hotel"`  [EXTRACTED]
  prisma/migrations/20260815085356_add_daily_inventory_and_rate_plan_rates/migration.sql → prisma/migrations/20260815083409_init_core_schema/migration.sql
- `"RatePlanDailyRate"` --references--> `"Hotel"`  [EXTRACTED]
  prisma/migrations/20260815085356_add_daily_inventory_and_rate_plan_rates/migration.sql → prisma/migrations/20260815083409_init_core_schema/migration.sql
- `"Booking"` --references--> `"Hotel"`  [EXTRACTED]
  prisma/migrations/20260815091329_add_booking_core_models/migration.sql → prisma/migrations/20260815083409_init_core_schema/migration.sql
- `"BookingItem"` --references--> `"Hotel"`  [EXTRACTED]
  prisma/migrations/20260815091329_add_booking_core_models/migration.sql → prisma/migrations/20260815083409_init_core_schema/migration.sql
- `"Guest"` --references--> `"Hotel"`  [EXTRACTED]
  prisma/migrations/20260815091329_add_booking_core_models/migration.sql → prisma/migrations/20260815083409_init_core_schema/migration.sql

## Import Cycles
- None detected.

## Communities (26 total, 0 thin omitted)

### Community 0 - "prisma.ts"
Cohesion: 0.12
Nodes (15): globalForPrisma, prisma, addDays(), getManilaToday(), seedInventoryForRoomType(), isValidRole(), main(), Role (+7 more)

### Community 1 - "scripts"
Cohesion: 0.08
Nodes (25): devDependencies, prisma, tsx, @types/bcryptjs, @types/express, @types/node, typescript, name (+17 more)

### Community 2 - "PH Channel Manager"
Cohesion: 0.10
Nodes (20): Active (In Progress), Business Constraints, Compliance Constraints, Constraints, Context, Core Features, Core Value, Current State (+12 more)

### Community 3 - "compilerOptions"
Cohesion: 0.10
Nodes (20): dist, ES2022, node_modules, src/**/*.ts, compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames (+12 more)

### Community 4 - "routes/auth.ts"
Cohesion: 0.18
Nodes (11): app, AuthClaims, secretKey, signToken(), verifyToken(), Express, Request, requireAuth() (+3 more)

### Community 5 - "01-03-PLAN.md"
Cohesion: 0.12
Nodes (16): AC-1: All five new models follow the established multi-tenant isolation pattern, AC-2: A full booking chain can be created and correctly linked, AC-3: Booking cancellation never destroys history, AC-4: BookingItem carries a total price snapshot, not a live price reference, AC-5: ChannelMapping can link either a RoomType or a RatePlan to an external Channex id, AC-6: The database rejects structurally invalid data even if application code has a bug, AC-7: Booking and Payment record which staff member acted, when known, DO NOT CHANGE (+8 more)

### Community 6 - "01-02-PLAN.md"
Cohesion: 0.12
Nodes (15): AC-1: Availability is shared across rate plans of the same room type, not independent per rate plan, AC-2: Rate plans have independent price/minStay, not independent availability, AC-3: Seed covers exactly 365 days from today in Asia/Manila time, AC-4: Seed worker is idempotent, AC-5: The database itself refuses to let bookings exceed physical availability, AC-6: Seeding a RoomType with zero physical rooms does not error, DO NOT CHANGE, Goal (+7 more)

### Community 7 - "02-01-PLAN.md"
Cohesion: 0.12
Nodes (15): AC-1: Staff can log in with valid credentials, AC-2: Invalid credentials are rejected without leaking which part was wrong, AC-3: Auth middleware enforces a valid, unexpired token on protected routes, AC-4: Auth middleware correctly attaches hotel-scoping context, AC-5: Passwords are never stored or logged in plaintext, DO NOT CHANGE, Goal, Output (+7 more)

### Community 8 - "PAUL Session Handoff"
Cohesion: 0.14
Nodes (13): Cross-hotel "super admin" view for founder, Decisions Made, Gap Analysis with Decisions, Keeping DailyInventory.availableCount in sync with Room changes, Open Questions, PAUL Session Handoff, Prioritized Next Actions, Reference Files for Next Session (+5 more)

### Community 9 - "Phase 1 Plan 01: Data Model Foundation Summary"
Cohesion: 0.14
Nodes (13): Acceptance Criteria Results, Accomplishments, Auto-fixed Issues, Decisions Made, Deferred Items, Deviations from Plan, Files Created/Modified, Issues Encountered (+5 more)

### Community 10 - ""Hotel""
Cohesion: 0.30
Nodes (12): "Hotel", "RatePlan", "Room", "RoomType", "User", "DailyInventory", "RatePlanDailyRate", "Booking" (+4 more)

### Community 11 - "01-01-PLAN.md"
Cohesion: 0.15
Nodes (12): AC-1: Backend project boots, AC-2: Schema migrates against the real dev database, AC-3: Schema is structurally correct, not just present, AC-4: Smoke test is repeatable, not one-shot, DO NOT CHANGE, Goal, Output, Project Context (+4 more)

### Community 12 - "Phase 1 Plan 02: Daily Inventory + Seed Worker Summary"
Cohesion: 0.15
Nodes (12): Acceptance Criteria Results, Accomplishments, Decisions Made, Deferred Items, Deviations from Plan, Files Created/Modified, Issues Encountered, Next Phase Readiness (+4 more)

### Community 13 - "Phase 1 Plan 03: Booking, Payment & Channel Mapping Summary"
Cohesion: 0.15
Nodes (12): Acceptance Criteria Results, Accomplishments, Auto-fixed Issues, Decisions Made, Deferred Items, Deviations from Plan, Files Created/Modified, Issues Encountered (+4 more)

### Community 14 - "Phase Details"
Cohesion: 0.15
Nodes (12): Current Milestone, Overview, Phase 1: Data model + inventory foundation ✅ Complete (2026-08-15), Phase 2: Front-desk booking core, Phase 3: Hotel admin config UI, Phase 4: Channex integration, Phase 5: Xendit payments, Phase 6: Mobile housekeeping view (+4 more)

### Community 15 - "Enterprise Plan Audit Report"
Cohesion: 0.18
Nodes (10): 1. Executive Verdict, 2. What Is Solid (Do Not Change), 3. Enterprise Gaps Identified, 4. Upgrades Applied to Plan, 5. Audit & Compliance Readiness, 6. Final Release Bar, Deferred (Can Safely Defer), Enterprise Plan Audit Report (+2 more)

### Community 16 - "Enterprise Plan Audit Report"
Cohesion: 0.18
Nodes (10): 1. Executive Verdict, 2. What Is Solid (Do Not Change), 3. Enterprise Gaps Identified, 4. Upgrades Applied to Plan, 5. Audit & Compliance Readiness, 6. Final Release Bar, Deferred (Can Safely Defer), Enterprise Plan Audit Report (+2 more)

### Community 17 - "Enterprise Plan Audit Report"
Cohesion: 0.18
Nodes (10): 1. Executive Verdict, 2. What Is Solid, 3. Enterprise Gaps Identified, 4. Upgrades Applied to Plan, 5. Audit & Compliance Readiness, 6. Final Release Bar, Deferred (Can Safely Defer), Enterprise Plan Audit Report (+2 more)

### Community 18 - "Enterprise Plan Audit Report"
Cohesion: 0.18
Nodes (10): 1. Executive Verdict, 2. What Is Solid, 3. Enterprise Gaps Identified, 4. Upgrades Applied to Plan, 5. Audit & Compliance Readiness, 6. Final Release Bar, Deferred (Can Safely Defer), Enterprise Plan Audit Report (+2 more)

### Community 19 - "Project State"
Cohesion: 0.18
Nodes (10): Accumulated Context, Blockers/Concerns, Current Position, Decisions, Deferred Issues, Git State, Loop Position, Project Reference (+2 more)

### Community 20 - "Integrations"
Cohesion: 0.20
Nodes (9): Enterprise Plan Audit, Future Integrations, Goal-Backward Verification (gsd-verifier), Integrations, Preferences, Project Config, Project Settings, SonarQube (+1 more)

### Community 21 - "ARCHITECTURE.md"
Cohesion: 0.25
Nodes (6): Auth (Phase 2, Plan 02-01 — PLANNED AND AUDITED ONLY, NO CODE YET), Data model (Phase 1, complete — 2026-08-15), DB access model (read before adding any Supabase-client code), Deferred (tracked, not forgotten), Known gotchas / decisions log, Stack

### Community 22 - "Specialized Flows"
Cohesion: 0.25
Nodes (7): Amendment History, Phase Overrides, Project-Level Dependencies, Skill Audit Template, Specialized Flows, Templates & Assets, Verification Checklist

### Community 23 - "dependencies"
Cohesion: 0.18
Nodes (11): bcryptjs, express, express-rate-limit, jose, dependencies, bcryptjs, express, express-rate-limit (+3 more)

## Knowledge Gaps
- **230 isolated node(s):** `name`, `version`, `private`, `type`, `dev` (+225 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `prisma` connect `prisma.ts` to `routes/auth.ts`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `scripts`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _230 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `prisma.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1225071225071225 - nodes in this community are weakly interconnected._
- **Should `scripts` be split into smaller, more focused modules?**
  _Cohesion score 0.07692307692307693 - nodes in this community are weakly interconnected._
- **Should `PH Channel Manager` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._