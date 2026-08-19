# Project Config

**Project:** PH Channel Manager
**Created:** 2026-08-15

## Project Settings

```yaml
project:
  name: ph-channel-manager
  version: 0.0.0
```

## Integrations

### SonarQube

```yaml
sonarqube:
  enabled: false
```

Not enabled — no CI/repo yet, no SonarQube server. Revisit once there's a live codebase worth scanning.

### Enterprise Plan Audit

```yaml
enterprise_plan_audit:
  enabled: true
```

**Why enabled:** Real money (PayMongo payments) and guest PII flow through this system, and the founder is a non-technical builder relying on AI-assisted development. `/paul:plan` will suggest running `/paul:audit` before every APPLY.

### Goal-Backward Verification (gsd-verifier)

```yaml
goal_backward_audit:
  enabled: true
  trigger: pre-launch-only
```

**Not run per-phase.** Reserved as a single gate right before the first real hotel goes live — checks the built system against PROJECT.md's Core Value and Success Metrics directly, not just one plan's own acceptance criteria. Running it after every phase would be more ceremony than useful at this pre-revenue stage; running it once before real money is on the line is where it earns its cost.

### Future Integrations

```yaml
# linting:
#   enabled: false
```

## Preferences

```yaml
preferences:
  auto_commit: false
  verbose_output: false
  parallel_agents: false
```

**parallel_agents: false** — the single biggest token multiplier is running multiple subagents in parallel (each is a full separate context). Default off; only enabled for a specific task when it genuinely needs it, and flagged before running.

## Usage Governance

Not a native PAUL field — documented here so it persists across sessions instead of living only in conversation.

**Context:** Builder is on Claude Pro ($20/mo), working in 5-hour usage windows, cost-conscious pre-revenue. Budget discipline governs *pacing and approval*, never *thoroughness* — quality bar does not move to save tokens.

**Rules:**
- No parallel subagent spawning by default (see `parallel_agents` above).
- Before any operation likely to consume a large share of a usage window (a large multi-phase APPLY run, `/paul:audit`'s full review, `/code-review ultra`, multi-agent research spawns), state the scope/cost tradeoff and get explicit approval before running it — don't assume.
- If a usage window runs low mid-phase, checkpoint cleanly in STATE.md's Session Continuity section and stop, rather than leaving something half-built.
- Security-critical and payment-critical work (the 3 subsystems named in SPECIAL-FLOWS.md) always gets full rigor regardless of budget pressure — never shortened to save cost.

---
*Config created: 2026-08-15*
*Edit anytime — changes take effect on next command*
