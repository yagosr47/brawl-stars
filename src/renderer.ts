/* ============================================================
   ARENA BRAWLER — Renderização Canvas 2D (visual aprimorado)
   - Câmera com interpolação (lerp) + screen shake por trauma
   - Piso pré-renderizado: texturas, grama, flores, AO, orlas
   - Paredes com volume, água animada, arbustos em camadas
   - Projéteis com brilho aditivo, explosões ricas, vignette
   - Sombras projetadas, retículos dinâmicos, números flutuantes
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

/** Hash determinístico para decorações do terreno. */
function hash2(x: number, y: number): number {
  let h = (x * 92837111) ^ (y * 689287499);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private floorCanvas: HTMLCanvasElement | null = null;
  private floorFor: World['map'] | null = null;

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

    this.drawFloorLayer(world, left, right, top, bottom);
    this.drawWallsAndWater(world, left, right, top, bottom);
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
      if (!p.dead) this.drawProjectile(p, world);
    }
    for (const pt of world.particles) this.drawParticle(pt);
    for (const f of world.floaters) this.drawFloater(f);

    this.drawBushOverlay(world, player, left, right, top, bottom);
    this.drawPoison(world, left, right, top, bottom);

    if (player && showAim && player.alive && !player.eliminated && !player.jump.active) {
      this.drawAimReticle(player, input, world);
    }

    ctx.restore();

    this.drawVignette();

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

  /* ============================ PISO PRÉ-RENDERIZADO ============================ */

  private buildFloorLayer(world: World): void {
    const map = world.map;
    const ts = TILE_SIZE;
    const w = map.width * ts;
    const h = map.height * ts;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const g = cv.getContext('2d');
    if (!g) return;

    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        const x = tx * ts;
        const y = ty * ts;
        const tile = map.getTile(tx, ty);
        const hv = hash2(tx, ty);

        if (tile === 'WALL' || tile === 'BREAKABLE') {
          // Base escura sob paredes (sombra projetada no chão).
          g.fillStyle = 'rgba(18, 30, 18, 0.55)';
          g.fillRect(x, y, ts, ts);
          continue;
        }

        // Gramado com duas tonalidades + variação por tile
        const base = (tx + ty) % 2 === 0 ? COLOR.floorA : COLOR.floorB;
        g.fillStyle = base;
        g.fillRect(x, y, ts + 1, ts + 1);
        const shade = hv * 0.12 - 0.04;
        g.fillStyle = shade > 0 ? `rgba(255,255,255,${shade})` : `rgba(0,40,10,${-shade})`;
        g.fillRect(x, y, ts + 1, ts + 1);

        // Tuços de grama
        if (hv > 0.42) {
          const gx = x + 6 + hash2(tx * 3, ty * 7) * (ts - 12);
          const gy = y + 8 + hash2(tx * 5, ty * 11) * (ts - 14);
          g.strokeStyle = 'rgba(24, 100, 40, 0.5)';
          g.lineWidth = 1.8;
          g.beginPath();
          g.moveTo(gx, gy);
          g.lineTo(gx - 2.5, gy - 6);
          g.moveTo(gx, gy);
          g.lineTo(gx + 1.5, gy - 6.5);
          g.moveTo(gx, gy);
          g.lineTo(gx + 4, gy - 4.5);
          g.stroke();
        }

        // Flores ocasionais
        const flower = hash2(tx * 13, ty * 17);
        if (flower > 0.86) {
          const fx = x + 10 + hash2(tx * 7, ty * 3) * (ts - 20);
          const fy = y + 10 + hash2(tx * 11, ty * 5) * (ts - 20);
          const colors = ['#ffd6e8', '#fff3b8', '#cfe8ff'];
          g.fillStyle = colors[Math.floor(flower * 100) % 3];
          for (let p = 0; p < 4; p++) {
            const a = (p / 4) * TAU + flower * TAU;
            g.beginPath();
            g.arc(fx + Math.cos(a) * 2.6, fy + Math.sin(a) * 2.6, 2, 0, TAU);
            g.fill();
          }
          g.fillStyle = '#ffcf4d';
          g.beginPath();
          g.arc(fx, fy, 1.8, 0, TAU);
          g.fill();
        }

        // Orla de areia perto da água
        const nearWater =
          map.isWaterAt((tx - 1) * ts + ts / 2, y + ts / 2) ||
          map.isWaterAt((tx + 1) * ts + ts / 2, y + ts / 2) ||
          map.isWaterAt(x + ts / 2, (ty - 1) * ts + ts / 2) ||
          map.isWaterAt(x + ts / 2, (ty + 1) * ts + ts / 2);
        if (nearWater && tile !== 'WATER') {
          g.fillStyle = 'rgba(232, 210, 150, 0.55)';
          g.fillRect(x, y, ts + 1, ts + 1);
        }
        if (tile === 'WATER') {
          g.fillStyle = '#2574c2';
          g.fillRect(x, y, ts + 1, ts + 1);
        }

        // Oclusão de contato perto de paredes
        const solid = (px: number, py: number): boolean =>
          map.getTile(Math.floor(px / ts), Math.floor(py / ts)) === 'WALL' ||
          map.getTile(Math.floor(px / ts), Math.floor(py / ts)) === 'BREAKABLE';
        g.fillStyle = 'rgba(10, 30, 12, 0.34)';
        if (solid(x - ts, y)) g.fillRect(x, y, 7, ts + 1);
        if (solid(x + ts, y)) g.fillRect(x + ts - 7, y, 7, ts + 1);
        if (solid(x, y - ts)) g.fillRect(x, y, ts + 1, 7);
        if (solid(x, y + ts)) g.fillRect(x, y + ts - 7, ts + 1, 7);
      }
    }

    this.floorCanvas = cv;
    this.floorFor = map;
  }

  private drawFloorLayer(world: World, left: number, right: number, top: number, bottom: number): void {
    const ctx = this.ctx;
    if (this.floorFor !== world.map || !this.floorCanvas) {
      this.buildFloorLayer(world);
    }
    if (this.floorCanvas) {
      ctx.drawImage(
        this.floorCanvas,
        left,
        top,
        right - left,
        bottom - top,
        left,
        top,
        right - left,
        bottom - top,
      );
      return;
    }
    // Fallback simples
    ctx.fillStyle = COLOR.floorA;
    ctx.fillRect(left, top, right - left, bottom - top);
  }

  /* ============================ PAREDES / ÁGUA ============================ */

  private drawWallsAndWater(world: World, left: number, right: number, top: number, bottom: number): void {
    const ctx = this.ctx;
    const map = world.map;
    const ts = TILE_SIZE;
    const tx0 = clamp(Math.floor(left / ts), 0, MAP_TILES_X - 1);
    const tx1 = clamp(Math.ceil(right / ts), 0, MAP_TILES_X - 1);
    const ty0 = clamp(Math.floor(top / ts), 0, MAP_TILES_Y - 1);
    const ty1 = clamp(Math.ceil(bottom / ts), 0, MAP_TILES_Y - 1);

    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const tile = map.getTile(tx, ty);
        if (tile !== 'WALL' && tile !== 'BREAKABLE' && tile !== 'WATER') continue;
        const x = tx * ts;
        const y = ty * ts;

        if (tile === 'WATER') {
          // Base + ondas animadas + brilhos
          ctx.fillStyle = '#2e86de';
          ctx.fillRect(x, y, ts + 1, ts + 1);
          const wob = Math.sin(world.time * 2.2 + tx * 0.9 + ty * 1.3) * 3;
          const wob2 = Math.sin(world.time * 1.6 + tx * 1.4 - ty * 0.8) * 2.2;
          ctx.strokeStyle = 'rgba(120, 195, 255, 0.85)';
          ctx.lineWidth = 2.4;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x + 5, y + ts * 0.38 + wob);
          ctx.quadraticCurveTo(x + ts * 0.5, y + ts * 0.24 + wob, x + ts - 5, y + ts * 0.38 + wob);
          ctx.stroke();
          ctx.strokeStyle = 'rgba(200, 235, 255, 0.6)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x + 8, y + ts * 0.72 + wob2);
          ctx.quadraticCurveTo(x + ts * 0.55, y + ts * 0.6 + wob2, x + ts - 8, y + ts * 0.72 + wob2);
          ctx.stroke();
          // Espuma nas bordas com chão
          const floorAt = (px: number, py: number): boolean => {
            const t = map.getTile(Math.floor(px / ts), Math.floor(py / ts));
            return t !== 'WATER' && t !== 'WALL' && t !== 'BREAKABLE';
          };
          ctx.fillStyle = 'rgba(235, 250, 255, 0.5)';
          if (floorAt(x - ts, y)) ctx.fillRect(x, y + 4, 4, ts - 8);
          if (floorAt(x + ts, y)) ctx.fillRect(x + ts - 4, y + 4, 4, ts - 8);
          if (floorAt(x, y - ts)) ctx.fillRect(x + 4, y, ts - 8, 4);
          if (floorAt(x, y + ts)) ctx.fillRect(x + 4, y + ts - 4, ts - 8, 4);
          continue;
        }

        if (tile === 'WALL') {
          // Sombra no chão
          ctx.fillStyle = 'rgba(12, 8, 20, 0.4)';
          ctx.fillRect(x + 3, y + 5, ts, ts);
          // Face lateral (volume)
          ctx.fillStyle = COLOR.wallEdge;
          this.roundRect(x + 1, y + 1, ts - 2, ts - 2, 6);
          ctx.fill();
          // Topo iluminado
          ctx.fillStyle = COLOR.wall;
          this.roundRect(x + 1.5, y + 1.5, ts - 3, ts * 0.72, 5);
          ctx.fill();
          ctx.fillStyle = COLOR.wallTop;
          this.roundRect(x + 3, y + 3, ts - 6, ts * 0.32, 4);
          ctx.fill();
          // Tijolos
          ctx.strokeStyle = 'rgba(60, 34, 12, 0.55)';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(x + 3, y + ts * 0.52);
          ctx.lineTo(x + ts - 3, y + ts * 0.52);
          ctx.moveTo(x + ts * 0.5, y + 3);
          ctx.lineTo(x + ts * 0.5, y + ts * 0.5);
          ctx.stroke();
          // Contorno
          ctx.strokeStyle = COLOR.outline;
          ctx.lineWidth = 3;
          ctx.lineJoin = 'round';
          this.roundRect(x + 1, y + 1, ts - 2, ts - 2, 6);
          ctx.stroke();
          continue;
        }

        // BREAKABLE — parede de madeira
        ctx.fillStyle = 'rgba(12, 8, 20, 0.35)';
        ctx.fillRect(x + 3, y + 4, ts, ts);
        ctx.fillStyle = COLOR.breakable;
        this.roundRect(x + 1, y + 1, ts - 2, ts - 2, 5);
        ctx.fill();
        ctx.fillStyle = COLOR.breakableTop;
        this.roundRect(x + 2.5, y + 2.5, ts - 5, ts * 0.4, 4);
        ctx.fill();
        // Tábuas
        ctx.strokeStyle = 'rgba(110, 62, 22, 0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + 2, y + ts * 0.55);
        ctx.lineTo(x + ts - 2, y + ts * 0.55);
        ctx.moveTo(x + 2, y + ts * 0.8);
        ctx.lineTo(x + ts - 2, y + ts * 0.8);
        ctx.stroke();
        // Parafusos
        ctx.fillStyle = 'rgba(90, 50, 16, 0.9)';
        for (const [ox, oy] of [
          [6, 6],
          [ts - 6, 6],
          [6, ts - 6],
          [ts - 6, ts - 6],
        ]) {
          ctx.beginPath();
          ctx.arc(x + ox, y + oy, 2, 0, TAU);
          ctx.fill();
        }
        // Rachaduras
        const seed = (tx * 7 + ty * 13) % 3;
        ctx.strokeStyle = COLOR.crack;
        ctx.lineWidth = 2.4;
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
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        this.roundRect(x + 1, y + 1, ts - 2, ts - 2, 5);
        ctx.stroke();
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
        const hv = hash2(tx * 31, ty * 37);

        let alpha = 1;
        if (player && playerInBush) {
          const d = Math.hypot(cx - player.pos.x, cy - player.pos.y);
          if (d < TILE_SIZE * 3) alpha = lerp(0.36, 1, d / (TILE_SIZE * 3));
        }

        ctx.globalAlpha = alpha;
        const wob = Math.sin(world.time * 1.4 + tx * 0.8 + ty * 1.1) * 1.8;
        const wob2 = Math.cos(world.time * 1.1 + tx * 0.5 + ty * 0.9) * 1.5;

        // Base escura (volume)
        ctx.fillStyle = COLOR.bushDark;
        this.leafBlob(cx - 8, cy - 4 + wob, 13.5);
        this.leafBlob(cx + 9, cy - 5 - wob, 12.5);
        this.leafBlob(cx, cy + 7 + wob2, 14);
        this.leafBlob(cx - 6, cy + 6 - wob2, 11);

        // Camada média
        ctx.fillStyle = COLOR.bush;
        this.leafBlob(cx - 5, cy - 3 + wob, 10.5);
        this.leafBlob(cx + 7, cy - 2 - wob, 9.5);
        this.leafBlob(cx + 1, cy + 7 + wob2, 10);

        // Brilho superior
        ctx.fillStyle = COLOR.bushLight;
        this.leafBlob(cx - 3, cy - 5 + wob, 5.5);
        this.leafBlob(cx + 6, cy + 1 - wob, 4.5);
        this.leafBlob(cx - 1, cy + 4 + wob2, 3.5);

        // Flores no arbusto
        if (hv > 0.55) {
          const fx = cx + (hv - 0.5) * 22 - 11;
          const fy = cy - 6 + (hash2(tx * 3, ty * 5) - 0.5) * 16;
          ctx.fillStyle = hv > 0.8 ? '#ffd6e8' : '#fff3b8';
          for (let p = 0; p < 4; p++) {
            const a = (p / 4) * TAU + hv * TAU;
            ctx.beginPath();
            ctx.arc(fx + Math.cos(a) * 2.4, fy + Math.sin(a) * 2.4, 1.9, 0, TAU);
            ctx.fill();
          }
          ctx.fillStyle = '#ffcf4d';
          ctx.beginPath();
          ctx.arc(fx, fy, 1.6, 0, TAU);
          ctx.fill();
        }
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
    const pulse = 0.3 + Math.sin(world.time * 2.4) * 0.07;

    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const dCheb = Math.max(Math.abs(tx - cxTile), Math.abs(ty - cyTile));
        if (dCheb <= world.poisonRadius) continue;
        ctx.fillStyle = `rgba(122, 28, 92, ${pulse})`;
        ctx.fillRect(tx * ts, ty * ts, ts + 1, ts + 1);
        // Névoa animada
        const n = Math.sin(world.time * 1.8 + tx * 0.7 + ty * 1.1) * 0.08;
        ctx.fillStyle = `rgba(160, 50, 130, ${0.12 + n})`;
        ctx.fillRect(tx * ts, ty * ts, ts + 1, ts + 1);
        if (Math.abs(dCheb - world.poisonRadius) < 1.1) {
          // Borda tóxica brilhante
          const glow = 0.45 + Math.sin(world.time * 3.2 + (tx + ty) * 0.6) * 0.2;
          ctx.fillStyle = `rgba(214, 88, 168, ${glow})`;
          ctx.fillRect(tx * ts, ty * ts, ts + 1, ts + 1);
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
      ctx.ellipse(c.pos.x, c.pos.y + r * 0.78, r * 1.1, r * 0.52, 0, 0, TAU);
      ctx.fill();
      // Corpo
      const flash = c.hitFlash > 0;
      ctx.fillStyle = flash ? '#ffffff' : COLOR.crateDark;
      this.roundRect(c.pos.x - r, c.pos.y - r, r * 2, r * 2, 7);
      ctx.fill();
      ctx.fillStyle = flash ? '#ffd7d7' : COLOR.crate;
      this.roundRect(c.pos.x - r + 3, c.pos.y - r + 3, r * 2 - 6, r * 2 - 9, 5);
      ctx.fill();
      // Tábuas cruzadas
      ctx.strokeStyle = flash ? '#ffb0b0' : COLOR.crateDark;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(c.pos.x - r * 0.7, c.pos.y - r * 0.7);
      ctx.lineTo(c.pos.x + r * 0.7, c.pos.y + r * 0.7);
      ctx.moveTo(c.pos.x + r * 0.7, c.pos.y - r * 0.7);
      ctx.lineTo(c.pos.x - r * 0.7, c.pos.y + r * 0.7);
      ctx.stroke();
      // Contorno
      ctx.strokeStyle = COLOR.outline;
      ctx.lineWidth = 3.5;
      ctx.lineJoin = 'round';
      this.roundRect(c.pos.x - r, c.pos.y - r, r * 2, r * 2, 7);
      ctx.stroke();
      // Vida da caixa
      const w = r * 1.9;
      const hpRatio = clamp(c.hp / c.maxHp, 0, 1);
      ctx.fillStyle = COLOR.hpBg;
      this.roundRect(c.pos.x - w / 2, c.pos.y - r - 13, w, 8, 3);
      ctx.fill();
      const grad = ctx.createLinearGradient(c.pos.x - w / 2, 0, c.pos.x + w / 2, 0);
      grad.addColorStop(0, '#43d97a');
      grad.addColorStop(1, '#a6f06e');
      ctx.fillStyle = grad;
      this.roundRect(c.pos.x - w / 2 + 1, c.pos.y - r - 12, (w - 2) * hpRatio, 6, 2.5);
      ctx.fill();
      ctx.strokeStyle = COLOR.outline;
      ctx.lineWidth = 2;
      this.roundRect(c.pos.x - w / 2, c.pos.y - r - 13, w, 8, 3);
      ctx.stroke();
    }
  }

  private drawPickups(world: World, left: number, right: number, top: number, bottom: number): void {
    const ctx = this.ctx;
    for (const p of world.pickups) {
      if (p.pos.x < left || p.pos.x > right || p.pos.y < top || p.pos.y > bottom) continue;
      const bob = Math.sin(world.time * 3 + p.bob) * 3.5;
      // Halo luminoso no chão
      const halo = ctx.createRadialGradient(p.pos.x, p.pos.y, 2, p.pos.x, p.pos.y, 26);
      halo.addColorStop(0, p.kind === 'GEM' ? 'rgba(180, 77, 255, 0.4)' : 'rgba(255, 127, 42, 0.4)');
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(p.pos.x - 26, p.pos.y - 26, 52, 52);
      // Sombra
      ctx.fillStyle = COLOR.shadow;
      ctx.beginPath();
      ctx.ellipse(p.pos.x, p.pos.y + 12, 11, 5, 0, 0, TAU);
      ctx.fill();

      if (p.kind === 'GEM') {
        const y = p.pos.y + bob;
        ctx.save();
        ctx.translate(p.pos.x, y);
        ctx.rotate(Math.sin(world.time * 1.6 + p.bob) * 0.3);
        ctx.beginPath();
        ctx.moveTo(0, -13);
        ctx.lineTo(10, 0);
        ctx.lineTo(0, 13);
        ctx.lineTo(-10, 0);
        ctx.closePath();
        const gemGrad = ctx.createLinearGradient(0, -13, 0, 13);
        gemGrad.addColorStop(0, '#d98cff');
        gemGrad.addColorStop(0.5, COLOR.gem);
        gemGrad.addColorStop(1, '#7c1fd4');
        ctx.fillStyle = gemGrad;
        ctx.fill();
        ctx.strokeStyle = COLOR.outline;
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.stroke();
        // Facetas
        ctx.beginPath();
        ctx.moveTo(0, -13);
        ctx.lineTo(5, -3);
        ctx.lineTo(-3, 2);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, -13);
        ctx.lineTo(-10, 0);
        ctx.lineTo(-3, 2);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.fill();
        ctx.restore();
      } else {
        const y = p.pos.y + bob;
        const s = 11;
        ctx.fillStyle = '#8c4a12';
        this.roundRect(p.pos.x - s, y - s, s * 2, s * 2, 5);
        ctx.fill();
        const cubeGrad = ctx.createLinearGradient(p.pos.x - s, y - s, p.pos.x + s, y + s);
        cubeGrad.addColorStop(0, COLOR.cubeLight);
        cubeGrad.addColorStop(1, COLOR.cube);
        ctx.fillStyle = cubeGrad;
        this.roundRect(p.pos.x - s + 2, y - s + 2, s * 2 - 4, s * 2 - 4, 4);
        ctx.fill();
        // Brilho superior
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        this.roundRect(p.pos.x - s * 0.55, y - s * 0.62, s * 1.1, s * 0.42, 3);
        ctx.fill();
        ctx.strokeStyle = COLOR.outline;
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        this.roundRect(p.pos.x - s, y - s, s * 2, s * 2, 5);
        ctx.stroke();
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
    const speed = Math.hypot(e.vel.x, e.vel.y);
    const bob = speed > 20 && !e.jump.active ? Math.sin(world.time * 11 + e.id) * 1.6 : 0;
    const flash = e.hitFlash > 0;

    // Sombra projetada (suave, escala com o salto)
    const shadowScale = 1 + jumpZ * 0.005;
    const shadowGrad = ctx.createRadialGradient(
      e.pos.x,
      e.pos.y + r * 0.8,
      r * 0.2,
      e.pos.x,
      e.pos.y + r * 0.8,
      r * 1.35 * shadowScale,
    );
    shadowGrad.addColorStop(0, 'rgba(16, 10, 26, 0.42)');
    shadowGrad.addColorStop(1, 'rgba(16, 10, 26, 0)');
    ctx.fillStyle = shadowGrad;
    ctx.beginPath();
    ctx.ellipse(e.pos.x, e.pos.y + r * 0.8, r * 1.3 * shadowScale, r * 0.6 * shadowScale, 0, 0, TAU);
    ctx.fill();

    // Anel de time no chão
    const teamRing =
      e.team === 'BLUE' ? 'rgba(46, 196, 255, 0.55)' : e.team === 'RED' ? 'rgba(255, 77, 94, 0.55)' : 'rgba(255, 179, 71, 0.55)';
    ctx.beginPath();
    ctx.arc(e.pos.x, e.pos.y + r * 0.28, r * 0.92, 0, TAU);
    ctx.strokeStyle = teamRing;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Aura do Super pronto
    if (e.superCharge >= 1) {
      const pulse = 1 + Math.sin(world.time * 5.5) * 0.12;
      const aura = ctx.createRadialGradient(px, py, r * 0.6, px, py, r * 2 * pulse);
      aura.addColorStop(0, 'rgba(255, 225, 77, 0.28)');
      aura.addColorStop(1, 'rgba(255, 225, 77, 0)');
      ctx.fillStyle = aura;
      ctx.fillRect(px - r * 2.2, py - r * 2.2, r * 4.4, r * 4.4);
      ctx.beginPath();
      ctx.arc(px, py, r + 6 + Math.sin(world.time * 5) * 2, 0, TAU);
      ctx.strokeStyle = COLOR.superColor;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.7;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Corpo com gradiente
    const bodyGrad = ctx.createRadialGradient(
      px - r * 0.35,
      py - r * 0.45,
      r * 0.25,
      px,
      py,
      r * 1.15,
    );
    if (flash) {
      bodyGrad.addColorStop(0, '#ffffff');
      bodyGrad.addColorStop(1, '#ffcccc');
    } else {
      bodyGrad.addColorStop(0, e.def.bodyColor);
      bodyGrad.addColorStop(1, e.def.darkColor);
    }
    ctx.beginPath();
    ctx.arc(px, py + bob * 0.3, r, 0, TAU);
    ctx.fillStyle = bodyGrad;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = flash ? '#ffdddd' : COLOR.outline;
    ctx.stroke();

    // Barriga
    ctx.beginPath();
    ctx.arc(px, py + r * 0.2 + bob * 0.3, r * 0.5, 0, TAU);
    ctx.fillStyle = flash ? '#fff0f0' : 'rgba(0, 0, 0, 0.18)';
    ctx.fill();

    // Arma apontando para a direção do olhar
    const gx = px + Math.cos(e.facing) * r * 1.02;
    const gy = py + Math.sin(e.facing) * r * 1.02 + bob * 0.3;
    ctx.save();
    ctx.translate(gx, gy);
    ctx.rotate(e.facing);
    const gunGrad = ctx.createLinearGradient(0, -r * 0.3, 0, r * 0.3);
    gunGrad.addColorStop(0, flash ? '#ffffff' : e.def.accentColor);
    gunGrad.addColorStop(1, flash ? '#ffe0e0' : e.def.darkColor);
    this.roundRect(0, -r * 0.28, r * 1.18, r * 0.56, 5);
    ctx.fillStyle = gunGrad;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLOR.outline;
    this.roundRect(0, -r * 0.28, r * 1.18, r * 0.56, 5);
    ctx.stroke();

    // Muzzle flash
    if (e.attackAnim > 0) {
      const k = e.attackAnim / 0.16;
      const flareR = r * (0.9 + k * 1.4);
      const flare = ctx.createRadialGradient(r * 1.25, 0, 1, r * 1.25, 0, flareR);
      flare.addColorStop(0, `rgba(255, 255, 220, ${0.9 * k})`);
      flare.addColorStop(0.45, `rgba(255, 210, 90, ${0.55 * k})`);
      flare.addColorStop(1, 'rgba(255, 170, 40, 0)');
      ctx.fillStyle = flare;
      ctx.fillRect(r * 1.25 - flareR, -flareR, flareR * 2, flareR * 2);
    }
    ctx.restore();

    // Olhos
    const eyeOX = Math.cos(e.facing) * r * 0.26;
    const eyeOY = Math.sin(e.facing) * r * 0.26;
    for (const side of [-1, 1]) {
      const ex = px + eyeOX + Math.cos(e.facing + Math.PI / 2) * side * r * 0.33;
      const ey = py + eyeOY + Math.sin(e.facing + Math.PI / 2) * side * r * 0.33 - r * 0.24 + bob * 0.3;
      ctx.beginPath();
      ctx.arc(ex, ey, r * 0.22, 0, TAU);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = COLOR.outline;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ex + Math.cos(e.facing) * r * 0.09, ey + Math.sin(e.facing) * r * 0.09, r * 0.105, 0, TAU);
      ctx.fillStyle = COLOR.outline;
      ctx.fill();
      // Brilho do olho
      ctx.beginPath();
      ctx.arc(ex - r * 0.05, ey - r * 0.08, r * 0.05, 0, TAU);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fill();
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
      const grad = ctx.createLinearGradient(0, cy, 0, cy + h);
      grad.addColorStop(0, this.teamColor(e));
      grad.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = grad;
      this.roundRect(cx - w / 2 + i * segW + 1, cy, (segW - 2) * segRatio, h, 2.5);
      ctx.fill();
    }
    // Brilho superior
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    this.roundRect(cx - w / 2 + 1, cy, w - 2, h * 0.38, 2);
    ctx.fill();
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
        const grad = ctx.createLinearGradient(x, y, x, y + 7);
        grad.addColorStop(0, '#ffe98a');
        grad.addColorStop(1, COLOR.ammo);
        ctx.fillStyle = grad;
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

  private drawProjectile(p: Projectile, world: World): void {
    const ctx = this.ctx;
    let px = p.pos.x;
    let py = p.pos.y;
    let z = 0;
    if (p.kind === 'LOBBED') {
      const t = clamp(p.flightT / Math.max(0.001, p.flightTime), 0, 1);
      z = p.arcHeight * 4 * t * (1 - t);
      py -= z;
    }

    // Sombra proporcional à altura
    const shadowR = p.radius * (1 + z * 0.006);
    ctx.fillStyle = `rgba(16, 10, 26, ${0.32 - z * 0.0018})`;
    ctx.beginPath();
    ctx.ellipse(px, p.pos.y + 4 + z * 0.22, shadowR, shadowR * 0.48, 0, 0, TAU);
    ctx.fill();

    // Rastro luminoso (aditivo)
    if (p.kind !== 'LOBBED') {
      const trailLen = 0.05;
      const tx0 = px - p.vel.x * trailLen;
      const ty0 = py - p.vel.y * trailLen;
      const trail = ctx.createLinearGradient(tx0, ty0, px, py);
      trail.addColorStop(0, 'rgba(255,255,255,0)');
      trail.addColorStop(1, p.color);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = trail;
      ctx.lineWidth = p.radius * 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tx0, ty0);
      ctx.lineTo(px, py);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    } else {
      // Faiscas do pavio
      if (Math.random() < 0.35) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255, 210, 120, 0.85)';
        ctx.beginPath();
        ctx.arc(px + randOffset(), py - z + randOffset(), 1.8, 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    // Halo
    const glow = ctx.createRadialGradient(px, py, 1, px, py, p.radius * 3);
    glow.addColorStop(0, p.color);
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = glow;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(px - p.radius * 3, py - p.radius * 3, p.radius * 6, p.radius * 6);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // Corpo
    const bodyGrad = ctx.createRadialGradient(px - p.radius * 0.3, py - p.radius * 0.35, 1, px, py, p.radius);
    bodyGrad.addColorStop(0, '#ffffff');
    bodyGrad.addColorStop(0.35, p.color);
    bodyGrad.addColorStop(1, p.color);
    ctx.beginPath();
    ctx.arc(px, py, p.radius, 0, TAU);
    ctx.fillStyle = bodyGrad;
    ctx.fill();
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = COLOR.outline;
    ctx.stroke();

    if (p.isSuper) {
      const ringPulse = p.radius + 4 + Math.sin(world.time * 9 + p.id) * 1.5;
      ctx.beginPath();
      ctx.arc(px, py, ringPulse, 0, TAU);
      ctx.strokeStyle = COLOR.superColor;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 2.8;
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
      const r = pt.size * (2 - alpha) * 1.6;
      ctx.beginPath();
      ctx.arc(pt.pos.x, pt.pos.y, r, 0, TAU);
      ctx.strokeStyle = pt.color;
      ctx.lineWidth = 5 * alpha + 1.2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(pt.pos.x, pt.pos.y, r * 0.72, 0, TAU);
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 2.2 * alpha;
      ctx.stroke();
    } else if (pt.kind === 'SPARK') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = pt.color;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pt.pos.x, pt.pos.y);
      ctx.lineTo(pt.pos.x - pt.vel.x * 0.035, pt.pos.y - pt.vel.y * 0.035);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    } else if (pt.kind === 'FLASH') {
      ctx.globalCompositeOperation = 'lighter';
      const r = pt.size * (1.6 - alpha * 0.5);
      const glow = ctx.createRadialGradient(pt.pos.x, pt.pos.y, 0, pt.pos.x, pt.pos.y, r * 2.2);
      glow.addColorStop(0, pt.color);
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(pt.pos.x - r * 2.2, pt.pos.y - r * 2.2, r * 4.4, r * 4.4);
      ctx.globalCompositeOperation = 'source-over';
    } else if (pt.kind === 'SMOKE') {
      const r = pt.size * (2 - alpha);
      const smoke = ctx.createRadialGradient(pt.pos.x, pt.pos.y, 0, pt.pos.x, pt.pos.y, r);
      smoke.addColorStop(0, pt.color);
      smoke.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = smoke;
      ctx.fillRect(pt.pos.x - r, pt.pos.y - r, r * 2, r * 2);
    } else {
      ctx.beginPath();
      ctx.arc(pt.pos.x, pt.pos.y, pt.size, 0, TAU);
      ctx.fillStyle = pt.color;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawFloater(f: { pos: { x: number; y: number }; text: string; color: string; life: number; maxLife: number; size: number }): void {
    const ctx = this.ctx;
    const alpha = clamp(f.life / f.maxLife, 0, 1);
    const grow = 1 + (1 - alpha) * 0.25;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(f.pos.x, f.pos.y);
    ctx.scale(grow, grow);
    ctx.font = `bold ${f.size}px Trebuchet MS, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = COLOR.outline;
    ctx.strokeText(f.text, 0, 0);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, 0, 0);
    ctx.restore();
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
    ctx.lineJoin = 'round';
    if (def.type === 'CONE') {
      const half = (def.spreadDeg * Math.PI) / 360;
      const grad = ctx.createRadialGradient(px, py, 10, px, py, def.range);
      grad.addColorStop(0, 'rgba(255, 210, 63, 0.28)');
      grad.addColorStop(1, 'rgba(255, 210, 63, 0.05)');
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.arc(px, py, def.range, angle - half, angle + half);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 210, 63, 0.65)';
      ctx.lineWidth = 2.2;
      ctx.stroke();
    } else if (def.type === 'LINEAR') {
      const ex = px + Math.cos(angle) * def.range;
      const ey = py + Math.sin(angle) * def.range;
      const lineGrad = ctx.createLinearGradient(px, py, ex, ey);
      lineGrad.addColorStop(0, 'rgba(125, 249, 255, 0.85)');
      lineGrad.addColorStop(1, 'rgba(125, 249, 255, 0.15)');
      ctx.setLineDash([13, 10]);
      ctx.lineDashOffset = -world.time * 28;
      ctx.strokeStyle = lineGrad;
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(ex, ey, 10, 0, TAU);
      ctx.strokeStyle = 'rgba(125, 249, 255, 0.95)';
      ctx.lineWidth = 2.6;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ex, ey, 3.4, 0, TAU);
      ctx.fillStyle = 'rgba(125, 249, 255, 0.95)';
      ctx.fill();
    } else {
      // LOBBED: arco + círculo de impacto
      const tx = px + Math.cos(angle) * def.range;
      const ty = py + Math.sin(angle) * def.range;
      ctx.setLineDash([9, 9]);
      ctx.lineDashOffset = -world.time * 22;
      ctx.strokeStyle = 'rgba(255, 179, 71, 0.75)';
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      const steps = 18;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = lerp(px, tx, t);
        const y = lerp(py, ty, t) - def.arcHeight * 4 * t * (1 - t);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      const pulse = 1 + Math.sin(world.time * 4.5) * 0.06;
      const impactGrad = ctx.createRadialGradient(tx, ty, def.explodeRadius * 0.2, tx, ty, def.explodeRadius * pulse);
      impactGrad.addColorStop(0, 'rgba(255, 140, 66, 0.32)');
      impactGrad.addColorStop(1, 'rgba(255, 140, 66, 0.06)');
      ctx.beginPath();
      ctx.arc(tx, ty, def.explodeRadius * pulse, 0, TAU);
      ctx.fillStyle = impactGrad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 179, 71, 0.95)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(tx, ty, 4, 0, TAU);
      ctx.fillStyle = 'rgba(255, 179, 71, 0.95)';
      ctx.fill();
    }

    // Indicador de parede no alcance
    const inRange =
      def.type !== 'LOBBED' &&
      world.map.isSolidAt(px + Math.cos(angle) * def.range, py + Math.sin(angle) * def.range);
    if (inRange) {
      ctx.beginPath();
      ctx.arc(px, py, 9, 0, TAU);
      ctx.strokeStyle = 'rgba(255, 80, 80, 0.85)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ============================ VIGNETTE / JOYSTICKS ============================ */

  private drawVignette(): void {
    const ctx = this.ctx;
    const vw = this.viewWidth;
    const vh = this.viewHeight;
    const g = ctx.createRadialGradient(
      vw / 2,
      vh / 2,
      Math.min(vw, vh) * 0.42,
      vw / 2,
      vh / 2,
      Math.max(vw, vh) * 0.8,
    );
    g.addColorStop(0, 'rgba(0, 0, 0, 0)');
    g.addColorStop(1, 'rgba(8, 3, 18, 0.42)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, vw, vh);
  }

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
    const knobGrad = ctx.createRadialGradient(baseX, baseY - radius * 0.2, 2, baseX, baseY, radius * 0.5);
    knobGrad.addColorStop(0, '#ffffff');
    knobGrad.addColorStop(1, '#b9a8e0');
    ctx.beginPath();
    ctx.arc(ms.active ? ms.kx : baseX, ms.active ? ms.ky : baseY, radius * 0.45, 0, TAU);
    ctx.fillStyle = knobGrad;
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
      const knob2 = ctx.createRadialGradient(as.kx, as.ky - radius * 0.15, 1, as.kx, as.ky, radius * 0.42);
      knob2.addColorStop(0, '#fff7d6');
      knob2.addColorStop(1, '#ffb703');
      ctx.beginPath();
      ctx.arc(as.kx, as.ky, radius * 0.4, 0, TAU);
      ctx.fillStyle = knob2;
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

/** Pequeno desvio aleatório para faisca de pavio. */
function randOffset(): number {
  return (Math.random() * 2 - 1) * 4;
}
