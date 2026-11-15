/* ============================================================
   ARENA BRAWLER — Gerador de arenas simétricas (40x28 tiles)
   ============================================================ */

import type { GameMode, Team, TileMapView, TileType, Vec2 } from './types';
import { MAP_TILES_X, MAP_TILES_Y, TILE_SIZE, WORLD_HEIGHT, WORLD_WIDTH } from './constants';

/** Mapa da arena em grid, com geração simétrica (espelhos horizontal, vertical e rotacional). */
export class GameMap implements TileMapView {
  readonly width: number = MAP_TILES_X;
  readonly height: number = MAP_TILES_Y;
  readonly tileSize: number = TILE_SIZE;
  private tiles: TileType[];

  constructor() {
    this.tiles = new Array<TileType>(this.width * this.height).fill('FLOOR');
    this.generate();
  }

  /* ---------------- Consultas ---------------- */

  getTile(tx: number, ty: number): TileType {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return 'WALL';
    return this.tiles[ty * this.width + tx];
  }

  setTile(tx: number, ty: number, t: TileType): void {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return;
    this.tiles[ty * this.width + tx] = t;
  }

  private tileAtPx(px: number, py: number): TileType {
    return this.getTile(Math.floor(px / TILE_SIZE), Math.floor(py / TILE_SIZE));
  }

  /** Bloqueia movimento de entidades (parede, parede destrutível e água). */
  isSolidAt(px: number, py: number): boolean {
    const t = this.tileAtPx(px, py);
    return t === 'WALL' || t === 'BREAKABLE' || t === 'WATER';
  }

  /** Bloqueia projéteis (apenas paredes). */
  isProjectileBlockingAt(px: number, py: number): boolean {
    const t = this.tileAtPx(px, py);
    return t === 'WALL' || t === 'BREAKABLE';
  }

  isBushAt(px: number, py: number): boolean {
    return this.tileAtPx(px, py) === 'BUSH';
  }

  isWaterAt(px: number, py: number): boolean {
    return this.tileAtPx(px, py) === 'WATER';
  }

  worldToTile(px: number, py: number): Vec2 {
    return { x: Math.floor(px / TILE_SIZE), y: Math.floor(py / TILE_SIZE) };
  }

  tileCenter(tx: number, ty: number): Vec2 {
    return { x: (tx + 0.5) * TILE_SIZE, y: (ty + 0.5) * TILE_SIZE };
  }

  /** Destrói a parede destrutível em uma coordenada de mundo. */
  destroyTileAt(px: number, py: number): boolean {
    const tx = Math.floor(px / TILE_SIZE);
    const ty = Math.floor(py / TILE_SIZE);
    if (this.getTile(tx, ty) === 'BREAKABLE') {
      this.setTile(tx, ty, 'FLOOR');
      return true;
    }
    return false;
  }

