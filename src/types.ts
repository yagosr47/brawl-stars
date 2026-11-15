export type AttackType = 'LINEAR' | 'CONE' | 'LOBBED';
export type TileType = 'FLOOR' | 'WALL_INDESTRUCTIBLE' | 'WALL_DESTRUCTIBLE' | 'WATER' | 'BUSH';
export type AIState = 'IDLE' | 'PATROL' | 'CHASE' | 'ATTACK' | 'DODGE' | 'RETREAT' | 'SUPER' | 'RETREAT_HEAL';
export type GameScreen = 'MENU' | 'MODE_SELECT' | 'BRAWLER_SELECT' | 'PLAYING' | 'GAME_OVER';
export type GameMode = 'GEM_GRAB' | 'SHOWDOWN';
export type BrawlerId = 'SHELLY' | 'COLT' | 'BARLEY' | 'ELPRIMO';
export type Team = 'BLUE' | 'RED';

export interface Vector2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BrawlerStats {
  maxHealth: number;
  moveSpeed: number;
  attackRange: number;
  attackDamage: number;
  attackCooldown: number;
  projectileSpeed: number;
  projectileLifetime: number;
  reloadTime: number;
  superChargeTime: number;
  superDamage: number;
  radius: number;
}

export interface BrawlerDefinition {
  id: BrawlerId;
  name: string;
  archetype: 'FIGHTER' | 'SHARPSHOOTER' | 'THROWER' | 'TANK';
  attackType: AttackType;
  stats: BrawlerStats;
  color: string;
  superType: 'WALL_BREAK' | 'PIERCE_BURST' | 'MULTI_EXPLOSIVE' | 'JUMP';
  description: string;
}

export interface Brawler extends BrawlerDefinition {
  team: Team;
  pos: Vector2;
  vel: Vector2;
  health: number;
  maxHealth: number;
  ammo: number;
  maxAmmo: number;
  lastShotTime: number;
  superCharge: number;
  maxSuperCharge: number;
  isSuperActive: boolean;
  superActiveTime: number;
  knockbackVel: Vector2;
  knockbackTime: number;
  stunTime: number;
  revealTime: number;
  inBush: boolean;
  lastDamageTime: number;
  regenTimer: number;
  powerCubes: number;
  radius: number;
  facing: Vector2;
  targetPos: Vector2;
  aiState: AIState;
  aiTimer: number;
  isBot: boolean;
}

export interface Projectile {
  id: number;
  pos: Vector2;
  vel: Vector2;
  damage: number;
  ownerId: number;
  ownerTeam: Team;
  lifetime: number;
  maxLifetime: number;
  radius: number;
  type: AttackType;
  speed: number;
  pierce: number;
  explosive: boolean;
  explodeRadius: number;
  lobbed: boolean;
  arcHeight: number;
  bounced: number;
  markForRemoval: boolean;
}

export interface Gem {
  pos: Vector2;
  value: number;
  collected: boolean;
}

export interface PowerCube {
  pos: Vector2;
  collected: boolean;
}

export interface Particle {
  pos: Vector2;
  vel: Vector2;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface DamageNumber {
  pos: Vector2;
  text: string;
  life: number;
  maxLife: number;
  color: string;
  vel: Vector2;
}

export interface Tile {
  type: TileType;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
}

export interface GameState {
  screen: GameScreen;
  mode: GameMode | null;
  playerTeam: Team;
  playerBrawler: BrawlerId | null;
  brawlers: Brawler[];
  projectiles: Projectile[];
  gems: Gem[];
  powerCubes: PowerCube[];
  particles: Particle[];
  damageNumbers: DamageNumber[];
  tiles: Tile[][];
  mapWidth: number;
  mapHeight: number;
  tileSize: number;
  camera: Vector2;
  shakeTrauma: number;
  time: number;
  gemSpawnTimer: number;
  toxicCloudRadius: number;
  winner: Team | null;
  gemsHeld: { BLUE: number; RED: number };
  gemCountdown: number;
  showCountdown: boolean;
}

export interface InputState {
  move: Vector2;
  aim: Vector2;
  shoot: boolean;
  shootJustPressed: boolean;
  super: boolean;
  superJustPressed: boolean;
  fullscreen: boolean;
  fullscreenJustPressed: boolean;
}

export interface SoundEffect {
  type: 'SHOT' | 'IMPACT' | 'WALL_BREAK' | 'GEM_PICKUP' | 'COUNTDOWN' | 'VICTORY' | 'DEFEAT' | 'SUPER';
  volume: number;
}
