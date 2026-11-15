import type { BrawlerDefinition, BrawlerStats, BrawlerId, Team, Brawler } from './types.js';

const SHELLY_STATS: BrawlerStats = {
  maxHealth: 4200,
  moveSpeed: 360,
  attackRange: 7.5 * 40,
  attackDamage: 900,
  attackCooldown: 1.1,
  projectileSpeed: 900,
  projectileLifetime: 0.85,
  reloadTime: 1.5,
  superChargeTime: 5.5,
  superDamage: 1200,
  radius: 22,
};

const COLT_STATS: BrawlerStats = {
  maxHealth: 3000,
  moveSpeed: 390,
  attackRange: 11.5 * 40,
  attackDamage: 1100,
  attackCooldown: 0.75,
  projectileSpeed: 1350,
  projectileLifetime: 1.0,
  reloadTime: 1.1,
  superChargeTime: 6.0,
  superDamage: 700,
  radius: 18,
};

const BARLEY_STATS: BrawlerStats = {
  maxHealth: 3400,
  moveSpeed: 340,
  attackRange: 9.5 * 40,
  attackDamage: 1050,
  attackCooldown: 1.4,
  projectileSpeed: 520,
  projectileLifetime: 2.6,
  reloadTime: 1.6,
  superChargeTime: 6.5,
  superDamage: 850,
  radius: 20,
};

const ELPRIMO_STATS: BrawlerStats = {
  maxHealth: 5600,
  moveSpeed: 410,
  attackRange: 2.6 * 40,
  attackDamage: 1800,
  attackCooldown: 0.9,
  projectileSpeed: 0,
  projectileLifetime: 0,
  reloadTime: 1.2,
  superChargeTime: 6.0,
  superDamage: 1600,
  radius: 26,
};

export const BRAWLERS: Record<BrawlerId, BrawlerDefinition> = {
  SHELLY: {
    id: 'SHELLY',
    name: 'Shelly',
    archetype: 'FIGHTER',
    attackType: 'CONE',
    stats: SHELLY_STATS,
    color: '#fb7185',
    superType: 'WALL_BREAK',
    description: 'Escopeta de 5 projéteis em cone. O Super destrói paredes e aplica empurrão.',
  },
  COLT: {
    id: 'COLT',
    name: 'Colt',
    archetype: 'SHARPSHOOTER',
    attackType: 'LINEAR',
    stats: COLT_STATS,
    color: '#3b82f6',
    superType: 'PIERCE_BURST',
    description: 'Projétil único de alta velocidade. O Super dispara rajada perfurante.',
  },
  BARLEY: {
    id: 'BARLEY',
    name: 'Barley',
    archetype: 'THROWER',
    attackType: 'LOBBED',
    stats: BARLEY_STATS,
    color: '#a3e635',
    superType: 'MULTI_EXPLOSIVE',
    description: 'Projétil parabólico que ignora paredes e explode em área.',
  },
  ELPRIMO: {
    id: 'ELPRIMO',
    name: 'El Primo',
    archetype: 'TANK',
    attackType: 'CONE',
    stats: ELPRIMO_STATS,
    color: '#f59e0b',
    superType: 'JUMP',
    description: 'Tanque com ataque corpo-a-corpo. O Super salta até o alvo causando dano e atordoamento.',
  },
};

export function makeBrawler(id: BrawlerId, team: Team, pos: { x: number; y: number }, isBot: boolean = false): Brawler {
  const def = BRAWLERS[id];
  const stats = def.stats;
  const now = performance.now();
  return {
    ...def,
    team,
    pos: { x: pos.x, y: pos.y },
    vel: { x: 0, y: 0 },
    health: stats.maxHealth,
    maxHealth: stats.maxHealth,
    ammo: 3,
    maxAmmo: 3,
    lastShotTime: now - stats.reloadTime,
    superCharge: 0,
    maxSuperCharge: 100,
    isSuperActive: false,
    superActiveTime: 0,
    knockbackVel: { x: 0, y: 0 },
    knockbackTime: 0,
    stunTime: 0,
    revealTime: 0,
    inBush: false,
    lastDamageTime: now,
    regenTimer: 0,
    powerCubes: 0,
    radius: stats.radius,
    facing: { x: 1, y: 0 },
    targetPos: { x: pos.x, y: pos.y },
    aiState: 'IDLE',
    aiTimer: 0,
    isBot,
  };
}

export function brawlerColor(b: Brawler): string {
  return b.color;
}
