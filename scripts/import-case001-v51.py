"""Import the approved source verbatim, one act at a time. No prose generation."""
from pathlib import Path
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[1]
SOURCE = next((ROOT / '5.1').glob('CASE001_StoryScript_v5.1*'))
DEST = ROOT / 'packages/server/scenarios/case-001'
source = SOURCE.read_text(encoding='utf-8')
old = json.loads((DEST / 'case-001.v4.3.GuidedScenes.json').read_text(encoding='utf-8'))
fields = ['dmReadAloud', 'npcLines', 'responses', 'clues', 'fallback', 'nextSceneHandoff', 'dmSecret']
matches = list(re.finditer(r'^### ([A-F]\d+|H1) — (.+)\n([\s\S]*?)(?=^### |\Z)', source.split('# IV.')[0], re.M))
assert len(matches) == 31
actors = ['ประเสริฐ', 'วิชัย', 'ต้น', 'ยายบุญมี', 'แม่แก้ว', 'ดล', 'นิด', 'เพิ่ม']
defaults = dict.fromkeys(['A1','A2','A3','B4','B5','C1','C2','H1'], 'ประเสริฐ')
defaults.update(dict.fromkeys(['B2','E5'], 'วิชัย'))
defaults.update(dict.fromkeys(['D3','D4','D5','F1','F2','F3','F4','F5','F6','E6'], 'แม่แก้ว'))
defaults.update(B3='ต้น', C5='ยายบุญมี', C3='เสียงจากผนัง', C4='ผีเงาจมน้ำ')

