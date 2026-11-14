import { useState } from 'react';
import { characterAttribute, professions, turnSkills, powerAttacks, type Character, type CaseSite } from '@baan/shared';
import { portraitUrl } from '../characters/CastPortraits';
import { illustrations } from '../case/CaseScene';
import drowned from '../../assets/case-001/combat/drowned.png';
import kaew from '../../assets/case-001/combat/kaew.png';
import kaewFinal from '../../assets/case-001/combat/kaewFinal.png';
import type { BattleView } from './EncounterBoard';
import { encounterBrief, encounterState, shieldSteps, threatMessage } from './turnEncounterPresentation';
import { useEncounterCue } from './useEncounterCue';
import { combatStatuses, describeBeat, describeChanges, type CombatBeat } from './combatLogPresentation';
import './TurnEncounter.css';

type StoryOption = {id:string; dice?:{dc:number}};
type Choice = {id:string;label:string;detail:string;mark:string;disabled?:boolean};
const outcomes={success:'สำเร็จ',partial:'สำเร็จบางส่วน',failure:'พลาด'};
const conclusions={won:'ผ่านการเผชิญหน้าแล้ว',pacified:'ผีสงบลง',escaped:'ทีมถอยออกมาได้',lost:'ทีมหมดสภาพต่อสู้'};
export type TurnConclusionView={outcome:keyof typeof conclusions;check?:{die:number;total:number;outcome:keyof typeof outcomes};history?:CombatBeat[]};

function CombatFlavourLine({beat}:{beat:CombatBeat}) {
  return beat.flavour ? <div className="c4-flavour"><p>{beat.flavour.text}</p>{beat.flavour.dialogue && <blockquote><strong>{beat.flavour.dialogue.speaker}</strong> “{beat.flavour.dialogue.text}”</blockquote>}</div> : null;
}

export function TurnConclusion({result}:{result:TurnConclusionView}) {
  return <div className="c4-conclusion" role="status"><strong>จบการเผชิญหน้า · {conclusions[result.outcome]}</strong>
    {result.check && <span>ผลทอยสุดท้าย · D20 {result.check.die} · รวม {result.check.total} · {outcomes[result.check.outcome]}</span>}
    {!!result.history?.length && <details><summary>บันทึกการต่อสู้ก่อนจบฉาก</summary><ol>{result.history.map((beat,index)=><li key={index}>{describeBeat(beat,()=> 'ผู้ร่วมฉาก')} · {beat.effect ?? (beat.check?outcomes[beat.check.outcome]:'บันทึกการกระทำแล้ว')}{beat.check && <small>D20 {beat.check.die} · รวม {beat.check.total} · {outcomes[beat.check.outcome]}</small>}{describeChanges(beat).map(text=><small key={text}>{text}</small>)}<CombatFlavourLine beat={beat}/></li>)}</ol></details>}
  </div>;
}

