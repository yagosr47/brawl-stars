import type { Brawler, Projectile, Gem, PowerCube, Vector2, Tile } from './types.js';
import { TILE_SIZE, PHYSICS, normalize, dist, distSq } from './constants.js';
import { isSolid, getTileAt } from './map.js';
import { resolveCircleVsTiles } from './physics.js';

export class BotAI {
  private patrolTarget: Vector2 | null = null;
  private patrolTimer: number = 0;
  private dodgeDir: Vector2 = { x: 0, y: 0 };
  private dodgeTimer: number = 0;

  update(
    bot: Brawler,
    dt: number,
    player: Brawler,
    enemies: Brawler[],
    projectiles: Projectile[],
    gems: Gem[],
    powerCubes: PowerCube[],
    tiles: Tile[][],
    tileSize: number,
  ): Vector2 {
    bot.aiTimer += dt;

    if (bot.stunTime > 0) {
      bot.stunTime = Math.max(0, bot.stunTime - dt);
      return { x: 0, y: 0 };
    }

    const hpPct = bot.health / bot.maxHealth;
    const nearestEnemy = this.findNearestEnemy(bot, enemies);
    const nearestProjectile = this.findDangerousProjectile(bot, projectiles);
    const nearestGem = this.findNearestGem(bot, gems);
    const nearestCube = this.findNearestCube(bot, powerCubes);

    if (!nearestEnemy) {
      bot.aiState = 'PATROL';
    }

    let steer = { x: 0, y: 0 };

    switch (bot.aiState) {
      case 'IDLE':
        steer = this.idleBehavior(bot, dt);
        if (nearestEnemy && dist(bot.pos, nearestEnemy.pos) < bot.stats.attackRange) {
          bot.aiState = 'CHASE';
        }
        break;
      case 'PATROL':
        steer = this.patrolBehavior(bot, dt, tiles, tileSize);
        if (nearestEnemy && dist(bot.pos, nearestEnemy.pos) < bot.stats.attackRange) {
          bot.aiState = 'CHASE';
        }
        break;
      case 'CHASE':
        if (!nearestEnemy) {
          bot.aiState = 'PATROL';
          break;
        }
        const dToEnemy = dist(bot.pos, nearestEnemy.pos);
        steer = this.chaseBehavior(bot, nearestEnemy, dt, tiles, tileSize);
        if (dToEnemy < bot.stats.attackRange * 0.85) {
          bot.aiState = 'ATTACK';
        }
        if (hpPct < PHYSICS.LOW_HP_THRESHOLD) {
          bot.aiState = 'RETREAT_HEAL';
        }
        break;
      case 'ATTACK':
        if (!nearestEnemy) {
          bot.aiState = 'PATROL';
          break;
        }
        const d2 = dist(bot.pos, nearestEnemy.pos);
        steer = this.attackBehavior(bot, nearestEnemy, dt, tiles, tileSize);
        if (d2 > bot.stats.attackRange) {
          bot.aiState = 'CHASE';
        }
        if (hpPct < PHYSICS.LOW_HP_THRESHOLD) {
          bot.aiState = 'RETREAT_HEAL';
        }
        break;
      case 'DODGE':
        steer = this.dodgeBehavior(bot, nearestProjectile, dt, tiles, tileSize);
        if (this.dodgeTimer <= 0) {
          bot.aiState = nearestEnemy ? 'CHASE' : 'PATROL';
        }
        break;
      case 'RETREAT':
        steer = this.retreatBehavior(bot, nearestEnemy ?? bot.pos, dt, tiles, tileSize);
        if (hpPct > 0.6) {
          bot.aiState = nearestEnemy ? 'CHASE' : 'PATROL';
        }
        break;
      case 'RETREAT_HEAL':
        steer = this.retreatBehavior(bot, nearestEnemy ?? bot.pos, dt, tiles, tileSize);
        if (hpPct > 0.7) {
          bot.aiState = nearestEnemy ? 'CHASE' : 'PATROL';
        }
        break;
      case 'SUPER':
        if (nearestEnemy) {
          const aimDir = normalize({ x: nearestEnemy.pos.x - bot.pos.x, y: nearestEnemy.pos.y - bot.pos.y });
          bot.facing = aimDir;
          bot.targetPos = nearestEnemy.pos;
        }
        if (bot.aiTimer > 1.0) {
          bot.aiState = 'ATTACK';
          bot.aiTimer = 0;
        }
        break;
    }

    if (nearestProjectile && distSq(bot.pos, nearestProjectile.pos) < 180 * 180) {
      bot.aiState = 'DODGE';
      this.dodgeTimer = 1.0;
      const away = normalize({ x: bot.pos.x - nearestProjectile.pos.x, y: bot.pos.y - nearestProjectile.pos.y });
      this.dodgeDir = away;
    }

    if (bot.aiState === 'DODGE') {
      steer = this.dodgeBehavior(bot, nearestProjectile, dt, tiles, tileSize);
      this.dodgeTimer = Math.max(0, this.dodgeTimer - dt);
    }

    if (nearestGem && distSq(bot.pos, nearestGem.pos) < 300 * 300 && !nearestEnemy) {
      const toGem = normalize({ x: nearestGem.pos.x - bot.pos.x, y: nearestGem.pos.y - bot.pos.y });
      steer = this.steerToward(bot, toGem, dt, tiles, tileSize);
    }

    if (nearestCube && distSq(bot.pos, nearestCube.pos) < 300 * 300 && !nearestEnemy && !nearestGem) {
      const toCube = normalize({ x: nearestCube.pos.x - bot.pos.x, y: nearestCube.pos.y - bot.pos.y });
      steer = this.steerToward(bot, toCube, dt, tiles, tileSize);
    }

    return steer;
  }

