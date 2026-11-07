# TEMPLATE — New CASE Authoring (for CASE 002 onward)

> คัดลอกไฟล์นี้ไปใช้สร้างเคสใหม่; ฟิลด์ในวงเล็บเหลี่ยมคือสิ่งที่ผู้เขียนต้องระบุ ไม่ใช่คำสั่งในเกม

## Header

- Case ID: `[CASE-...]`
- Title TH / EN: `[title]`
- Version: `[x.y]`, status: `design_draft`
- Recommended players: `2–4`
- Estimated **world** duration: `[hours/days]`
- Estimated **session** count: `[number or estimate]`
- Location / timezone / date: `[setting; worldTime ISO]`
- Tone / content boundaries / safety notes: `[topics to warn about]`

## Case overview

- Player-facing mission brief: `[what company tells players; no spoilers]`
- Actual hidden truth (DM-only): `[what happened, by whom, why]`
- Essential mystery: `[question 1..n]`
- Human stakes / moral dilemma: `[what matters beyond killing ghost]`
- Endings: `[3–5 main outcomes with priority and state criteria]`

## Timeline & geography

| Day / world time | Location | Event scheduled in fiction | Trigger / alternate if players arrive early |
|---|---|---|---|
| Day 1 10:00 | [scene] | [event] | [condition] |
| Day 2 18:00 | [scene] | [event] | [condition] |

World Time ≠ Session Time. NPC ไม่มีสิทธิ์วาร์ปเข้าฉาก; ตรวจ location, travel time, custody, alive state ก่อนเปิด dialogue.

## Scene record (ทำซ้ำทุก Scene)

```text
scene_id:
phase / day / location:
expected_time_window:
scene_goal:
start_trigger:
DM_narration:
mandatory_dialogue: [script ids]
NPC_present: [ids and where physically present]
NPC_secret_knowledge: [facts that can be told / cannot be told]
player_actions:
  - action_id:
    player_intent:
    approach_options: [PER/INT/SOC/SPI/RES/BODY where each makes sense]
    needs_roll: true/false
    dc: 11/14/17/20/22 or case-defined
    partial_supported: true/false
    full_result:
    partial_result:
    fail_result:
    time_cost_minutes:
    resource_effect:
clues: [visible, major, bonus]
mandatory_lead_to_next: [at least one clue not dice-locked]
fallback_route:
clock_trigger:
exit_conditions:
state_write:
```

## NPC records

- `npc_id`, `current_location`, `knowledge`, `lies_or_evasions`, `trust`, `mandatory_dialogue`, `conditional_dialogue`, `injury_or_custody_status`
- Test NPC answers to: polite question, direct accusation, evidence shown, threat, bribe, request for help, request to leave, question outside their knowledge
- A Full Check never grants NPC omniscience or bypasses magical speech restrictions

## Clue graph

| Clue ID | Tier | Primary source | Alternate source | Required for what? |
|---|---|---|---|---|
| CLUE-A | critical | NPC-A | physical note | move to B |
| CLUE-B | major | document | witness | interpret motive |
| CLUE-C | bonus | spirit echo | none | optional advantage |

Every critical clue must be obtainable **without a single mandatory successful roll**. If reaching source requires an obstacle, provide a second path or a fail-forward consequence.

## Encounter and enemy rules

- Enemy ID / phase / objective / win condition / retreat / failure / aftermath
- Attack formula, damage, Defense, initiative reference: `[link to universal combat rules once approved]`
- When enemy is temporarily dispersed: `[return condition, recovery duration, persistent consequences]`
- Non-combat resolution must be mechanically possible if intended
- No free revival/death of enemies for story convenience

## Case-specific clocks (optional)

- Clock ID / type: `objective | threat`
- Max progress: `[case-specific number]`, increments and decrements
- Trigger for tick, time deadline, effect at threshold, telegraphing
- The clock should advance from fiction, not on every rest without cause

## Multi-day design checklist

- [ ] Scheduled actions of antagonist continue while players sleep, with explicit triggers/deadlines
- [ ] NPC's location/custody and evidence persistence across days are tracked
- [ ] Long Rest and resource recovery use world time, not session time
- [ ] Fatigue if team stays awake for long periods
- [ ] Inventory/replenishment and consequences from missed appointments
- [ ] At least one alternative route if a necessary NPC dies/leaves/refuses
- [ ] Teams lacking specialist classes can still finish by other means
- [ ] Save & resume preserves exact worldTime, party resources, and consumed scene uses
- [ ] Ending criteria are mutually ordered and do not treat one failed check as automatic bad ending

## Playtest record

- Team: `[classes and size]`
- Total real playing minutes / world minutes / days:
- Number of non-combat checks, partials, fails, rerolls:
- Focus spent/recovered; HP/Sanity spent/recovered; number and type of rest:
- Critical clues skipped/blocked; NPC inconsistencies:
- Ending and conditions reached:
- Changes for next revision:
