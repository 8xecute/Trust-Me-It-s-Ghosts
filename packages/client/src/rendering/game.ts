import Phaser from 'phaser';
import { location } from '../data/location';
import { gridToScreen, screenToGrid, TILE_WIDTH, TILE_HEIGHT } from './isometric';
import { Movement } from '../game/movement';
import { changeZoom, toggleRoof } from './view';
import { initialObjects } from '../game/objects';
import { Encounter } from '../game/encounter';
import { startGhostEncounter, runGhostPhase, playerGhostAction, type GhostEncounter } from '@baan/shared';

export interface OnlineMap {
  read(): { self: {x:number;y:number}; others: {x:number;y:number}[]; ghost: GhostEncounter|null } | null;
  move(target: {x:number;y:number}): void;
}

class LocationScene extends Phaser.Scene {
  private grid = { width: location.width, height: location.height, blocked: [
    ...location.walls, ...location.obstacles,
    ...Array.from({ length: location.house.width * location.house.depth }, (_, i) => ({ x: location.house.x + i % location.house.width, y: location.house.y + Math.floor(i / location.house.width) })),
    ...initialObjects.map(({x,y}) => ({x,y})),
  ] };
  private movement = new Movement(this.grid, { x: 4, y: 7 });
  private encounter = new Encounter([{id: 'player', position: {x:4,y:7}}]);
  private ghostState: GhostEncounter | null = null;
  private ghostToken!: Phaser.GameObjects.Arc;
  private overlay!: Phaser.GameObjects.Graphics;
  private token!: Phaser.GameObjects.Container;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private elapsed = 0;
  private roof!: Phaser.GameObjects.Graphics;
  private marker!: Phaser.GameObjects.Ellipse;
  private following = true;
  private peers: Phaser.GameObjects.Arc[] = [];
  constructor(private onSelect: (id: string | null) => void, private online?: OnlineMap) { super('location'); }
  create() {
    let g = this.add.graphics().setDepth(-1000);
    const polygon = (points: { x: number; y: number }[], fill: number, stroke: number) => {
      g.fillStyle(fill).lineStyle(2, stroke).beginPath().moveTo(points[0].x, points[0].y);
      for (const p of points.slice(1)) g.lineTo(p.x, p.y);
      g.closePath().fillPath().strokePath();
    };
    for (let y = 0; y < location.height; y++) for (let x = 0; x < location.width; x++) {
      const p = gridToScreen(x, y);
      polygon([{x:p.x,y:p.y-TILE_HEIGHT/2},{x:p.x+TILE_WIDTH/2,y:p.y},{x:p.x,y:p.y+TILE_HEIGHT/2},{x:p.x-TILE_WIDTH/2,y:p.y}], (x+y)%2 ? 0x526d4d : 0x5a7653, 0x425b40);
    }
    this.overlay = this.add.graphics().setDepth(-999).setVisible(false).lineStyle(2, 0xf5df9c, 0.85);
    for (let y = 0; y < location.height; y++) for (let x = 0; x < location.width; x++) {
      const p = gridToScreen(x,y);
      this.overlay.beginPath().moveTo(p.x,p.y-16).lineTo(p.x+32,p.y).lineTo(p.x,p.y+16).lineTo(p.x-32,p.y).closePath().strokePath();
    }
    this.game.events.on('set-mode', this.setMode, this);
    this.game.events.on('ghost-action', this.ghostAction, this);
    this.game.events.on('end-turn', this.endTurn, this);
    this.game.events.on('focus-action', this.focusAction, this);
    this.game.events.on('check-action', this.checkAction, this);
    this.events.once('shutdown', () => { this.game.events.off('set-mode', this.setMode, this); this.game.events.off('end-turn', this.endTurn, this); this.game.events.off('ghost-action', this.ghostAction, this); this.game.events.off('focus-action', this.focusAction, this); this.game.events.off('check-action', this.checkAction, this); });
    for (const cell of location.walls) {
      g = this.add.graphics();
      const p = gridToScreen(cell.x, cell.y);
      g.setDepth(p.y);
      polygon([{x:p.x-32,y:p.y-12},{x:p.x,y:p.y+4},{x:p.x,y:p.y-16},{x:p.x-32,y:p.y-32}], 0x6b7464, 0x414d40);
    }
    g = this.add.graphics();
    const h = location.house;
    const a = gridToScreen(h.x-.5,h.y-.5), b = gridToScreen(h.x+h.width-.5,h.y-.5);
    const c = gridToScreen(h.x+h.width-.5,h.y+h.depth-.5), d = gridToScreen(h.x-.5,h.y+h.depth-.5);
    g.setDepth(c.y);
    const up = (p: {x:number;y:number}, n:number) => ({x:p.x,y:p.y-n});
    g.lineStyle(8, 0x503929);
    for (const p of [a,b,c,d]) g.lineBetween(p.x,p.y-35,p.x,p.y+18);
    polygon([up(a,35),up(b,35),up(c,35),up(d,35)], 0xa17a4e, 0x503929);
    polygon([up(d,35),up(c,35),up(c,100),up(d,100)], 0x8d6746, 0x503929);
    polygon([up(b,35),up(c,35),up(c,100),up(b,100)], 0x785438, 0x503929);
    this.roof = this.add.graphics().setDepth(c.y + 1);
    g = this.roof;
    const ridgeA = {x:(a.x+d.x)/2,y:(a.y+d.y)/2-160};
    const ridgeB = {x:(b.x+c.x)/2,y:(b.y+c.y)/2-160};
    polygon([up(a,100),ridgeA,ridgeB,up(b,100)], 0x674337, 0x392d27);
    polygon([ridgeA,up(d,100),up(c,100),ridgeB], 0x805044, 0x392d27);
    g.lineStyle(3, 0xd4b986).lineBetween(ridgeA.x,ridgeA.y,ridgeA.x,ridgeA.y-10);
    // Obstacles in the foreground are deliberately separate from map data.
    for (const cell of location.obstacles) {
      const p = gridToScreen(cell.x, cell.y);
      g = this.add.graphics().setDepth(p.y);
      g.fillStyle(0x6b5134).fillRect(p.x-4,p.y-12,8,16);
      g.fillStyle(0x294a32).fillCircle(p.x,p.y-23,17);
      g.fillStyle(0x3d6240).fillCircle(p.x-6,p.y-28,10);
    }
    for (const object of initialObjects) {
      const p = gridToScreen(object.x, object.y);
      this.add.rectangle(p.x, p.y-12, 26, 22, object.evidenceId ? 0xe6c678 : 0xa16f42).setStrokeStyle(2, 0x36291e).setDepth(p.y);
    }
    this.ghostToken = this.add.circle(0,0,14,0xb9e9e5,0.8).setStrokeStyle(2,0xffffff).setVisible(false);
    const pos = gridToScreen(this.movement.position.x, this.movement.position.y);
    this.token = this.add.container(pos.x, pos.y, [
      this.add.ellipse(0, 0, 24, 10, 0x172a24, 0.6),
      this.add.circle(0, -15, 10, 0xe7bd7b).setStrokeStyle(2, 0x503929),
      this.add.circle(0, -26, 7, 0xf3d7ad).setStrokeStyle(2, 0x503929),
    ]);
    this.marker = this.add.ellipse(pos.x, pos.y - 15, 30, 40, 0xffe3a1, 0.28).setStrokeStyle(2, 0xffe3a1, 0.8).setDepth(10000);
    this.cameras.main.startFollow(this.token);
    this.keys = this.input.keyboard!.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D,I,J,K,L,F,R,Q,E') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const cell = screenToGrid(pointer.worldX, pointer.worldY);
      const target = {x: Math.round(cell.x), y: Math.round(cell.y)};
      const object = initialObjects.find(o => o.x === target.x && o.y === target.y);
      this.onSelect(object?.id ?? null);
      if (!object && this.online) this.online.move(target);
      else if (!object) { if (this.encounter.mode === 'encounter') this.encounterStep(target); else this.movement.moveTo(target); }
    });
  }
  private setMode(mode: 'exploration' | 'encounter') {
    this.movement.cancel();
    this.encounter.tokens[0].position = {...this.movement.position};
    this.encounter.setMode(mode);
    if (mode === 'encounter') {
      const spawn = [{x:8,y:7},{x:9,y:9},{x:0,y:9}].find(p => !this.grid.blocked.some(b => b.x===p.x && b.y===p.y) && (p.x!==this.movement.position.x || p.y!==this.movement.position.y));
      if (spawn) { this.ghostState = startGhostEncounter(this.movement.position,spawn); this.encounter.tokens.push({id:'ghost',position:{...spawn}}); }
    } else { this.ghostState = null; this.encounter.tokens.splice(1); }
    this.drawGhost();
    this.overlay.setVisible(mode === 'encounter');
    this.reportTurn();
  }
  private reportTurn() { this.game.events.emit('turn-update', {...this.encounter.turn}); }
  private drawGhost() {
    const s=this.ghostState; this.ghostToken.setVisible(!!s && s.manifestation>0 && s.phase !== 'resolved');
    if (s) { const p=gridToScreen(s.ghost.x,s.ghost.y); this.ghostToken.setPosition(p.x,p.y-18).setDepth(p.y); this.game.events.emit('ghost-update',s); }
  }
  private endTurn() {
    if (!this.ghostState || this.ghostState.phase !== 'player') return;
    this.ghostState = runGhostPhase({...this.ghostState,player:{...this.movement.position},turn:this.encounter.turn},this.grid);
    this.encounter.turn = this.ghostState.turn; this.encounter.tokens[1].position = {...this.ghostState.ghost};
    this.drawGhost(); this.reportTurn();
  }
  private ghostAction(action: 'pacify'|'strike'|'escape') {
    if (!this.ghostState) return;
    this.ghostState = playerGhostAction({...this.ghostState,player:{...this.movement.position},turn:this.encounter.turn},action,this.grid);
    this.encounter.turn = this.ghostState.turn; this.drawGhost(); this.reportTurn();
    if (this.ghostState.phase === 'resolved') { this.game.events.emit('encounter-resolved',this.ghostState.outcome); this.setMode('exploration'); }
  }
  private focusAction() { if (this.encounter.mode === 'encounter') { this.encounter.focus(); this.reportTurn(); } }
  private checkAction() {
    if (this.encounter.mode !== 'encounter') return;
    const result = this.encounter.check(() => Phaser.Math.Between(1,20));
    this.reportTurn();
    if (result) this.game.events.emit('check-result', result);
  }
  private encounterStep(target: {x:number;y:number}) {
    if (this.ghostState?.phase === 'player' && this.encounter.move(this.grid, 'player', target)) { this.movement.position = {...this.encounter.tokens[0].position}; this.reportTurn(); }
  }
  private step(dx: number, dy: number) {
    if (this.online) { const self=this.online.read()?.self; if(self) this.online.move({x:self.x+dx,y:self.y+dy}); return; }
    if (this.encounter.mode === 'encounter') this.encounterStep({x:this.movement.position.x+dx,y:this.movement.position.y+dy});
    else this.movement.stepDirection(dx,dy);
  }
  update(_time: number, delta: number) {
    const camera = this.cameras.main;
    if (Phaser.Input.Keyboard.JustDown(this.keys.R)) this.roof.setVisible(toggleRoof(this.roof.visible));
    if (Phaser.Input.Keyboard.JustDown(this.keys.F)) { this.following = !this.following; if (this.following) camera.startFollow(this.token); else camera.stopFollow(); }
    if (Phaser.Input.Keyboard.JustDown(this.keys.Q)) camera.setZoom(changeZoom(camera.zoom, -0.1));
    if (Phaser.Input.Keyboard.JustDown(this.keys.E)) camera.setZoom(changeZoom(camera.zoom, 0.1));
    const panX = Number(this.keys.L.isDown) - Number(this.keys.J.isDown);
    const panY = Number(this.keys.K.isDown) - Number(this.keys.I.isDown);
    if (panX || panY) { if (this.following) { this.following = false; camera.stopFollow(); } camera.scrollX += panX * delta * 0.4 / camera.zoom; camera.scrollY += panY * delta * 0.4 / camera.zoom; }
    const just = (name: string) => Phaser.Input.Keyboard.JustDown(this.keys[name]);
    // Arrow keys follow the screen's isometric diagonals.
    if (just('UP') || just('W')) this.step(0, -1);
    else if (just('RIGHT') || just('D')) this.step(1, 0);
    else if (just('DOWN') || just('S')) this.step(0, 1);
    else if (just('LEFT') || just('A')) this.step(-1, 0);
    if (this.online) {
      const snapshot = this.online.read();
      if (snapshot) {
        this.movement.position = snapshot.self;
        this.ghostState = snapshot.ghost;
        this.ghostToken.setVisible(!!snapshot.ghost && snapshot.ghost.phase !== 'resolved');
        if (snapshot.ghost) {
          const ghost = gridToScreen(snapshot.ghost.ghost.x,snapshot.ghost.ghost.y);
          this.ghostToken.setPosition(ghost.x,ghost.y-18).setDepth(ghost.y);
        }
        this.overlay.setVisible(!!snapshot.ghost && snapshot.ghost.phase !== 'resolved');
        snapshot.others.forEach((cell,index) => {
          const pos = gridToScreen(cell.x,cell.y);
          const peer = this.peers[index] ??= this.add.circle(0,0,10,0x78caff);
          peer.setPosition(pos.x,pos.y-12).setDepth(pos.y).setVisible(true);
        });
        this.peers.slice(snapshot.others.length).forEach(peer => peer.setVisible(false));
      }
    }
    this.elapsed += delta;
    if (this.elapsed >= 150) { this.elapsed = 0; if (this.encounter.mode === 'exploration') this.movement.advance(); }
    const p = gridToScreen(this.movement.position.x, this.movement.position.y);
    this.token.setPosition(p.x, p.y).setDepth(p.y);
    this.marker.setPosition(p.x, p.y - 15);
  }
}

export function createGame(parent: HTMLElement, onSelect: (id: string | null) => void, online?: OnlineMap) {
  return new Phaser.Game({ type: Phaser.AUTO, parent, width: 960, height: 540, backgroundColor: '#182d2d', scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: [new LocationScene(onSelect, online)] });
}
