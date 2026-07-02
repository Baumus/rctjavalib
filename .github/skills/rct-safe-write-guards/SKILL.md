---
name: rct-safe-write-guards
description: "Use when defining or reviewing safe write guards in rctjavalib, including allowlists, ranges, enum validation, risk classes, and write test requirements for RCT inverter values."
---

# RCT Safe Write Guards

## 1) Goal
Provide a deterministic framework for write safety decisions in rctjavalib.

## 2) Scope (MECE)

### In Scope
1. Classify write targets into risk classes.
2. Define allowlist and denylist decisions.
3. Define per-identifier validation constraints.
4. Define pre-write and post-write verification.
5. Define mandatory tests for write safety.

### Out of Scope
1. Protocol reverse engineering without evidence.
2. Auto-approving unknown values.
3. Security/operational guarantees beyond implemented checks.

## 3) Risk Classes (MECE)

1. LOW
- Cosmetic or non-critical behavior.
- Failure should not affect inverter safety envelope.

2. MEDIUM
- Operational behavior changes with reversible impact.
- Requires stronger validation and verification.

3. HIGH
- Grid limits, protection thresholds, power management, calibration, service/network settings.
- Default deny unless explicitly approved with complete constraints.

## 4) Decision Model (MECE)
For each identifier, decide exactly one state:

1. ALLOW
- Writable and fully constrained.

2. ALLOW_WITH_CONFIRMATION
- Writable but requires explicit user intent and stronger checks.

3. DENY
- Unknown, ambiguous, unsupported, or high-risk without complete constraints.

## 5) Guard Record Schema
Use one record per identifier:

- identifier: string
- oid: string
- risk_class: LOW | MEDIUM | HIGH
- decision: ALLOW | ALLOW_WITH_CONFIRMATION | DENY
- js_type: number | boolean | string | enum
- datatype_request: string
- datatype_response: string
- unit: string | null
- allowed_values: list | null
- min: number | null
- max: number | null
- step: number | null
- requires_confirmation: boolean
- requires_readback: boolean
- notes: string

## 6) Validation Pipeline (MECE)
Apply in this order; fail fast:

1. Identity validation
- Identifier exists and maps uniquely.

2. Policy validation
- Decision is not DENY.
- If ALLOW_WITH_CONFIRMATION: confirmation flag must be present.

3. Type validation
- JS type matches expected type.
- Request datatype is encodable.

4. Domain validation
- Enum value is whitelisted.
- Numeric value satisfies min/max/step.

5. Runtime safety validation
- Connection state is valid.
- Optional cooldown/rate-limit constraints are met.

6. Verification validation
- If requires_readback: perform readback and compare with tolerance.

## 7) High-Risk Default Deny Groups
Default to DENY unless explicit guard record exists:

- power_mng
- nsm
- grid_mon
- grid_lt
- switch_on_cond
- flash_param
- flash_rtc
- io_board
- wifi

## 8) Output Contract
When asked for a write recommendation, answer in this order:

1. Policy Decision
2. Validation Rules
3. Verification Plan
4. Required Tests
5. Residual Risk

No section overlap.

## 9) Test Requirements
Minimum write-test matrix per identifier:

1. Accept valid value.
2. Reject wrong type.
3. Reject out-of-range or unknown enum.
4. Enforce confirmation for ALLOW_WITH_CONFIRMATION.
5. Verify readback behavior and mismatch handling.
6. Verify deny-path error message quality.

## 10) Implementation Notes for rctjavalib
Apply guard checks in write path before frame build/transmit, and keep decisions data-driven.
Prefer centralized guard config over duplicated logic to avoid policy drift.
