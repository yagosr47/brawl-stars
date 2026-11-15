/* ============================================================
   ARENA BRAWLER — Renderização Canvas 2D
   - Câmera com interpolação (lerp) + screen shake por trauma
   - Sombras projetadas, retículos dinâmicos, arbustos translúcidos
   - Barras de vida segmentadas, munição e números de dano flutuantes
   ============================================================ */

import type { Entity, Particle, Projectile, World } from './types';
import type { InputManager } from './input';
import {
  COLOR,
  MAP_TILES_X,
  MAP_TILES_Y,
  SHAKE_MAX_OFFSET,
  TILE_SIZE,
  TAU,
  clamp,
  lerp,
} from './constants';
import { isEntityVisible } from './physics';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
  trauma: number;
}

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponível');
    this.ctx = ctx;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(window.innerWidth * this.dpr);
    this.canvas.height = Math.floor(window.innerHeight * this.dpr);
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;
  }

  get viewWidth(): number {
    return this.canvas.width / this.dpr;
  }

  get viewHeight(): number {
    return this.canvas.height / this.dpr;
  }

  /* ============================ DRAW PRINCIPAL ============================ */

  draw(world: World | null, player: Entity | null, cam: Camera, input: InputManager, showAim: boolean): void {
    const ctx = this.ctx;
    const vw = this.viewWidth;
    const vh = this.viewHeight;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    if (!world) {
      this.drawMenuBackdrop();
      return;
    }

    // Fundo
    ctx.fillStyle = '#12241a';
    ctx.fillRect(0, 0, vw, vh);

    // Screen shake baseado em trauma
    const shake = cam.trauma * cam.trauma;
    const sx = (Math.random() * 2 - 1) * SHAKE_MAX_OFFSET * shake;
    const sy = (Math.random() * 2 - 1) * SHAKE_MAX_OFFSET * shake;

    ctx.save();
    ctx.translate(vw / 2 + sx, vh / 2 + sy);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    const viewHalfW = vw / (2 * cam.zoom);
    const viewHalfH = vh / (2 * cam.zoom);
    const left = cam.x - viewHalfW - TILE_SIZE * 2;
    const right = cam.x + viewHalfW + TILE_SIZE * 2;
    const top = cam.y - viewHalfH - TILE_SIZE * 2;
    const bottom = cam.y + viewHalfH + TILE_SIZE * 2;

    this.drawTiles(world, left, right, top, bottom);
    this.drawCrates(world, left, right, top, bottom);
    this.drawPickups(world, left, right, top, bottom);

    // Entidades ordenadas por Y (falso depth-sort)
    const visible: Entity[] = [];
    for (const e of world.entities) {
      if (!e.alive || e.eliminated) continue;
      if (player && !isEntityVisible(e, player, world) && !e.jump.active) continue;
      visible.push(e);
    }
    visible.sort((a, b) => a.pos.y - b.pos.y);
    for (const e of visible) this.drawEntity(e, world, player);

    for (const p of world.projectiles) {
      if (!p.dead) this.drawProjectile(p);
    }
    for (const pt of world.particles) this.drawParticle(pt);
    for (const f of world.floaters) this.drawFloater(f);

    this.drawBushOverlay(world, player, left, right, top, bottom);
    this.drawPoison(world, left, right, top, bottom);

    if (player && showAim && player.alive && !player.eliminated && !player.jump.active) {
      this.drawAimReticle(player, input, world);
    }

    ctx.restore();

    // Elementos de tela (joysticks)
    if (input.touchMode) this.drawSticks(input);
  }

  /* ============================ MENU BACKDROP ============================ */

  private drawMenuBackdrop(): void {
    const ctx = this.ctx;
    const vw = this.viewWidth;
    const vh = this.viewHeight;
    const t = performance.now() / 1000;
    const g = ctx.createLinearGradient(0, 0, 0, vh);
    g.addColorStop(0, '#3d2a75');
    g.addColorStop(0.55, '#2a1a4a');
    g.addColorStop(1, '#160c2b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, vw, vh);

    for (let i = 0; i < 14; i++) {
      const phase = t * (0.12 + (i % 5) * 0.035) + i * 1.7;
      const x = ((Math.sin(phase) * 0.5 + 0.5) * vw + i * 97) % vw;
      const y = ((Math.cos(phase * 0.8 + i) * 0.5 + 0.5) * vh + i * 61) % vh;
      const r = 18 + (i % 4) * 12;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fillStyle = i % 3 === 0 ? 'rgba(255, 210, 63, 0.1)' : 'rgba(120, 80, 220, 0.12)';
      ctx.fill();
    }
  }

  /* ============================ TILES ============================ */

  private drawTiles(world: World, left: number, right: number, top: number, bottom: number): void {
    const ctx = this.ctx;
    const map = world.map;
    const ts = TILE_SIZE;
    const tx0 = clamp(Math.floor(left / ts), 0, MAP_TILES_X - 1);
    const tx1 = clamp(Math.ceil(right / ts), 0, MAP_TILES_X - 1);
    const ty0 = clamp(Math.floor(top / ts), 0, MAP_TILES_Y - 1);
    const ty1 = clamp(Math.ceil(bottom / ts), 0, MAP_TILES_Y - 1);

    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const x = tx * ts;
        const y = ty * ts;
        const tile = map.getTile(tx, ty);
        if (tile === 'BUSH') {
          // Chão embaixo do arbusto
          ctx.fillStyle = (tx + ty) % 2 === 0 ? COLOR.floorA : COLOR.floorB;
          ctx.fillRect(x, y, ts, ts);
          continue;
        }
        if (tile === 'FLOOR') {
          ctx.fillStyle = (tx + ty) % 2 === 0 ? COLOR.floorA : COLOR.floorB;
          ctx.fillRect(x, y, ts, ts);
          continue;
        }
        if (tile === 'WATER') {
          ctx.fillStyle = COLOR.water;
          ctx.fillRect(x, y, ts, ts);
          const wob = Math.sin(world.time * 2.2 + tx * 0.9 + ty * 1.3) * 3;
          ctx.strokeStyle = COLOR.waterLight;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x + 5, y + ts * 0.5 + wob);
          ctx.quadraticCurveTo(x + ts * 0.5, y + ts * 0.35 + wob, x + ts - 5, y + ts * 0.5 + wob);
          ctx.stroke();
          continue;
        }
        if (tile === 'WALL') {
          ctx.fillStyle = COLOR.wallEdge;
          ctx.fillRect(x, y, ts, ts);
          ctx.fillStyle = COLOR.wall;
          ctx.fillRect(x + 2, y + 2, ts - 4, ts - 4);
          ctx.fillStyle = COLOR.wallTop;
          ctx.fillRect(x + 2, y + 2, ts - 4, ts * 0.38);
          ctx.strokeStyle = COLOR.outline;
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 1, y + 1, ts - 2, ts - 2);
          continue;
        }
        if (tile === 'BREAKABLE') {
          ctx.fillStyle = COLOR.breakable;
          ctx.fillRect(x, y, ts, ts);
          ctx.fillStyle = COLOR.breakableTop;
          ctx.fillRect(x + 2, y + 2, ts - 4, ts * 0.32);
          ctx.strokeStyle = COLOR.crack;
          ctx.lineWidth = 2.4;
          const seed = (tx * 7 + ty * 13) % 3;
          ctx.beginPath();
          if (seed === 0) {
            ctx.moveTo(x + ts * 0.2, y + ts * 0.45);
            ctx.lineTo(x + ts * 0.55, y + ts * 0.7);
            ctx.lineTo(x + ts * 0.4, y + ts * 0.95);
          } else if (seed === 1) {
            ctx.moveTo(x + ts * 0.75, y + ts * 0.4);
            ctx.lineTo(x + ts * 0.35, y + ts * 0.6);
            ctx.lineTo(x + ts * 0.6, y + ts * 0.92);
          } else {
            ctx.moveTo(x + ts * 0.25, y + ts * 0.55);
            ctx.lineTo(x + ts * 0.7, y + ts * 0.5);
            ctx.lineTo(x + ts * 0.55, y + ts * 0.88);
          }
          ctx.stroke();
          ctx.strokeStyle = COLOR.outline;
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 1, y + 1, ts - 2, ts - 2);
        }
      }
    }
  }

  /* ============================ ARBUSTOS (overlay stealth) ============================ */

  private drawBushOverlay(
    world: World,
    player: Entity | null,
    left: number,
    right: number,
    top: number,
    bottom: number,
  ): void {
    const ctx = this.ctx;
    const map = world.map;
    const ts = TILE_SIZE;
    const tx0 = clamp(Math.floor(left / ts), 0, MAP_TILES_X - 1);
    const tx1 = clamp(Math.ceil(right / ts), 0, MAP_TILES_X - 1);
    const ty0 = clamp(Math.floor(top / ts), 0, MAP_TILES_Y - 1);
    const ty1 = clamp(Math.ceil(bottom / ts), 0, MAP_TILES_Y - 1);

    const playerInBush = player ? map.isBushAt(player.pos.x, player.pos.y) : false;

    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (map.getTile(tx, ty) !== 'BUSH') continue;
        const x = tx * ts;
        const y = ty * ts;
        const cx = x + ts / 2;
        const cy = y + ts / 2;

        let alpha = 1;
        if (player && playerInBush) {
          const d = Math.hypot(cx - player.pos.x, cy - player.pos.y);
          if (d < TILE_SIZE * 3) alpha = lerp(0.38, 1, d / (TILE_SIZE * 3));
        }

        ctx.globalAlpha = alpha;
        const wob = Math.sin(world.time * 1.4 + tx * 0.8 + ty * 1.1) * 1.5;
        ctx.fillStyle = COLOR.bushDark;
        this.leafBlob(cx - 7, cy - 5 + wob, 13);
        this.leafBlob(cx + 8, cy - 6 - wob, 12);
        this.leafBlob(cx, cy + 6 + wob * 0.6, 14);
        ctx.fillStyle = COLOR.bush;
        this.leafBlob(cx - 5, cy - 3 + wob, 10);
        this.leafBlob(cx + 6, cy - 2 - wob, 9);
        this.leafBlob(cx + 1, cy + 7 + wob * 0.6, 10);
        ctx.fillStyle = COLOR.bushLight;
        this.leafBlob(cx - 3, cy - 4 + wob, 5);
        this.leafBlob(cx + 5, cy + 1 - wob, 4);
        ctx.globalAlpha = 1;
      }
    }
  }

  private leafBlob(x: number, y: number, r: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }

  /* ============================ POISON (Showdown) ============================ */

  private drawPoison(world: World, left: number, right: number, top: number, bottom: number): void {
    if (world.mode !== 'SHOWDOWN') return;
    const ctx = this.ctx;
    const ts = TILE_SIZE;
    const cxTile = MAP_TILES_X / 2;
    const cyTile = MAP_TILES_Y / 2;
    const tx0 = clamp(Math.floor(left / ts), 0, MAP_TILES_X - 1);
    const tx1 = clamp(Math.ceil(right / ts), 0, MAP_TILES_X - 1);
    const ty0 = clamp(Math.floor(top / ts), 0, MAP_TILES_Y - 1);
    const ty1 = clamp(Math.ceil(bottom / ts), 0, MAP_TILES_Y - 1);
    const pulse = 0.32 + Math.sin(world.time * 2.4) * 0.06;

    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const dCheb = Math.max(Math.abs(tx - cxTile), Math.abs(ty - cyTile));
        if (dCheb <= world.poisonRadius) continue;
        ctx.fillStyle = `rgba(122, 28, 92, ${pulse})`;
        ctx.fillRect(tx * ts, ty * ts, ts, ts);
        if (Math.abs(dCheb - world.poisonRadius) < 1.1) {
          ctx.fillStyle = COLOR.poisonEdge;
          ctx.fillRect(tx * ts, ty * ts, ts, ts);
        }
      }
    }
  }

  /* ============================ CAIXAS / ITENS ============================ */

  private drawCrates(world: World, left: number, right: number, top: number, bottom: number): void {
    const ctx = this.ctx;
    for (const c of world.crates) {
      if (c.hp <= 0) continue;
      if (c.pos.x < left || c.pos.x > right || c.pos.y < top || c.pos.y > bottom) continue;
      const r = c.radius;
      // Sombra
      ctx.fillStyle = COLOR.shadow;
      ctx.beginPath();
      ctx.ellipse(c.pos.x, c.pos.y + r * 0.72, r * 1.05, r * 0.5, 0, 0, TAU);
      ctx.fill();
      // Corpo
      const flash = c.hitFlash > 0;
      ctx.fillStyle = flash ? '#ffffff' : COLOR.crate;
      this.roundRect(c.pos.x - r, c.pos.y - r, r * 2, r * 2, 7);
      ctx.fill();
      ctx.fillStyle = flash ? '#ffd7d7' : COLOR.crateDark;
      this.roundRect(c.pos.x - r * 0.72, c.pos.y - r * 0.72, r * 1.44, r * 1.44, 5);
      ctx.fill();
      ctx.strokeStyle = COLOR.outline;
      ctx.lineWidth = 3.5;
      this.roundRect(c.pos.x - r, c.pos.y - r, r * 2, r * 2, 7);
      ctx.stroke();
      // X
      ctx.strokeStyle = COLOR.outline;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(c.pos.x - r * 0.45, c.pos.y - r * 0.45);
      ctx.lineTo(c.pos.x + r * 0.45, c.pos.y + r * 0.45);
      ctx.moveTo(c.pos.x + r * 0.45, c.pos.y - r * 0.45);
      ctx.lineTo(c.pos.x - r * 0.45, c.pos.y + r * 0.45);
      ctx.stroke();
      // Vida da caixa
      const w = r * 1.9;
      const hpRatio = clamp(c.hp / c.maxHp, 0, 1);
      ctx.fillStyle = COLOR.hpBg;
      this.roundRect(c.pos.x - w / 2, c.pos.y - r - 12, w, 7, 3);
      ctx.fill();
      ctx.fillStyle = COLOR.hpHeal;
      this.roundRect(c.pos.x - w / 2 + 1, c.pos.y - r - 11, (w - 2) * hpRatio, 5, 2);
      ctx.fill();
    }
  }

  private drawPickups(world: World, left: number, right: number, top: number, bottom: number): void {
    const ctx = this.ctx;
    for (const p of world.pickups) {
      if (p.pos.x < left || p.pos.x > right || p.pos.y < top || p.pos.y > bottom) continue;
      const bob = Math.sin(world.time * 3 + p.bob) * 3;
      ctx.fillStyle = COLOR.shadow;
      ctx.beginPath();
      ctx.ellipse(p.pos.x, p.pos.y + 11, 11, 5, 0, 0, TAU);
      ctx.fill();

      if (p.kind === 'GEM') {
        const y = p.pos.y + bob;
        ctx.save();
        ctx.translate(p.pos.x, y);
        ctx.rotate(Math.sin(world.time * 1.6 + p.bob) * 0.25);
        ctx.beginPath();
        ctx.moveTo(0, -12);
        ctx.lineTo(9, 0);
        ctx.lineTo(0, 12);
        ctx.lineTo(-9, 0);
        ctx.closePath();
        ctx.fillStyle = COLOR.gem;
        ctx.fill();
        ctx.strokeStyle = COLOR.outline;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -12);
        ctx.lineTo(4, -3);
        ctx.lineTo(-3, 1);
        ctx.closePath();
        ctx.fillStyle = COLOR.gemLight;
        ctx.fill();
        ctx.restore();
      } else {
        const y = p.pos.y + bob;
        const s = 11;
        ctx.fillStyle = COLOR.cube;
        this.roundRect(p.pos.x - s, y - s, s * 2, s * 2, 4);
        ctx.fill();
        ctx.strokeStyle = COLOR.outline;
        ctx.lineWidth = 3;
        this.roundRect(p.pos.x - s, y - s, s * 2, s * 2, 4);
        ctx.stroke();
        ctx.fillStyle = COLOR.cubeLight;
        this.roundRect(p.pos.x - s * 0.55, y - s * 0.55, s * 1.1, s * 1.1, 3);
        ctx.fill();
      }
    }
  }

  /* ============================ ENTIDADES ============================ */

  private drawEntity(e: Entity, world: World, player: Entity | null): void {
    const ctx = this.ctx;
    const r = e.radius;
    const jumpZ = e.jump.active ? Math.sin(Math.PI * clamp(e.jump.t / e.jump.duration, 0, 1)) * 46 : 0;
    const px = e.pos.x;
    const py = e.pos.y - jumpZ;

    // Sombra projetada
    ctx.fillStyle = COLOR.shadow;
    ctx.beginPath();
    ctx.ellipse(px, e.pos.y + r * 0.78, r * (1 + jumpZ * 0.004), r * 0.52, 0, 0, TAU);
    ctx.fill();

    // Corpo
    const flash = e.hitFlash > 0;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, TAU);
    ctx.fillStyle = flash ? '#ffffff' : e.def.bodyColor;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = flash ? '#ffdddd' : COLOR.outline;
    ctx.stroke();

    // Barriga / detalhe
    ctx.beginPath();
    ctx.arc(px, py + r * 0.18, r * 0.52, 0, TAU);
    ctx.fillStyle = flash ? '#fff0f0' : e.def.darkColor;
    ctx.fill();

    // Arma apontando para a direção do olhar
    const gx = px + Math.cos(e.facing) * r * 1.05;
    const gy = py + Math.sin(e.facing) * r * 1.05;
    ctx.save();
    ctx.translate(gx, gy);
    ctx.rotate(e.facing);
    this.roundRect(0, -r * 0.28, r * 1.15, r * 0.56, 5);
    ctx.fillStyle = flash ? '#ffffff' : e.def.accentColor;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLOR.outline;
    this.roundRect(0, -r * 0.28, r * 1.15, r * 0.56, 5);
    ctx.stroke();
    ctx.restore();

    // Olhos
    const eyeOX = Math.cos(e.facing) * r * 0.28;
    const eyeOY = Math.sin(e.facing) * r * 0.28;
    for (const side of [-1, 1]) {
      const ex = px + eyeOX + Math.cos(e.facing + Math.PI / 2) * side * r * 0.34;
      const ey = py + eyeOY + Math.sin(e.facing + Math.PI / 2) * side * r * 0.34 - r * 0.22;
      ctx.beginPath();
      ctx.arc(ex, ey, r * 0.22, 0, TAU);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = COLOR.outline;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ex + Math.cos(e.facing) * r * 0.08, ey + Math.sin(e.facing) * r * 0.08, r * 0.1, 0, TAU);
      ctx.fillStyle = COLOR.outline;
      ctx.fill();
    }

    // Aura do Super pronto
    if (e.superCharge >= 1) {
      ctx.beginPath();
      ctx.arc(px, py, r + 6 + Math.sin(world.time * 5) * 2, 0, TAU);
      ctx.strokeStyle = COLOR.superColor;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.65;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    this.drawHealthBar(e, px, py - r - 16);
    if (player && e.id === player.id) this.drawAmmoAndGems(e, px, py);
    else if (e.gems > 0) this.drawGemCounter(e, px, py - r - 32);
  }

  private teamColor(e: Entity): string {
    if (e.team === 'BLUE') return COLOR.hpBlue;
    if (e.team === 'RED') return COLOR.hpRed;
    return COLOR.hpNeutral;
  }

  private drawHealthBar(e: Entity, cx: number, cy: number): void {
    const ctx = this.ctx;
    const w = 52;
    const h = 9;
    const ratio = clamp(e.hp / e.maxHp, 0, 1);
    ctx.fillStyle = COLOR.hpBg;
    this.roundRect(cx - w / 2 - 2, cy - 2, w + 4, h + 4, 5);
    ctx.fill();

    // Segmentos
    const segments = clamp(Math.round(e.maxHp / 1000), 4, 12);
    const segW = w / segments;
    for (let i = 0; i < segments; i++) {
      const segRatio = clamp(ratio * segments - i, 0, 1);
      if (segRatio <= 0) continue;
      ctx.fillStyle = this.teamColor(e);
      this.roundRect(cx - w / 2 + i * segW + 1, cy, (segW - 2) * segRatio, h, 2.5);
      ctx.fill();
    }
    ctx.strokeStyle = COLOR.outline;
    ctx.lineWidth = 2;
    this.roundRect(cx - w / 2 - 2, cy - 2, w + 4, h + 4, 5);
    ctx.stroke();

    // Nome
    ctx.font = 'bold 11px Trebuchet MS, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLOR.outline;
    ctx.strokeText(e.name, cx, cy - 5);
    ctx.fillStyle = '#fff7ea';
    ctx.fillText(e.name, cx, cy - 5);
  }

  private drawAmmoAndGems(e: Entity, px: number, py: number): void {
    const ctx = this.ctx;
    const y = py + e.radius + 12;
    for (let i = 0; i < 3; i++) {
      const x = px - 21 + i * 15;
      ctx.fillStyle = COLOR.hpBg;
      this.roundRect(x, y, 12, 7, 3);
      ctx.fill();
      const fill = clamp(e.ammo - i, 0, 1);
      if (fill > 0) {
        ctx.fillStyle = COLOR.ammo;
        this.roundRect(x + 1, y + 1, 10 * fill, 5, 2);
        ctx.fill();
      }
      ctx.strokeStyle = COLOR.outline;
      ctx.lineWidth = 1.6;
      this.roundRect(x, y, 12, 7, 3);
      ctx.stroke();
    }
    if (e.gems > 0) this.drawGemCounter(e, px, py - e.radius - 32);
  }

  private drawGemCounter(e: Entity, px: number, py: number): void {
    const ctx = this.ctx;
    ctx.font = 'bold 13px Trebuchet MS, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = `💎 ${e.gems}`;
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = COLOR.outline;
    ctx.strokeText(label, px, py);
    ctx.fillStyle = COLOR.gemLight;
    ctx.fillText(label, px, py);
  }

  /* ============================ PROJÉTEIS ============================ */

  private drawProjectile(p: Projectile): void {
    const ctx = this.ctx;
    let px = p.pos.x;
    let py = p.pos.y;
    let z = 0;
    if (p.kind === 'LOBBED') {
      const t = clamp(p.flightT / Math.max(0.001, p.flightTime), 0, 1);
      z = p.arcHeight * 4 * t * (1 - t);
      py -= z;
    }

    // Sombra
    ctx.fillStyle = COLOR.shadow;
    ctx.beginPath();
    ctx.ellipse(px, p.pos.y + 4 + z * 0.25, p.radius * 0.9, p.radius * 0.42, 0, 0, TAU);
    ctx.fill();

    // Rastro
    const trailLen = p.kind === 'LOBBED' ? 0 : 0.035;
    if (trailLen > 0) {
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = p.radius * 1.1;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(px - p.vel.x * trailLen, py - p.vel.y * trailLen);
      ctx.lineTo(px, py);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Corpo
    ctx.beginPath();
    ctx.arc(px, py, p.radius, 0, TAU);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.lineWidth = 2.8;
    ctx.strokeStyle = COLOR.outline;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px - p.radius * 0.25, py - p.radius * 0.3, p.radius * 0.32, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fill();

    if (p.isSuper) {
      ctx.beginPath();
      ctx.arc(px, py, p.radius + 4, 0, TAU);
      ctx.strokeStyle = COLOR.superColor;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  /* ============================ PARTÍCULAS / FLOATERS ============================ */

  private drawParticle(pt: Particle): void {
    const ctx = this.ctx;
    const alpha = clamp(pt.life / pt.maxLife, 0, 1);
    ctx.globalAlpha = alpha;
    if (pt.kind === 'RING') {
      ctx.beginPath();
      ctx.arc(pt.pos.x, pt.pos.y, pt.size * (2 - alpha) * 1.6, 0, TAU);
      ctx.strokeStyle = pt.color;
      ctx.lineWidth = 4 * alpha + 1;
      ctx.stroke();
    } else if (pt.kind === 'SPARK') {
      ctx.strokeStyle = pt.color;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pt.pos.x, pt.pos.y);
      ctx.lineTo(pt.pos.x - pt.vel.x * 0.03, pt.pos.y - pt.vel.y * 0.03);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(pt.pos.x, pt.pos.y, pt.size * (pt.kind === 'SMOKE' ? 2 - alpha : 1), 0, TAU);
      ctx.fillStyle = pt.color;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawFloater(f: { pos: { x: number; y: number }; text: string; color: string; life: number; maxLife: number; size: number }): void {
    const ctx = this.ctx;
    const alpha = clamp(f.life / f.maxLife, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.font = `bold ${f.size}px Trebuchet MS, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = COLOR.outline;
    ctx.strokeText(f.text, f.pos.x, f.pos.y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.pos.x, f.pos.y);
    ctx.globalAlpha = 1;
  }

  /* ============================ RETÍCULO DE MIRA ============================ */

  private drawAimReticle(player: Entity, input: InputManager, world: World): void {
    const ctx = this.ctx;
    const aim = input.aimVec;
    const angle = Math.atan2(aim.y, aim.x);
    const def = player.def.attack;
    const px = player.pos.x;
    const py = player.pos.y;

    ctx.save();
    if (def.type === 'CONE') {
      const half = (def.spreadDeg * Math.PI) / 360;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.arc(px, py, def.range, angle - half, angle + half);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 210, 63, 0.16)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 210, 63, 0.55)';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (def.type === 'LINEAR') {
      const ex = px + Math.cos(angle) * def.range;
      const ey = py + Math.sin(angle) * def.range;
      ctx.setLineDash([12, 10]);
      ctx.strokeStyle = 'rgba(125, 249, 255, 0.7)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(ex, ey, 9, 0, TAU);
      ctx.strokeStyle = 'rgba(125, 249, 255, 0.85)';
      ctx.stroke();
    } else {
      // LOBBED: arco + círculo de impacto no alvo
      const tx = px + Math.cos(angle) * def.range;
      const ty = py + Math.sin(angle) * def.range;
      ctx.setLineDash([8, 8]);
      ctx.strokeStyle = 'rgba(255, 179, 71, 0.6)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      const steps = 16;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = lerp(px, tx, t);
        const y = lerp(py, ty, t) - def.arcHeight * 4 * t * (1 - t);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(tx, ty, def.explodeRadius, 0, TAU);
      ctx.fillStyle = 'rgba(255, 140, 66, 0.2)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 179, 71, 0.85)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Indicador de alcance no chão
    const inRange =
      world.map.isSolidAt(px + Math.cos(angle) * def.range, py + Math.sin(angle) * def.range) &&
      def.type !== 'LOBBED';
    if (inRange) {
      ctx.beginPath();
      ctx.arc(px, py, 8, 0, TAU);
      ctx.strokeStyle = 'rgba(255, 80, 80, 0.8)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ============================ JOYSTICKS (tela) ============================ */

  private drawSticks(input: InputManager): void {
    const ctx = this.ctx;
    // Joystick esquerdo fixo
    const ms = input.moveStick;
    const baseX = ms.active ? ms.ox : window.innerWidth * 0.17;
    const baseY = ms.active ? ms.oy : window.innerHeight * 0.72;
    const radius = clamp(Math.min(window.innerWidth, window.innerHeight) * 0.12, 48, 86);
    ctx.globalAlpha = ms.active ? 0.55 : 0.22;
    ctx.beginPath();
    ctx.arc(baseX, baseY, radius, 0, TAU);
    ctx.fillStyle = '#000000';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ms.active ? ms.kx : baseX, ms.active ? ms.ky : baseY, radius * 0.45, 0, TAU);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.globalAlpha = 1;

    // Joystick direito flutuante (mirar)
    const as = input.aimStick;
    if (as.active) {
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(as.ox, as.oy, radius * 0.9, 0, TAU);
      ctx.fillStyle = '#000000';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffd23f';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(as.kx, as.ky, radius * 0.4, 0, TAU);
      ctx.fillStyle = '#ffd23f';
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  /* ============================ HELPERS ============================ */

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx;
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }
}
