"""Import the approved source verbatim, one act at a time. No prose generation."""
from pathlib import Path
import hashlib
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(sys.argv[1]) if len(sys.argv)>1 else next((ROOT / '5.1').glob('CASE001_StoryScript_v5.1*'))
VERSION = '5.3' if 'v5.3' in SOURCE.name else '5.2' if 'v5.2' in SOURCE.name else '5.1'
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
        if VERSION in ('5.2', '5.3'):
            # Separate quoted prose from scene instructions.
            opening = re.search(r'^> (?!\*\*\[)(.+)', scene['dmReadAloud'], re.M)
            scene['cue'] = opening[1] if opening else ''
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
        if VERSION in ('5.2', '5.3'):
            prompts = {
                'A1': ['ใครหายไปบ้าง?', 'แต่ละคนถูกพบครั้งสุดท้ายที่ไหน?', 'ทำไมถึงเรียกบริษัทมาช่วย?'],
                'A2': ['เมื่อกี้ทุกคนได้ยินคำว่าอะไร?', 'เสียงน้ำกับเสียงพูดมาจากวิทยุหรือรอบรถ?', 'ลองฟังหรือบันทึกเสียงอีกครั้งได้ไหม?'],
                'A3': ['แฟ้มฉบับเต็มอยู่ที่ไหน?', 'ไปบ้านผู้ใหญ่ทางไหน?'],
                'B1': ['หมุดแดงกับวงสีน้ำเงินหมายถึงอะไร?', 'ใครทำเครื่องหมายบนแผนที่?'],
                'B2': ['วิชัยเข้าไปสวนตอนไหน?', 'รอยข่วนที่มือเกิดจากอะไร?'],
                'B3': ['ต้นเห็นอะไรที่ทางเข้าสวน?', 'อยากคุยเป็นส่วนตัวไหม?'],
                'B4': ['คนในรูปเป็นใคร?', 'รูปนี้ถ่ายที่ไหนและเมื่อไร?'],
                'B5': ['บ้านดลอยู่ตรงไหน?', 'ดลเก็บบันทึกไว้ที่ไหน?'],
                'C1': ['มีร่องรอยใครเข้าบ้านไหม?', 'บนโต๊ะมีอะไรให้ตรวจ?'],
                'C2': ['สมุดดลบันทึกเรื่องอะไร?', 'ทำไมดลจดให้กลับไปดูศาล?'],
                'C3': ['เสียงเคาะมาจากไหน?', 'ตรวจคราบน้ำจากตรงนี้ได้ไหม?'],
                'C4': ['สิ่งที่เห็นกำลังทำอะไร?', 'ช่วยเพื่อนหรือถอยออกทางไหนได้บ้าง?'],
                'C5': ['ยายรู้จักแม่แก้วอย่างไร?', 'ยายเห็นอะไรแถวศาล?'],
                'D1': ['รอยบนทางเดินพาไปไหน?', 'มองเห็นอะไรระหว่างทาง?'],
                'D2': ['ชื่อบนด้ายเป็นของใครบ้าง?', 'ด้ายดำโยงไปทางไหน?'],
                'D3': ['แม่แก้วกำลังพยายามบอกอะไร?', 'ทีมช่วยอะไรเธอได้บ้าง?'],
                'D4': ['ตอนนี้ใครอยู่ในอันตราย?', 'มีทางถอยออกจากศาลไหม?'],
                'D5': ['รอยล้อไปสิ้นสุดตรงไหน?', 'รอยล้อมุ่งไปทางเดียวกันหรือเปล่า?'],
                'E1': ['เสียงคนดังจากตรงไหน?', 'มีทางเข้าเรือนทางไหนบ้าง?'],
                'E2': ['ใครยังพูดคุยได้?', 'ใครต้องให้ทีมช่วยพาออก?'],
                'E3': ['แต่ละคนเห็นหรือได้ยินอะไรด้วยตัวเอง?', 'ตอนนี้ใครพร้อมเล่าให้ฟัง?'],
                'E4': ['กำไลอยู่ตรงไหน?', 'ตำราที่อยู่ข้างกล่องมีอะไร?', 'ใต้ฐานกล่องมีอะไร?'],
                'E5': ['ทำไมวิชัยถึงมาที่เรือน?', 'เราจะคุยให้เขาวางมีดได้ไหม?'],
                'H1': ['เอกสารบอกเวลาเปิดประตูน้ำว่าอย่างไร?', 'คำให้การตรงกับบันทึกส่วนไหน?'],
                'E6': ['ใครอยู่ที่ไหนและปลอดภัยหรือยัง?', 'ทีมจะจัดการอะไรก่อน?'],
                'F1': ['สัญญาณที่เตือนมาจากตรงไหน?', 'ใครอยู่ใกล้กำไลตอนนี้?'],
                'F2': ['แม่แก้วจำอะไรเกี่ยวกับทีมได้บ้าง?', 'ตอนนี้เธออยากบอกอะไร?'],
                'F3': ['ใครต้องการคนคุ้มกัน?', 'เข้าใกล้แกนจากตรงไหนได้บ้าง?'],
                'F4': ['ในภาพน้ำท่วมเกิดอะไรขึ้น?', 'ภาพนี้บอกอะไรเกี่ยวกับแม่แก้ว?'],
                'F5': ['แม่แก้วอยากให้ทีมทำอะไรต่อ?', 'ทีมจะเปิดเผยหลักฐานที่มีอย่างไร?'],
                'F6': ['ใครอยู่ใกล้แกนตอนเกิดแรงสะท้อน?', 'ทีมจะหยุดมือหรือคุ้มกันใครได้ทัน?'],
            }
            scene['questions'] = prompts[sid]
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
    (DEST / f'case-001.v{VERSION}.{act}.json').write_text(json.dumps(scenes,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'{act}: {len(scenes)} scenes imported')

endings = {}
for m in re.finditer(r'^## ENDING ([A-D]) — (.+)\n([\s\S]*?)(?=^## ENDING |^### Ending Resolver|^### |^# |\Z)',source,re.M):
    endings[m[1]] = dict(title=m[2],script=m[3].strip(), paragraphs=re.findall(r'^> (.+)$',m[3],re.M))
assert len(endings)==4
(DEST/f'case-001.v{VERSION}.endings.json').write_text(json.dumps(endings,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(DEST/f'case-001.v{VERSION}.script.md').write_bytes(SOURCE.read_bytes())
(DEST/f'case-001.v{VERSION}.manifest.json').write_text(json.dumps(dict(version=VERSION,source=SOURCE.name,sha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(),sceneCount=31,checkCount=16),indent=2)+'\n',encoding='utf-8')


if VERSION in ('5.2', '5.3'):
    reference = json.loads((DEST / 'case-001.v4.3.DiceChecks.json').read_text(encoding='utf-8'))
    expected = {check['id']: check for check in reference['checks']}
    appendix = source.split('# ภาคผนวก ข', 1)[1].split('# ภาคผนวก ค', 1)[0]
    cards = re.split(r'^### 🎲 (\w+) (.+)\n', appendix, flags=re.M)[1:]
    checks = []
    for check_id, title, card in zip(cards[::3], cards[1::3], cards[2::3]):
        old_check = expected[check_id]
        stat, dc = re.search(r'\*\*ค่าสถานะ:\*\* (.*?) · \*\*DC (\d+)\*\*', card).groups()
        assert '|'.join(re.findall(r'`([A-Z|]+)`', stat)) == old_check['stat'] and int(dc) == old_check['dc'], check_id
        check = {**old_check, 'title': title, 'sourceMarkdown': re.sub(r'\n---[\s\S]*\Z', '', card).strip()}
        if check_id == 'C5_EVACUATION_RECORDS' and VERSION == '5.2':
            check['decision'] = 'รออนุมัติตำแหน่งเอกสารประกอบ B4 และ C5 (X02) การ์ดนี้ต้องใช้เอกสารสองแหล่งที่ทีมตรวจจริง'
        for name, label in [('trigger','เรียกทอยเมื่อ'), ('baseline','ข้อมูลที่ได้แน่ ๆ'), ('bypass','ไม่ต้องทอยเมื่อ'), ('fallback','ถ้าทอยพลาดแล้วไปต่ออย่างไร')]:
            check[name] = re.search(r'\*\*'+label+r':\*\* (.+)', card)[1]
        chunks = re.split(r'^#### .+ (FULL SUCCESS|PARTIAL SUCCESS|FAILURE) — (.+)\n', card, flags=re.M)[1:]
        assert len(chunks) == 9, check_id
        for branch, bounds, body in zip(chunks[::3], chunks[1::3], chunks[2::3]):
            name = {'FULL SUCCESS':'full','PARTIAL SUCCESS':'partial','FAILURE':'failure'}[branch]
            assert list(map(int,re.findall(r'\d+', bounds))) == {'full':[int(dc)],'partial':[int(dc)-old_check['partial_margin'],int(dc)-1],'failure':[int(dc)-old_check['partial_margin']-1]}[name], (check_id, bounds)
            check[name] = {
                'dm': re.search(r'\*\*\[DM อ่าน\]\*\* (.+)',body)[1],
                'dialogue': re.search(r'\*\*\[บทพูด / เสียง\]\*\* (.+)',body)[1],
                'information': [re.search(r'\*\*ข้อมูล:\*\* (.+)',body)[1]],
                'state': re.search(r'\*\*\[ผลต่อสถานะ\]\*\* (.+)',body)[1]
            }
        checks.append(check)
    assert len(checks) == 16 and set(expected) == {check['id'] for check in checks}
    (DEST / f'case-001.v{VERSION}.checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
