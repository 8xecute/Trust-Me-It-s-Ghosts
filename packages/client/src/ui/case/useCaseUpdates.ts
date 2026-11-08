import {useEffect,useState} from 'react';
const read=(key:string):string[]=>{try{const value=JSON.parse(sessionStorage.getItem(key) ?? '[]');return Array.isArray(value)?value.filter(v=>typeof v==='string'):[];}catch{return [];}};
/** Tracks only content actually exposed by the player's snapshot, per room and player. */
export function useCaseUpdates(scope:string,entries:string[],reading:boolean) {
 const key='case-read:'+scope;
 const [state,setState]=useState<{key:string;seen:string[]}>({key:'',seen:[]});
 const [visible,setVisible]=useState(()=>document.visibilityState==='visible');
 useEffect(()=>{const update=()=>setVisible(document.visibilityState==='visible');document.addEventListener('visibilitychange',update);return()=>document.removeEventListener('visibilitychange',update);},[]);
 const seen=state.key===key?state.seen:read(key);
 const signature=JSON.stringify(entries);
 useEffect(()=>{
  if(!scope || !reading || !visible)return;
  const next=[...new Set([...read(key),...JSON.parse(signature) as string[]])].slice(-1000);
  try{sessionStorage.setItem(key,JSON.stringify(next));}catch{ /* The in-memory tracker still works if browser storage is unavailable. */ }
  setState({key,seen:next});
 },[key,signature,reading,visible,scope]);
 return entries.filter(entry=>!seen.includes(entry)).length;
}
