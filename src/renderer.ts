import type { Brawler, Projectile, Gem, PowerCube, Particle, DamageNumber, Tile } from './types.js';
import { COLORS, clamp, normalize } from './constants.js';
import { isBush, getTileAt } from './map.js';

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private camera: { x: number; y: number };
  private shakeTrauma: number;
  private shakeOffset: { x: number; y: number };
  private width: number;
  private height: number;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context');
    this.ctx = ctx;
    this.camera = { x: 0, y: 0 };
    this.shakeTrauma = 0;
    this.shakeOffset = { x: 0, y: 0 };
    this.width = canvas.width;
    this.height = canvas.height;
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this.width = width;
    this.height = height;
  }

  setCamera(x: number, y: number): void {
    this.camera = { x, y };
  }

  setShakeTrauma(trauma: number): void {
    this.shakeTrauma = clamp(trauma, 0, 1);
  }

  updateShake(dt: number): void {
    if (this.shakeTrauma > 0) {
      const shake = this.shakeTrauma * this.shakeTrauma * this.shakeTrauma * 20;
      this.shakeOffset.x = (Math.random() - 0.5) * shake;
      this.shakeOffset.y = (Math.random() - 0.5) * shake;
      this.shakeTrauma = Math.max(0, this.shakeTrauma - dt * 2.5);
      if (this.shakeTrauma < 0.01) this.shakeTrauma = 0;
    } else {
      this.shakeOffset = { x: 0, y: 0 };
    }
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: wx - this.camera.x + this.width / 2 + this.shakeOffset.x,
      y: wy - this.camera.y + this.height / 2 + this.shakeOffset.y,
    };
  }

  clear(): void {
    this.ctx.fillStyle = COLORS.BG;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  renderMap(tiles: Tile[][], tileSize: number, camera: { x: number; y: number }): void {
    const cols = tiles[0].length;
    const rows = tiles.length;
    const startCol = Math.floor((camera.x - this.width / 2) / tileSize) - 1;
    const endCol = Math.floor((camera.x + this.width / 2) / tileSize) + 2;
    const startRow = Math.floor((camera.y - this.height / 2) / tileSize) - 1;
    const endRow = Math.floor((camera.y + this.height / 2) / tileSize) + 2;

    for (let y = startRow; y <= endRow; y++) {
      if (y < 0 || y >= rows) continue;
      for (let x = startCol; x <= endCol; x++) {
        if (x < 0 || x >= cols) continue;
        const tile = tiles[y][x];
        this.drawTile(tile, tileSize);
      }
    }
  }

  private drawTile(tile: Tile, tileSize: number): void {
    const { x, y } = this.worldToScreen(tile.x * tileSize, tile.y * tileSize);
    const s = tileSize;
    const ctx = this.ctx;

    if (tile.type === 'FLOOR') {
      const checker = ((tile.x + tile.y) % 2 === 0) ? COLORS.FLOOR : COLORS.FLOOR_DARK;
      ctx.fillStyle = checker;
      ctx.fillRect(x, y, s, s);
      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 1, y + 1, s - 2, s - 2);
    } else if (tile.type === 'WALL_INDESTRUCTIBLE') {
      ctx.fillStyle = COLORS.WALL_INDESTRUCTIBLE;
      ctx.fillRect(x, y, s, s);
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, s - 2, s - 2);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x + 4, y + 4, s - 8, s - 8);
    } else if (tile.type === 'WALL_DESTRUCTIBLE') {
      ctx.fillStyle = COLORS.WALL_DESTRUCTIBLE;
      ctx.fillRect(x, y, s, s);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, s - 2, s - 2);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(x + 5, y + 5, s - 10, s - 10);
      for (let hp = 0; hp < tile.hp; hp++) {
        ctx.fillStyle = '#64748b';
        ctx.fillRect(x + 6 + hp * 4, y + 6, 3, s - 12);
      }
    } else if (tile.type === 'WATER') {
      ctx.fillStyle = COLORS.WATER;
      ctx.globalAlpha = COLORS.WATER_ALPHA as unknown as number;
      ctx.fillRect(x, y, s, s);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, s, s);
    } else if (tile.type === 'BUSH') {
      ctx.fillStyle = COLORS.BUSH;
      ctx.globalAlpha = COLORS.BUSH_ALPHA as unknown as number;
      ctx.beginPath();
      ctx.arc(x + s / 2, y + s / 2, s * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = COLORS.BUSH_DARK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + s / 2, y + s / 2, s * 0.42, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  renderShadows(brawlers: Brawler[]): void {
    const ctx = this.ctx;
    ctx.fillStyle = COLORS.SHADOW;
    for (const b of brawlers) {
      if (b.health <= 0) continue;
      const { x, y } = this.worldToScreen(b.pos.x, b.pos.y + 6);
      const alpha = b.inBush ? 0.25 : 0.55;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.ellipse(x, y, b.radius * 0.75, b.radius * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  renderBrawlers(
    brawlers: Brawler[],
    playerId: number,
    tileSize: number,
    tiles: Tile[][],
  ): void {
    const ctx = this.ctx;
    for (const b of brawlers) {
      if (b.health <= 0) continue;
      const visible = this.isBrawlerVisible(b, playerId, tiles, tileSize);
      if (!visible && b.inBush) continue;

      const alpha = visible ? (b.inBush ? 0.55 : 1) : 1;
      const { x, y } = this.worldToScreen(b.pos.x, b.pos.y);

      ctx.save();
      ctx.translate(x, y);
      ctx.globalAlpha = alpha;

      if (b.stunTime > 0) {
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(0, -b.radius - 8, 6, 0, Math.PI * 2);
        ctx.fill();
      }

      const bodyColor = b.team === 'BLUE' ? '#3b82f6' : '#ef4444';
      const accent = b.color;

      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';

      ctx.fillStyle = bodyColor;
      ctx.beginPath();
      ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(0, 0, b.radius * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.stroke();

      const facingLen = b.radius * 0.9;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(b.facing.x * facingLen, b.facing.y * facingLen);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.stroke();

      if (b.isSuperActive) {
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, b.radius * 1.35, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  private isBrawlerVisible(b: Brawler, playerId: number, tiles: Tile[][], tileSize: number): boolean {
    return true;
  }

  renderProjectiles(projectiles: Projectile[]): void {
    const ctx = this.ctx;
    for (const p of projectiles) {
      const { x, y } = this.worldToScreen(p.pos.x, p.pos.y);
      ctx.save();
      ctx.translate(x, y);
      if (p.lobbed) {
        const progress = 1 - p.lifetime / p.maxLifetime;
        const arc = Math.sin(progress * Math.PI) * p.arcHeight;
        ctx.translate(0, -arc);
      }
      ctx.fillStyle = p.ownerTeam === 'BLUE' ? '#3b82f6' : '#ef4444';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (p.explosive) {
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, p.explodeRadius * 0.5, 0, Math.PI * 2);
        ctx.stroke();
      }

      const velLen = Math.hypot(p.vel.x, p.vel.y);
      if (velLen > 0) {
        const n = normalize(p.vel);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-n.x * p.radius * 1.5, -n.y * p.radius * 1.5);
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  renderGems(gems: Gem[]): void {
    const ctx = this.ctx;
    for (const g of gems) {
      if (g.collected) continue;
      const { x, y } = this.worldToScreen(g.pos.x, g.pos.y);
      const pulse = 1 + Math.sin(performance.now() * 0.006) * 0.12;
      const r = 7 * pulse;
      ctx.fillStyle = '#22d3ee';
      ctx.shadowColor = '#22d3ee';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.6, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r * 0.6, y);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.6, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r * 0.6, y);
      ctx.closePath();
      ctx.stroke();
    }
  }

  renderPowerCubes(cubes: PowerCube[]): void {
    const ctx = this.ctx;
    for (const c of cubes) {
      if (c.collected) continue;
      const { x, y } = this.worldToScreen(c.pos.x, c.pos.y);
      const pulse = 1 + Math.sin(performance.now() * 0.005) * 0.15;
      const r = 8 * pulse;
      ctx.fillStyle = '#f59e0b';
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 14;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(x - r, y - r, r * 2, r * 2);
    }
  }

  renderParticles(particles: Particle[]): void {
    const ctx = this.ctx;
    for (const p of particles) {
      const { x, y } = this.worldToScreen(p.pos.x, p.pos.y);
      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(x, y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  renderDamageNumbers(numbers: DamageNumber[]): void {
    const ctx = this.ctx;
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const d of numbers) {
      const { x, y } = this.worldToScreen(d.pos.x, d.pos.y);
      const alpha = d.life / d.maxLife;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = d.color;
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 4;
      ctx.fillText(d.text, x, y);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
  }

  renderAimReticle(
    aimPos: Vector2Screen,
    brawler: Brawler,
    camera: { x: number; y: number },
  ): void {
    const ctx = this.ctx;
    const { x, y } = this.worldToScreen(aimPos.x, aimPos.y);
    const range = brawler.stats.attackRange;

    ctx.save();
    ctx.translate(x, y);

    if (brawler.attackType === 'CONE') {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, range, -0.4, 0.4);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = 'rgba(56, 189, 248, 0.1)';
      ctx.fill();
    } else if (brawler.attackType === 'LINEAR') {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.moveTo(0, -range);
      ctx.lineTo(0, range);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (brawler.attackType === 'LOBBED') {
      ctx.strokeStyle = 'rgba(163, 230, 53, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, range, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(163, 230, 53, 0.08)';
      ctx.fill();
    }

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  renderHealthBar(b: Brawler, camera: { x: number; y: number }): void {
    const ctx = this.ctx;
    const { x, y } = this.worldToScreen(b.pos.x, b.pos.y - b.radius - 16);
    const w = b.radius * 2.2;
    const h = 7;
    const pct = clamp(b.health / b.maxHealth, 0, 1);

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - w / 2 - 2, y - 2, w + 4, h + 4);

    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x - w / 2, y, w, h);

    const segCount = 4;
    for (let i = 1; i < segCount; i++) {
      const sx = x - w / 2 + (w * i) / segCount;
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(sx - 1, y, 2, h);
    }

    const color = pct > 0.5 ? '#4ade80' : pct > 0.25 ? '#fbbf24' : '#fb7185';
    ctx.fillStyle = color;
    ctx.fillRect(x - w / 2, y, w * pct, h);

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - w / 2, y, w, h);
  }

  renderAmmoSlots(b: Brawler, camera: { x: number; y: number }): void {
    const ctx = this.ctx;
    const { x, y } = this.worldToScreen(b.pos.x, b.pos.y + b.radius + 14);
    const slot = 12;
    const gap = 4;
    for (let i = 0; i < b.maxAmmo; i++) {
      const sx = x - (b.maxAmmo * (slot + gap)) / 2 + i * (slot + gap);
      const ready = i < b.ammo;
      ctx.fillStyle = ready ? '#38bdf8' : 'rgba(255,255,255,0.15)';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.fillRect(sx, y, slot, slot);
      ctx.strokeRect(sx, y, slot, slot);
      if (ready) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.strokeRect(sx + 1, y + 1, slot - 2, slot - 2);
      }
    }
  }

  renderSuperCharge(b: Brawler, camera: { x: number; y: number }): void {
    const ctx = this.ctx;
    const { x, y } = this.worldToScreen(b.pos.x, b.pos.y - b.radius - 28);
    const w = b.radius * 2.2;
    const h = 5;
    const pct = clamp(b.superCharge / b.maxSuperCharge, 0, 1);

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x - w / 2, y, w, h);
    ctx.fillStyle = pct >= 1 ? '#fbbf24' : 'rgba(251, 191, 36, 0.35)';
    ctx.fillRect(x - w / 2, y, w * pct, h);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - w / 2, y, w, h);
    if (pct >= 1) {
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('SUPER', x, y + h / 2 + 4);
    }
  }

  renderBushOverlay(player: Brawler, tiles: Tile[][], tileSize: number): void {
    const ctx = this.ctx;
    const tx = Math.floor(player.pos.x / tileSize);
    const ty = Math.floor(player.pos.y / tileSize);
    let inBush = false;
    for (let y = ty - 1; y <= ty + 1; y++) {
      for (let x = tx - 1; x <= tx + 1; x++) {
        const t = getTileAt(tiles, player.pos.x, player.pos.y, tileSize);
        if (t && isBush(t)) inBush = true;
      }
    }
    if (!inBush) return;

    const cols = tiles[0].length;
    const rows = tiles.length;
    ctx.fillStyle = 'rgba(21, 128, 61, 0.25)';
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const t = tiles[y][x];
        if (t && isBush(t)) {
          const { x: sx, y: sy } = this.worldToScreen(t.x * tileSize, t.y * tileSize);
          ctx.fillRect(sx, sy, tileSize, tileSize);
        }
      }
    }
  }

  renderScreenFlash(alpha: number, color: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.globalAlpha = 1;
  }
}

interface Vector2Screen {
  x: number;
  y: number;
}
