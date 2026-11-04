import type Phaser from 'phaser';

export const villageArt = {
  banana:'village-banana', crate:'village-crate', evidence:'village-evidence',
  player:'village-investigator', ghost:'village-spirit', glow:'village-glow',
} as const;

/** Bake placeholder artwork once so repeated objects share textures. */
export function prepareVillageArt(scene: Phaser.Scene) {
  if (scene.textures.exists(villageArt.banana)) return;
  const g = scene.make.graphics({x:0,y:0});
  g.fillStyle(0x101e1b,0.45).fillEllipse(28,65,42,12);
  g.fillStyle(0x696343).fillRect(26,22,6,44);
  for (const [x,y,angle] of [[15,22,0],[40,20,0],[13,33,1],[43,34,1],[30,14,0]]) {
    g.fillStyle(angle ? 0x315c43 : 0x518358).fillEllipse(x,y,25,11);
    g.lineStyle(1,0x87a66a,0.7).lineBetween(x-8,y,x+8,y);
  }
  g.generateTexture(villageArt.banana,56,72).clear();
  for (const [key,color] of [[villageArt.crate,0x9e7047],[villageArt.evidence,0xdab46d]] as const) {
    g.fillStyle(0x152523,0.5).fillEllipse(20,28,32,8);
    g.fillStyle(color).fillPoints([{x:3,y:11},{x:19,y:3},{x:37,y:11},{x:20,y:20}],true);
    g.fillStyle(0x6d4d38).fillPoints([{x:3,y:11},{x:20,y:20},{x:20,y:30},{x:3,y:22}],true);
    g.fillStyle(0x886448).fillPoints([{x:20,y:20},{x:37,y:11},{x:37,y:22},{x:20,y:30}],true);
    g.lineStyle(1,0x392c29).lineBetween(20,20,20,30);
    g.generateTexture(key,40,32).clear();
  }
  g.fillStyle(0x11221f,0.55).fillEllipse(16,37,25,8);
  g.fillStyle(0xe0b16b).fillRoundedRect(8,16,16,20,5);
  g.fillStyle(0x453c33).fillRoundedRect(10,23,12,8,2);
  g.fillStyle(0xf1d7b7).fillCircle(16,13,7);
  g.fillStyle(0x3c3934).fillEllipse(16,8,17,7);
  g.generateTexture(villageArt.player,32,42).clear();
  g.fillStyle(0x547c68).fillPoints([{x:12,y:20},{x:28,y:20},{x:34,y:53},{x:19,y:47},{x:6,y:53}],true);
  g.fillStyle(0x1f3531).fillEllipse(20,16,20,30);
  g.fillStyle(0xe3f3dc).fillEllipse(20,16,12,17);
  g.generateTexture(villageArt.ghost,40,56).destroy();
  const glow = scene.textures.createCanvas(villageArt.glow,128,128)!;
  const ctx = glow.getContext();
  const gradient = ctx.createRadialGradient(64,64,0,64,64,64);
  gradient.addColorStop(0,'rgba(255,255,255,0.9)');
  gradient.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=gradient;
  ctx.fillRect(0,0,128,128);
  glow.refresh();
}
