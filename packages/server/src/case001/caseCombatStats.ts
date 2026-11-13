import {readFileSync} from 'node:fs';
import type {LiteDefense, LiteManifestation} from '@baan/shared';

type EnemyId = 'DROWNED_ECHO'|'NANG_TANI_D'|'NANG_TANI_FINAL'|'WICHAI';
export interface CaseAttack {
 id:string;
 name_th:string;
 range:number;
 damage:number;
 targetDefense:LiteDefense;
 damageResource:'HP'|'Sanity';
 condition?:'ROOTED';
 telegraphOneBossTurnBeforeUse?:boolean;
 requires?:string;
}
export interface CaseCombatStats {
 enemyId:EnemyId;
 baseHPFor2:number;
 scalesWithParty:boolean;
 PDEF:number;
 MDEF:number;
 ATK:number;
 INIT:number;
 MOVE:number;
 manifestation:LiteManifestation;
 attacks:CaseAttack[];
}

const {enemy_archetypes}=JSON.parse(readFileSync(
 new URL('../../scenarios/case-001/case001_enemies_v1_1.json',import.meta.url),'utf8',
)) as {enemy_archetypes:CaseCombatStats[]};

function enemy(id:EnemyId) {
 const entry=enemy_archetypes.find(value=>value.enemyId===id);
 if(!entry) throw Error('ไม่พบค่าสเตตัสศัตรู '+id);
 return entry;
}

export const caseCombatStats={
 EN01:enemy('DROWNED_ECHO'),
 EN02:enemy('NANG_TANI_D'),
 EN04:enemy('NANG_TANI_FINAL'),
 wichai:enemy('WICHAI'),
};
