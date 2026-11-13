import { useEffect, useRef, useState } from 'react';

export function useEncounterCue(cue:string) {
  const context=useRef<AudioContext>();
  const previous=useRef(cue);
  const [enabled,setEnabled]=useState(false);
  useEffect(()=>{
    const changed=previous.current!==cue;
    previous.current=cue;
    const audio=context.current;
    if(!enabled || !changed || !cue || !audio || audio.state!=='running')return;
    const oscillator=audio.createOscillator(), gain=audio.createGain();
    oscillator.type='sine';
    oscillator.frequency.setValueAtTime(180,audio.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(90,audio.currentTime+.35);
    gain.gain.setValueAtTime(.08,audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.4);
    oscillator.connect(gain);gain.connect(audio.destination);
    oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
    oscillator.start();oscillator.stop(audio.currentTime+.4);
  },[cue,enabled]);
  useEffect(()=>()=>{void context.current?.close();},[]);
  const toggle=async()=>{
    if(enabled){setEnabled(false);return;}
    if(typeof AudioContext==='undefined')return;
    try {
      context.current ??= new AudioContext();
      await context.current.resume();
      setEnabled(context.current.state==='running');
    } catch { setEnabled(false); }
  };
  return {enabled,toggle};
}
