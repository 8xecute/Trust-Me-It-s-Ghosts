from pathlib import Path
import html
import json

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[2]
DATA = ROOT / 'packages/server/scenarios/case-001'
scene = json.loads((DATA / 'case-001.v5.5.A.json').read_text(encoding='utf-8'))['A1']
questions = next(s['questions'] for s in json.loads((DATA / 'case-001.v5.5.qa.json').read_text(encoding='utf-8'))['scenes'] if s['scene'] == 'A1')
by_id = {q['id']: q for q in questions}
topics = [('A1_Q001', 'คนหายและลำดับ'), ('A1_Q002', 'จุดหายและแฟ้มรายละเอียด'), ('A1_Q003', 'เหตุผลที่จ้างบริษัท'), ('A1_Q006', 'ตำรวจค้นถึงไหน'), ('A1_Q008', 'เรื่องค่าจ้าง'), ('A1_Q005', 'เมื่อถูกสงสัยว่าปิดบัง')]
ledger = [{'id': 'opening', 'label': 'บทเปิดและภารกิจ'}]
cards = []
for qid, title in topics:
    q = by_id[qid]
    assert q.get('playerAnswer'), qid
    ledger.append({'id': qid, 'label': title})
    tone = ' conditional' if qid == 'A1_Q005' else ''
    cards.append(f'<article class="answer{tone}"><h3>{html.escape(title)}</h3><p>{html.escape(q["playerAnswer"])}</p><label class="check"><input type="checkbox" data-mark="{qid}">บอกข้อมูลนี้กับทีมแล้ว</label></article>')
ledger.append({'id': 'plan', 'label': 'แผนต่อของทีม', 'done': 'สรุปแล้ว', 'pending': 'ยังไม่สรุป'})
ratings = []
for name, label in [('boundary', 'รู้ว่าเปิดเผยอะไรได้'), ('recording', 'รู้ว่าต้องบันทึกเมื่อไร'), ('roleplay', 'สวมบทได้ต่อเนื่อง')]:
    options = ''.join(f'<label><input type="radio" name="{name}" value="{i}" required>{i}</label>' for i in range(1, 6))
    ratings.append(f'<fieldset><legend>{label}</legend><div class="scale">{options}</div></fieldset>')
page = (OUT / 'dm.template.html').read_text(encoding='utf-8')
for marker, text in [('__CUE__', html.escape(scene['cue'])), ('__OPENING__', html.escape(scene['dialogue'][0]['text'])), ('__ANSWERS__', ''.join(cards)), ('__RATINGS__', ''.join(ratings)), ('__LEDGER__', json.dumps(ledger, ensure_ascii=False).replace('<', '\u003c'))]:
    page = page.replace(marker, text)
(OUT / 'DM-ONLY.html').write_text(page, encoding='utf-8')
print('Built private DM companion; player files and public preview unchanged')
