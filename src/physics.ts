import type { Vector2, Tile } from './types.js';
import { TILE_SIZE, PHYSICS, clamp } from './constants.js';
import { isSolid, getTile, getTileAt, tileRect } from './map.js';

export function resolveCircleVsTiles(
  pos: Vector2,
  radius: number,
  vel: Vector2,
  tiles: Tile[][],
  tileSize: number,
): { pos: Vector2; vel: Vector2; collided: boolean } {
  const nextX = pos.x + vel.x;
  const nextY = pos.y + vel.y;
  let outX = nextX;
  let outY = nextY;
  let outVX = vel.x;
  let outVY = vel.y;
  let collided = false;

  const rx = resolveAxisX(pos, outX, outY, radius, vel.x, tiles, tileSize);
  outX = rx.x;
  collided = collided || rx.collided;
  if (rx.collided) outVX = 0;

  const ry = resolveAxisY({ x: outX, y: pos.y }, outX, outY, radius, vel.y, tiles, tileSize);
  outY = ry.y;
  collided = collided || ry.collided;
  if (ry.collided) outVY = 0;

  outX = clamp(outX, radius, TILE_SIZE * tiles[0].length - radius);
  outY = clamp(outY, radius, TILE_SIZE * tiles.length - radius);

  return { pos: { x: outX, y: outY }, vel: { x: outVX, y: outVY }, collided };
}

function resolveAxisX(
  pos: Vector2,
  nextX: number,
  nextY: number,
  radius: number,
  moveX: number,
  tiles: Tile[][],
  tileSize: number,
): { x: number; collided: boolean } {
  let cx = nextX;
  let cy = nextY;
  let collided = false;

  const tilesToCheck = getTilesAround(cx, cy, radius, tiles, tileSize);
  for (const tile of tilesToCheck) {
    if (!isSolid(tile)) continue;
    const r = tileRect(tile, tileSize);
    const closestX = clamp(cx, r.x, r.x + r.w);
    const closestY = clamp(cy, r.y, r.y + r.h);
    const dx = cx - closestX;
    const dy = cy - closestY;
    const distSq = dx * dx + dy * dy;

    if (distSq < radius * radius && distSq > 0) {
      const dist = Math.sqrt(distSq);
      const overlap = radius - dist;
      const nx = dx / dist;
      cx += nx * overlap;
      collided = true;
    }
  }

  return { x: cx, collided };
}

function resolveAxisY(
  pos: Vector2,
  nextX: number,
  nextY: number,
  radius: number,
  moveY: number,
  tiles: Tile[][],
  tileSize: number,
): { y: number; collided: boolean } {
  let cx = nextX;
  let cy = nextY;
  let collided = false;

  const tilesToCheck = getTilesAround(cx, cy, radius, tiles, tileSize);
  for (const tile of tilesToCheck) {
    if (!isSolid(tile)) continue;
    const r = tileRect(tile, tileSize);
    const closestX = clamp(cx, r.x, r.x + r.w);
    const closestY = clamp(cy, r.y, r.y + r.h);
    const dx = cx - closestX;
    const dy = cy - closestY;
    const distSq = dx * dx + dy * dy;

    if (distSq < radius * radius && distSq > 0) {
      const dist = Math.sqrt(distSq);
      const overlap = radius - dist;
      const ny = dy / dist;
      cy += ny * overlap;
      collided = true;
    }
  }

  return { y: cy, collided };
}

export function getTilesAround(
  x: number,
  y: number,
  radius: number,
  tiles: Tile[][],
  tileSize: number,
): Tile[] {
  const found: Tile[] = [];
  const minTx = Math.floor((x - radius) / tileSize) - 1;
  const maxTx = Math.floor((x + radius) / tileSize) + 1;
  const minTy = Math.floor((y - radius) / tileSize) - 1;
  const maxTy = Math.floor((y + radius) / tileSize) + 1;
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      const t = getTile(tiles, tx, ty);
      if (t) found.push(t);
    }
  }
  return found;
}

export function hasLineOfSight(
  p1: Vector2,
  p2: Vector2,
  tiles: Tile[][],
  tileSize: number,
): boolean {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return true;
  const steps = Math.ceil(dist / 4);
  const nx = dx / dist;
  const ny = dy / dist;
  for (let i = 1; i <= steps; i++) {
    const tx = p1.x + nx * i * 4;
    const ty = p1.y + ny * i * 4;
    const tile = getTileAt(tiles, tx, ty, tileSize);
    if (tile && isSolid(tile)) return false;
  }
  return true;
}

export function tileBushProximity(
  tiles: Tile[][],
  pos: Vector2,
  tileSize: number,
): boolean {
  const tx = Math.floor(pos.x / tileSize);
  const ty = Math.floor(pos.y / tileSize);
  for (let y = ty - 1; y <= ty + 1; y++) {
    for (let x = tx - 1; x <= tx + 1; x++) {
      const t = getTile(tiles, x, y);
      if (t && t.type === 'BUSH') return true;
    }
  }
  return false;
}

export function getTilesInRadius(
  tiles: Tile[][],
  center: Vector2,
  radius: number,
  tileSize: number,
): Tile[] {
  const found: Tile[] = [];
  const minTx = Math.floor((center.x - radius) / tileSize) - 1;
  const maxTx = Math.floor((center.x + radius) / tileSize) + 1;
  const minTy = Math.floor((center.y - radius) / tileSize) - 1;
  const maxTy = Math.floor((center.y + radius) / tileSize) + 1;
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      const t = getTile(tiles, tx, ty);
      if (t) found.push(t);
    }
  }
  return found;
}

export function applyKnockback(
  b: { pos: Vector2; knockbackVel: Vector2; knockbackTime: number },
  direction: Vector2,
  strength: number,
  duration: number,
): void {
  b.knockbackVel = { x: direction.x * strength, y: direction.y * strength };
  b.knockbackTime = duration;
}

export function updateKnockback(b: { knockbackVel: Vector2; knockbackTime: number }, dt: number): void {
  if (b.knockbackTime > 0) {
    b.knockbackTime = Math.max(0, b.knockbackTime - dt);
    b.knockbackVel.x *= PHYSICS.KNOCKBACK_FRICTION;
    b.knockbackVel.y *= PHYSICS.KNOCKBACK_FRICTION;
    if (Math.abs(b.knockbackVel.x) < 1 && Math.abs(b.knockbackVel.y) < 1) {
      b.knockbackVel = { x: 0, y: 0 };
      b.knockbackTime = 0;
    }
  }
}

export function distance(a: Vector2, b: Vector2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function distanceSq(a: Vector2, b: Vector2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function normalize(v: Vector2): Vector2 {
  const len = Math.hypot(v.x, v.y);
  if (len === 0) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}
