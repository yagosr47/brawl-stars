/* ============================================================
   ARENA BRAWLER — Tipagem estrita do jogo
   ============================================================ */

/** Vetor 2D genérico. */
export interface Vec2 {
  x: number;
  y: number;
}

/** Tipo de ataque de um brawler. */
export type AttackType = 'LINEAR' | 'CONE' | 'LOBBED';

/** Tipos de terreno do mapa. */
export type TileType = 'FLOOR' | 'WALL' | 'BREAKABLE' | 'WATER' | 'BUSH';

/** Estados da máquina de estados finitos (FSM) da IA. */
export type AIState = 'IDLE' | 'ROAM' | 'COLLECT' | 'CHASE' | 'ATTACK' | 'RETREAT';

/** Modos de jogo. */
export type GameMode = 'GEM_GRAB' | 'SHOWDOWN';

/** Telas do jogo. */
export type GameScreen = 'MENU' | 'MODE_SELECT' | 'BRAWLER_SELECT' | 'PLAYING' | 'GAME_OVER';

/** Times. Em Showdown todos são NEUTRAL (todos contra todos). */
export type Team = 'BLUE' | 'RED' | 'NEUTRAL';

/** Definição completa de um ataque normal ou Super. */
export interface AttackDef {
  type: AttackType;
  damage: number;
  projectileCount: number;
  spreadDeg: number;
  speed: number;
  range: number;
  radius: number;
  reloadTime: number;
  color: string;
  knockback: number;
  pierce: boolean;
  explodeRadius: number;
  flightTime: number;
  arcHeight: number;
  stun: number;
  destroyWalls: boolean;
}

/** Especificação de Super de salto (tanque). */
export interface LeapSpec {
  range: number;
  duration: number;
  landRadius: number;
  landDamage: number;
  landStun: number;
  invulnerable: boolean;
}

/** Definição de Super: ataque associado e/ou salto. */
export interface SuperDef {
  attack: AttackDef;
  leap: LeapSpec | null;
}

/** Definição estática de um Brawler. */
export interface BrawlerDef {
  id: string;
  name: string;
  role: string;
  blurb: string;
  maxHp: number;
  speed: number;
  radius: number;
  bodyColor: string;
  darkColor: string;
  accentColor: string;
  attack: AttackDef;
  super: SuperDef;
  superDamageNeeded: number;
}

/** Estado do salto do Super do tanque. */
export interface JumpState {
  active: boolean;
  from: Vec2;
  to: Vec2;
  t: number;
  duration: number;
}

/** Estatísticas por partida. */
export interface EntityStats {
  kills: number;
  damageDealt: number;
  gemsCollected: number;
}

/** Entidade jogável (humano ou bot). */
export interface Entity {
  id: number;
  def: BrawlerDef;
  name: string;
  team: Team;
  isBot: boolean;
  pos: Vec2;
  vel: Vec2;
  facing: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  ammo: number;
  attackCooldown: number;
  timeSinceAttack: number;
  timeSinceDamage: number;
  regenTick: number;
  superCharge: number;
  gems: number;
  powerCubes: number;
  stunTimer: number;
  revealTimer: number;
  invulnTimer: number;
  hitFlash: number;
  alive: boolean;
  respawnTimer: number;
  eliminated: boolean;
  knockback: Vec2;
  jump: JumpState;
  aiState: AIState;
  aiTimer: number;
  aiTargetId: number;
  aiStrafeDir: number;
  wanderTarget: Vec2;
  stats: EntityStats;
}

/** Projétil em voo (linear, em cone ou parabólico). */
export interface Projectile {
  id: number;
  ownerId: number;
  ownerTeam: Team;
  kind: AttackType;
  pos: Vec2;
  vel: Vec2;
  dir: Vec2;
  start: Vec2;
  target: Vec2;
  radius: number;
  damage: number;
  speed: number;
  traveled: number;
  maxRange: number;
  life: number;
  isSuper: boolean;
  color: string;
  pierce: boolean;
  hitIds: number[];
  knockback: number;
  explodeRadius: number;
  flightTime: number;
  flightT: number;
  arcHeight: number;
  stun: number;
  destroyWalls: boolean;
  dead: boolean;
}

/** Item coletável (gema ou cubo de poder). */
export interface Pickup {
  id: number;
  kind: 'GEM' | 'POWER_CUBE';
  pos: Vec2;
  vel: Vec2;
  radius: number;
  life: number;
  bob: number;
}

/** Caixa destrutível do Showdown. */
export interface Crate {
  id: number;
  pos: Vec2;
  hp: number;
  maxHp: number;
  radius: number;
  hitFlash: number;
}

/** Partícula de efeito visual. */
export interface Particle {
  pos: Vec2;
  vel: Vec2;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  kind: 'CIRCLE' | 'SPARK' | 'SMOKE' | 'RING';
  gravity: number;
}

/** Número de dano flutuante. */
export interface Floater {
  pos: Vec2;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  vy: number;
  size: number;
}

/** Visão somente-leitura do mapa usada por física/IA/renderer. */
export interface TileMapView {
  readonly width: number;
  readonly height: number;
  readonly tileSize: number;
  getTile(tx: number, ty: number): TileType;
  isSolidAt(px: number, py: number): boolean;
  isProjectileBlockingAt(px: number, py: number): boolean;
  isBushAt(px: number, py: number): boolean;
  isWaterAt(px: number, py: number): boolean;
}

/** Estado completo do mundo da partida. */
export interface World {
  map: TileMapView;
  mode: GameMode;
  time: number;
  entities: Entity[];
  projectiles: Projectile[];
  pickups: Pickup[];
  crates: Crate[];
  particles: Particle[];
  floaters: Floater[];
  spawnPoints: Record<Team, Vec2[]>;
  gemTimer: number;
  countdown: number;
  countdownActive: boolean;
  countdownTeam: Team;
  poisonRadius: number;
  poisonTimer: number;
  poisonLevel: number;
  nextId: number;
  gameOver: boolean;
  winner: string;
  result: 'VICTORY' | 'DEFEAT';
  playerPlacement: number;
}
