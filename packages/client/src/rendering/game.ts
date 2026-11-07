import { prepareVillageArt, villageArt } from './villageArt';
import bananaImage from '../assets/case-001/sprites/banana-horror.png';
import investigatorImage from '../assets/case-001/sprites/investigator-horror.png';
import ghostImage from '../assets/case-001/sprites/ghost-horror.png';
import houseImage from '../assets/case-001/sprites/house-horror.png';
import houseRooflessImage from '../assets/case-001/sprites/house-roofless.png';
import salaImage from '../assets/case-001/sprites/sala.png';
import cottageImage from '../assets/case-001/sprites/cottage.png';
import pickupImage from '../assets/case-001/sprites/pickup.png';
import Phaser from 'phaser';
import { location } from '../data/location';
import { gridToScreen, screenToGrid, TILE_WIDTH, TILE_HEIGHT } from './isometric';
import { Movement } from '../game/movement';
import { changeZoom, toggleRoof } from './view';
import { initialObjects } from '../game/objects';
import { Encounter } from '../game/encounter';
import { startGhostEncounter, runGhostPhase, playerGhostAction, type GhostEncounter, caseLayout, type CaseSite } from '@baan/shared';

export interface OnlineMap {
  read(): { self: {x:number;y:number}; others: {x:number;y:number}[]; ghost: GhostEncounter|null; encounterActive?:boolean; danger?:{x:number;y:number}[]; objectives?:{x:number;y:number}[]; enemies?:{position:{x:number;y:number}}[] } | null;
  move(target: {x:number;y:number}): void;
}