for act in ['A','B','C','D','E','F']:
    scenes = {}
    for match in matches:
        sid, title, body = match.groups()
        if ('E' if sid == 'H1' else sid[0]) != act:
            continue
        body = re.sub(r'\n(?:---\n|## ACT[^\n]*\n|<a id=[^\n]*\n)', '\n', body).strip()
        parts = re.split(r'^#### [^\n]+\n', body, flags=re.M)
        assert len(parts) == 8, sid
        intro = parts[0].split('**👥 ตัวละครที่อยู่ในฉาก**')
        scene = dict(id=sid, title=title, phase='FINAL' if act=='F' else act,
                     purpose=intro[0].replace('**🎯 เป้าหมายและเงื่อนไขเริ่ม**','').strip(),
                     presence=intro[1].strip(), sourceMarkdown=body)
        scene.update(zip(fields, (p.strip() for p in parts[1:])))
        # Only unconditional opening quotations enter the public cue. Additional
        # paragraphs carry their original trigger in the private reader.
        opening = re.split(r'\n[ \t]*>[ \t]*\n|\n\s*\n',scene['dmReadAloud'])[0]
        scene['cue'] = '\n'.join(line.removeprefix('> ').removeprefix('>') for line in opening.splitlines()).strip()
        if sid == 'F2':
            scene['cue'] = ''  # Runtime selects the actual D result.
        scene['questions'] = old['scenes'][sid]['suggested_questions']
        # Reviewed against the v5.1 opening information, not inherited spoilers.
        if sid=='C5':scene['questions']=['แก้วเป็นใคร?', 'เธอเกี่ยวกับเหตุปี 2534 อย่างไร?', 'ด้ายที่ศาลมีมาตั้งแต่เมื่อไร?']
        if sid=='B4':scene['questions']=['คนในรูปเป็นใคร?', 'รูปนี้เกี่ยวกับเหตุคนหายอย่างไร?', 'ตำแหน่งประตูน้ำสัมพันธ์กับสวนอย่างไร?']
        if sid=='E1':scene['questions']=['เสียงคนมาจากตรงไหน?', 'จะช่วยคนก่อนหรือสำรวจชั้นบนก่อน?', 'มีทางเข้าออกที่ต้องคุ้มกันไหม?']
        if sid=='E5':scene['questions']=['เหตุใดวิชัยถึงมาที่เรือนนี้?', 'จะให้วิชัยวางอาวุธได้อย่างไร?', 'ทีมจะคุ้มกันผู้ที่อยู่ใกล้อย่างไร?']
        if sid=='H1':scene['questions']=['ประตูน้ำถูกเปิดเมื่อใด?', 'หลักฐานยืนยันบทบาทของใครบ้าง?', 'ข้อมูลอพยพตรงกับเวลาเปิดประตูน้ำหรือไม่?']
        if sid=='F2':scene['questions']=['เธอรู้จักทีมมาก่อนหรือไม่?', 'ยังถูกด้ายบังคับอยู่ไหม?', 'มีทางสื่อสารโดยไม่สู้หรือไม่?']
        scene['checkId'] = old['scenes'][sid]['optional_check_id']
        lines = []
        for field in ['npcLines','responses']:
            for paragraph in scene[field].splitlines():
                # Lists of mechanics, death-trigger instructions and editorial
                # props stay private. Their dialogue is selected through events.
                if not paragraph.strip() or re.match(r'^\d+\.', paragraph.strip()) or 'Editorial Prop' in paragraph:
                    continue
                if sid == 'F2':
                    continue
                heading = re.match(r'^[>\s-]*\*\*.*?\*\*',paragraph)
                search_start = heading.end() if heading else 0
                speaker = defaults.get(sid, 'ผู้บรรยาย')
                label = re.sub(r'^[>\s*-]+|\*\*', '', paragraph[:search_start]).strip() or 'บทหลัก'
                # A name inside a question or editorial version tag is not a
                # speaker. In particular "เสนอเพิ่ม" is not hostage "เพิ่ม".
                leading = re.match(r'^('+'|'.join(actors)+r')(?=[:\s(/]|อยู่)',label)
                if leading: speaker=leading[1]
                if sid=='E2' and 'ทางเลือกการแสดง' in label: speaker='นิด'
                if sid=='E2' and 'ใครจับ' in label: speaker='เพิ่ม'
                if sid=='E2' and 'จะพาออกอย่างไร' in label: speaker='นิด'
                if sid=='E3' and 'ถามดล' in label: speaker='ดล'
                if sid=='E3' and 'ถามนิดว่า' in label: speaker='นิด'
                previous_end=search_start
                for quote in re.finditer('“([^”]+)”', paragraph[search_start:]):
                    pos = search_start + quote.start()
                    before = paragraph[previous_end:pos]
                    if re.search(r'(?:ทีมถามต่อว่า|DM ถามสั้น ๆ)\s*\**\s*$',before):
                        previous_end=search_start+quote.end()
                        continue
                    found = list(re.finditer(r'(?<![ก-๙])('+'|'.join(actors)+r')(?:\s*\([^)]*\))?\s*:?\s*$', before))
                    if found:
                        speaker=found[-1][1]
                    if sid=='E4': speaker='ข้อความในเอกสาร'
                    if sid=='C2' and 'ดลเขียนกำกับ' in paragraph: speaker='ข้อความในเอกสาร'
                    if sid=='F5' and quote[1].startswith('ช่วยด้วย!'): speaker='วิชัย'
                    if sid=='F6' and quote[1]=='เขาอยู่คนเดียวไหม?': speaker='ดล'
                    if sid=='F6' and quote[1]=='ตอนนั้นมีใครอยู่กับเขาหรือเปล่า?': speaker='นิด'
                    lines.append(dict(id=f'{sid}:{len(lines)+1}',scene=sid,speaker=speaker,
                                      label=label,text=quote[1],context=paragraph,field=field))
                    previous_end=search_start+quote.end()
        if sid == 'F2':
            quotes = re.findall('“([^”]+)”',scene['npcLines'])
            assert len(quotes) == 4
            lines = [dict(id=f'F2:{key}',scene=sid,speaker='แม่แก้ว',label='บทหลัก',text=text,context=key,field='npcLines')
                     for key,text in zip(['won','talked','fled_lost','not_met'],quotes)]
        scene['dialogue'] = lines
        scenes[sid] = scene
    (DEST / f'case-001.v5.1.{act}.json').write_text(json.dumps(scenes,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'{act}: {len(scenes)} scenes imported')

endings = {}
for m in re.finditer(r'^## ENDING ([A-D]) — (.+)\n([\s\S]*?)(?=^## ENDING |^### Ending Resolver)',source,re.M):
    endings[m[1]] = dict(title=m[2],script=m[3].strip(), paragraphs=re.findall(r'^> (.+)$',m[3],re.M))
assert len(endings)==4
(DEST/'case-001.v5.1.endings.json').write_text(json.dumps(endings,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(DEST/'case-001.v5.1.script.md').write_text(source,encoding='utf-8')
(DEST/'case-001.v5.1.manifest.json').write_text(json.dumps(dict(version='5.1',source=SOURCE.name,sha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(),sceneCount=31,checkCount=16),indent=2)+'\n',encoding='utf-8')