  /** Destrói todas as paredes destrutíveis dentro de um raio (Super). */
  destroyTilesInRadius(x: number, y: number, r: number): number {
    let count = 0;
    const tx0 = Math.floor((x - r) / TILE_SIZE);
    const tx1 = Math.floor((x + r) / TILE_SIZE);
    const ty0 = Math.floor((y - r) / TILE_SIZE);
    const ty1 = Math.floor((y + r) / TILE_SIZE);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (this.getTile(tx, ty) !== 'BREAKABLE') continue;
        const cx = (tx + 0.5) * TILE_SIZE;
        const cy = (ty + 0.5) * TILE_SIZE;
        if (Math.hypot(cx - x, cy - y) <= r + TILE_SIZE * 0.4) {
          this.setTile(tx, ty, 'FLOOR');
          count++;
        }
      }
    }
    return count;
  }

  /* ---------------- Geração ---------------- */

  private generate(): void {
    this.tiles.fill('FLOOR');
    this.paintBorder();
    this.paintRandomClusters();
    this.paintWaterBlobs();
    this.paintBushBlobs();
    this.connectBushes();
    this.clearCenter();
    this.clearSpawnAreas();
    this.ensureConnectivity();
  }

  /** Aplica o tile nas 4 posições simétricas (espelhos H, V e rotacional). */
  private setSymmetric(tx: number, ty: number, t: TileType): void {
    this.setTile(tx, ty, t);
    this.setTile(this.width - 1 - tx, ty, t);
    this.setTile(tx, this.height - 1 - ty, t);
    this.setTile(this.width - 1 - tx, this.height - 1 - ty, t);
  }

  private paintBorder(): void {
    for (let x = 0; x < this.width; x++) {
      this.setTile(x, 0, 'WALL');
      this.setTile(x, this.height - 1, 'WALL');
    }
    for (let y = 0; y < this.height; y++) {
      this.setTile(0, y, 'WALL');
      this.setTile(this.width - 1, y, 'WALL');
    }
  }

  private paintRectSymmetric(cx: number, cy: number, w: number, h: number, t: TileType): void {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        this.setSymmetric(cx + dx, cy + dy, t);
      }
    }
  }

  private paintRandomClusters(): void {
    for (let i = 0; i < 30; i++) {
      const t: TileType = Math.random() < 0.45 ? 'WALL' : 'BREAKABLE';
      const w = 1 + Math.floor(Math.random() * 4);
      const h = 1 + Math.floor(Math.random() * 3);
      const cx = 3 + Math.floor(Math.random() * (this.width / 2 - 6));
      const cy = 3 + Math.floor(Math.random() * (this.height - 6));
      this.paintRectSymmetric(cx, cy, w, h, t);
    }
  }

  /** Blobs de água por caminhada aleatória (bloqueiam movimento, não projéteis). */
  private paintWaterBlobs(): void {
    for (let i = 0; i < 3; i++) {
      let tx = 6 + Math.floor(Math.random() * (this.width / 2 - 12));
      let ty = 5 + Math.floor(Math.random() * (this.height - 10));
      const steps = 10 + Math.floor(Math.random() * 10);
      for (let s = 0; s < steps; s++) {
        if (tx > 2 && ty > 2 && tx < this.width / 2 - 2 && ty < this.height - 3) {
          this.setSymmetric(tx, ty, 'WATER');
          this.setSymmetric(tx + 1, ty, 'WATER');
        }
        tx += Math.floor(Math.random() * 3) - 1;
        ty += Math.floor(Math.random() * 3) - 1;
      }
    }
  }

  /** Blobs de arbustos por caminhada aleatória. */
  private paintBushBlobs(): void {
    for (let i = 0; i < 8; i++) {
      let tx = 3 + Math.floor(Math.random() * (this.width / 2 - 6));
      let ty = 3 + Math.floor(Math.random() * (this.height - 6));
      const steps = 12 + Math.floor(Math.random() * 14);
      for (let s = 0; s < steps; s++) {
        if (tx > 1 && ty > 1 && tx < this.width / 2 && ty < this.height - 2) {
          this.setSymmetric(tx, ty, 'BUSH');
        }
        tx += Math.floor(Math.random() * 3) - 1;
        ty += Math.floor(Math.random() * 3) - 1;
      }
    }
  }

  /** Conecta manchas de arbustos com corredores em L (arbustos interconectados). */
  private connectBushes(): void {
    const bushes: Vec2[] = [];
    for (let y = 1; y < this.height - 1; y++) {
      for (let x = 1; x < this.width - 1; x++) {
        if (this.getTile(x, y) === 'BUSH') bushes.push({ x, y });
      }
    }
    if (bushes.length < 2) return;
    for (let i = 0; i < 8; i++) {
      const a = bushes[Math.floor(Math.random() * bushes.length)];
      const b = bushes[Math.floor(Math.random() * bushes.length)];
      const dirX = b.x >= a.x ? 1 : -1;
      const dirY = b.y >= a.y ? 1 : -1;
      let x = a.x;
      let y = a.y;
      const carve = (): void => {
        const t = this.getTile(x, y);
        if (t === 'FLOOR' || t === 'WATER' || t === 'BUSH') this.setSymmetric(x, y, 'BUSH');
      };
      while (x !== b.x) {
        carve();
        x += dirX;
      }
      while (y !== b.y) {
        carve();
        y += dirY;
      }
      carve();
    }
  }

  /** Mantém o centro livre (spawner de gemas). */
  private clearCenter(): void {
    const cx = Math.floor(this.width / 2);
    const cy = Math.floor(this.height / 2);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.setTile(cx + dx, cy + dy, 'FLOOR');
      }
    }
  }

  /** Zonas de spawn sempre livres. */
  private clearSpawnAreas(): void {
    const spawns = getSpawnTiles();
    for (const s of spawns) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          this.setTile(s.x + dx, s.y + dy, 'FLOOR');
        }
      }
    }
  }

  /**
   * Garante que exista caminho de chão entre os spawns de cada time
   * abrindo um corredor horizontal e um vertical pelo centro.
   */
  private ensureConnectivity(): void {
    const cy = Math.floor(this.height / 2);
    const cx = Math.floor(this.width / 2);
    for (let x = 1; x < this.width - 1; x++) {
      if (this.getTile(x, cy) !== 'BUSH') this.setTile(x, cy, 'FLOOR');
      if (this.getTile(x, cy - 1) !== 'BUSH') this.setTile(x, cy - 1, 'FLOOR');
    }
    for (let y = 1; y < this.height - 1; y++) {
      if (this.getTile(cx, y) !== 'BUSH') this.setTile(cx, y, 'FLOOR');
    }
  }

  /** Posições simétricas para as caixas do Showdown. */
  findCrateSpots(count: number): Vec2[] {
    const spots: Vec2[] = [];
    let attempts = 0;
    while (spots.length < count && attempts < 600) {
      attempts++;
      const tx = 4 + Math.floor(Math.random() * (this.width / 2 - 8));
      const ty = 4 + Math.floor(Math.random() * (this.height - 8));
      if (this.getTile(tx, ty) !== 'FLOOR') continue;
      const cx = Math.floor(this.width / 2);
      const cy = Math.floor(this.height / 2);
      if (Math.abs(tx - cx) < 3 && Math.abs(ty - cy) < 3) continue;
      const p = this.tileCenter(tx, ty);
      const q = this.tileCenter(this.width - 1 - tx, this.height - 1 - ty);
      if (spots.some((s) => Math.hypot(s.x - p.x, s.y - p.y) < TILE_SIZE * 2)) continue;
      spots.push(p, q);
    }
    return spots.slice(0, count);
  }
}