export function TurnEncounter({site,battle,characters,self,isDm=false,enabled,paused,action,waitingForStoryRoll,onManageRoll}:{
  site:CaseSite; battle:BattleView; characters:Record<string,Character>; self?:string;
  isDm?:boolean; enabled?:boolean; paused?:boolean; action?:(type:string,payload?:object)=>void;
  waitingForStoryRoll?:boolean; onManageRoll?:()=>void;
}) {
  const turn=battle.turnEncounter!;
  const [fullLog,setFullLog]=useState(false);
  const enemy=battle.enemies.find(enemy=>enemy.id===turn.npcActive) ?? battle.enemies.find(enemy=>!enemy.resolved) ?? battle.enemies[0];
  const brief=encounterBrief(battle);
  const state=encounterState(battle);
  const threat=threatMessage(battle);
  const latest=turn.history.at(-1);
  const cue=useEncounterCue(threat ? battle.round+':'+threat.title : '');
  const npcTurn=!battle.active;
  const myTurn=isDm ? npcTurn : battle.active===self;
  const allowed=!!(enabled && action && turn.ready && myTurn && !waitingForStoryRoll);
  const name=(id:string)=>battle.enemies.find(candidate=>candidate.id===id)?.name || characters[id]?.playerName || characters[id]?.characterName ||
    (characters[id] ? professions[characters[id].profession].name : 'ผู้สืบสวน');
  const heading=!turn.ready?(isDm?'รอเปิดฉาก '+turn.scene:'รอ DM เปิดการเผชิญหน้า') : npcTurn ? 'ตาของ'+enemy.name :
    battle.active===self?'ถึงตาคุณแล้ว':'ตาของ'+name(battle.active!);
  return <section className="c4-encounter" data-manifestation={state} data-wounded={enemy.hp>0 && enemy.hp<(enemy.maxHp ?? turn.maxHp)/2} aria-label="ฉากเผชิญหน้า">
    <header className="c4-stage" style={{backgroundImage:'linear-gradient(90deg, #081513 10%, #081513dc 45%, #08151338), url('+illustrations[site]+')'}}>
      {battle.final55 && <div className="c4-wards" aria-hidden="true">{[0,1,2].map(step=><i key={step} data-broken={battle.final55!.step>step}/> )}</div>}
      <img className="c4-ghost" src={turn.scene==='C4'?drowned:turn.scene==='D4'?kaew:kaewFinal} alt=""/>
      <div className="c4-stage-copy">
        <div className="c4-stage-meta"><span>{isDm?'CASE 001 / '+turn.scene:'การเผชิญหน้า'}</span><span>รอบ {battle.round}</span></div>
        <h2>{battle.title}</h2>
        <p>{enemy.name}</p>
        <div className="c4-enemy-health">
          <progress max={enemy.maxHp ?? turn.maxHp} value={enemy.hp} aria-label="พลังชีวิตผี"/>
          <span>{enemy.hp}/{enemy.maxHp ?? turn.maxHp}</span>
        </div>
      </div>
    </header>
    {battle.enemies.length>1 && <section className="c4-enemies" aria-label="ผีในฉาก">
      {battle.enemies.map(member=><article key={member.id} data-resolved={!!member.resolved} aria-current={npcTurn && turn.npcActive===member.id?'step':undefined}>
        <img src={drowned} alt=""/><div><strong>{member.name}</strong>
          <p>{member.resolved?(member.outcome==='pacified'?'สงบแล้ว':'ร่างสลายแล้ว'):member.hesitating?'ชะงัก · งดโจมตีตานี้':npcTurn && turn.npcActive===member.id?'กำลังลงมือ':turn.acted.includes(member.id)?'เล่นแล้ว':'ยังคุกคามทีม'}</p>
          <progress max={member.maxHp ?? turn.maxHp} value={member.hp} aria-label={'พลังชีวิต '+member.name}/><small> {member.hp}/{member.maxHp ?? turn.maxHp}</small>{turn.conditions?.silenced[member.id] && <p>ถูกสะกดเสียง · ใช้ท่าโจมตีทางจิตไม่ได้ในตานี้</p>}{member.opening && <p>มีช่องเปิด · เพื่อนของ {name(member.opening.actor)} โจมตี +2 ครั้งเดียวถึงรอบ {member.opening.until}</p>}
        </div>
      </article>)}
    </section>}
    <button type="button" className="c4-sound" aria-pressed={cue.enabled} onClick={()=>void cue.toggle()}>เสียงเตือนท่าผี: {cue.enabled?'เปิด':'ปิด'}</button>
    {turn.ready && <section className="c4-plan" aria-label="วางแผนร่วมกัน">
      <strong>{brief.title}</strong><p>{brief.goal}</p><small>{brief.plan}</small>
    </section>}
    {battle.enemies.length===1 && turn.conditions?.silenced[enemy.id] && <p className="c4-plan">ถูกสะกดเสียง · ผีใช้ท่าโจมตีทางจิตไม่ได้ในตานี้ แต่ยังโจมตีทางกายได้</p>}
    {battle.enemies.length===1 && enemy.opening && <p className="c4-plan">มีช่องเปิด · เพื่อนของ {name(enemy.opening.actor)} โจมตี +2 ครั้งเดียวถึงรอบ {enemy.opening.until}</p>}
    {threat && <section className="c4-threat" role="status"><strong>{threat.title}</strong><p>{threat.detail}</p></section>}
    {battle.final55 && <section className="c4-objective" aria-label="ความคืบหน้าพิธี">
      <ol>{shieldSteps.map((label,step)=><li key={label} data-progress={step<battle.final55!.step?'done':step===battle.final55!.step?'current':'waiting'}>
        <span>{step<battle.final55!.step?'✓':step+1}</span>{label}
      </li>)}</ol>
      <p>{state==='dispersed'?'ร่างผีสลายแล้ว แต่พิธียังทำงาน — ลงมือจัดการอาคมต่อ':battle.final55.shield==='up'?'เกราะยังรับความเสียหาย — จัดการจุดอาคมตามลำดับ':'เกราะเปิดแล้ว — ปลดกำไลให้สำเร็จเพื่อหยุดพิธี'}</p>
    </section>}
    {latest && <section className="c4-spotlight" role="status" key={battle.round+':'+turn.history.length+':'+latest.actor+':'+latest.label}>
      <small>เหตุการณ์ล่าสุด · รอบ {latest.round}</small>
      <strong>{describeBeat(latest,name)}</strong>
      <CombatFlavourLine beat={latest}/>
      {latest.check && <span className="c4-roll" data-result={latest.check.outcome}>D20 {latest.check.die} · รวม {latest.check.total} · {outcomes[latest.check.outcome]}</span>}
      <p>{latest.effect ?? (latest.check?outcomes[latest.check.outcome]:'บันทึกการกระทำแล้ว')}</p>
      {describeChanges(latest).map(text=><small key={text}>{text}</small>)}
    </section>}
    {battle.final55 && <p className="c4-hint" role="status">เกราะ{battle.final55.shield==='up'?'ยังป้องกันอยู่':'เปิดแล้ว'} · สำเร็จ {battle.final55.step}/3 ขั้น · {battle.final55.step===3?'ลงมือปลดกำไลอีกครั้งเพื่อหยุดพิธี':'จัดการจุดอาคมตามลำดับ'}{battle.final55.damageBlocked?' · เกราะรับความเสียหายไว้':''}</p>}
    <ol className="c4-order" aria-label="ลำดับการเล่น">
      {turn.party.map(id=>{
        const c=characters[id];
        const down=!c?.hp;
        const status=down?'ล้ม':battle.active===id?'กำลังเล่น':turn.acted.includes(id)?'เล่นแล้ว':npcTurn?'รอรอบหน้า':'รอคิว';
        return <li key={id} data-state={status} aria-current={battle.active===id?'step':undefined}>
          {c && <img src={portraitUrl(c.profession)} alt=""/>}
          <span><strong>{name(id)}{id===self?' · คุณ':''}</strong><small>{status}{c ? ' · ชีวิต '+c.hp+'/'+(c.maxHp ?? 10)+' · สติ '+c.sanity+' · สมาธิ '+c.focus : ''}</small>
            {c && <small>{combatStatuses(battle,id,characters,name).map(status=>status.label).join(' · ') || 'ไม่มีสถานะพิเศษ'}</small>}
            {c && <small>BODY {characterAttribute(c,'body')} · PER {characterAttribute(c,'mind','PER')} · INT {characterAttribute(c,'knowledge')} · SOC {characterAttribute(c,'spirit','SOC')} · SPI {characterAttribute(c,'spirit')} · RES {characterAttribute(c,'spirit','RES')}</small>}</span>
        </li>;
      })}
      <li data-state={npcTurn?'กำลังเล่น':'รอคิว'} aria-current={npcTurn?'step':undefined}>
        <span className="c4-npc-badge">DM</span><span><strong>{enemy.name}</strong><small>{npcTurn?'DM กำลังเลือก':'เล่นหลังทีม'}</small></span>
      </li>
    </ol>
    <details className="c4-status-panel" open>
      <summary>สถานะปัจจุบัน · รอบ {battle.round}</summary>
      <div className="c4-status-grid">{[...turn.party,...battle.enemies.map(member=>member.id)].map(id=>{
        const statuses=combatStatuses(battle,id,characters,name);
        return <article key={id}><strong>{name(id)}{id===self?' · คุณ':''}</strong>
          {statuses.length ? <ul>{statuses.map(status=><li key={status.label}><b>{status.label}</b><p>{status.effect}</p><small>{status.expiry}</small></li>)}</ul> : <p>ไม่มีสถานะพิเศษ</p>}
        </article>;
      })}</div>
    </details>
    <div className="c4-body">
      <div className="c4-controls">
        <p className="c4-kicker">{isDm?'หน้าคุมฉาก':'ผู้สืบสวน'}</p>
        <h3 aria-live="polite">{heading}</h3>
        {!isDm && turn.expandedActions && <p className="c4-hint">{myTurn?'เหลือ 1 การกระทำ':turn.acted.includes(self ?? '')?'ใช้การกระทำแล้ว':'รอถึงตา'} · สมาธิ {self && characters[self]?.focus}</p>}
        {paused ? <p className="c4-hint">พักคดีอยู่ รอ DM เปิดเล่นต่อ</p> : !turn.ready ?
          <p className="c4-hint">{isDm?'ส่งบทเปิด '+turn.scene+' จากคิวด้านล่างก่อนเริ่มรอบแรก':'รอ DM ส่งบทเปิดให้ทีมก่อนลงมือ'}</p> :
          waitingForStoryRoll ? <p className="c4-hint">รอการ์ด D20 สำหรับติดต่อผี</p> :
          myTurn ? <TurnChoices key={battle.round+':'+battle.active+':'+turn.npcActive} battle={battle} isDm={isDm}
            allowed={allowed} characters={characters} name={name} action={action}/> :
          <p className="c4-hint">{isDm?'ทีมกำลังลงมือทีละคน คุณจะเลือกท่าให้ผีเมื่อทุกคนเล่นครบ':
            npcTurn?'DM กำลังเลือกการกระทำให้ผี':'รอเพื่อนร่วมทีมลงมือ คุณดูผลได้จากบันทึกรอบ'}</p>}
        {onManageRoll && <button type="button" className="c4-roll-link" onClick={onManageRoll}>เปิดคำขอทอย D20</button>}
      </div>
      <aside className="c4-journal" aria-label="บันทึกการเผชิญหน้า" aria-live="polite">
        <p className="c4-kicker">บันทึกที่ทีมเห็นร่วมกัน</p>
        <h3>ผลการเล่น</h3>
        {turn.history.length===0 ? <p className="c4-hint">การกระทำและผลทอยจะปรากฏที่นี่</p> :
          <ol>{(fullLog?turn.history:turn.history.slice(-6)).slice().reverse().map((beat,i)=><li key={turn.history.length-i}>
            <div><small>รอบ {beat.round}</small><strong>{describeBeat(beat,name)}</strong><CombatFlavourLine beat={beat}/>
              <small>{beat.effect ?? (beat.check?outcomes[beat.check.outcome]:'บันทึกการกระทำแล้ว')}</small>{describeChanges(beat).map(text=><small key={text}>{text}</small>)}</div>
            {beat.check && <span className="c4-roll" data-result={beat.check.outcome}>D20 {beat.check.die}<br/>รวม {beat.check.total} · {outcomes[beat.check.outcome]}</span>}
          </li>)}</ol>}
        {turn.history.length>6 && <button type="button" className="c4-roll-link" aria-expanded={fullLog} onClick={()=>setFullLog(!fullLog)}>{fullLog?'แสดง 6 เหตุการณ์ล่าสุด':'ดูย้อนหลังทั้งหมดที่เก็บไว้ ('+turn.history.length+' เหตุการณ์)'}</button>}
      </aside>
    </div>
  </section>;
}