class LocationScene extends Phaser.Scene {
  private get layout() {return this.site ? caseLayout(this.site) : location;}
  private get objects() {return this.site ? [] : initialObjects;}
  private enemies: Phaser.GameObjects.Image[]=[];
  private get grid() {return { width: this.layout.width, height: this.layout.height, blocked: [
    ...this.layout.walls, ...this.layout.obstacles,
    ...Array.from({ length: this.layout.house.width * this.layout.house.depth }, (_, i) => ({ x: this.layout.house.x + i % this.layout.house.width, y: this.layout.house.y + Math.floor(i / this.layout.house.width) })),
    ...this.objects.map(({x,y}) => ({x,y})),
  ] };}
  private movement: Movement;
  private encounter = new Encounter([{id: 'player', position: {x:4,y:7}}]);
  private ghostState: GhostEncounter | null = null;
  private ghostToken!: Phaser.GameObjects.Image;
  private fog!: Phaser.GameObjects.Image;
  private ghostAura!: Phaser.GameObjects.Image;
  private ghostVisible = false;
  private danger?: Phaser.GameObjects.Graphics;
  private dangerKey = '';
  private overlay!: Phaser.GameObjects.Graphics;
  private token!: Phaser.GameObjects.Container;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private elapsed = 0;
  private roof!: Phaser.GameObjects.Container;
  private houseBase!: Phaser.GameObjects.Image;
  private marker!: Phaser.GameObjects.Ellipse;
  private following = true;
  private peers: Phaser.GameObjects.Image[] = [];
  constructor(private onSelect: (id: string | null) => void, private online?: OnlineMap, private site?:CaseSite) { super('location'); this.movement=new Movement(this.grid,{x:4,y:7}); }
  preload() {
    this.load.image(villageArt.banana, bananaImage);
    this.load.image(villageArt.player, investigatorImage);
    this.load.image(villageArt.ghost, ghostImage);
    this.load.image('village-house-horror', houseImage);
    this.load.image('village-house-roofless', houseRooflessImage);
    this.load.image('roadside-sala', salaImage);
    this.load.image('villager-cottage', cottageImage);
    this.load.image('roadside-pickup', pickupImage);
  }
  create() {
    prepareVillageArt(this);
    let g = this.add.graphics().setDepth(-1000);
    const polygon = (points: { x: number; y: number }[], fill: number, stroke: number) => {
      g.fillStyle(fill).lineStyle(2, stroke).beginPath().moveTo(points[0].x, points[0].y);
      for (const p of points.slice(1)) g.lineTo(p.x, p.y);
      g.closePath().fillPath().strokePath();
    };
    for (let y = 0; y < this.layout.height; y++) for (let x = 0; x < this.layout.width; x++) {
      const p = gridToScreen(x, y);
      const path = y===7 || (x===4 && y>4);
      const road = this.site==='A' && y>=7;
      const earth = [0x354638,0x394b3a,0x3d4d3b,0x32443a,0x404c3b];
      polygon([{x:p.x,y:p.y-TILE_HEIGHT/2},{x:p.x+TILE_WIDTH/2,y:p.y},{x:p.x,y:p.y+TILE_HEIGHT/2},{x:p.x-TILE_WIDTH/2,y:p.y}], road ? 0x42494a : path ? ((x+y)%3===0 ? 0x554e3d : 0x4d493b) : earth[(x*19+y*13+x*y)%earth.length], road ? 0x454d4b : 0x344438);
      if (road && y===8 && x%2===0) g.lineStyle(2,0xb4aa88,0.65).lineBetween(p.x-11,p.y-5,p.x+11,p.y+5);
      // Small deterministic marks suggest wet earth without changing the logical grid.
      for (let i=0;i<4;i++) {
        const dx=((x*19+y*13+i*17)%37)-18;
        const dy=((x*7+y*23+i*11)%9)-4;
        g.lineStyle(1,i%2 ? 0x70816a : 0x1f312b,0.35).lineBetween(p.x+dx,p.y+dy,p.x+dx+4,p.y+dy+1);
      }
    }
    const lantern = gridToScreen(6,5);
    this.add.image(lantern.x,lantern.y-14,villageArt.glow).setTint(0xffb45e).setAlpha(0.27).setDepth(-998);
    const mist = gridToScreen(5,4);
    this.fog = this.add.image(mist.x,mist.y,villageArt.glow).setTint(0x9baeb3).setScale(4,1.15).setAlpha(0.14).setDepth(9000);
    this.tweens.add({targets:this.fog,x:mist.x+65,duration:7400,yoyo:true,repeat:-1,ease:'Sine.easeInOut'});
    this.overlay = this.add.graphics().setDepth(-999).setVisible(false).lineStyle(2, 0xf5df9c, 0.85);
    for (let y = 0; y < this.layout.height; y++) for (let x = 0; x < this.layout.width; x++) {
      const p = gridToScreen(x,y);
      this.overlay.beginPath().moveTo(p.x,p.y-16).lineTo(p.x+32,p.y).lineTo(p.x,p.y+16).lineTo(p.x-32,p.y).closePath().strokePath();
    }
    this.game.events.on('set-mode', this.setMode, this);
    this.game.events.on('ghost-action', this.ghostAction, this);
    this.game.events.on('end-turn', this.endTurn, this);
    this.game.events.on('focus-action', this.focusAction, this);
    this.game.events.on('check-action', this.checkAction, this);
    this.events.once('shutdown', () => { this.game.events.off('set-mode', this.setMode, this); this.game.events.off('end-turn', this.endTurn, this); this.game.events.off('ghost-action', this.ghostAction, this); this.game.events.off('focus-action', this.focusAction, this); this.game.events.off('check-action', this.checkAction, this); });
    for (const cell of this.layout.walls) {
      g = this.add.graphics();
      const p = gridToScreen(cell.x, cell.y);
      g.setDepth(p.y);
      polygon([{x:p.x-32,y:p.y-12},{x:p.x,y:p.y+4},{x:p.x,y:p.y-16},{x:p.x-32,y:p.y-32}], 0x6b7464, 0x414d40);
    }
    g = this.add.graphics();
    const h = this.layout.house;
    const a = gridToScreen(h.x-.5,h.y-.5), b = gridToScreen(h.x+h.width-.5,h.y-.5);
    const c = gridToScreen(h.x+h.width-.5,h.y+h.depth-.5), d = gridToScreen(h.x-.5,h.y+h.depth-.5);
    g.setDepth(c.y);
    const up = (p: {x:number;y:number}, n:number) => ({x:p.x,y:p.y-n});
    g.lineStyle(8, 0x503929);
    for (const p of [a,b,c,d]) g.lineBetween(p.x,p.y-35,p.x,p.y+18);
    polygon([up(a,35),up(b,35),up(c,35),up(d,35)], 0x68533d, 0x302a25);
    polygon([up(d,35),up(c,35),up(c,100),up(d,100)], 0x68503b, 0x302a25);
    polygon([up(b,35),up(c,35),up(c,100),up(b,100)], 0x504032, 0x302a25);
    for (let i=1;i<9;i++) {
      const t=i/9;
      g.lineStyle(1,0x2e2924,0.55).lineBetween(Phaser.Math.Linear(d.x,c.x,t),Phaser.Math.Linear(d.y,c.y,t)-100,Phaser.Math.Linear(d.x,c.x,t),Phaser.Math.Linear(d.y,c.y,t)-35);
      g.lineBetween(Phaser.Math.Linear(b.x,c.x,t),Phaser.Math.Linear(b.y,c.y,t)-100,Phaser.Math.Linear(b.x,c.x,t),Phaser.Math.Linear(b.y,c.y,t)-35);
    }
    g.setVisible(false);
    const roofPanels = this.add.graphics();
    const roofTrim = this.add.graphics();
    this.roof = this.add.container(0,0,[roofPanels,roofTrim]).setDepth(c.y+0.5);
    g = roofPanels;
    const ridgeA = {x:(a.x+d.x)/2,y:(a.y+d.y)/2-160};
    const ridgeB = {x:(b.x+c.x)/2,y:(b.y+c.y)/2-160};
    polygon([up(a,100),ridgeA,ridgeB,up(b,100)], 0x493b35, 0x292624);
    polygon([ridgeA,up(d,100),up(c,100),ridgeB], 0x5d4940, 0x292624);
    g = roofTrim;
    g.lineStyle(3,0xb38056).lineBetween(ridgeA.x,ridgeA.y,ridgeB.x,ridgeB.y);
    for (let i=1;i<8;i++) {
      const t=i/8;
      g.lineStyle(1,0xc09370,0.55).lineBetween(
        Phaser.Math.Linear(ridgeA.x,ridgeB.x,t), Phaser.Math.Linear(ridgeA.y,ridgeB.y,t),
        Phaser.Math.Linear(d.x,c.x,t), Phaser.Math.Linear(d.y,c.y,t)-100);
    }
    g.lineStyle(3, 0xd4b986).lineBetween(ridgeA.x,ridgeA.y,ridgeA.x,ridgeA.y-10);
    roofPanels.setVisible(false);
    roofTrim.setVisible(false);
    const houseWidth = Math.abs(b.x-d.x) + 34;
    const building = this.site==='A' ? 'roadside-sala' : this.site==='C' ? 'villager-cottage' : this.site==='D' ? villageArt.banana : 'village-house-horror';
    const roofless = this.site==='A' || this.site==='C' || this.site==='D' ? building : 'village-house-roofless';
    this.houseBase = this.add.image((a.x+c.x)/2,c.y+18,roofless)
      .setOrigin(0.5,1).setDisplaySize(houseWidth,190).setDepth(c.y).setVisible(false);
    const house = this.add.image((a.x+c.x)/2,c.y+18,building)
      .setOrigin(0.5,1).setDisplaySize(houseWidth,190);
    if(this.site==='E') { house.setTint(0x92928b); this.houseBase.setTint(0x92928b); }
    this.roof.add(house);
    if(this.site==='A') {
      const roadside=gridToScreen(14,8);
      this.add.image(roadside.x,roadside.y,'roadside-pickup').setOrigin(0.5,1).setDisplaySize(92,60).setDepth(roadside.y);
    }
    if(this.site==='B') {
      const p=gridToScreen(7,6);
      this.add.image(p.x,p.y,villageArt.player).setOrigin(0.5,1).setDisplaySize(30,46).setTint(0xe3c7a2).setDepth(p.y);
      this.add.text(p.x,p.y-50,'ผู้ใหญ่ประเสริฐ',{fontFamily:'sans-serif',fontSize:'11px',color:'#f1e1be',backgroundColor:'#152021bb',padding:{x:4,y:2}}).setOrigin(0.5,1).setDepth(10001);
    }
    for (const cell of this.layout.obstacles) {
      const p = gridToScreen(cell.x,cell.y);
      this.add.image(p.x,p.y,villageArt.banana).setDisplaySize(74,76).setOrigin(0.5,1).setDepth(p.y);
    }
    for (const object of this.objects) {
      const p = gridToScreen(object.x,object.y);
      this.add.image(p.x,p.y,object.evidenceId ? villageArt.evidence : villageArt.crate).setOrigin(0.5,0.88).setDepth(p.y);
    }
    this.ghostAura = this.add.image(0,0,villageArt.glow).setScale(0.7).setAlpha(0.55).setVisible(false);
    this.ghostToken = this.add.image(0,0,villageArt.ghost).setDisplaySize(37,58).setOrigin(0.5,1).setVisible(false);
    const pos = gridToScreen(this.movement.position.x, this.movement.position.y);
    this.token = this.add.container(pos.x,pos.y,[this.add.image(0,0,villageArt.player).setDisplaySize(30,46).setOrigin(0.5,1)]);
    this.marker = this.add.ellipse(pos.x, pos.y + 1, 30, 12, 0xffe3a1, 0.18).setStrokeStyle(2, 0xffe3a1, 0.9).setDepth(10000);
    this.cameras.main.startFollow(this.token);
    this.cameras.main.setZoom(1.2);
    this.keys = this.input.keyboard!.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D,I,J,K,L,F,R,Q,E') as Record<string, Phaser.Input.Keyboard.Key>;
    const keyboard = this.input.keyboard!;
    const editable = (target: EventTarget | null) => target instanceof HTMLElement &&
      (target.isContentEditable || !!target.closest('input, textarea, select, [contenteditable="true"]'));
    const focusIn = (event: FocusEvent) => {
      if (editable(event.target)) { keyboard.resetKeys(); keyboard.manager.enabled = false; }
    };
    const focusOut = (event: FocusEvent) => {
      if (editable(event.target) && !editable(event.relatedTarget)) { keyboard.resetKeys(); keyboard.manager.enabled = true; }
    };
    document.addEventListener('focusin', focusIn);
    document.addEventListener('focusout', focusOut);
    if (editable(document.activeElement)) keyboard.manager.enabled = false;
    this.events.once('shutdown', () => {
      document.removeEventListener('focusin', focusIn);
      document.removeEventListener('focusout', focusOut);
      keyboard.manager.enabled = true;
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const cell = screenToGrid(pointer.worldX, pointer.worldY);
      const target = {x: Math.round(cell.x), y: Math.round(cell.y)};
      const object = this.objects.find(o => o.x === target.x && o.y === target.y);
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
    if (this.ghostState) this.game.events.emit('ghost-update',this.ghostState);
  }
  private renderGhost(time:number) {
    const ghost=this.ghostState;
    const visible=!!ghost && ghost.manifestation>0 && ghost.phase!=='resolved';
    this.ghostToken.setVisible(visible);
    this.ghostAura.setVisible(visible);
    if (visible!==this.ghostVisible) {
      this.ghostVisible=visible;
      this.cameras.main.flash(280,visible?124:77,visible?166:132,visible?155:105);
      this.fog.setAlpha(visible?0.3:0.19);
    }
    if (!visible || !ghost) return;
    const p=gridToScreen(ghost.ghost.x,ghost.ghost.y);
    const color=ghost.disposition==='hostile'?0xde9db5:0x91e6bb;
    const bob=Math.sin(time/380)*4;
    this.ghostAura.setPosition(p.x,p.y-22).setDepth(p.y-0.1).setTint(color);
    this.ghostToken.setPosition(p.x,p.y-6+bob).setDepth(p.y+0.1).setTint(color);
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
    if (Phaser.Input.Keyboard.JustDown(this.keys.R)) {
      this.roof.setVisible(toggleRoof(this.roof.visible));
      this.houseBase.setVisible(!this.roof.visible);
    }
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
        this.overlay.setVisible(snapshot.encounterActive ?? (!!snapshot.ghost && snapshot.ghost.phase !== 'resolved'));
        const dangerKey = JSON.stringify([snapshot.danger,snapshot.objectives]);
        if(dangerKey!==this.dangerKey) {
          this.dangerKey=dangerKey;
          const marker=this.danger ??= this.add.graphics().setDepth(1);
          marker.clear().fillStyle(0xe36b66,0.55);
          for(const cell of [...(snapshot.danger ?? []),...(snapshot.objectives ?? [])]) {
            if(snapshot.objectives?.includes(cell)) marker.fillStyle(0xffd674,0.68);
            const p=gridToScreen(cell.x,cell.y);
            marker.fillPoints([{x:p.x,y:p.y-TILE_HEIGHT/2},{x:p.x+TILE_WIDTH/2,y:p.y},
              {x:p.x,y:p.y+TILE_HEIGHT/2},{x:p.x-TILE_WIDTH/2,y:p.y}],true);
          }
        }
        (snapshot.enemies ?? []).forEach(({position},index)=>{
          const p=gridToScreen(position.x,position.y);
          const enemy=this.enemies[index] ??= this.add.image(0,0,villageArt.ghost).setDisplaySize(37,58).setOrigin(0.5,1);
          enemy.setPosition(p.x,p.y-6+Math.sin(_time/380+index)*4).setDepth(p.y+0.1).setVisible(true);
        });
        for(let i=snapshot.enemies?.length ?? 0;i<this.enemies.length;i++) this.enemies[i].setVisible(false);
        snapshot.others.forEach((cell,index) => {
          const pos = gridToScreen(cell.x,cell.y);
          const peer = this.peers[index] ??= this.add.image(0,0,villageArt.player).setDisplaySize(30,46).setOrigin(0.5,1).setTint(0x9bd6ed);
          peer.setPosition(pos.x,pos.y).setDepth(pos.y+0.2).setVisible(true);
        });
        for (let i=snapshot.others.length;i<this.peers.length;i++) this.peers[i].setVisible(false);
      }
    }
    this.renderGhost(_time);
    this.elapsed += delta;
    if (this.elapsed >= 150) { this.elapsed = 0; if (this.encounter.mode === 'exploration') this.movement.advance(); }
    const p = gridToScreen(this.movement.position.x, this.movement.position.y);
    this.token.setPosition(p.x, p.y).setDepth(p.y+0.3);
    this.marker.setPosition(p.x, p.y + 1);
  }
}

export function createGame(parent: HTMLElement, onSelect: (id: string | null) => void, online?: OnlineMap, site?:CaseSite) {
  return new Phaser.Game({ type: Phaser.AUTO, parent, width: 960, height: 540, backgroundColor: '#111f22', scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: [new LocationScene(onSelect, online, site)] });
}
