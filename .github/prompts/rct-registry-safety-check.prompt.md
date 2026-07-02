---
description: "Standardized check for RCT inverter values using registry facts, API semantics, and rctjavalib safety mapping."
mode: ask
---

Run a structured safety analysis for one RCT inverter value and answer in the required sections.

## Input
Provide exactly one primary target:
- Identifier:
- Registry Name:
- OID:
- Intent:

Optional context:
- Proposed operation: read | write
- Proposed value:
- Device/runtime constraints:

## Required Process
1. Use registry documentation facts.
2. Use API semantics (ObjectInfo, datatype encode/decode, exceptions if relevant).
3. Map to rctjavalib implementation points.
4. Apply write guard policy.

## Required Output Sections
1. Registry Facts
2. API Semantics
3. rctjavalib Mapping
4. Safety Classification
5. Recommended Next Steps

## Hard Rules
- If ambiguous or unknown: classify as write-prohibited.
- Do not recommend a write without explicit validation rules.
- For write requests, include a readback verification step.
- Clearly state assumptions.
