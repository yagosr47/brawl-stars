import Phaser from 'phaser';
import { colorFor, distance, ROOM_LABELS, USE_DISTANCE } from '../../../shared/constants.js';
import { MAPS, movePosition } from '../../../shared/physics.js';
import { audio } from '../lib/audio.js';
import { gameBus, sendInput } from '../lib/client.js';

const lerp = (from, to, amount) => from + (to - from) * amount;

export class OrbitalScene extends Phaser.Scene {
  constructor(bridge) {
    super('Orbital');
    this.bridge = bridge;
    this.views = new Map();
    this.bodyViews = new Map();
    this.effects = [];
    this.deathUntil = new Map();
    this.lastInput = { x: 0, y: 0, at: 0 };
    this.lastSnapshot = 0;
  }

  preload() {
    this.load.image('ship-map', '/assets/map/skled.png');
    this.load.image('lobby-map', '/assets/map/Lobby.png');
    this.load.image('crew-source', '/assets/crew-sheet.png');
    this.load.json('crew-meta', '/assets/crew-sheet.json');
    this.load.on('progress', value => this.bridge.onProgress(value));
  }

  create() {
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT');
    this.makeUtilityTextures();
    this.game.canvas.setAttribute('aria-label', 'Nave espacial. Use W A S D ou as setas para mover seu tripulante.');
    this.game.canvas.setAttribute('role', 'img');
    this.game.canvas.tabIndex = 0;
    this.effectListener = event => this.effects.push(event.detail);
    gameBus.addEventListener('effect', this.effectListener);
    this.resizeListener = () => this.configureCamera();
    this.scale.on('resize', this.resizeListener);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      gameBus.removeEventListener('effect', this.effectListener);
      this.scale.off('resize', this.resizeListener);
      sendInput(0, 0);
    });
    this.bridge.onReady();
  }

  makeUtilityTextures() {
    const glow = this.textures.createCanvas('orbital-glow', 64, 64);
    const context = glow.context;
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, '#ffffffcc'); gradient.addColorStop(0.22, '#ffffff66'); gradient.addColorStop(1, '#ffffff00');
    context.fillStyle = gradient; context.fillRect(0, 0, 64, 64); glow.refresh();
    const fog = this.textures.createCanvas('orbital-fog', 1024, 1024);
    const fg = fog.context.createRadialGradient(512, 512, 15, 512, 512, 480);
    fg.addColorStop(0, '#060e1800'); fg.addColorStop(0.18, '#060e1800');
    fg.addColorStop(0.3, '#060e1838'); fg.addColorStop(0.43, '#060e18cc'); fg.addColorStop(0.6, '#060e18ef'); fg.addColorStop(1, '#060e18f9');
    fog.context.fillStyle = fg; fog.context.fillRect(0, 0, 1024, 1024); fog.refresh();
  }

  crewTexture(colorId) {
    const key = `crew-${colorId}`;
    if (this.textures.exists(key)) return key;
    const source = this.textures.get('crew-source').getSourceImage();
    const canvas = document.createElement('canvas');
    canvas.width = source.width / 2; canvas.height = source.height / 2;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const rgb = hex => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
    const palette = colorFor(colorId), main = rgb(palette.hex), dark = rgb(palette.dark);
    const pixels = image.data;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] < 8) continue;
      const r = pixels[index], g = pixels[index + 1], b = pixels[index + 2];
      let output;
      if (r > 65 && r > g * 1.45 && r > b * 1.45) output = main.map(channel => channel * r / 255);
      else if (b > 65 && b > r * 1.45 && b > g * 1.45) output = dark.map(channel => channel * b / 255);
      else if (g > 55 && g > r * 1.4 && g > b * 1.4) output = [40 + 125 * g / 255, 40 + 190 * g / 255, 40 + 210 * g / 255];
      if (output) { pixels[index] = output[0]; pixels[index + 1] = output[1]; pixels[index + 2] = output[2]; }
    }
    context.putImageData(image, 0, 0);
    this.textures.addSpriteSheet(key, canvas, { frameWidth: 96, frameHeight: 120 });
    const meta = this.cache.json.get('crew-meta');
    this.anims.create({ key: `walk-${colorId}`, frames: this.anims.generateFrameNumbers(key, { start: meta.walkStart, end: meta.walkEnd }), frameRate: 15, repeat: -1 });
    this.anims.create({ key: `death-${colorId}`, frames: this.anims.generateFrameNumbers(key, { start: meta.deathStart, end: meta.deathEnd }), frameRate: 38, repeat: 0 });
    return key;
  }

  rebuildMap(room) {
    this.cameras.main.stopFollow();
    this.tweens.killAll();
    this.children.removeAll(true);
    this.views.clear(); this.bodyViews.clear(); this.deathUntil.clear();
    this.mapKey = room.map;
    this.lastSnapshot = 0;
    this.predicted = null;
    this.background = this.add.image(0, 0, `${room.map}-map`).setOrigin(0).setDepth(-100);
    this.cameras.main.setBackgroundColor('#0a121d');
    this.markerViews = new Map();
    this.dust = this.add.particles(0, 0, 'orbital-glow', {
      lifespan: { min: 260, max: 440 }, speed: { min: 3, max: 11 },
      scale: { start: room.map === 'lobby' ? 0.19 : 0.075, end: 0 }, alpha: { start: 0.2, end: 0 },
      tint: [0xa6bec9, 0xc4d5d1], frequency: -1, blendMode: Phaser.BlendModes.ADD,
    }).setDepth(5);
    this.sparkEmitter = this.add.particles(0, 0, 'orbital-glow', {
      lifespan: { min: 300, max: 650 }, speed: { min: 22, max: 78 },
      scale: { start: 0.1, end: 0 }, alpha: { start: 0.9, end: 0 },
      tint: [0xffdb9b, 0xf88782, 0xeaf3f4], frequency: -1, blendMode: Phaser.BlendModes.ADD,
    }).setDepth(700);
    if (room.map === 'ship') {
      for (const label of ROOM_LABELS) this.add.text(label.x, label.y, label.label, { fontFamily: 'Space Grotesk Variable, sans-serif', fontSize: '3.6px', color: '#e5f3ff', letterSpacing: 1 }).setOrigin(0.5).setAlpha(0.3).setDepth(-50);
      this.emergencyGlow = this.add.image(556, 126, 'orbital-glow').setTint(0x71d5f6).setScale(0.48).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(-10);
      this.emergencyRing = this.add.circle(556, 126, 8).setStrokeStyle(0.6, 0x9be4f0, 0.7).setDepth(1);
      this.add.text(556, 112, 'REUNIÃO', { fontFamily: 'Space Grotesk Variable, sans-serif', fontSize: '3.5px', color: '#aed8e0' }).setOrigin(0.5).setDepth(2).setAlpha(0.7);
      this.fog = this.add.image(0, 0, 'orbital-fog').setDepth(800);
    } else {
      this.fog = null;
      for (const x of [130, 1115]) {
        const glow = this.add.image(x, 825, 'orbital-glow').setTint(0x7be0f8).setDisplaySize(230, 260).setAlpha(0.38).setBlendMode(Phaser.BlendModes.ADD).setDepth(0);
        if (!this.bridge.settings.current.reducedMotion) this.tweens.add({ targets: glow, alpha: 0.22, scaleY: glow.scaleY * 0.88, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
    }
    this.configureCamera();
    if (!this.bridge.settings.current.reducedMotion) this.cameras.main.fadeIn(550, 6, 12, 20);
  }

  configureCamera() {
    if (!this.mapKey) return;
    const { width, height } = this.scale;
    const camera = this.cameras.main;
    if (this.mapKey === 'lobby') {
      camera.setZoom(Math.min(width / 1060, height / 760));
      camera.centerOn(615, 440);
      camera.removeBounds();
    } else {
      camera.setZoom(Phaser.Math.Clamp(Math.min(width / 375, height / 270), 1.35, 3));
      const local = this.views.get(this.bridge.room.current?.self.id);
      if (local) camera.startFollow(local.sprite, true, 0.085, 0.085);
      camera.setBounds(0, 0, MAPS.ship.width, MAPS.ship.height);
    }
  }

  addView(player, room) {
    const isLobby = room.map === 'lobby';
    const texture = this.crewTexture(player.color);
    const scale = isLobby ? 0.57 : 0.285;
    const shadow = this.add.ellipse(player.x, player.y - 1, isLobby ? 40 : 20, isLobby ? 11 : 6, 0x05090f, 0.24).setDepth(9);
    const isSelf = player.id === room.self.id;
    const glow = isSelf ? this.add.image(player.x, player.y - 1, 'orbital-glow').setTint(0xc4ef76).setDisplaySize(isLobby ? 96 : 45, isLobby ? 35 : 18).setAlpha(0.28).setBlendMode(Phaser.BlendModes.ADD).setDepth(8) : null;
    const sprite = this.add.sprite(player.x, player.y, texture, 0).setOrigin(0.5, 0.96).setScale(scale).setDepth(player.y + 20);
    const label = this.add.text(player.x, player.y + (isLobby ? 10 : 5), player.name, {
      // Set this at construction: Phaser's Canvas renderer reads the texture's
      // source resolution once; changing it later incorrectly triples label size.
      resolution: 3,
      fontFamily: 'Space Grotesk Variable, sans-serif', fontSize: isLobby ? '13px' : '5.2px',
      fontStyle: isSelf ? 'bold' : 'normal', color: isSelf ? '#d7f5ad' : '#e1e9ef',
      stroke: '#0b111b', strokeThickness: isLobby ? 2 : 0.9,
    }).setOrigin(0.5, 0).setDepth(player.y + 22);
    const view = { sprite, shadow, label, glow, scale, color: player.color, target: player, lastDust: 0, index: this.views.size };
    this.views.set(player.id, view);
    if (isSelf) {
      this.predicted = { x: player.x, y: player.y };
      if (!isLobby) { this.cameras.main.startFollow(sprite, true, 0.085, 0.085); this.cameras.main.centerOn(player.x, player.y); }
    }
    if (!this.bridge.settings.current.reducedMotion) {
      sprite.setAlpha(0);
      this.tweens.add({ targets: sprite, alpha: 1, duration: 400 });
    }
    return view;
  }

  syncRoom(room) {
    const ids = new Set(room.players.map(player => player.id));
    for (const [id, view] of this.views) {
      if (!ids.has(id)) { view.sprite.destroy(); view.shadow.destroy(); view.label.destroy(); view.glow?.destroy(); this.views.delete(id); }
    }
    for (const player of room.players) {
      let view = this.views.get(player.id) || this.addView(player, room);
      if (view.color !== player.color) { view.sprite.setTexture(this.crewTexture(player.color), 0); view.color = player.color; }
      view.target = player;
      view.label.setText(player.connected ? player.name : `${player.name} ···`);
      if (player.id === room.self.id && this.predicted) {
        const error = distance(this.predicted, player);
        if (error > 45 || !['lobby', 'playing'].includes(room.phase)) this.predicted = { x: player.x, y: player.y };
        else {
          const blend = player.moving ? 0.08 : 0.32;
          this.predicted.x = lerp(this.predicted.x, player.x, blend);
          this.predicted.y = lerp(this.predicted.y, player.y, blend);
        }
      }
    }
    if (room.map === 'ship') this.syncMarkers(room);
  }

  syncMarkers(room) {
    for (const task of room.self.tasks) {
      let marker = this.markerViews.get(task.id);
      if (!marker) {
        const glow = this.add.image(task.x, task.y - 3, 'orbital-glow').setTint(0xc4ef76).setScale(0.55).setAlpha(0.4).setBlendMode(Phaser.BlendModes.ADD).setDepth(3);
        const circle = this.add.rectangle(task.x, task.y - 5, 8, 10, 0xc4ef76).setStrokeStyle(0.5, 0xf1ffda).setDepth(650);
        const text = this.add.text(task.x, task.y - 5, '!', { fontFamily: 'Space Grotesk Variable, sans-serif', fontSize: '8px', color: '#24371c', fontStyle: 'bold' }).setOrigin(0.5).setDepth(651);
        marker = { glow, circle, text, x: task.x, y: task.y, done: task.done };
        this.markerViews.set(task.id, marker);
      }
      marker.done = task.done;
      for (const object of [marker.glow, marker.circle, marker.text]) object.setVisible(!task.done && room.phase === 'playing');
    }
    const bodies = new Set(room.bodies.map(body => body.id));
    for (const [id, objects] of this.bodyViews) {
      if (!bodies.has(id)) { objects.forEach(object => object.destroy()); this.bodyViews.delete(id); }
    }
    for (const body of room.bodies) {
      if (this.bodyViews.has(body.id) || (this.deathUntil.get(body.id) || 0) > performance.now()) continue;
      const texture = this.crewTexture(body.color);
      const meta = this.cache.json.get('crew-meta');
      const sprite = this.add.image(body.x, body.y, texture, meta.deathEnd).setOrigin(0.5, 0.96).setScale(0.285).setDepth(body.y + 19);
      const glow = this.add.image(body.x, body.y, 'orbital-glow').setTint(0xef777a).setScale(0.4).setAlpha(0.17).setBlendMode(Phaser.BlendModes.ADD).setDepth(2);
      this.bodyViews.set(body.id, [sprite, glow]);
    }
  }

  handleEffects(_room) {
    for (const event of this.effects.splice(0)) {
      if (event.type === 'elimination') {
        this.deathUntil.set(event.targetId, performance.now() + 1150);
        const existing = this.bodyViews.get(event.targetId);
        if (existing) { existing.forEach(object => object.destroy()); this.bodyViews.delete(event.targetId); }
        const visible = distance(this.predicted || { x: 0, y: 0 }, event) < 175;
        if (visible) {
          const animation = this.add.sprite(event.x, event.y, this.crewTexture(event.color), 13).setOrigin(0.5, 0.96).setScale(0.285).setDepth(event.y + 21);
          animation.play(`death-${event.color}`);
          animation.once('animationcomplete', () => animation.destroy());
          if (this.bridge.settings.current.particles) {
            this.sparkEmitter.explode(17, event.x, event.y - 10);
            const ring = this.add.circle(event.x, event.y - 7, 6).setStrokeStyle(1, 0xf6a295, 0.7).setDepth(698);
            this.tweens.add({ targets: ring, scale: 4, alpha: 0, duration: 380, onComplete: () => ring.destroy() });
          }
          if (this.bridge.settings.current.shake && !this.bridge.settings.current.reducedMotion) this.cameras.main.shake(180, 0.006);
          audio.play('kill');
        }
      }
      if (event.type === 'task-complete' && this.predicted) {
        if (this.bridge.settings.current.particles) { this.sparkEmitter.setParticleTint([0xc4ef76, 0xdff8b9, 0x8fded5]); this.sparkEmitter.explode(20, this.predicted.x, this.predicted.y - 12); }
        audio.play('success');
      }
      if (event.type === 'mission-started' && !this.bridge.settings.current.reducedMotion) this.cameras.main.flash(250, 122, 168, 169, false);
    }
  }

  update(time, delta) {
    const room = this.bridge.room.current;
    if (!room || !this.keys) return;
    if (room.map !== this.mapKey) this.rebuildMap(room);
    const seconds = Math.min(delta / 1000, 0.06);
    this.handleEffects(room);
    if (room.serverTime !== this.lastSnapshot) { this.syncRoom(room); this.lastSnapshot = room.serverTime; }
    const self = room.players.find(player => player.id === room.self.id);
    if (!self || !this.predicted) return;
    const focused = document.activeElement;
    const typing = focused && ['INPUT', 'TEXTAREA', 'SELECT'].includes(focused.tagName);
    const blocked = this.bridge.interactions.current.blocked || typing || !['lobby', 'playing'].includes(room.phase);
    let x = 0, y = 0;
    if (!blocked) {
      x = (this.keys.D.isDown || this.keys.RIGHT.isDown ? 1 : 0) - (this.keys.A.isDown || this.keys.LEFT.isDown ? 1 : 0);
      y = (this.keys.S.isDown || this.keys.DOWN.isDown ? 1 : 0) - (this.keys.W.isDown || this.keys.UP.isDown ? 1 : 0);
      if (this.bridge.interactions.current.joystick?.active) {
        x = this.bridge.interactions.current.joystick.x;
        y = this.bridge.interactions.current.joystick.y;
      }
    }
    if (x !== this.lastInput.x || y !== this.lastInput.y || time - this.lastInput.at > 80) {
      if (['lobby', 'playing'].includes(room.phase)) sendInput(x, y);
      this.lastInput = { x, y, at: time };
    }
    this.predicted = movePosition(room.map, this.predicted, { x, y }, seconds, !self.alive);
    const localMoving = Boolean(x || y);
    const settings = this.bridge.settings.current;
    const vision = room.self.role === 'impostor' ? 175 : 153;
    for (const [id, view] of this.views) {
      const player = view.target;
      const local = id === room.self.id;
      const position = local ? this.predicted : { x: lerp(view.sprite.x, player.x, 1 - Math.exp(-delta / 85)), y: lerp(view.sprite.y, player.y, 1 - Math.exp(-delta / 85)) };
      const visible = (player.alive || !self.alive || local || room.phase === 'ended') && (room.map === 'lobby' || local || !self.alive || distance(this.predicted, position) < vision);
      const dying = (this.deathUntil.get(id) || 0) > performance.now();
      view.sprite.setVisible(visible && !dying);
      view.shadow.setVisible(visible && player.alive && !dying);
      view.label.setVisible(visible && !dying);
      const moving = local ? localMoving : player.moving;
      const direction = local && Math.abs(x) > 0.1 ? x > 0 ? 1 : -1 : player.direction;
      if (moving && !dying && player.alive) { if (view.sprite.anims.currentAnim?.key !== `walk-${view.color}` || !view.sprite.anims.isPlaying) view.sprite.play(`walk-${view.color}`, true); }
      else { view.sprite.anims.stop(); view.sprite.setFrame(0); }
      const bob = player.alive || settings.reducedMotion ? 0 : Math.sin(time / 450 + view.index) * (room.map === 'lobby' ? 4 : 2);
      view.sprite.setPosition(position.x, position.y + bob).setDepth(position.y + 20).setFlipX(direction < 0).setAlpha(player.alive ? player.connected ? 1 : 0.45 : 0.36);
      if (!moving && player.alive && !settings.reducedMotion) view.sprite.setScale(view.scale, view.scale * (1 + Math.sin(time / 430 + view.index) * 0.009));
      else view.sprite.setScale(view.scale);
      view.shadow.setPosition(position.x, position.y - 1);
      view.label.setPosition(position.x, position.y + (room.map === 'lobby' ? 10 : 5)).setDepth(position.y + 22).setAlpha(player.alive ? 1 : 0.5);
      view.glow?.setPosition(position.x, position.y - 2).setAlpha(0.19 + Math.sin(time / 600) * 0.04);
      if (moving && visible && player.alive && settings.particles && !settings.reducedMotion && time - view.lastDust > 160) {
        this.dust.emitParticleAt(position.x, position.y, 1); view.lastDust = time;
        if (local && room.map === 'ship') audio.play('foot');
      }
    }
    if (this.fog) this.fog.setPosition(this.predicted.x, this.predicted.y - 10).setVisible(self.alive && !['meeting', 'ejection', 'ended'].includes(room.phase)).setAlpha(room.practice ? 0.78 : 0.93).setScale(room.self.role === 'impostor' ? 1.15 : 1);
    for (const marker of this.markerViews.values()) {
      if (marker.done) continue;
      const near = distance(this.predicted, marker) < USE_DISTANCE;
      marker.glow.setAlpha(near ? 0.6 : 0.28 + Math.sin(time / 600) * 0.08);
      if (!settings.reducedMotion) { marker.circle.setY(marker.y - 5 + Math.sin(time / 400) * 1.2); marker.text.setY(marker.circle.y); }
    }
    if (this.emergencyGlow?.active) this.emergencyGlow.setAlpha(0.35 + Math.sin(time / 800) * 0.12);
  }
}