/* ---------------- Spawns ---------------- */

function getSpawnTiles(): Vec2[] {
  const w = MAP_TILES_X;
  const h = MAP_TILES_Y;
  return [
    { x: 3, y: 7 },
    { x: 3, y: Math.floor(h / 2) },
    { x: 3, y: h - 8 },
    { x: w - 4, y: 7 },
    { x: w - 4, y: Math.floor(h / 2) },
    { x: w - 4, y: h - 8 },
    { x: Math.floor(w / 2) - 6, y: 3 },
    { x: Math.floor(w / 2) + 6, y: 3 },
    { x: Math.floor(w / 2) - 6, y: h - 4 },
    { x: Math.floor(w / 2) + 6, y: h - 4 },
  ];
}

/** Pontos de spawn em coordenadas de mundo para cada time/modo. */
export function getSpawns(mode: GameMode): Record<Team, Vec2[]> {
  const t = getSpawnTiles();
  const at = (i: number): Vec2 => ({ x: (t[i].x + 0.5) * TILE_SIZE, y: (t[i].y + 0.5) * TILE_SIZE });
  if (mode === 'GEM_GRAB') {
    return {
      BLUE: [at(0), at(1), at(2)],
      RED: [at(3), at(4), at(5)],
      NEUTRAL: [],
    };
  }
  return {
    BLUE: [],
    RED: [],
    NEUTRAL: [at(0), at(3), at(2), at(5), at(6), at(7)],
  };
}

/** Centro da arena (spawner de gemas). */
export function getMapCenter(): Vec2 {
  return { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };
}
