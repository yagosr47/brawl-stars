/* ============================================================
   ARENA BRAWLER — FSM tática para bots (aliados e inimigos)
   - Navegação com steering + desvio de paredes
   - Coleta prioritária de gemas/cubos
   - Desvio lateral de projéteis (strafe)
   - Recuo para cobertura com vida < 35%
   - Uso inteligente do Super
   ============================================================ */

import type { Entity, Vec2, World } from './types';
import { isEnemy, isEntityVisible, lineOfSight } from './physics';
import {
  AUTO_AIM_EXTRA_RANGE,
  TILE_SIZE,
  clamp,
  dist,
  distSq,
  normalize,
  randRange,
} from './constants';

export interface AIContext {
  fire: (e: Entity, angle: number, useSuper: boolean, targetPos?: Vec2) => void;
}

const BOT_AIM_ERROR = 0.1; // rad — margem de erro de mira dos bots
const STATE_TICK = 0.35;

/** Alcance preferido do bot conforme o arquétipo de ataque. */
function preferredRange(e: Entity): number {
  switch (e.def.attack.type) {
    case 'LINEAR':
      return e.def.attack.range * 0.72;
    case 'LOBBED':
      return e.def.attack.range * 0.75;
    case 'CONE':
    default:
      return e.def.id === 'bruto' ? TILE_SIZE * 2.1 : TILE_SIZE * 5.2;
  }
}

function nearestEnemy(e: Entity, world: World): Entity | null {
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const o of world.entities) {
    if (!o.alive || o.eliminated || !isEnemy(e, o, world.mode)) continue;
    if (!isEntityVisible(o, e, world)) continue;
    const d = dist(e.pos.x, e.pos.y, o.pos.x, o.pos.y);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

function nearestPickup(e: Entity, world: World): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestD = TILE_SIZE * 16;
  for (const p of world.pickups) {
    const d = dist(e.pos.x, e.pos.y, p.pos.x, p.pos.y);
    // Gemas têm prioridade sobre cubos.
    const bias = p.kind === 'GEM' ? 0.55 : 1;
    if (d * bias < bestD) {
      bestD = d * bias;
      best = p.pos;
    }
  }
  return best;
}

/** O ponto livre mais próximo na direção oposta a uma ameaça. */
function retreatTarget(e: Entity, threat: Entity | null, world: World): Vec2 {
  const spawnList = world.spawnPoints[e.team];
  const home = spawnList.length > 0 ? spawnList[e.id % spawnList.length] : { x: e.pos.x, y: e.pos.y };
  if (threat) {
    const away = normalize(e.pos.x - threat.pos.x, e.pos.y - threat.pos.y);
    return {
      x: clamp(e.pos.x + away.x * TILE_SIZE * 6 + (home.x - e.pos.x) * 0.25, TILE_SIZE, world.map.width * TILE_SIZE - TILE_SIZE),
      y: clamp(e.pos.y + away.y * TILE_SIZE * 6 + (home.y - e.pos.y) * 0.25, TILE_SIZE, world.map.height * TILE_SIZE - TILE_SIZE),
    };
  }
  return home;
}

/** Steering com desvio de paredes (feeler rays). */
function steerTowards(e: Entity, world: World, target: Vec2): Vec2 {
  const desired = normalize(target.x - e.pos.x, target.y - e.pos.y);
  if (desired.x === 0 && desired.y === 0) return desired;
  const feeler = TILE_SIZE * 1.9;
  const offsets = [0, 0.55, -0.55, 1.1, -1.1, 1.7, -1.7];
  for (const off of offsets) {
    const cos = Math.cos(off);
    const sin = Math.sin(off);
    const dx = desired.x * cos - desired.y * sin;
    const dy = desired.x * sin + desired.y * cos;
    let blocked = false;
    for (let s = TILE_SIZE * 0.6; s <= feeler; s += TILE_SIZE * 0.55) {
      const px = e.pos.x + dx * s;
      const py = e.pos.y + dy * s;
      if (world.map.isSolidAt(px, py)) {
        blocked = true;
        break;
      }
    }
    if (!blocked) return { x: dx, y: dy };
  }
  return { x: -desired.y, y: desired.x };
}

