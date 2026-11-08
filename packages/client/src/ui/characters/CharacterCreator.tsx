import { useState } from 'react';
import { BASIC_RULES_MODE, maxPlayerNameLength, characterPresets, coreStatLabels, biographyFields, castProfiles, type Biography, professions, professionTechniques, type Character, type Profession, type Talent } from '@baan/shared';
import { portraitUrl } from './CastPortraits';

const roleHelp:Record<Profession,string>={
 ritual_specialist:'เชี่ยวชาญพิธี ช่วยคลายผนึกและสนับสนุนทีม พิธีปลดปล่อยสำเร็จเพิ่มความคืบหน้า 3',
 paranormal_investigator:'ถนัดสังเกตและสืบสวน ใช้สำรวจความผิดปกติเพื่อชี้ร่องรอยที่ค้นได้',
 containment_specialist:'แนวหน้าร่างกายแข็งแรง รับการโจมตีแทนเพื่อนที่อยู่ติดกันได้เมื่อมีการฟาดที่เตรียมไว้',
 medium:'เด่นด้านจิตวิญญาณ สนทนาและปลอบวิญญาณ ใช้ญาณถามเรื่องที่เกี่ยวข้องเมื่อเงื่อนไขครบ',
 occult_engineer:'เชี่ยวชาญอุปกรณ์ วางอุปกรณ์เตือนภัย และตรวจกลไกที่เกี่ยวข้องได้',
 field_medic:'ดูแลผู้บาดเจ็บ ช่วยเพื่อนที่หมดสภาพให้ฟื้น 3 HP ได้หนึ่งครั้งตามเงื่อนไข',
};
const talentHelp:Record<Talent,string>={
 protective_talisman:'ให้เพื่อนในระยะ 2 ช่องได้โบนัสป้องกันในรอบนี้',break_bindings:'ปลดพันธนาการให้เพื่อนในระยะ 2 ช่อง',ritual_zone:'สร้างเขตอาคมในระยะ 3 ช่อง ลดผลทดสอบของผีในเขต',
 weakness_analysis:'วิเคราะห์ผีในระยะ 4 ช่อง เปิดจุดอ่อนให้การโจมตีครั้งถัดไปของเพื่อน',evasive_step:'ตอบโต้เมื่อถูกเล็ง หลบไปช่องที่เดินถึงได้ไม่เกิน 2 ช่อง',detect_deception:'ใช้จับพิรุธในการตรวจคำให้การที่รองรับ ได้โบนัส +2',
 spirit_binding:'ทดสอบร่างกายเพื่อจำกัดการเคลื่อนที่ของผีในระยะ 2 ช่อง',defensive_line:'ให้โบนัสป้องกันตัวเองและเพื่อนที่อยู่ติดกันในรอบนี้',clearing_bash:'ทดสอบร่างกายผลักผีที่อยู่ติดกันได้สูงสุด 2 ช่องและสร้างความเสียหาย',
 soothe_spirit:'ทดสอบจิตวิญญาณเพื่อปลอบผีในระยะ 4 ช่อง',share_composure:'ฟื้นสติให้เพื่อนติดกัน 1 หน่วย หนึ่งครั้งต่อเป้าหมายในการเผชิญหน้า',silence_wail:'ทดสอบจิตวิญญาณเพื่อยกเลิกเสียงกรีดร้องที่ผีเตรียมไว้ในระยะ 4 ช่อง',
 electric_talisman_trap:'วางกับดักในช่องว่างติดตัว ทำงานเมื่อผีเข้าช่อง',spirit_scanner:'สแกนผีในระยะ 4 ช่องที่มีแนวถึงเป้าหมาย เพื่อเปิดเผยผีที่ซ่อนตัว',ritual_jammer:'ทดสอบความรู้เพื่อรบกวนผี หรือยกเลิกท่าพิเศษของบอสที่เตรียมไว้',
 field_first_aid:'ฟื้น HP สูงสุด 3 ให้ตัวเองหรือเพื่อนติดกันที่ยังมี HP หนึ่งครั้งต่อเป้าหมายในการเผชิญหน้า',composure_kit:'ฟื้นสติสูงสุด 2 ให้เพื่อนติดกัน หรือช่วยเพื่อนที่สติเป็นศูนย์ หนึ่งครั้งต่อเป้าหมาย',emergency_drag:'ตอบโต้เมื่อเพื่อนติดกันถูกเล็ง ย้ายตัวเองและเพื่อนออกจากอันตรายได้คนละไม่เกิน 1 ช่อง',
};
export const bioLabels = {background_story:'ประวัติ',motivation:'แรงจูงใจ',fear:'ความกลัว',past_mistake:'ความผิดพลาดในอดีต',personal_secret:'ความลับ'};
const roles = Object.keys(professions) as Profession[];

export function CoreStats({stats}:{stats:NonNullable<Character['coreStats']>}) {
  return <dl className="character-stats" aria-label="ค่าสถานะพื้นฐาน">{Object.entries(coreStatLabels).map(([key,label]) => <div key={key}><dt>{label} <small>{key}</small></dt><dd>{stats[key as keyof typeof stats]}</dd></div>)}</dl>;
}

