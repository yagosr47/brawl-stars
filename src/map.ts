import type { Tile } from './types.js';
import { MAP_COLS, MAP_ROWS } from './constants.js';

export function generateMap(seed: number = Date.now()): Tile[][] {
  const rng = createRNG(seed);
  const cols = MAP_COLS;
  const rows = MAP_ROWS;
  const tiles: Tile[][] = [];

  for (let y = 0; y < rows; y++) {
    tiles[y] = [];
    for (let x = 0; x < cols; x++) {
      tiles[y][x] = { type: 'FLOOR', x, y, hp: 0, maxHp: 0 };
    }
  }

  const borderThickness = 1;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (x < borderThickness || x >= cols - borderThickness || y < borderThickness || y >= rows - borderThickness) {
        tiles[y][x].type = 'WALL_INDESTRUCTIBLE';
        tiles[y][x].hp = 9999;
        tiles[y][x].maxHp = 9999;
      }
    }
  }

  const centerX = Math.floor(cols / 2);
  const centerY = Math.floor(rows / 2);
  const spawnDistance = 7;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const dx = Math.abs(x - centerX);
      const dy = Math.abs(y - centerY);
      if (dx < spawnDistance && dy < spawnDistance) {
        tiles[y][x].type = 'FLOOR';
        tiles[y][x].hp = 0;
        tiles[y][x].maxHp = 0;
      }
    }
  }

  const destructibleCount = Math.floor((cols * rows) * 0.14);
  for (let i = 0; i < destructibleCount; i++) {
    const x = pickX(rng, 3, cols - 4);
    const y = pickY(rng, 3, rows - 4);
    if (isFarFromCenter(x, y, centerX, centerY, 8) && tiles[y][x].type === 'FLOOR') {
      tiles[y][x].type = 'WALL_DESTRUCTIBLE';
      tiles[y][x].hp = 3;
      tiles[y][x].maxHp = 3;
    }
  }

  const indestructibleInner = Math.floor((cols * rows) * 0.06);
  for (let i = 0; i < indestructibleInner; i++) {
    const x = pickX(rng, 3, cols - 4);
    const y = pickY(rng, 3, rows - 4);
    if (isFarFromCenter(x, y, centerX, centerY, 9) && tiles[y][x].type === 'FLOOR') {
      tiles[y][x].type = 'WALL_INDESTRUCTIBLE';
      tiles[y][x].hp = 9999;
      tiles[y][x].maxHp = 9999;
    }
  }

  const waterClusters = 4;
  for (let c = 0; c < waterClusters; c++) {
    const cx = pickX(rng, 5, cols - 6);
    const cy = pickY(rng, 5, rows - 6);
    const radius = pickInt(rng, 2, 4);
    for (let y = cy - radius; y <= cy + radius; y++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        if (x >= 2 && x < cols - 2 && y >= 2 && y < rows - 2) {
          const d = Math.hypot(x - cx, y - cy);
          if (d <= radius && isFarFromCenter(x, y, centerX, centerY, 8)) {
            tiles[y][x].type = 'WATER';
            tiles[y][x].hp = 0;
            tiles[y][x].maxHp = 0;
          }
        }
      }
    }
  }

  const bushPatches = 10;
  for (let p = 0; p < bushPatches; p++) {
    const bx = pickX(rng, 3, cols - 4);
    const by = pickY(rng, 3, rows - 4);
    const size = pickInt(rng, 2, 3);
    for (let y = by - size; y <= by + size; y++) {
      for (let x = bx - size; x <= bx + size; x++) {
        if (x >= 2 && x < cols - 2 && y >= 2 && y < rows - 2 && rng() < 0.72) {
          if (tiles[y][x].type === 'FLOOR' && isFarFromCenter(x, y, centerX, centerY, 9)) {
            tiles[y][x].type = 'BUSH';
            tiles[y][x].hp = 0;
            tiles[y][x].maxHp = 0;
          }
        }
      }
    }
  }

  ensureSymmetry(tiles, centerX, centerY);

  return tiles;
}

function pickX(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pickY(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pickInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function isFarFromCenter(x: number, y: number, cx: number, cy: number, minDist: number): boolean {
  return Math.hypot(x - cx, y - cy) >= minDist;
}

function ensureSymmetry(tiles: Tile[][], centerX: number, centerY: number): void {
  const rows = tiles.length;
  const cols = tiles[0].length;
  const mirrored: Tile[][] = [];
  for (let y = 0; y < rows; y++) {
    mirrored[y] = [];
    for (let x = 0; x < cols; x++) {
      const mx = cols - 1 - x;
      const my = rows - 1 - y;
      mirrored[y][x] = { ...tiles[my][mx] };
      mirrored[y][x].x = x;
      mirrored[y][x].y = y;
    }
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      tiles[y][x] = mirrored[y][x];
    }
  }
}

function createRNG(seed: number): () => number {
  let s = seed >>> 0;
  return (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s >>> 0) / 0xffffffff;
  };
}

export function getTile(tiles: Tile[][], x: number, y: number): Tile | null {
  if (x < 0 || x >= tiles[0].length || y < 0 || y >= tiles.length) return null;
  return tiles[y][x];
}

export function isSolid(tile: Tile | null): boolean {
  if (!tile) return true;
  return tile.type === 'WALL_INDESTRUCTIBLE' || tile.type === 'WALL_DESTRUCTIBLE';
}

export function isWater(tile: Tile | null): boolean {
  return tile ? tile.type === 'WATER' : false;
}

export function isBush(tile: Tile | null): boolean {
  return tile ? tile.type === 'BUSH' : false;
}

export function isFloor(tile: Tile | null): boolean {
  return tile ? tile.type === 'FLOOR' : false;
}

export function tileRect(tile: Tile, tileSize: number): { x: number; y: number; w: number; h: number } {
  return { x: tile.x * tileSize, y: tile.y * tileSize, w: tileSize, h: tileSize };
}

export function getTileAt(tiles: Tile[][], worldX: number, worldY: number, tileSize: number): Tile | null {
  const tx = Math.floor(worldX / tileSize);
  const ty = Math.floor(worldY / tileSize);
  return getTile(tiles, tx, ty);
}
