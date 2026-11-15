/* ============================================================
   ARENA BRAWLER — Constantes de balanceamento, física e cores
   ============================================================ */

import type { Vec2 } from './types';

/* ---------- Dimensões da arena ---------- */
export const TILE_SIZE = 32;
export const MAP_TILES_X = 40;
export const MAP_TILES_Y = 28;
export const WORLD_WIDTH = MAP_TILES_X * TILE_SIZE; // 1280
export const WORLD_HEIGHT = MAP_TILES_Y * TILE_SIZE; // 896

/* ---------- Game loop ---------- */
export const FIXED_DT_MAX = 0.05; // dt limitado a 50ms

/* ---------- Combate / munição ---------- */
export const MAX_AMMO = 3;
export const ATTACK_COOLDOWN = 0.28;

/* ---------- Regeneração passiva ---------- */
export const REGEN_DELAY = 3.0; // segundos sem atacar/sofrer dano
export const REGEN_INTERVAL = 0.8; // tick de cura
export const REGEN_PERCENT = 0.12; // 12% da vida máxima por tick

/* ---------- Arbustos (stealth) ---------- */
export const BUSH_DETECT_RADIUS = 2.5 * TILE_SIZE;
export const BUSH_REVEAL_TIME = 1.2;

/* ---------- Pique-Gema ---------- */
export const GEM_SPAWN_INTERVAL = 7;
export const GEM_WIN_COUNT = 10;
export const GEM_COUNTDOWN_TIME = 15;
export const GEM_RESPAWN_TIME = 3;

/* ---------- Showdown ---------- */
export const SHOWDOWN_PLAYER_COUNT = 6;
export const SHOWDOWN_CRATE_COUNT = 14;
export const CRATE_HP = 1600;
export const POWER_CUBE_HP_BONUS = 400;
export const POWER_CUBE_DMG_BONUS = 0.1;

/* ---------- Nuvens tóxicas ---------- */
export const POISON_START_DELAY = 20;
export const POISON_STEP_INTERVAL = 14;
export const POISON_BASE_DPS = 350;
export const POISON_DPS_GROWTH = 120;
export const POISON_DAMAGE_TICK = 1.0;

/* ---------- Input mobile ---------- */
export const TAP_MAX_TIME = 0.12; // 120ms
export const TAP_MAX_DIST = 10; // 10px
export const AUTO_AIM_EXTRA_RANGE = 90;

/* ---------- Câmera ---------- */
export const VIEW_HEIGHT = 640;
export const CAMERA_LERP = 8;
export const SHAKE_MAX_OFFSET = 26;
export const SHAKE_DECAY = 1.5;

/* ---------- Física ---------- */
export const KNOCKBACK_DECAY = 5.5;
export const PICKUP_RADIUS = 13;
export const PICKUP_MAGNET = 26;

/* ---------- Cores ---------- */
export const COLOR = {
  floorA: '#3fae5a',
  floorB: '#37a052',
  floorLine: 'rgba(20, 70, 35, 0.25)',
  wall: '#8a5a2b',
  wallTop: '#a9743c',
  wallEdge: '#5c3a1c',
  breakable: '#c98840',
  breakableTop: '#e0a45c',
  crack: '#7c4a20',
  water: '#2e86de',
  waterLight: '#5fb3f7',
  bush: '#2f8f3f',
  bushDark: '#1f6b2c',
  bushLight: '#4fc462',
  outline: '#1c1227',
  shadow: 'rgba(20, 12, 30, 0.3)',
  hpBg: '#241a33',
  hpBlue: '#2ec4ff',
  hpRed: '#ff4d5e',
  hpNeutral: '#ffb347',
  hpHeal: '#63e07a',
  ammo: '#ffd23f',
  ammoEmpty: 'rgba(255, 255, 255, 0.18)',
  superColor: '#ffe14d',
  gem: '#b44dff',
  gemLight: '#d98cff',
  cube: '#ff7f2a',
  cubeLight: '#ffb36b',
  crate: '#a4713d',
  crateDark: '#7c4f26',
  poison: 'rgba(122, 28, 92, 0.42)',
  poisonEdge: 'rgba(180, 60, 130, 0.75)',
  damageText: '#fff7ea',
  healText: '#63e07a',
  critText: '#ffd23f',
} as const;

/* ---------- Utilitários matemáticos ---------- */
export const TAU = Math.PI * 2;

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

export function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

export function normalize(x: number, y: number): Vec2 {
  const len = Math.hypot(x, y);
  if (len < 1e-8) return { x: 0, y: 0 };
  return { x: x / len, y: y / len };
}

export function deg2rad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function randInt(min: number, max: number): number {
  return Math.floor(randRange(min, max + 1));
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
