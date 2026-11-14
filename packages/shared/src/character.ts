import type { LiteStats } from './combatLite.js';

export const attributes = ['body', 'mind', 'spirit', 'knowledge'] as const;
export type Attribute = typeof attributes[number];
type Stats = Record<Attribute, number>;

export const professions = {
  ritual_specialist: { name: 'หมอพิธี', stats: { body: 1, mind: 2, spirit: 3, knowledge: 3 } },
  paranormal_investigator: { name: 'นักสืบ', stats: { body: 1, mind: 4, spirit: 2, knowledge: 2 } },
  containment_specialist: { name: 'บอดี้การ์ด', stats: { body: 4, mind: 2, spirit: 2, knowledge: 1 } },
  medium: { name: 'ร่างทรง', stats: { body: 1, mind: 2, spirit: 4, knowledge: 2 } },
  occult_engineer: { name: 'นักศึกษาฝึกงาน', stats: { body: 2, mind: 3, spirit: 1, knowledge: 3 } },
  field_medic: { name: 'คนขับรถ (อดีตนายพราน)', stats: { body: 3, mind: 2, spirit: 2, knowledge: 2 } },
} satisfies Record<string, { name: string; stats: Stats }>;

export type Profession = keyof typeof professions;
export const professionTechniques = {
  ritual_specialist: { passive: 'ritual_mastery', talents: [
    { id: 'protective_talisman', name: 'ยันต์คุ้มภัย', ap: 1, focus: 1, reaction: false },
    { id: 'break_bindings', name: 'ปลดพันธนาการ', ap: 1, focus: 1, reaction: false },
    { id: 'ritual_zone', name: 'เขตอาคม', ap: 2, focus: 1, reaction: false },
  ] },
  paranormal_investigator: { passive: 'investigator_eye', talents: [
    { id: 'weakness_analysis', name: 'วิเคราะห์จุดอ่อน', ap: 1, focus: 1, reaction: false },
    { id: 'evasive_step', name: 'ทางหนีทีไล่', ap: 0, focus: 1, reaction: true },
    { id: 'detect_deception', name: 'จับพิรุธ', ap: 0, focus: 1, reaction: false },
  ] },
  containment_specialist: { passive: 'bodyguard', talents: [
    { id: 'spirit_binding', name: 'พันธนาการ', ap: 2, focus: 1, reaction: false },
    { id: 'defensive_line', name: 'ตั้งแนวป้องกัน', ap: 1, focus: 1, reaction: false },
    { id: 'clearing_bash', name: 'กระแทกเปิดทาง', ap: 2, focus: 1, reaction: false },
  ] },
  medium: { passive: 'spirit_sense', talents: [
    { id: 'soothe_spirit', name: 'เสียงปลอบวิญญาณ', ap: 2, focus: 1, reaction: false },
    { id: 'share_composure', name: 'แบ่งปันจิต', ap: 1, focus: 1, reaction: false },
    { id: 'silence_wail', name: 'สะกดเสียงกรีดร้อง', ap: 2, focus: 1, reaction: false },
  ] },
  occult_engineer: { passive: 'field_technician', talents: [
    { id: 'electric_talisman_trap', name: 'กับดักยันต์ไฟฟ้า', ap: 2, focus: 1, reaction: false },
    { id: 'spirit_scanner', name: 'เครื่องสแกนคลื่นวิญญาณ', ap: 1, focus: 1, reaction: false },
    { id: 'ritual_jammer', name: 'เครื่องรบกวนอาคม', ap: 2, focus: 1, reaction: false },
  ] },
  field_medic: { passive: 'emergency_response', talents: [
    { id: 'field_first_aid', name: 'ปฐมพยาบาลภาคสนาม', ap: 2, focus: 1, reaction: false },
    { id: 'composure_kit', name: 'ชุดกระตุ้นสติ', ap: 1, focus: 1, reaction: false },
    { id: 'emergency_drag', name: 'ลากเพื่อนออกจากอันตราย', ap: 0, focus: 1, reaction: true },
  ] },
} as const;

export const backgrounds = {
  rescuer: 'อดีตอาสากู้ภัย',
  journalist: 'อดีตนักข่าว',
  technician: 'อดีตช่างเทคนิค',
  temple_student: 'ศิษย์วัดเก่า',
  skeptic: 'นักวิทยาศาสตร์สายไม่เชื่อผี',
  rural_native: 'เติบโตในชนบท',
} as const;

export type Background = keyof typeof backgrounds;
export type Talent = typeof professionTechniques[Profession]['talents'][number]['id'];

export const biographyFields = ['background_story','motivation','fear','past_mistake','personal_secret'] as const;
export type Biography = Partial<Record<typeof biographyFields[number], string>>;

