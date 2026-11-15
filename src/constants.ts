import type { Vector2 } from './types.js';

export const TILE_SIZE = 40;
export const MAP_COLS = 40;
export const MAP_ROWS = 28;
export const MAP_WIDTH = MAP_COLS * TILE_SIZE;
export const MAP_HEIGHT = MAP_ROWS * TILE_SIZE;

export const SCREEN_WIDTH = 1280;
export const SCREEN_HEIGHT = 720;

export const TEAM_COLORS: { BLUE: string; RED: string } = {
  BLUE: '#3b82f6',
  RED: '#ef4444',
};

export const TEAM_NAMES: { BLUE: string; RED: string } = {
  BLUE: 'AZUL',
  RED: 'VERMELHO',
};

export const PHYSICS = {
  FRICTION: 0.82,
  KNOCKBACK_FRICTION: 0.88,
  MAX_SPEED: 560,
  BUSH_REVEAL_DISTANCE: 2.5 * TILE_SIZE,
  BUSH_REVEAL_TIME: 1.2,
  REGEN_DELAY: 3.0,
  REGEN_INTERVAL: 0.8,
  REGEN_AMOUNT: 0.12,
  LOW_HP_THRESHOLD: 0.35,
  STUN_DURATION: 1.0,
  DASH_INVULN: 0.0,
};

export const AUDIO = {
  MASTER_VOLUME: 0.5,
};

export const GAME = {
  GEM_SPAWN_INTERVAL: 7.0,
  GEM_COUNTDOWN_TIME: 15.0,
  GEMS_TO_COUNTDOWN: 10,
  SHOWDOWN_POWER_CUBE_HP: 400,
  SHOWDOWN_POWER_CUBE_DAMAGE: 0.10,
  TOXIC_DAMAGE_PER_SECOND: 8,
  TOXIC_CLOSE_TIME: 90.0,
  SPAWN_INVULN: 2.0,
};

export const COLORS = {
  BG: '#0b0e14',
  PANEL: '#161b26',
  PANEL_BORDER: '#2d3748',
  TEXT: '#e2e8f0',
  TEXT_DIM: '#94a3b8',
  ACCENT: '#38bdf8',
  ACCENT_DIM: '#0ea5e9',
  DANGER: '#fb7185',
  DANGER_DIM: '#e11d48',
  SUCCESS: '#4ade80',
  SUCCESS_DIM: '#22c55e',
  WARNING: '#fbbf24',
  WARNING_DIM: '#d97706',
  SHADOW: 'rgba(0, 0, 0, 0.55)',
  WATER: '#3b82f6',
  WATER_ALPHA: 0.35,
  BUSH: '#22c55e',
  BUSH_ALPHA: 0.45,
  BUSH_DARK: '#15803d',
  WALL_INDESTRUCTIBLE: '#475569',
  WALL_DESTRUCTIBLE: '#94a3b8',
  FLOOR: '#1e293b',
  FLOOR_DARK: '#0f172a',
};

export const BALANCE = {
  MAX_AMMO: 3,
  SUPER_CHARGE_PER_HIT: 15,
  SUPER_CHARGE_PER_HIT_TAKEN: 8,
};

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function dist(a: Vector2, b: Vector2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function distSq(a: Vector2, b: Vector2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function normalize(v: Vector2): Vector2 {
  const len = Math.hypot(v.x, v.y);
  if (len === 0) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

export function rotate(v: Vector2, angle: number): Vector2 {
  return {
    x: v.x * Math.cos(angle) - v.y * Math.sin(angle),
    y: v.x * Math.sin(angle) + v.y * Math.cos(angle),
  };
}

export function randomRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
