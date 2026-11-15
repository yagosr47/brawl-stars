/* ============================================================
   ARENA BRAWLER — Física: Círculo×AABB com deslizamento,
   linha de visão, arbustos, knockback e visibilidade.
   ============================================================ */

import type { Entity, GameMode, TileMapView, Vec2, World } from './types';
import {
  BUSH_DETECT_RADIUS,
  BUSH_REVEAL_TIME,
  KNOCKBACK_DECAY,
  clamp,
  dist,
  normalize,
} from './constants';

/**
 * Resolve colisão Círculo vs. AABB (tile) empurrando o círculo
 * apenas ao longo da normal — o que gera deslizamento suave em
 * paredes e quinas (sem travar).
 */
export function resolveCircleTiles(pos: Vec2, radius: number, map: TileMapView): boolean {
  const ts = map.tileSize;
  let collided = false;
  const minTX = Math.floor((pos.x - radius) / ts);
  const maxTX = Math.floor((pos.x + radius) / ts);
  const minTY = Math.floor((pos.y - radius) / ts);
  const maxTY = Math.floor((pos.y + radius) / ts);

  for (let ty = minTY; ty <= maxTY; ty++) {
    for (let tx = minTX; tx <= maxTX; tx++) {
      if (!map.isSolidAt(tx * ts + ts * 0.5, ty * ts + ts * 0.5)) continue;
      const left = tx * ts;
      const top = ty * ts;
      const right = left + ts;
      const bottom = top + ts;

      const cx = clamp(pos.x, left, right);
      const cy = clamp(pos.y, top, bottom);
      const dx = pos.x - cx;
      const dy = pos.y - cy;
      const d2 = dx * dx + dy * dy;

      if (d2 >= radius * radius) continue;
      collided = true;

      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        const push = radius - d + 0.05;
        pos.x += (dx / d) * push;
        pos.y += (dy / d) * push;
      } else {
        // Centro dentro do tile: sai pelo eixo de menor penetração.
        const pushLeft = pos.x - left + radius;
        const pushRight = right - pos.x + radius;
        const pushTop = pos.y - top + radius;
        const pushBottom = bottom - pos.y + radius;
        const minPush = Math.min(pushLeft, pushRight, pushTop, pushBottom);
        if (minPush === pushLeft) pos.x = left - radius - 0.05;
        else if (minPush === pushRight) pos.x = right + radius + 0.05;
        else if (minPush === pushTop) pos.y = top - radius - 0.05;
        else pos.y = bottom + radius + 0.05;
      }
    }
  }
  return collided;
}

/** Move a entidade pela velocidade + knockback e resolve colisões. */
export function moveEntity(e: Entity, dt: number, map: TileMapView): void {
  e.pos.x += (e.vel.x + e.knockback.x) * dt;
  e.pos.y += (e.vel.y + e.knockback.y) * dt;
  resolveCircleTiles(e.pos, e.radius, map);
  e.pos.x = clamp(e.pos.x, e.radius, map.width * map.tileSize - e.radius);
  e.pos.y = clamp(e.pos.y, e.radius, map.height * map.tileSize - e.radius);
  const decay = Math.exp(-KNOCKBACK_DECAY * dt);
  e.knockback.x *= decay;
  e.knockback.y *= decay;
  if (Math.abs(e.knockback.x) < 2) e.knockback.x = 0;
  if (Math.abs(e.knockback.y) < 2) e.knockback.y = 0;
}

/** Aplica um impulso de knockback acumulativo. */
export function applyKnockback(e: Entity, dirX: number, dirY: number, force: number): void {
  const n = normalize(dirX, dirY);
  e.knockback.x += n.x * force;
  e.knockback.y += n.y * force;
}

/** Linha de visão: paredes bloqueiam; água e arbustos não. */
export function lineOfSight(map: TileMapView, x0: number, y0: number, x1: number, y1: number): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const length = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(length / (map.tileSize * 0.35)));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (map.isProjectileBlockingAt(x0 + dx * t, y0 + dy * t)) return false;
  }
  return true;
}

/** Dois jogadores são inimigos? */
export function isEnemy(a: Entity, b: Entity, mode: GameMode): boolean {
  if (a.id === b.id) return false;
  if (mode === 'SHOWDOWN') return true;
  return a.team !== b.team;
}

/**
 * Regras de stealth dos arbustos:
 * - Aliados sempre se veem.
 * - Inimigo em arbusto é invisível, exceto:
 *   (a) a menos de 2.5 tiles, (b) revelado por ataque/dano (1.2s),
 *   (c) sem arbusto — vale a linha de visão normal.
 */
export function isEntityVisible(target: Entity, viewer: Entity, world: World): boolean {
  if (target.id === viewer.id) return true;
  if (!target.alive || target.eliminated) return false;
  if (!isEnemy(target, viewer, world.mode)) return true;

  const inBush = world.map.isBushAt(target.pos.x, target.pos.y);
  if (!inBush) {
    return lineOfSight(world.map, viewer.pos.x, viewer.pos.y, target.pos.x, target.pos.y);
  }
  if (target.revealTimer > 0) {
    return lineOfSight(world.map, viewer.pos.x, viewer.pos.y, target.pos.x, target.pos.y);
  }
  return dist(viewer.pos.x, viewer.pos.y, target.pos.x, target.pos.y) < BUSH_DETECT_RADIUS;
}

/** Revela o brawler ao atacar ou ao sofrer dano. */
export function revealEntity(e: Entity): void {
  e.revealTimer = Math.max(e.revealTimer, BUSH_REVEAL_TIME);
}

/** Projétil colide com tile sólido para projéteis? */
export function projectileHitsTile(map: TileMapView, x: number, y: number): boolean {
  return map.isProjectileBlockingAt(x, y);
}
