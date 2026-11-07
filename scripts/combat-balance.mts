import {WorldStore} from '../packages/server/src/world.js';
import {executeCaseAction} from '../packages/server/src/case001/caseActions.js';
import {newCase} from '../packages/server/src/case001/case001.js';
import {startCaseBattle,caseBattleAction} from '../packages/server/src/case001/caseBattle.js';
import {caseGrid,characterPresets} from '@baan/shared';
import {writeFileSync} from 'node:fs';
const results=[];
for(const site of ['C','D','E'] as const) for(const count of [2,4,6]) {
 const trials=[];
 for(let seed=1;seed<=60;seed++) {
  let random=seed;const roll=()=>{random=(Math.imul(1664525,random)+1013904223)>>>0;return Math.floor(random/4294967296*20)+1;};
  const store=new WorldStore(roll,true,true,true,true);store.create('sim',2);
  const ids=Array.from({length:count},(_,i)=>'p'+i);
  ids.forEach((id,i)=>{store.addPlayer('sim',id);store.apply('sim',id,{id:'create',type:'createCharacter',profession:Object.keys(characterPresets)[i]});});
  const w=store.checkpoint('sim').world;
  w.case001={...newCase(true,4,'4.1'),site,ghost:'hostile',seals:site==='E'?[true,true,false]:[false,false,false],evidence:site==='E'?['E05']:['E02']};
  w.caseMap={sites:Object.fromEntries(ids.map(id=>[id,site])),positions:{},completed:[],rounds:0};
  ids.forEach((id,i)=>w.players[id]={x:2+i,y:8});
  const grid=caseGrid(site);startCaseBattle(w,ids[0],grid,roll);
  let rounds=0;
  for(let turn=0;w.caseMap.battle && turn<500;turn++) {
   const b=w.caseMap.battle;rounds=b.round;const id=b.active;if(!id || rounds>80)break;
   const action=(type:string,payload:object={})=>caseBattleAction(w,id,{type,...payload},grid,roll,()=>{});
   if((b.enemies[0].tactics.restrained[id]??0)>=b.round && w.turns[id].ap)action('breakRestraint');
   if(site==='E' && !b.projections.length && w.turns[id].ap>=2) {
    try {executeCaseAction(w,id,{actionId:!w.case001!.seals[2]?'seal3':!w.case001!.returned?'return':'ritual'},roll);} catch { /* A failed check leaves its action available on the next turn. */ }
    if(!w.caseMap.battle)break;
   }
   const objective=site==='E' && b.projections.length>0;
   const target=objective?b.projections[0]:b.enemies[0].state.ghost;
   const dist=(p:{x:number;y:number})=>Math.abs(p.x-target.x)+Math.abs(p.y-target.y);
   if(dist(w.players[id])>1 && w.turns[id].ap && (b.enemies[0].tactics.restrained[id]??0)<b.round) {
    const blocked=[...grid.blocked,...ids.filter(p=>p!==id).map(p=>w.players[p]),b.enemies[0].state.ghost,target];
    const queue=[{p:w.players[id],path:[] as {x:number;y:number}[]}],visited=new Set<string>();let path:{x:number;y:number}[]=[];
    for(const q of queue) {
     if(dist(q.p)===1){path=q.path;break;}
     for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const p={x:q.p.x+dx,y:q.p.y+dy},k=p.x+','+p.y;
      if(p.x<0||p.y<0||p.x>=grid.width||p.y>=grid.height||visited.has(k)||blocked.some(c=>c.x===p.x&&c.y===p.y))continue;
      visited.add(k);queue.push({p,path:[...q.path,p]});
     }
    }
    if(path.length) {try{action('move',{target:path[Math.min(3,path.length-1)]});}catch{action('move',{target:path[0]});}}
   }
   if(objective && w.caseMap.battle && dist(w.players[id])<=1 && w.turns[id].ap>=2)action('caseObjective');
   if(!objective && site!=='E' && w.caseMap.battle && dist(w.players[id])===1 && w.turns[id].ap>=2) {try{action('strike');}catch{ /* A concealed or dispersed ghost cannot be struck this turn. */ }}
   if(w.caseMap.battle)action('endTurn');
  }
  trials.push({rounds,won:!w.caseMap.battle && ids.some(id=>w.characters![id].hp>0),down:ids.filter(id=>w.characters![id].hp===0).length});
 }
 results.push({site,count,trials:trials.length,winRate:trials.filter(t=>t.won).length/trials.length,meanRounds:trials.reduce((a,t)=>a+t.rounds,0)/trials.length,meanDown:trials.reduce((a,t)=>a+t.down,0)/trials.length});
}
writeFileSync('combat-balance-report.json',JSON.stringify(results,null,2));console.log(results);
