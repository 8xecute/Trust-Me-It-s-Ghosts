#!/usr/bin/env python3
"""Validate JSON, scene ids, check ids and dialogue preservation for v4.3."""
import json,re
from pathlib import Path
p=Path(__file__).resolve().parent
f=json.loads((p/'data/CASE001_StoryFlow_v4.3.json').read_text())
d=json.loads((p/'data/CASE001_DiceChecks_v4.3.json').read_text())
g=json.loads((p/'data/CASE001_GuidedScenes_v4.3.json').read_text())
s=(p/'CASE001_StoryScript_v4.3.md').read_text()
old=(p/'references/CASE001_StoryScript_v4.2_REFERENCE_ONLY.md').read_text()
ids=[x['id'] for x in f['scenes']]
assert len(ids)==31 and len(set(ids))==31,('scenes',len(ids))
assert set(g['scenes'])==set(ids)
assert len(d['checks'])==16 and len({c['id'] for c in d['checks']})==16
assert all(c['scene_id'] in ids for c in d['checks'])
assert all(all(z in c for z in ('full','partial','failure')) for c in d['checks'])
assert len(re.findall(r'(?m)^#### 🧭 \[v4.3 การนำฉาก —',s))==31
assert len(re.findall(r'(?m)^#### 🎲 \[ทอยเต๋า —',s))==16
assert not re.search(r'(?m)^#### 🎬 \[เชื่อมฉาก v4.2 —',s)
assert g['phase_progress_policy']['can_revisit_closed_phase'] is False
assert len(g['phases'])==6
assert all(len(x['hints'])==3 for x in g['phases'].values())
assert not any(x.get('phase')=='H1' for x in g['scenes'].values())
# Verify original spoken/read-aloud content from v4.2 was not dropped: remove its bridge blocks.
act=old[old.index('## ACT 1 —'):]
act=re.sub(r'(?ms)^#### 🎬 \[เชื่อมฉาก v4\.2 — ([A-Z][0-9]+)\].*?(?=^### [A-Z][0-9]+ —|^## ACT |\Z)','',act)
# Extract canonical dialogue lines independent of v4.3 inserted headings.
quote_lines=lambda t:[line.strip() for line in t.splitlines() if line.startswith('> “') and len(line.strip())>18]
new_quoted=quote_lines(s)
missing=[line for line in quote_lines(act) if line not in new_quoted]
assert not missing,('missing original dialogue lines',missing[:3])
assert f['source_of_truth']=='CASE001_StoryScript_v4.3.md'
for c in d['checks']:
  assert '🎲 [ทอยเต๋า — '+c['id']+']' in s,c['id']
print('PASS: 31 guided scenes, 16 intact checks, 6 phase hints, no backward route, original quotes preserved, JSON valid.')
