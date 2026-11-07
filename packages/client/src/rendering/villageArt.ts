import type Phaser from 'phaser';

export const villageArt = {
  banana:'village-banana', crate:'village-crate', evidence:'village-evidence',
  player:'village-investigator', ghost:'village-spirit', glow:'village-glow',
} as const;

/** Bake placeholder artwork once so repeated objects share textures. */
export function prepareVillageArt(scene: Phaser.Scene) {
  if (scene.textures.exists(villageArt.crate)) return;
  const g = scene.make.graphics({x:0,y:0});
  for (const [key,color] of [[villageArt.crate,0x9e7047],[villageArt.evidence,0xdab46d]] as const) {
    g.fillStyle(0x152523,0.5).fillEllipse(20,28,32,8);
    g.fillStyle(color).fillPoints([{x:3,y:11},{x:19,y:3},{x:37,y:11},{x:20,y:20}],true);
    g.fillStyle(0x6d4d38).fillPoints([{x:3,y:11},{x:20,y:20},{x:20,y:30},{x:3,y:22}],true);
    g.fillStyle(0x886448).fillPoints([{x:20,y:20},{x:37,y:11},{x:37,y:22},{x:20,y:30}],true);
    g.lineStyle(1,0x392c29).lineBetween(20,20,20,30);
    g.generateTexture(key,40,32).clear();
  }
  g.destroy();
  const glow = scene.textures.createCanvas(villageArt.glow,128,128)!;
  const ctx = glow.getContext();
  const gradient = ctx.createRadialGradient(64,64,0,64,64,64);
  gradient.addColorStop(0,'rgba(255,255,255,0.9)');
  gradient.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=gradient;
  ctx.fillRect(0,0,128,128);
  glow.refresh();
}
