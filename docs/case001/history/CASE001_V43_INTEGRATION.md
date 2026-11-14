# CASE 001 v4.3 integration

## Mapping and migration

- Existing runtime content was v4.0/v4.1. The supplied v4.2 reference remains in the source pack. No saved room is rewritten to v4.3.
- New story rooms use Guided Linear v4.3. Set CASE_STORY_VERSION=4.1 to start new rooms with the previous runtime. Existing saved rooms use their stored guided state or previous state.
- case-001.v4.3.GuidedScenes.json supplies 31 scene cues, up to three questions, phase hints and handoff guidance. StoryFlow validates scene IDs. DiceChecks preserves all 16 existing result branches.
- The full v4.3 Markdown is available to the DM. case-001.v4.3.dialogue.json contains verbatim public quotations extracted from it. Secret blocks are excluded. The server checks the current scene and NPC presence before returning these quotations.
- Existing roles, stats, Socket.IO, AP, dice cards, combat and save directory remain the integration points.
- The 96 public dialogue quotations are checked against the full source at startup. Legacy automatic scene narration is suppressed only in guided rooms, so it cannot overlap the new cues. Ending narration uses the approved v4.3 handoff paragraphs; the DM can read the complete matching ending script privately.

## Conflicts resolved

- Previous travel allowed A–E revisits and closed cases at A. Guided sessions use a monotonic phase and explicit handoff. The DM proposes a summary and one investigator confirms on behalf of the team. Everyone can continue investigating or cancel the proposal.
- E and Final share the existing E location. The guided phase keeps them distinct. Scene changes preserve positions.
- Opening the cellar does not grant safety. Escort actions collect the people being helped, and an explicit evacuation action takes them to safety. Changing phase alone grants no rescues. Evacuation uses the existing travel-time cost.
- The older engine required clearing two seals in D before acting on the bracelet. In guided rooms the discovered ritual core can be stopped from E4 using the existing seal3 test and costs, preserving forward recovery if D was skipped. Earlier seals remain recorded as they were.
- No recovery duration for a dispersed Mae Kaeo is specified. Guided Final does not automatically respawn her after a D victory. The existing state records temporary dispersal.
- H1 analyses actually acquired documents. Prasert's authored confession is available only where he is present. E4 supplies the documented alternate source without moving NPCs.
- Human DM free-text narration remains available. NPC replies in guided mode are selected from eligible authored quotations. Unsupported questions require DM review and cannot generate a new NPC fact automatically.
- The shared handoff journal includes only narration delivered to every investigator. It labels received testimony separately from confirmed evidence and preserves unanswered questions.

## Validation

Automated coverage is in packages/server/tests/case-v43.test.ts. It covers 2–4 investigators, cues before suggestions, closed-phase rejection, failed-check forward routes, all sixteen check branches, three hint tiers, saved phase/journal/check state, temporary dispersal and complete forward routes to all four endings.

The full pack checklist is PLAYTEST_GUIDED_LINEAR_v4.3.md in the source pack. Human pacing and creative questions still need a real group playtest. File saves require CASE_SAVE_DIR on persistent private storage.

## Changed files for this integration

- Content: `packages/server/scenarios/case-001/case-001.v4.3.{GuidedScenes.json,StoryFlow.json,DiceChecks.json,dialogue.json,script.md}`.
- Server: `packages/server/src/case001/guidedCase.ts`, `case001.ts`, `caseActions.ts`, `caseStory.ts`, `storyDice.ts`, `caseBattle.ts`; `packages/server/src/world.ts`, `index.ts`.
- Client: `packages/client/src/ui/case/GuidedPanel.tsx`, `ui/gm/DmWorkspace.tsx`, `network/onlineTypes.ts`, `OnlineGame.tsx`.
- Verification: `packages/server/tests/case-v43.test.ts`, `production-smoke.test.mjs` (explicit previous-version compatibility mode).
- Documentation: `README.md`, this file. Other pre-existing local changes are retained.

## วิธีทดสอบในเกม

1. เปิดห้องใหม่หลังรีสตาร์ตเซิร์ฟเวอร์ เลือก DM หนึ่งคนและผู้สืบสวนอย่างน้อยสองคน ห้องเซฟเก่ายังใช้บทเดิม
2. DM เริ่มคดี เปิดคิวบทเล่าแล้วส่ง cue A1 ผู้เล่นจึงเห็นหัวข้อสงสัยไม่เกินสามข้อ และส่งคำถามอิสระได้
3. ในแผงการดำเนินบท DM เปิดฉาก A3 และส่ง cue แล้วกดเตรียมสมุดคดี ผู้เล่นเลือกสำรวจต่อหรือยืนยันไป B
4. ตรวจว่ากลับ A ไม่ได้ ทดลองคำใบ้สามครั้ง และลอง B3 แบบทอยพลาดหรือจัดที่คุยปลอดภัยเพื่อไม่ต้องทอย
5. เดินหน้าผ่าน C2 และ D5 แม้ไม่พบยายหรือทอยพลาด ทดลอง E4 ก่อน E2 แล้วกลับมาช่วยในบท E
6. พบคนหายยังไม่เพิ่มจำนวนปลอดภัย ต้องพาออกและยืนยันพาไปจุดปลอดภัย อ่านเอกสาร H1 โดยไม่เรียกประเสริฐมาที่ E
7. หยุดแกนพิธีหรือรับผลจากการไม่หยุด ยืนยัน Final และตรวจรายงานตามสถานะจริง

## Acceptance evidence and remaining playtest

- Automated server tests cover forward routing with 2/3/4 investigators, all 16 checks and both F5 stats at Full/Partial/Failure thresholds, skipped interviews, failed B3/D5, E4 before E2, no free safety credit, H1 without an absent confession, no forced recovered boss, and actual routes to reports A–D.
- Cue replay, duplicate confirmations, private-journal filtering, safety bypass, serialized phase/check/hint/journal preservation and previous-version regressions have automated coverage.
- Chrome checks exercise cue-before-prompts, requested hint, handoff journal, investigator confirmation and DM scene controls. Screenshots were reviewed at mobile and desktop sizes; the character screen was also checked at 320px. This is not a complete human playthrough.
- Still needed: a real group's timing, improvised questions, evacuation roleplay and the combat-first routes on devices with different networks. The existing combat regression suite covers tactical rules, but it does not prove the entire v4.3 combat-first experience in a browser.
- No new numerical recovery duration or new NPC communication channel has been invented. Unsupported creative questions remain Human DM review; this does not introduce an autonomous AI or new System DM mode.
