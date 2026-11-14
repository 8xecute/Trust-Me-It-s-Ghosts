export type SavePreview={room:string;title:string;location:string;players:number};

// Preview only public labels. The server validates and restores the complete save.
export function savePreview(input:unknown):SavePreview {
 if(!input || typeof input!=='object')throw Error('ไฟล์นี้ไม่ใช่เซฟของเกม');
 const save=input as {format?:unknown;version?:unknown;membership?:{room?:{code?:unknown;players?:unknown[]}};state?:{world?:{humanDmId?:unknown;case001?:{title?:unknown;location?:unknown;guided?:{version?:unknown}}}}};
 const room=save.membership?.room,world=save.state?.world;
 if(save.format!=='baan-session' || save.version!==1 || typeof room?.code!=='string' || !/^[A-F0-9]{6}$/.test(room.code) || !Array.isArray(room.players) || !world?.case001 || !world.humanDmId)throw Error('ไฟล์ไม่ตรงรูปแบบเซฟที่รองรับ เลือกไฟล์ JSON ที่ DM ดาวน์โหลดจากเกม');
 if(world.case001.guided?.version!=='5.5')throw Error('รองรับเฉพาะเซฟ CASE 001 v5.5 เลือกไฟล์เซฟฉบับ v5.5');
 return {room:room.code,title:typeof world.case001.title==='string'?world.case001.title:'คดีที่บันทึกไว้',location:typeof world.case001.location==='string'?world.case001.location:'ตำแหน่งเดิม',players:room.players.length-1};
}