/** Detecta projéteis inimigos voando na direção do bot. */
function incomingThreat(e: Entity, world: World): Vec2 {
  let sum: Vec2 = { x: 0, y: 0 };
  for (const p of world.projectiles) {
    if (p.dead || p.ownerId === e.id) continue;
    const owner = world.entities.find((o) => o.id === p.ownerId);
    if (!owner || !isEnemy(owner, e, world.mode)) continue;
    const toX = e.pos.x - p.pos.x;
    const toY = e.pos.y - p.pos.y;
    const d = Math.hypot(toX, toY);
    if (d > TILE_SIZE * 7 || d < 1) continue;
    const dot = (toX / d) * p.dir.x + (toY / d) * p.dir.y;
    if (dot > 0.88) {
      // Perpendicular ao projétil, para o lado mais aberto.
      sum = { x: sum.x + -p.dir.y, y: sum.y + p.dir.x };
    }
  }
  return sum;
}

function aimAtTarget(e: Entity, target: Entity, useSuper: boolean): number {
  const def = useSuper ? e.def.super.attack : e.def.attack;
  const d = dist(e.pos.x, e.pos.y, target.pos.x, target.pos.y);
  // Previsão simples de mira (lead).
  const travel = def.speed > 0 ? d / def.speed : 0;
  const leadX = target.pos.x + target.vel.x * travel * 0.75;
  const leadY = target.pos.y + target.vel.y * travel * 0.75;
  const base = Math.atan2(leadY - e.pos.y, leadX - e.pos.x);
  return base + randRange(-BOT_AIM_ERROR, BOT_AIM_ERROR);
}

function tryUseSuper(e: Entity, world: World, ctx: AIContext, target: Entity | null): boolean {
  if (e.superCharge < 1 || !target) return false;
  const leap = e.def.super.leap;
  const d = dist(e.pos.x, e.pos.y, target.pos.x, target.pos.y);
  let ok: boolean;
  let angle = aimAtTarget(e, target, true);
  if (leap) {
    ok = d > TILE_SIZE * 1.2 && d < leap.range * 0.95;
  } else {
    const sRange = e.def.super.attack.range;
    ok = d < sRange * 0.92 && lineOfSight(world.map, e.pos.x, e.pos.y, target.pos.x, target.pos.y);
    if (ok && e.def.super.attack.type === 'LOBBED') {
      angle = Math.atan2(target.pos.y - e.pos.y, target.pos.x - e.pos.x);
    }
  }
  if (!ok) return false;
  ctx.fire(e, angle, true, { x: target.pos.x, y: target.pos.y });
  return true;
}

function botWanderTarget(world: World): Vec2 {
  if (world.mode === 'GEM_GRAB') {
    const cx = world.map.width * world.map.tileSize * 0.5;
    const cy = world.map.height * world.map.tileSize * 0.5;
    return {
      x: cx + randRange(-TILE_SIZE * 6, TILE_SIZE * 6),
      y: cy + randRange(-TILE_SIZE * 5, TILE_SIZE * 5),
    };
  }
  return {
    x: randRange(TILE_SIZE * 3, world.map.width * world.map.tileSize - TILE_SIZE * 3),
    y: randRange(TILE_SIZE * 3, world.map.height * world.map.tileSize - TILE_SIZE * 3),
  };
}

function moveAlong(e: Entity, world: World, target: Vec2, speedScale: number): void {
  const dir = steerTowards(e, world, target);
  e.vel.x = dir.x * e.speed * speedScale;
  e.vel.y = dir.y * e.speed * speedScale;
}

/**
 * Atualiza a FSM de um bot por frame.
 */