  private idleBehavior(bot: Brawler, dt: number): Vector2 {
    if (bot.aiTimer > 2.0) {
      bot.aiState = 'PATROL';
      bot.aiTimer = 0;
      this.patrolTarget = null;
    }
    return { x: 0, y: 0 };
  }

  private patrolBehavior(bot: Brawler, dt: number, tiles: Tile[][], tileSize: number): Vector2 {
    if (!this.patrolTarget || dist(bot.pos, this.patrolTarget) < 60 || this.patrolTimer <= 0) {
      const cx = TILE_SIZE * (tiles[0].length / 2);
      const cy = TILE_SIZE * (tiles.length / 2);
      const angle = Math.random() * Math.PI * 2;
      const radius = 150 + Math.random() * 300;
      this.patrolTarget = { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
      this.patrolTimer = 2.5 + Math.random() * 2.5;
    }
    this.patrolTimer = Math.max(0, this.patrolTimer - dt);
    const dir = normalize({ x: this.patrolTarget.x - bot.pos.x, y: this.patrolTarget.y - bot.pos.y });
    return this.steerToward(bot, dir, dt, tiles, tileSize);
  }

  private chaseBehavior(bot: Brawler, target: Brawler, dt: number, tiles: Tile[][], tileSize: number): Vector2 {
    const dir = normalize({ x: target.pos.x - bot.pos.x, y: target.pos.y - bot.pos.y });
    bot.facing = dir;
    bot.targetPos = target.pos;
    return this.steerToward(bot, dir, dt, tiles, tileSize);
  }

  private attackBehavior(bot: Brawler, target: Brawler, dt: number, tiles: Tile[][], tileSize: number): Vector2 {
    const dir = normalize({ x: target.pos.x - bot.pos.x, y: target.pos.y - bot.pos.y });
    bot.facing = dir;
    bot.targetPos = target.pos;
    const distToTarget = dist(bot.pos, target.pos);
    const idealDist = bot.stats.attackRange * 0.7;
    if (distToTarget < idealDist) {
      return { x: -dir.x * 0.5, y: -dir.y * 0.5 };
    }
    return this.steerToward(bot, dir, dt, tiles, tileSize);
  }

  private dodgeBehavior(bot: Brawler, projectile: Projectile | null, dt: number, tiles: Tile[][], tileSize: number): Vector2 {
    let dir = this.dodgeDir;
    if (projectile) {
      dir = normalize({ x: bot.pos.x - projectile.pos.x, y: bot.pos.y - projectile.pos.y });
    }
    return this.steerToward(bot, dir, dt, tiles, tileSize);
  }

  private retreatBehavior(bot: Brawler, from: Brawler | Vector2, dt: number, tiles: Tile[][], tileSize: number): Vector2 {
    const targetPos = 'pos' in from ? from.pos : from;
    const dir = normalize({ x: bot.pos.x - targetPos.x, y: bot.pos.y - targetPos.y });
    const cx = TILE_SIZE * (tiles[0].length / 2);
    const cy = TILE_SIZE * (tiles.length / 2);
    const toCenter = normalize({ x: cx - bot.pos.x, y: cy - bot.pos.y });
    const combined = normalize({ x: dir.x * 0.7 + toCenter.x * 0.3, y: dir.y * 0.7 + toCenter.y * 0.3 });
    return this.steerToward(bot, combined, dt, tiles, tileSize);
  }

  private steerToward(bot: Brawler, dir: Vector2, dt: number, tiles: Tile[][], tileSize: number): Vector2 {
    bot.facing = dir;
    const speed = bot.stats.moveSpeed;
    const desired = { x: dir.x * speed, y: dir.y * speed };
    const accel = 1400;
    bot.vel.x += (desired.x - bot.vel.x) * accel * dt;
    bot.vel.y += (desired.y - bot.vel.y) * accel * dt;

    const result = resolveCircleVsTiles(bot.pos, bot.radius, bot.vel, tiles, tileSize);
    bot.pos = result.pos;
    bot.vel = result.vel;

    return dir;
  }

  private findNearestEnemy(bot: Brawler, enemies: Brawler[]): Brawler | null {
    let nearest: Brawler | null = null;
    let nearestD = Infinity;
    for (const e of enemies) {
      if (e.health <= 0) continue;
      const d = distSq(bot.pos, e.pos);
      if (d < nearestD) {
        nearestD = d;
        nearest = e;
      }
    }
    return nearest;
  }

  private findDangerousProjectile(bot: Brawler, projectiles: Projectile[]): Projectile | null {
    let nearest: Projectile | null = null;
    let nearestD = Infinity;
    for (const p of projectiles) {
      if (p.ownerTeam === bot.team) continue;
      const d = distSq(bot.pos, p.pos);
      if (d < nearestD) {
        nearestD = d;
        nearest = p;
      }
    }
    return nearest;
  }

  private findNearestGem(bot: Brawler, gems: Gem[]): Gem | null {
    let nearest: Gem | null = null;
    let nearestD = Infinity;
    for (const g of gems) {
      if (g.collected) continue;
      const d = distSq(bot.pos, g.pos);
      if (d < nearestD) {
        nearestD = d;
        nearest = g;
      }
    }
    return nearest;
  }

  private findNearestCube(bot: Brawler, cubes: PowerCube[]): PowerCube | null {
    let nearest: PowerCube | null = null;
    let nearestD = Infinity;
    for (const c of cubes) {
      if (c.collected) continue;
      const d = distSq(bot.pos, c.pos);
      if (d < nearestD) {
        nearestD = d;
        nearest = c;
      }
    }
    return nearest;
  }

  shouldUseSuper(bot: Brawler, enemies: Brawler[]): boolean {
    if (bot.superCharge < bot.maxSuperCharge) return false;
    return enemies.some((e) => e.health > 0 && distSq(bot.pos, e.pos) < bot.stats.attackRange * bot.stats.attackRange);
  }

  getAimTarget(bot: Brawler, enemies: Brawler[]): Vector2 | null {
    let nearest: Brawler | null = null;
    let nearestD = Infinity;
    for (const e of enemies) {
      if (e.health <= 0) continue;
      const d = distSq(bot.pos, e.pos);
      if (d < nearestD) {
        nearestD = d;
        nearest = e;
      }
    }
    return nearest ? nearest.pos : null;
  }
}
