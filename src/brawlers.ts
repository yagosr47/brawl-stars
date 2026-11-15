/* ============================================================
   ARENA BRAWLER — Definição dos 4 Brawlers
   ============================================================ */

import type { BrawlerDef } from './types';

const mkAttack = (
  type: BrawlerDef['attack']['type'],
  damage: number,
  projectileCount: number,
  spreadDeg: number,
  speed: number,
  range: number,
  radius: number,
  reloadTime: number,
  color: string,
  knockback: number,
  pierce: boolean,
  explodeRadius: number,
  flightTime: number,
  arcHeight: number,
  stun: number,
  destroyWalls: boolean,
): BrawlerDef['attack'] => ({
  type,
  damage,
  projectileCount,
  spreadDeg,
  speed,
  range,
  radius,
  reloadTime,
  color,
  knockback,
  pierce,
  explodeRadius,
  flightTime,
  arcHeight,
  stun,
  destroyWalls,
});

/**
 * 1) SCARLET — Lutador/Escopeta (Shelly-like)
 *    Disparo em cone de 5 projéteis; mais dano de perto.
 *    Super: explosão em cone que destrói paredes e aplica knockback.
 */
const scarlet: BrawlerDef = {
  id: 'scarlet',
  name: 'Scarlet',
  role: 'Lutador',
  blurb: 'Escopeta em cone com 5 projéteis. Super destrói paredes e empurra inimigos!',
  maxHp: 5200,
  speed: 212,
  radius: 15,
  bodyColor: '#e8485c',
  darkColor: '#8c2036',
  accentColor: '#ffd23f',
  attack: mkAttack('CONE', 380, 5, 26, 520, 250, 7, 1.5, '#ffd23f', 60, false, 0, 0, 0, 0, false),
  super: {
    attack: mkAttack(
      'CONE',
      460,
      9,
      36,
      620,
      310,
      9,
      0,
      '#ff9f1c',
      430,
      false,
      0,
      0,
      0,
      0,
      true,
    ),
    leap: null,
  },
  superDamageNeeded: 1500,
};

/**
 * 2) HAWK — Atirador/Sniper (Colt/Piper-like)
 *    Projétil único rápido e de longo alcance.
 *    Super: rajada perfurante de longa distância.
 */
const hawk: BrawlerDef = {
  id: 'hawk',
  name: 'Hawk',
  role: 'Atirador',
  blurb: 'Tiro único veloz e preciso de longuíssimo alcance. Super perfura tudo!',
  maxHp: 3200,
  speed: 226,
  radius: 14,
  bodyColor: '#39c1ff',
  darkColor: '#155e8c',
  accentColor: '#7df9ff',
  attack: mkAttack('LINEAR', 720, 1, 0, 900, 430, 6, 1.7, '#7df9ff', 40, false, 0, 0, 0, 0, false),
  super: {
    attack: mkAttack(
      'LINEAR',
      430,
      6,
      7,
      1050,
      560,
      7,
      0,
      '#00e5ff',
      60,
      true,
      0,
      0,
      0,
      0,
      false,
    ),
    leap: null,
  },
  superDamageNeeded: 1600,
};

/**
 * 3) FUSE — Lançador/Thrower (Barley/Dynamike-like)
 *    Projétil parabólico que ignora paredes e explode em área.
 *    Super: múltiplos explosivos em grande raio.
 */
const fuse: BrawlerDef = {
  id: 'fuse',
  name: 'Fuse',
  role: 'Lançador',
  blurb: 'Joga explosivos por cima das paredes! Super chove bombas em grande área.',
  maxHp: 3600,
  speed: 216,
  radius: 14,
  bodyColor: '#b44dff',
  darkColor: '#5c1f8c',
  accentColor: '#ffb347',
  attack: mkAttack('LOBBED', 620, 1, 0, 0, 320, 8, 1.9, '#ffb347', 80, false, 62, 0.85, 90, 0, false),
  super: {
    attack: mkAttack(
      'LOBBED',
      720,
      4,
      26,
      0,
      350,
      8,
      0,
      '#ff8c42',
      110,
      false,
      100,
      1.05,
      120,
      0,
      true,
    ),
    leap: null,
  },
  superDamageNeeded: 1500,
};

/**
 * 4) BRUTO — Tanque (El Primo/Bull-like)
 *    Alta vida, rápido, ataque corpo-a-corpo em arco curto.
 *    Super: salto invulnerável que causa dano e atordoa ao aterrissar.
 */
const bruto: BrawlerDef = {
  id: 'bruto',
  name: 'Bruto',
  role: 'Tanque',
  blurb: 'Monstro corpo-a-corpo com vida gigante. Super é um salto que atordoa!',
  maxHp: 6800,
  speed: 242,
  radius: 17,
  bodyColor: '#ff6b35',
  darkColor: '#993412',
  accentColor: '#ffe14d',
  attack: mkAttack('CONE', 400, 3, 22, 700, 95, 18, 1.35, '#ff6b35', 140, false, 0, 0, 0, 0, false),
  super: {
    attack: mkAttack('LINEAR', 0, 0, 0, 0, 0, 0, 0, '#ffe14d', 0, false, 0, 0, 0, 0, false),
    leap: {
      range: 240,
      duration: 0.55,
      landRadius: 112,
      landDamage: 900,
      landStun: 1.0,
      invulnerable: true,
    },
  },
  superDamageNeeded: 1700,
};

/** Registro de todos os brawlers. */
export const BRAWLERS: Record<string, BrawlerDef> = {
  scarlet,
  hawk,
  fuse,
  bruto,
};

/** Ordem de exibição na seleção. */
export const BRAWLER_IDS: string[] = ['scarlet', 'hawk', 'fuse', 'bruto'];

/** Nomes aleatórios para bots. */
export const BOT_NAMES: string[] = [
  'Zé',
  'Luna',
  'Kiko',
  'Maya',
  'Rui',
  'Nina',
  'Téo',
  'Ivy',
  'Duda',
  'Beto',
  'Sara',
  'Vini',
];

/** Ícones por brawler (avatar do menu). */
export const BRAWLER_ICONS: Record<string, string> = {
  scarlet: '💥',
  hawk: '🎯',
  fuse: '💣',
  bruto: '👊',
};