function TurnChoices({battle,isDm,allowed,characters,name,action}:{
  battle:BattleView; isDm:boolean; allowed:boolean; characters:Record<string,Character>;name:(id:string)=>string;
  action?:(type:string,payload?:object)=>void;
}) {
  const [choice,setChoice]=useState('');
  const [target,setTarget]=useState('');
  const turn=battle.turnEncounter!;
  const active=characters[battle.active ?? ''];
  const skill=active && turnSkills[active.profession];
  const power=active && powerAttacks[active.profession];
  const restrained=!!turn.expandedActions && !!battle.active && (battle.restrained[battle.active] ?? 0)>=battle.round;
  const unsteady=!!battle.active && (turn.unsteady?.[battle.active] ?? 0)>=battle.round;
  const frightened=!!battle.active && (turn.shaken?.[battle.active] ?? 0)>=battle.round;
  const down=turn.party.filter(id=>characters[id]?.hp===0);
  const choices:Choice[]=isDm ? [
    ...(turn.attacks ?? []).map(attack=>({id:attack.id,label:attack.name,detail:'ทอย D20 · ลด'+(attack.resource==='HP'?'ชีวิต':'สติ')+' '+attack.damage+(attack.detail?' · '+attack.detail:''),mark:'D20'})),
    {id:'pass',label:battle.enemies.find(enemy=>enemy.id===turn.npcActive)?.hesitating?'ผีชะงัก · ส่งตาต่อ':'รอดูท่าที',detail:'จบตาของผีตัวนี้',mark:'—'},
    ...(turn.scene!=='F1'?[{id:'withdraw',label:'ให้ผีถอย',detail:'ผีสลายและจบฉาก',mark:'↩'}]:[]),
  ] : [
    ...(turn.expandedActions && power ? [{id:'powerStrike',label:power.name+(turn.powerUsed?.includes(battle.active!)?' (ใช้แล้ว)':''),detail:power.stat+' เทียบ '+power.defense+' · โดนแล้ว '+power.damage+' ดาเมจ · หนึ่งครั้งต่อฉาก แม้พลาด · ไม่เสียสมาธิ',mark:'D20',disabled:!!turn.powerUsed?.includes(battle.active!) || active.sanity===0 || frightened || restrained && power.physical}]:[]),
    ...(turn.expandedActions && skill ? [{id:'classSkill',label:skill.name,detail:skill.detail,mark:active.profession==='medium'?'D20':'ท่า',disabled:unsteady && active.profession==='containment_specialist' || frightened || active.focus<skill.focus || active.sanity===0 || restrained && ['field_medic','containment_specialist'].includes(active.profession)}]:[]),
    ...(frightened || unsteady?[{id:'compose',label:'ตั้งหลัก',detail:'RES DC12 · ลบหวาดกลัวและเสียหลัก ไม่ฟื้นแต้มสติ',mark:'D20'}]:[]),
    ...(restrained?[{id:'breakFree',label:'ดิ้นหลุดพันธนาการ',detail:'BODY DC12 · ใช้หนึ่งการกระทำ',mark:'D20'}]:[]),
    {id:'strike',disabled:restrained,label:'ขับไล่ผี',detail:'BODY · '+(battle.final55?.shield==='up'?'เกราะยังรับความเสียหายไว้':battle.final55?'ลดพลังชีวิตร่างผี แต่ไม่หยุดพิธี':'โจมตีเพื่อลดพลังชีวิตผี'),mark:'D20'},
    ...(turn.canPacify?[{id:'pacify',label:turn.pacifyDescription?'เรียกสติผี':'กล่อมให้สงบ',detail:turn.pacifyDescription ?? 'SPI · ใช้พลังจิตเพื่อจบฉาก',mark:'D20',disabled:frightened || !characters[battle.active!]?.sanity}]:[]),
    ...(battle.objective && turn.scene!=='C4'?[{id:'objective',label:battle.final55?shieldSteps[battle.final55.step]:'คลายจุดอาคม',detail:turn.expandedActions?'INT DC12 · สำเร็จแล้วบันทึกผลตามลำดับ':'2 AP · INT DC12 · สำเร็จแล้วบันทึกผลตามลำดับ',mark:'D20'}]:[]),
    ...(turn.expandedActions?[{id:'observe',label:'อ่านจังหวะผี',detail:'PER DC12 · เปิดช่องให้เพื่อนโจมตี +2 ครั้งเดียวถึงรอบหน้า',mark:'D20'}, {id:'encourage',label:'ดึงสติเพื่อน',detail:'SOC DC12 · ฟื้นสติ 1 และลบหวาดกลัว · ลองได้ครั้งเดียวต่อเพื่อนแต่ละคนในฉาก',mark:'D20',disabled:!turn.party.some(id=>id!==battle.active && characters[id]?.hp>0 && (characters[id]?.sanity<10 || (turn.shaken?.[id] ?? 0)>=battle.round) && !turn.supportUsed?.includes(id))}]:[]),
    {id:'guard',disabled:unsteady,label:'ตั้งรับ',detail:'ป้องกัน +2 ในตาผีรอบนี้',mark:'+2'},
    ...(down.length ? [{id:'stabilize',label:'พยุงเพื่อน',detail:'ช่วยผู้สืบสวนที่ล้ม',mark:'D20'}] : []),
    {id:'pass',label:'ผ่านตา',detail:'ส่งต่อให้คนถัดไป',mark:'—'},
    {id:'withdraw',disabled:restrained,label:'พาทีมถอย',detail:'จบการเผชิญหน้าของทั้งทีม',mark:'↩'},
  ];
  const attack=turn.attacks?.find(option=>option.id===choice);
  const targets= !isDm && (choice==='strike' || choice==='powerStrike' || choice==='pacify' || choice==='observe' || choice==='classSkill' && skill?.target==='enemy') ? battle.enemies.filter(enemy=>!enemy.resolved && enemy.hp>0).map(enemy=>enemy.id) : choice==='classSkill' && skill?.target==='ally' ? turn.party.filter(id=>characters[id]?.hp>0 && (active.profession==='ritual_specialist' || id!==battle.active)) : choice==='encourage' ? turn.party.filter(id=>id!==battle.active && characters[id]?.hp>0 && (characters[id]?.sanity<10 || (turn.shaken?.[id] ?? 0)>=battle.round) && !turn.supportUsed?.includes(id)) : attack ? turn.party.filter(id=>!!characters[id]?.hp) : choice==='stabilize' ? down : [];
  const pickedTarget=targets.includes(target) ? target : targets.length===1 ? targets[0] : '';
  const selected=choices.find(item=>item.id===choice && !item.disabled);
  const commit=()=>{
    if(!selected) return;
    action?.('turnEncounter',{round:battle.round,choice:attack?(turn.scene==='F1' && !enemyDeclared()?'declareAttack':'attack'):choice,attackId:attack?.id,targetId:pickedTarget || undefined,enemyId:turn.npcActive,step:battle.final55?.step});
  };
  const enemyDeclared=()=>turn.declared?.attackId===attack?.id && turn.declared?.targetId===pickedTarget;
  return <>
    {isDm && turn.canWithhold && <button type="button" disabled={!allowed} onClick={()=>action?.('guided',{command:'v51:forbear55'})}>แม่แก้วฝืนคำสั่ง · งดการโจมตีนี้ครั้งเดียว</button>}
    <p className="c4-hint">{isDm?'เลือกท่าและเป้าหมาย แล้วกดทอยแทนผี':'เลือก 1 การกระทำ แล้วกดยืนยันเพื่อส่งตา'}</p>
    <div className="c4-choices" role="group" aria-label={isDm?'เลือกท่าของผี':'เลือกการกระทำ'}>
      {choices.map(item=><button key={item.id} type="button" aria-pressed={choice===item.id} disabled={!allowed || item.disabled} onClick={()=>{setChoice(item.id);setTarget('');}}>
        <span className="c4-mark" aria-hidden="true">{item.mark}</span><span><strong>{item.label}</strong><small>{item.detail}</small></span>
      </button>)}
    </div>
    {selected && <p className="c4-choice-preview" role="status">{selected.label} · {selected.detail}{choice==='withdraw'?' · ทุกคนจะออกจากการเผชิญหน้า':''}</p>}
    {targets.length>0 && <div className="c4-targets" role="group" aria-label="เลือกเป้าหมาย">
      <span>เลือกเป้าหมาย</span>
      {targets.map(id=><button type="button" key={id} aria-pressed={pickedTarget===id} disabled={!allowed} onClick={()=>setTarget(id)}>{name(id)}</button>)}
    </div>}
    <button type="button" className="c4-confirm" disabled={!allowed || !selected || (targets.length>0 && !pickedTarget)} onClick={commit}>
      {!selected?'เลือกการกระทำก่อน':attack?(turn.scene==='F1' && !enemyDeclared()?'ประกาศท่าและเป้าหมาย':'ทอย D20 ให้ผี'):
        selected.mark==='D20'?'ทอย D20 · '+selected.label:'ยืนยัน'+selected.label}
    </button>
  </>;
}
