export function dmEventGroup(id:string):'npc'|'evidence'|'scene' {
 if(['wichai-route','wichai-arrived','wichai-depart','wichai-escaped'].includes(id.split(':')[0]))return 'npc';
 if(['collect-land','collect-flood','read-gate','read-shelter','read-ritual-book','history-supported','evidence-supported','evidence-insufficient','plan-credible','plan-insufficient','disclosed'].includes(id.split(':')[0]))return 'evidence';
 return 'scene';
}

// Only stateful scene interactions belong here; routine exploration stays in narration.
export function isSceneInteraction(option:{id:string;check?:boolean}) {
 return !option.check && (['key','search-ritual-bag','approach-ritual-core','engage-kaew','show-clue','unsafe-bracelet'].includes(option.id)
  || option.id.startsWith('escort:') || option.id.startsWith('clue:'));
}
