import { useState } from 'react';
import { attributes, biographyFields, type Biography, backgrounds, professions, professionTechniques, type Attribute, type Background, type Character, type Profession, type Talent } from '@baan/shared';

const labels: Record<Attribute, string> = {
  body: 'ร่างกาย', mind: 'ไหวพริบ', spirit: 'จิตวิญญาณ', knowledge: 'ความรู้',
};
export const bioLabels = {background_story:'ภูมิหลังที่เขียนเอง',motivation:'แรงจูงใจ',fear:'ความกลัว',past_mistake:'ความผิดพลาดในอดีต',personal_secret:'ความลับ'};
const roles = Object.keys(professions) as Profession[];

export function CharacterCreator({ character, biography, disabled, onCreate }: {
  character?: Character;
  biography?: Biography;
  disabled: boolean;
  onCreate: (profession: Profession, bonus: Attribute, talent: Talent, background: Background, biography: Biography) => void;
}) {
  const [profession, setProfession] = useState<Profession>('ritual_specialist');
  const [bonus, setBonus] = useState<Attribute>('body');
  const [talent, setTalent] = useState<Talent>('protective_talisman');
  const [background, setBackground] = useState<Background>('rescuer');
  const [draft, setDraft] = useState<Biography>({});
  const talents = professionTechniques[profession].talents;
  const stats = professions[profession].stats;
  return <details className="game-panel character-panel" aria-label="ตัวละคร" open={!character}>
    <summary>{character ? `ตัวละครของคุณ · ${professions[character.profession].name}` : 'สร้างตัวละครของคุณ'}</summary>
    <ul>{attributes.map(stat => <li key={stat}>{labels[stat]} {character?.stats[stat] ?? stats[stat] + Number(stat === bonus)}</li>)}</ul>
    {character ? <>
      <p>พลังชีวิต {character.hp} · สติ {character.sanity} · สมาธิ {character.focus}</p>
      {character.talent && <p>พรสวรรค์ {professionTechniques[character.profession].talents.find(entry => entry.id === character.talent)?.name}</p>}
      {character.background && <p>ภูมิหลัง {backgrounds[character.background]}</p>}
      {biography && biographyFields.map(field=>biography[field] && <p key={field}>{bioLabels[field]} · {biography[field]}</p>)}
    </> :
      <form onSubmit={event => { event.preventDefault(); onCreate(profession, bonus, talent, background, draft); }}>
        <label>อาชีพ <select value={profession} onChange={event => {
          const next = event.target.value as Profession;
          setProfession(next);
          setTalent(professionTechniques[next].talents[0].id);
          if (professions[next].stats[bonus] >= 4) setBonus(attributes.find(stat => professions[next].stats[stat] < 4)!);
        }}>
          {roles.map(role => <option key={role} value={role}>{professions[role].name}</option>)}
        </select></label>
        <label>เพิ่มหนึ่งแต้ม <select value={bonus} onChange={event => setBonus(event.target.value as Attribute)}>
          {attributes.filter(stat => stats[stat] < 4).map(stat => <option key={stat} value={stat}>{labels[stat]}</option>)}
        </select></label>
        <label>พรสวรรค์ <select value={talent} onChange={event => setTalent(event.target.value as Talent)}>
          {talents.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select></label>
        <label>ภูมิหลัง <select value={background} onChange={event => setBackground(event.target.value as Background)}>
          {Object.entries(backgrounds).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select></label>
        <details><summary>ประวัติส่วนตัว · เฉพาะคุณ</summary>
          {biographyFields.map(field=><label key={field}>{bioLabels[field]}
            <textarea maxLength={500} value={draft[field] ?? ''} onChange={event=>setDraft({...draft,[field]:event.target.value})}/>
          </label>)}
        </details>
        <button className="primary" disabled={disabled}>ยืนยันตัวละคร</button>
      </form>}
  </details>;
}