export function updateBotAI(e: Entity, world: World, ctx: AIContext, dt: number): void {
  if (!e.alive || e.eliminated) return;
  if (e.jump.active) return;

  // Atordoado: parado.
  if (e.stunTimer > 0) {
    e.vel.x = 0;
    e.vel.y = 0;
    return;
  }

  e.aiTimer -= dt;
  const enemy = nearestEnemy(e, world);
  const enemyDist = enemy ? dist(e.pos.x, e.pos.y, enemy.pos.x, enemy.pos.y) : Infinity;
  const hpRatio = e.hp / e.maxHp;
  const pref = preferredRange(e);

  /* -------- Decisão de estado (FSM) -------- */
  if (e.aiTimer <= 0) {
    e.aiTimer = STATE_TICK + randRange(0, 0.25);
    const pickup = nearestPickup(e, world);
    if (hpRatio < 0.35 && enemy && enemyDist < TILE_SIZE * 11) {
      e.aiState = 'RETREAT';
    } else if (pickup && (!enemy || enemyDist > TILE_SIZE * 7)) {
      e.aiState = 'COLLECT';
    } else if (enemy && enemyDist < pref * 1.35) {
      e.aiState = 'ATTACK';
    } else if (enemy && enemyDist < TILE_SIZE * 15) {
      e.aiState = 'CHASE';
    } else {
      e.aiState = 'ROAM';
    }
    if (Math.random() < 0.35) e.aiStrafeDir = -e.aiStrafeDir;
  }

  /* -------- Comportamento por estado -------- */
  let moveTarget: Vec2 | null = null;
  let speedScale = 1;

  switch (e.aiState) {
    case 'RETREAT': {
      moveTarget = retreatTarget(e, enemy, world);
      speedScale = 1;
      break;
    }
    case 'COLLECT': {
      const pickup = nearestPickup(e, world);
      moveTarget = pickup ?? botWanderTarget(world);
      speedScale = 1;
      break;
    }
    case 'ATTACK': {
      if (!enemy) break;
      // Strafe lateral + controle de distância.
      const toEnemy = normalize(enemy.pos.x - e.pos.x, enemy.pos.y - e.pos.y);
      const perp = { x: -toEnemy.y * e.aiStrafeDir, y: toEnemy.x * e.aiStrafeDir };
      const rangeErr = clamp((enemyDist - pref) / (TILE_SIZE * 4), -1, 1);
      const desired = {
        x: e.pos.x + perp.x * TILE_SIZE * 3 + toEnemy.x * rangeErr * TILE_SIZE * 3,
        y: e.pos.y + perp.y * TILE_SIZE * 3 + toEnemy.y * rangeErr * TILE_SIZE * 3,
      };
      moveTarget = desired;
      speedScale = 0.82;

      // Disparo.
      if (
        e.attackCooldown <= 0 &&
        e.ammo >= 1 &&
        enemyDist < e.def.attack.range + AUTO_AIM_EXTRA_RANGE &&
        lineOfSight(world.map, e.pos.x, e.pos.y, enemy.pos.x, enemy.pos.y)
      ) {
        ctx.fire(e, aimAtTarget(e, enemy, false), false, { x: enemy.pos.x, y: enemy.pos.y });
      }
      tryUseSuper(e, world, ctx, enemy);
      break;
    }
    case 'CHASE': {
      if (!enemy) break;
      moveTarget = enemy.pos;
      speedScale = 1;
      if (e.def.attack.type === 'LOBBED' && enemyDist < TILE_SIZE * 3.5) {
        // Lançador foge de curta distância.
        moveTarget = retreatTarget(e, enemy, world);
      }
      tryUseSuper(e, world, ctx, enemy);
      break;
    }
    case 'ROAM': {
      if (distSq(e.pos.x, e.pos.y, e.wanderTarget.x, e.wanderTarget.y) < (TILE_SIZE * 2) ** 2) {
        e.wanderTarget = botWanderTarget(world);
      }
      moveTarget = e.wanderTarget;
      speedScale = 0.9;
      break;
    }
    case 'IDLE':
    default: {
      e.vel.x = 0;
      e.vel.y = 0;
      e.aiState = 'ROAM';
      e.wanderTarget = botWanderTarget(world);
      break;
    }
  }

  /* -------- Projéteis: desvio lateral -------- */
  const threat = incomingThreat(e, world);
  if (threat.x !== 0 || threat.y !== 0) {
    const tNorm = normalize(threat.x, threat.y);
    if (moveTarget) {
      moveTarget = {
        x: moveTarget.x + tNorm.x * TILE_SIZE * 4.5,
        y: moveTarget.y + tNorm.y * TILE_SIZE * 4.5,
      };
    } else {
      moveTarget = { x: e.pos.x + tNorm.x * TILE_SIZE * 4, y: e.pos.y + tNorm.y * TILE_SIZE * 4 };
    }
  }

  /* -------- Movimento final -------- */
  if (moveTarget) {
    moveAlong(e, world, moveTarget, speedScale);
  } else {
    e.vel.x = 0;
    e.vel.y = 0;
  }

  // Encara o inimigo quando há um visível.
  if (enemy && enemyDist < TILE_SIZE * 14) {
    e.facing = Math.atan2(enemy.pos.y - e.pos.y, enemy.pos.x - e.pos.x);
  } else if (Math.hypot(e.vel.x, e.vel.y) > 8) {
    e.facing = Math.atan2(e.vel.y, e.vel.x);
  }
}