export const castProfiles: Record<Profession,{name:string;biography:Biography}> = {
  ritual_specialist:{name:'หมอพิธี',biography:{background_story:'รับหน้าที่อ่านร่องรอยพิธีและหาวิธีคลายอาคมให้ทีม'}},
  paranormal_investigator:{name:'นักสืบ',biography:{background_story:'ตามรอยหลักฐานและเทียบคำให้การ เพื่อแยกข้อเท็จจริงออกจากข่าวลือ'}},
  containment_specialist:{name:'บอดี้การ์ด',biography:{background_story:'คอยคุ้มกันเพื่อนร่วมทีมเมื่อต้องเข้าไปในพื้นที่เสี่ยง'}},
  medium:{name:'ร่างทรง',biography:{background_story:'รับฟังวิญญาณและช่วยทีมทำความเข้าใจสิ่งที่ผู้ตายยังติดค้าง'}},
  occult_engineer:{name:'นักศึกษาฝึกงาน',biography:{background_story:'นักศึกษาที่ติดตามทีมภาคสนามและช่วยดูแลอุปกรณ์ตรวจสอบ'}},
  field_medic:{name:'คนขับรถ (อดีตนายพราน)',biography:{background_story:'อดีตนายพรานผู้ขับรถพาทีมเข้าพื้นที่และคอยช่วยพาคนกลับอย่างปลอดภัย'}},
};

export function validateBiography(input: unknown): Biography {
  if (input===undefined) return {};
  if (!input || typeof input!=='object' || Array.isArray(input)) throw Error('ประวัติส่วนตัวไม่ถูกต้อง');
  const source=input as Record<string,unknown>;
  const biography: Biography={};
  for(const field of biographyFields) {
    const value=source[field];
    if(value===undefined) continue;
    if(typeof value!=='string' || value.length>500) throw Error('ประวัติส่วนตัวยาวเกินกำหนด');
    if(value.trim()) biography[field]=value.trim();
  }
  return biography;
}

export const coreStatLabels = {
  BODY: 'ร่างกาย', PER: 'การสังเกต', INT: 'เชาวน์ปัญญา',
  SOC: 'การเข้าสังคม', SPI: 'จิตวิญญาณ', RES: 'ความต้านทาน',
} satisfies Record<keyof LiteStats, string>;

export const characterPresets = {
  paranormal_investigator: {BODY:1, PER:5, INT:5, SOC:4, SPI:1, RES:2},
  ritual_specialist: {BODY:1, PER:1, INT:5, SOC:2, SPI:4, RES:5},
  medium: {BODY:1, PER:2, INT:2, SOC:5, SPI:5, RES:3},
  containment_specialist: {BODY:5, PER:3, INT:1, SOC:3, SPI:1, RES:5},
  occult_engineer: {BODY:3, PER:3, INT:3, SOC:3, SPI:3, RES:3},
  field_medic: {BODY:5, PER:5, INT:1, SOC:3, SPI:1, RES:3},
} satisfies Record<Profession, LiteStats>;

const legacyCoreStat = {body:'BODY', mind:'PER', spirit:'SPI', knowledge:'INT'} as const;

export function characterAttribute(character: Character, legacy: Attribute, core: keyof LiteStats = legacyCoreStat[legacy]) {
  return character.coreStats?.[core] ?? character.stats[legacy];
}

export const STARTING_CHARACTER_HP = 15;
export const characterMaxHp=(character:Character)=>character.maxHp ?? 10;

export const maxPlayerNameLength = 32;

export function validatePlayerName(value:unknown):string|undefined {
  if(value===undefined) return;
  if(typeof value!=='string') throw Error('ชื่อผู้เล่นไม่ถูกต้อง');
  const name=value.trim();
  if(name.length>maxPlayerNameLength || /[\u0000-\u001f\u007f-\u009f]/u.test(name)) {
    throw Error('ชื่อผู้เล่นต้องไม่เกิน '+maxPlayerNameLength+' ตัวอักษรและอยู่ในบรรทัดเดียว');
  }
  return name || undefined;
}

export interface Character {
  playerName?: string;
  characterName?: string;
  coreStats?: LiteStats;
  talent?: Talent;
  background?: Background;
  profession: Profession;
  bonus?: Attribute;
  stats: Stats;
  maxHp?: number;
  hp: number;
  sanity: number;
  focus: number;
}

export function createCharacter(profession: unknown, bonus: unknown, selection?: { talent: unknown; background?: unknown }, usePreset = false): Character {
  if (typeof profession !== 'string' || !Object.hasOwn(professions, profession)) {
    throw Error('อาชีพไม่ถูกต้อง');
  }
  const role = profession as Profession;
  const stat = attributes.find(attribute => attribute === bonus);
  const stats = { ...professions[role].stats };
  if (!usePreset) {
    if (!stat || stats[stat] >= 4) throw Error('เลือกเพิ่มหนึ่งแต้มให้ค่าสถานะที่ยังไม่ถึง 4');
    stats[stat]++;
  }
  const base = {
    profession: role, stats, hp: usePreset ? STARTING_CHARACTER_HP : 10, sanity: 10, focus: 4,
    ...(usePreset ? {maxHp:STARTING_CHARACTER_HP} : {}),
    ...(usePreset ? {coreStats:{...characterPresets[role]}} : {bonus:stat}),
  };
  if (!selection) return base;
  const talent = professionTechniques[role].talents.find(entry => entry.id === selection.talent);
  if (!talent) throw Error('เลือกพรสวรรค์ของอาชีพนี้หนึ่งอย่าง');
  // Legacy background fields are accepted for old clients but grant no mechanics.
  return { ...base, talent: talent.id };
}
