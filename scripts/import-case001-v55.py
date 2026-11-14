"""Import v5.5 source and retain the original card blocks for audit."""
from pathlib import Path
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'docs/reference/case001/v5.5'
DEST = ROOT / 'packages/server/scenarios/case-001'
script_path = next(SOURCE.glob('*StoryScript*'))
script = script_path.read_text(encoding='utf8')
qa = json.loads(next(SOURCE.glob('*QA_Playtest.json')).read_text(encoding='utf8'))
def write(suffix, value):
    (DEST / ('case-001.v5.5.' + suffix)).write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf8')

matches = list(re.finditer(
    r'^### ([A-F]\d+|H1) — (.+)\n([\s\S]*?)(?=^### (?:[A-F]\d+|H1) —|^# IV\.|\Z)',
    script.split('# IV.')[0], re.M))
assert len(matches) == 31
scenes = {}
for match in matches:
    sid, title, body = match.groups()
    sections = list(re.finditer(r'^#{3,4} (.+)\n([\s\S]*?)(?=^#{3,4} |\Z)', body, re.M))
    def section(pattern):
        return '\n'.join(m[2].strip() for m in sections if re.search(pattern, m[1]))
    aloud = section(r'🎬|DM อ่าน')
    quotes = re.findall(r'^> (?!\*\*)(.+)', aloud, re.M)
    cue = '\n'.join(quotes)
    # Conditional Final openings are selected by the server.
    if sid in ['F2', 'F5']:
        cue = ''
    npc = section(r'🗣️|พูด|ปฏิกิริยา')
    responses = section(r'💬|คำถาม|ตอบ')
    rows = next(s['questions'] for s in qa['scenes'] if s['scene'] == sid)
    dialogue = []
    possible_speakers = {q['speaker'] for q in rows if q['kind']=='npc'}
    speaker = next(iter(possible_speakers)) if len(possible_speakers)==1 else None
    actors = 'ประเสริฐ|วิชัย|ต้น|ยายบุญมี|แม่แก้ว|ดล|นิด|เพิ่ม|ผีเงาจมน้ำ'
    for line in (npc + '\n' + responses).splitlines():
        found = re.search(r'(' + actors + r')(?:\s*\([^)]*\))?\s*[:พูด]', line)
        if found:
            speaker = found[1]
        if not speaker or 'DM ONLY' in line:
            continue
        for quote in re.finditer('“([^”]+)”', line):
            dialogue.append(dict(id=f'{sid}:v55:{len(dialogue)+1}', scene=sid,
                                 speaker=speaker, label='บทหลัก', text=quote[1],
                                 context=line, field='npcLines'))
    scenes[sid] = dict(
        id=sid, title=re.sub(r'\s*\(Playtest v5\.5\)', '', title), phase='FINAL' if sid.startswith('F') else 'E' if sid=='H1' else sid[0],
        purpose=body.split('\n###')[0].strip(), presence=body.split('\n###')[0].strip(),
        dmReadAloud=aloud, npcLines=npc, responses=responses, clues=section(r'🔎|เบาะแส'),
        fallback=section(r'🧭|ทางสำรอง'), nextSceneHandoff=section(r'➡️|ไปต่อ'),
        dmSecret=section(r'🔒|ลับ'), sourceMarkdown=body.strip(), cue=cue,
        questions=[q['question'] for q in rows if q['kind']!='action'],
        checkId=None, dialogue=dialogue)
for act in 'ABCDEF':
    write(act+'.json', {sid:s for sid,s in scenes.items() if s['phase']==('FINAL' if act=='F' else act)})
endings = {}
for m in re.finditer(r'^## ENDING ([A-D]) — (.+)\n([\s\S]*?)(?=^## ENDING |^### |^# |\Z)', script, re.M):
    endings[m[1]] = dict(title=m[2],script=m[3].strip(),paragraphs=re.findall(r'^> (.+)$',m[3],re.M))
assert len(endings)==4
write('endings.json', endings)
cards = list(re.finditer(r'^### 🎲 (.+)\n([\s\S]*?)(?=^### 🎲 |^## 7\.1|\Z)', script, re.M))
assert len(cards)==17
baseline=json.loads((DEST/'case-001.v5.3.checks.json').read_text(encoding='utf8'))
checks=[]
raw={}
for card in cards:
    cid=next((c['id'] for c in baseline if c['id'] in card[1]), 'E2_DOOR_BREAK')
    template=next((c for c in baseline if c['id']==cid), dict(
        id=cid,scene_id='E2',title='พังประตูห้องขัง',stat='BODY',dc=14,partial_margin=3))
    check={**template, 'sourceMarkdown':card[0]}
    check.pop('decision',None)
    for field,label in [('trigger','เรียกทอยเมื่อ'),('baseline','ข้อมูลที่ได้แน่ ๆ'),('bypass','ไม่ต้องทอยเมื่อ'),('fallback','ถ้าทอยพลาดแล้วไปต่ออย่างไร')]:
        m=re.search(r'\*\*'+label+r':\*\* (.+)',card[2])
        check[field]=m[1] if m else ''
    for name,label in [('full','FULL SUCCESS'),('partial','PARTIAL SUCCESS'),('failure','FAILURE')]:
        m=re.search(r'^#### .*'+label+r'.*\n([\s\S]*?)(?=^#### |^\*\*สำคัญ|\Z)',card[2],re.M)
        assert m, cid
        def item(pattern):
            value=re.search(pattern,m[1])
            return value[1] if value else ''
        check[name]=dict(dm=item(r'\*\*\[DM อ่าน\]\*\* (.+)'),
                         dialogue=item(r'\*\*\[บทพูด / เสียง\]\*\* (.+)'),
                         information=[item(r'\*\*ข้อมูล:\*\* (.+)')],
                         state=item(r'\*\*\[ผลต่อสถานะ\]\*\* (.+)'))
    checks.append(check)
    raw[cid]=card[0]
assert len({c['id'] for c in checks})==17
write('checks.json',checks)
write('cards-original.json',raw)
write('qa.json',qa)
write('contract.json',json.loads(next(SOURCE.glob('*Contract.json')).read_text(encoding='utf8')))
write('overrides.json',json.loads(next(SOURCE.glob('*Presentation_Overrides.json')).read_text(encoding='utf8')))
(DEST/'case-001.v5.5.script.md').write_bytes(script_path.read_bytes())
write('manifest.json',dict(version='5.5',sceneCount=31,checkCount=17,qaCount=sum(len(s['questions']) for s in qa['scenes']),
                          sha256=hashlib.sha256(script_path.read_bytes()).hexdigest()))