export function CharacterCreator({ character, biography, taken, takenBy={}, disabled, onCreate, names, onSaveNames, editable=false, showCoreStats=true }: {
  character?: Character;
  biography?: Biography;
  taken: Profession[];
  takenBy?:Partial<Record<Profession,string>>;
  disabled: boolean;
  showCoreStats?: boolean;
  editable?: boolean;
  names?:{playerName?:string;characterName?:string};
  onSaveNames?:(playerName:string,characterName:string)=>void;
  onCreate: (profession: Profession, talent: Talent | undefined, playerName: string, characterName: string) => void;
}) {
  const [profession, setProfession] = useState<Profession>(()=>character?.profession ?? roles.find(role=>!taken.includes(role)) ?? roles[0]);
  const [talent, setTalent] = useState<Talent>(()=>professionTechniques[profession].talents[0].id);
  const [playerName, setPlayerName] = useState(names?.playerName ?? character?.playerName ?? '');
  const [characterName,setCharacterName]=useState(names?.characterName ?? character?.characterName ?? '');
  const role=editable ? profession : character?.profession ?? profession;
  const profile=castProfiles[role];
  const unavailable=taken.includes(profession);
  function cycle(step:number) {
    const next=roles[(roles.indexOf(profession)+step+roles.length)%roles.length];
    selectProfession(next);
  }
  function selectProfession(next:Profession) {
    setProfession(next);
    setTalent(professionTechniques[next].talents[0].id);
  }
  const talents = professionTechniques[profession].talents;
  const stats = editable ? characterPresets[role] : character?.coreStats ?? characterPresets[role];
  const chosenTalent=talents.find(entry=>entry.id===talent);
  return <details className="game-panel character-panel" aria-label="ตัวละคร" open={!character || editable}>
    <summary>{character ? `ตัวละครของคุณ · ${character.playerName ?? profile.name}` : 'เลือกตัวละครของคุณ'}</summary>
    {editable && onSaveNames && <form className="player-names-form" aria-label="ตั้งชื่อผู้เล่นและชื่อในเกม" onSubmit={event=>{event.preventDefault();onSaveNames(playerName,characterName);}}>
        <label className="character-name">ชื่อเล่นผู้เล่นจริง <input value={playerName} maxLength={maxPlayerNameLength}
          onChange={event=>setPlayerName(event.target.value)} placeholder="ชื่อเล่นที่เพื่อนเรียก"/></label>
        <label className="character-name">ชื่อในเกม <input value={characterName} maxLength={maxPlayerNameLength} onChange={event=>setCharacterName(event.target.value)} placeholder={profile.name}/></label>
      <button type="submit" disabled={disabled}>บันทึกชื่อ</button>
      <p className="note">บันทึกชื่อแยกจากการเลือกตัวละคร ทุกคนจะเห็นชื่อที่บันทึกแล้ว</p>
    </form>}
    {(!character || editable) && <div className="cast-picker">
      <button type="button" aria-label="ตัวละครก่อนหน้า" onClick={()=>cycle(-1)}>‹</button>
      <label>ตัวละครและอาชีพ
        <select value={profession} onChange={event=>selectProfession(event.target.value as Profession)}>
          {roles.map(option=><option key={option} value={option}>{castProfiles[option].name}{castProfiles[option].name!==professions[option].name ? ' · '+professions[option].name : ''}{taken.includes(option)?' (เลือกโดย '+(takenBy[option] ?? 'เพื่อนร่วมทีม')+')':''}</option>)}
        </select>
      </label>
      <button type="button" aria-label="ตัวละครถัดไป" onClick={()=>cycle(1)}>›</button>
    </div>}
    <div className="character-profile">
      <img src={portraitUrl(role)} alt={profile.name}/>
      <div>
        <h3>{(editable?playerName:character?.playerName) || playerName || 'ชื่อเล่นยังไม่ระบุ'} · {professions[role].name}</h3><p>ชื่อในเกม: {(editable?characterName:character?.characterName) || characterName || profile.name}</p>
        {profile.name!==professions[role].name && <p className="character-role">{professions[role].name}</p>}
        {(!character || editable) && <p className="note" role="status">{roles.indexOf(profession)+1}/{roles.length} · {unavailable?'เพื่อนเลือกแล้ว กรุณาเลือกตัวอื่น':'เลือกได้'}</p>}
        <p className="character-role-help">{BASIC_RULES_MODE ? 'โหมดพื้นฐาน · ใช้ค่าสถานะประจำอาชีพและสมาธิ พักความสามารถพิเศษไว้ก่อน' : roleHelp[role]}</p>
      </div>
    </div>
    {showCoreStats && <CoreStats stats={stats}/>}
    {(!character || editable) && <details className="character-bio"><summary>ประวัติตัวละคร</summary><p>{profile.biography.background_story}</p></details>}
    {character && !editable ? <>
      <p>พลังชีวิต {character.hp} · สติ {character.sanity} · สมาธิ {character.focus}</p>
      {!BASIC_RULES_MODE && character.talent && <p>พรสวรรค์ {professionTechniques[character.profession].talents.find(entry => entry.id === character.talent)?.name} · {talentHelp[character.talent]}</p>}
      {biography && biographyFields.map(field=>biography[field] && <p key={field}>{bioLabels[field]} · {biography[field]}</p>)}
    </> :
      <form onSubmit={event => { event.preventDefault(); if(!disabled && !unavailable) onCreate(profession, BASIC_RULES_MODE ? undefined : talent, names?.playerName ?? character?.playerName ?? '', names?.characterName ?? character?.characterName ?? ''); }}>
        {!BASIC_RULES_MODE && <label>พรสวรรค์ <select value={talent} onChange={event => setTalent(event.target.value as Talent)}>
          {talents.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>{chosenTalent && <span className="character-help"><strong>{chosenTalent.reaction ? 'ตอบโต้' : chosenTalent.ap+' AP'} · สมาธิ {chosenTalent.focus}</strong><br/>{talentHelp[chosenTalent.id]}</span>}</label>}
        <button className="primary" disabled={disabled || unavailable}>{unavailable ? 'ตัวละครนี้ถูกเลือกแล้ว' : character ? 'บันทึกตัวละคร' : 'ยืนยันตัวละคร'}</button>
      </form>}
  </details>;
}
