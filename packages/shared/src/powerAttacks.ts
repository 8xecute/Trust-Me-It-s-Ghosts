import type {Attribute,Profession} from './character.js';
import type {LiteDefense,LiteStats} from './combatLite.js';
export const powerAttacks:Record<Profession,{name:string;stat:keyof LiteStats;legacy:Attribute;defense:LiteDefense;damage:number;physical:boolean}>={
 paranormal_investigator:{name:'จี้จุดอ่อน',stat:'INT',legacy:'knowledge',defense:'PDEF',damage:3,physical:true},
 ritual_specialist:{name:'อาคมขับไล่',stat:'INT',legacy:'knowledge',defense:'MDEF',damage:3,physical:false},
 medium:{name:'แรงสะท้อนวิญญาณ',stat:'SPI',legacy:'spirit',defense:'MDEF',damage:3,physical:false},
 containment_specialist:{name:'กระแทกเต็มแรง',stat:'BODY',legacy:'body',defense:'PDEF',damage:3,physical:true},
 occult_engineer:{name:'ประสานแรงขับไล่',stat:'SOC',legacy:'spirit',defense:'MDEF',damage:3,physical:false},
 field_medic:{name:'โจมตีฉวยจังหวะ',stat:'PER',legacy:'mind',defense:'PDEF',damage:3,physical:true},
};
