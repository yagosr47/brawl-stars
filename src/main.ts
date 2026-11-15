import type {
  Brawler, Projectile, Gem, PowerCube, Particle, Tile,
  GameState, GameMode, BrawlerId, Team, GameScreen,
} from './types.js';
import { BRAWLERS, makeBrawler } from './brawlers.js';
import { TILE_SIZE, MAP_COLS, MAP_ROWS, MAP_WIDTH, MAP_HEIGHT, GAME, PHYSICS, BALANCE, lerp, clamp, dist, distSq, normalize } from './constants.js';
import { generateMap, getTileAt } from './map.js';
import { resolveCircleVsTiles, applyKnockback, updateKnockback } from './physics.js';
import { BotAI } from './ai.js';
import { playSound } from './audio.js';
import { Renderer } from './renderer.js';
import { Input } from './input.js';

let projectileIdCounter = 0;

function nextProjectileId(): number {
  projectileIdCounter++;
  return projectileIdCounter;
}

function makeProjectile(
  pos: { x: number; y: number },
  dir: { x: number; y: number },
  speed: number,
  damage: number,
  lifetime: number,
  radius: number,
  type: Projectile['type'],
  ownerTeam: Team,
  pierce: number,
  explodeRadius: number,
  lobbed: boolean,
  arcHeight: number,
): Projectile {
  return {
    id: nextProjectileId(),
    pos: { ...pos },
    vel: { x: dir.x * speed, y: dir.y * speed },
    damage,
    ownerId: -1,
    ownerTeam,
    lifetime,
    maxLifetime: lifetime,
    radius,
    type,
    speed,
    pierce,
    explosive: explodeRadius > 0,
    explodeRadius,
    lobbed,
    arcHeight,
    bounced: 0,
    markForRemoval: false,
  };
}

function createProjectile(owner: Brawler, targetPos: { x: number; y: number }): Projectile[] {
  const stats = owner.stats;
  const start = { ...owner.pos };
  const dir = normalize({ x: targetPos.x - start.x, y: targetPos.y - start.y });
  const projectiles: Projectile[] = [];

  if (owner.attackType === 'CONE' && owner.id === 'SHELLY') {
    const count = 5;
    const spread = 0.34;
    for (let i = 0; i < count; i++) {
      const t = (i - (count - 1) / 2) * spread;
      const c = Math.cos(t);
      const s = Math.sin(t);
      const d = { x: dir.x * c - dir.y * s, y: dir.x * s + dir.y * c };
      projectiles.push(makeProjectile(start, d, stats.projectileSpeed, stats.attackDamage, stats.projectileLifetime, 6, 'CONE', owner.team, 0, 0, false, 0));
    }
  } else if (owner.attackType === 'LINEAR') {
    projectiles.push(makeProjectile(start, dir, stats.projectileSpeed, stats.attackDamage, stats.projectileLifetime, 5, 'LINEAR', owner.team, 0, 0, false, 0));
  } else if (owner.attackType === 'LOBBED') {
    projectiles.push(makeProjectile(start, dir, stats.projectileSpeed, stats.attackDamage, stats.projectileLifetime, 10, 'LOBBED', owner.team, 0, 90, true, 150));
  } else if (owner.attackType === 'CONE' && owner.id === 'ELPRIMO') {
    const reach = stats.attackRange;
    projectiles.push(makeProjectile(start, dir, 0, stats.attackDamage, 0.18, reach, 'CONE', owner.team, 0, 0, false, 0));
  }

  return projectiles;
}

function createSuperProjectiles(owner: Brawler, targetPos: { x: number; y: number }): Projectile[] {
  const projectiles: Projectile[] = [];
  const start = { ...owner.pos };
  const dir = normalize({ x: targetPos.x - start.x, y: targetPos.y - start.y });

  if (owner.superType === 'PIERCE_BURST') {
    for (let i = -2; i <= 2; i++) {
      const angle = (i / 4) * 0.5;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const d = { x: dir.x * c - dir.y * s, y: dir.x * s + dir.y * c };
      projectiles.push(makeProjectile(start, d, 1500, owner.stats.superDamage, 1.4, 5, 'LINEAR', owner.team, 5, 0, false, 0));
    }
  } else if (owner.superType === 'MULTI_EXPLOSIVE') {
    const count = 8;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      projectiles.push(makeProjectile(start, { x: Math.cos(angle), y: Math.sin(angle) }, 450, owner.stats.superDamage, 2.2, 8, 'LOBBED', owner.team, 0, 70, true, 120));
    }
  }

  return projectiles;
}

function spawnGem(): Gem {
  const tx = 2 + Math.floor(Math.random() * (MAP_COLS - 4));
  const ty = 2 + Math.floor(Math.random() * (MAP_ROWS - 4));
  return { pos: { x: tx * TILE_SIZE + TILE_SIZE / 2, y: ty * TILE_SIZE + TILE_SIZE / 2 }, value: 1, collected: false };
}

function spawnPowerCube(): PowerCube {
  const tx = 2 + Math.floor(Math.random() * (MAP_COLS - 4));
  const ty = 2 + Math.floor(Math.random() * (MAP_ROWS - 4));
  return { pos: { x: tx * TILE_SIZE + TILE_SIZE / 2, y: ty * TILE_SIZE + TILE_SIZE / 2 }, collected: false };
}

export class Game {
  private canvas: HTMLCanvasElement;
  private ui: HTMLElement;
  private renderer: Renderer;
  private input: Input;
  private state: GameState;
  private mode: GameMode | null = null;
  private lastTime: number = performance.now();
  private animFrame: number | null = null;
  private running = false;
  private ai = new BotAI();
  private screen: GameScreen = 'MENU';
  private menuMode: GameMode | null = null;
  private selectedBrawler: BrawlerId | null = null;
  private toxicRadius = 0;
  private toxicDamageTimer = 0;
  private shakeTrauma = 0;
  private countdownTimer = 0;
  private showCountdown = false;
  private winner: Team | null = null;
  private gemsHeld = { BLUE: 0, RED: 0 };
  private player: Brawler | null = null;
  private playerId = 0;

  constructor() {
    this.canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    this.ui = document.getElementById('ui-overlay') as HTMLElement;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.renderer = new Renderer(this.canvas);
    this.input = new Input(this.canvas);
    this.state = this.createInitialState();
    this.input.setSuperHandler(() => this.handleSuperTap());
    this.setupUI();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.canvas.focus();
  }

  private createInitialState(): GameState {
    return {
      screen: 'MENU',
      mode: null,
      playerTeam: 'BLUE',
      playerBrawler: null,
      brawlers: [],
      projectiles: [],
      gems: [],
      powerCubes: [],
      particles: [],
      damageNumbers: [],
      tiles: generateMap(),
      mapWidth: MAP_WIDTH,
      mapHeight: MAP_HEIGHT,
      tileSize: TILE_SIZE,
      camera: { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 },
      shakeTrauma: 0,
      time: 0,
      gemSpawnTimer: 0,
      toxicCloudRadius: 0,
      winner: null,
      gemsHeld: { BLUE: 0, RED: 0 },
      gemCountdown: 0,
      showCountdown: false,
    };
  }

  private setupUI(): void {
    this.ui.innerHTML = `
      <div class="hud hidden" id="hud">
        <div class="hud-top">
          <div class="hud-player">
            <div class="hud-label">Vida</div>
            <div class="hud-health-bar"><div class="hud-health-fill" id="healthFill"></div></div>
            <div class="hud-ammo" id="ammoSlots"></div>
          </div>
          <div class="hud-super">
            <div class="hud-label">Super</div>
            <div class="hud-super-bar"><div class="hud-super-fill" id="superFill"></div></div>
            <div class="hud-super-ready" id="superReady">SUPER PRONTO</div>
          </div>
          <div class="hud-right">
            <div class="hud-mode-info">
              <div class="hud-mode-title" id="modeTitle">Modo</div>
              <div class="hud-mode-sub" id="modeSub"></div>
            </div>
            <div class="hud-gem-counter" id="gemCounter" style="display:none">
              <div class="hud-gem-icon"></div><div class="hud-gem-count" id="gemCount">0</div>
            </div>
          </div>
        </div>
        <div class="hud-bottom">
          <div class="mobile-controls" id="mobileControls">
            <div class="joystick" id="moveJoystick"><div class="joystick-knob" id="moveKnob"></div></div>
            <div class="aim-joystick" id="aimJoystick"><div class="aim-reticle" id="aimReticle"></div></div>
            <div class="action-button super" id="superBtn">SUPER</div>
          </div>
        </div>
      </div>

      <div class="screen active" id="screenMenu">
        <div class="screen-title">BRAWL ARENA</div>
        <div class="screen-subtitle">Arena Brawler Top-Down 2D</div>
        <div class="btn-row">
          <button class="btn" id="btnGemGrab">Pique-Gema (3v3)</button>
          <button class="btn btn-secondary" id="btnShowdown">Combate Solo (6p)</button>
        </div>
        <div class="game-info">WASD/Setas: mover • Mouse: mirar • Clique: atirar • Direito/Espaço: Super • F: tela cheia</div>
      </div>

      <div class="screen hidden" id="screenMode">
        <div class="screen-title">Escolha o Modo</div>
        <div class="screen-subtitle">Selecione a partida</div>
        <div class="btn-row">
          <button class="btn" id="modeGemGrab">Pique-Gema (3v3)</button>
          <button class="btn btn-secondary" id="modeShowdown">Combate Solo (Showdown)</button>
        </div>
        <button class="btn btn-secondary" style="margin-top:16px" id="btnBackMenu">Voltar</button>
      </div>

      <div class="screen hidden" id="screenBrawler">
        <div class="screen-title">Escolha o Brawler</div>
        <div class="screen-subtitle">Seu lutador na arena</div>
        <div class="brawler-grid" id="brawlerGrid"></div>
        <div class="btn-row" style="margin-top:24px; align-items:center">
          <button class="btn btn-secondary" id="brawlerBack">Voltar</button>
          <button class="btn" id="brawlerConfirm" style="margin-left:auto">Confirmar</button>
        </div>
      </div>

      <div class="screen hidden" id="screenGameOver">
        <div class="game-over-result result-victory" id="goResult">VITÓRIA</div>
        <div class="game-over-stats" id="goStats"></div>
        <div class="btn-row">
          <button class="btn" id="goMainMenu">Menu Principal</button>
        </div>
      </div>

      <div class="msg-banner" id="msgBanner"><div class="msg-text" id="msgText"></div></div>
    `;

    document.getElementById('btnGemGrab')!.addEventListener('click', () => this.selectMode('GEM_GRAB'));
    document.getElementById('btnShowdown')!.addEventListener('click', () => this.selectMode('SHOWDOWN'));
    document.getElementById('modeGemGrab')!.addEventListener('click', () => this.selectMode('GEM_GRAB'));
    document.getElementById('modeShowdown')!.addEventListener('click', () => this.selectMode('SHOWDOWN'));
    document.getElementById('btnBackMenu')!.addEventListener('click', () => this.showScreen('MENU'));
    document.getElementById('brawlerBack')!.addEventListener('click', () => this.showScreen('MODE_SELECT'));
    document.getElementById('brawlerConfirm')!.addEventListener('click', () => this.confirmBrawler());
    document.getElementById('goMainMenu')!.addEventListener('click', () => this.showScreen('MENU'));

    document.getElementById('superBtn')!.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.handleSuperTap();
    });

    this.buildBrawlerGrid();
  }

  private buildBrawlerGrid(): void {
    const grid = document.getElementById('brawlerGrid')!;
    grid.innerHTML = '';
    for (const id of Object.keys(BRAWLERS) as BrawlerId[]) {
      const def = BRAWLERS[id];
      const card = document.createElement('div');
      card.className = 'brawler-card' + (this.selectedBrawler === id ? ' selected' : '');
      card.innerHTML = `
        <div class="brawler-color-chip" style="background:${def.color}"></div>
        <div class="brawler-name">${def.name}</div>
        <div class="brawler-archetype">${def.archetype}</div>
        <div class="brawler-stats">${def.description}</div>
      `;
      card.addEventListener('click', () => {
        this.selectedBrawler = id;
        this.buildBrawlerGrid();
      });
      grid.appendChild(card);
    }
  }

  private selectMode(mode: GameMode): void {
    this.menuMode = mode;
    this.showScreen('BRAWLER_SELECT');
  }

  private confirmBrawler(): void {
    if (!this.selectedBrawler || !this.menuMode) return;
    this.startGame(this.menuMode, this.selectedBrawler);
  }

  private startGame(mode: GameMode, brawlerId: BrawlerId): void {
    this.mode = mode;
    this.selectedBrawler = brawlerId;
    this.state = this.createInitialState();
    this.state.mode = mode;
    this.state.playerTeam = 'BLUE';
    this.state.playerBrawler = brawlerId;
    this.state.tiles = generateMap();
    this.toxicRadius = 0;
    this.toxicDamageTimer = 0;
    this.gemsHeld = { BLUE: 0, RED: 0 };
    this.winner = null;
    this.countdownTimer = 0;
    this.showCountdown = false;
    this.ai = new BotAI();

    const centerX = MAP_WIDTH / 2;
    const centerY = MAP_HEIGHT / 2;

    const spawns: { x: number; y: number }[] = [
      { x: centerX - 300, y: centerY - 300 },
      { x: centerX + 300, y: centerY + 300 },
      { x: centerX - 300, y: centerY + 300 },
      { x: centerX + 300, y: centerY - 300 },
      { x: centerX - 200, y: centerY + 200 },
      { x: centerX + 200, y: centerY - 200 },
    ];

    this.player = makeBrawler(brawlerId, 'BLUE', spawns[0], false);
    this.playerId = 0;
    this.state.brawlers.push(this.player);

    const teams: Team[] = ['RED', 'RED', 'BLUE', 'BLUE', 'RED', 'BLUE'];
    const ids: BrawlerId[] = ['COLT', 'BARLEY', 'ELPRIMO', 'SHELLY', 'COLT'];
    for (let i = 1; i < 6; i++) {
      const bot = makeBrawler(ids[i - 1], teams[i - 1], spawns[i], true);
      this.state.brawlers.push(bot);
    }

    if (mode === 'GEM_GRAB') {
      this.state.gems.push(spawnGem());
    }

    if (mode === 'SHOWDOWN') {
      for (let i = 0; i < 10; i++) {
        this.state.powerCubes.push(spawnPowerCube());
      }
    }

    this.showScreen('PLAYING');
    this.lastTime = performance.now();
    if (!this.running) {
      this.running = true;
      this.animFrame = requestAnimationFrame(() => this.loop());
    }
  }

  private showScreen(screen: GameScreen): void {
    this.screen = screen;
    const ids: Record<GameScreen, string> = {
      MENU: 'screenMenu',
      MODE_SELECT: 'screenMode',
      BRAWLER_SELECT: 'screenBrawler',
      PLAYING: 'screenGameOver',
      GAME_OVER: 'screenGameOver',
    };
    for (const [s, id] of Object.entries(ids)) {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', s !== screen);
    }
    const hud = document.getElementById('hud');
    if (hud) hud.classList.toggle('hidden', screen !== 'PLAYING');
    this.state.screen = screen;
  }

  private resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.renderer.resize(this.canvas.width, this.canvas.height);
    this.input.updateLayout();
  }

  private handleSuperTap(): void {
    if (this.screen !== 'PLAYING' || !this.player) return;
    const p = this.player;
    if (p.superCharge < p.maxSuperCharge || p.isSuperActive) return;
    this.activateSuper(p);
  }

  private activateSuper(p: Brawler): void {
    p.isSuperActive = true;
    p.superActiveTime = 0;
    p.superCharge = 0;
    playSound('SUPER', 0.6);

    if (p.superType === 'WALL_BREAK') {
      const radius = 260;
      const center = { ...p.pos };
      const tilesToBreak = this.getTilesInRadius(center, radius);
      for (const t of tilesToBreak) {
        if (t.type === 'WALL_DESTRUCTIBLE') {
          t.type = 'FLOOR';
          t.hp = 0;
          this.spawnExplosionParticles({ x: t.x * TILE_SIZE + TILE_SIZE / 2, y: t.y * TILE_SIZE + TILE_SIZE / 2 }, '#94a3b8', 8);
        }
      }
      for (const b of this.state.brawlers) {
        if (b.team !== p.team && dist(b.pos, center) < radius && b.health > 0) {
          const dir = normalize({ x: b.pos.x - center.x, y: b.pos.y - center.y });
          applyKnockback(b, dir, 420, 0.5);
          this.damageBrawler(b, 400, p);
        }
      }
      playSound('WALL_BREAK', 0.6);
    } else if (p.superType === 'PIERCE_BURST') {
      const projs = createSuperProjectiles(p, { x: p.pos.x + p.facing.x * 600, y: p.pos.y + p.facing.y * 600 });
      for (const pr of projs) { pr.ownerId = this.playerId; this.state.projectiles.push(pr); }
    } else if (p.superType === 'MULTI_EXPLOSIVE') {
      const projs = createSuperProjectiles(p, { x: p.pos.x, y: p.pos.y });
      for (const pr of projs) { pr.ownerId = this.playerId; this.state.projectiles.push(pr); }
    } else if (p.superType === 'JUMP') {
      const jumpDist = 500;
      p.pos.x += p.facing.x * jumpDist;
      p.pos.y += p.facing.y * jumpDist;
      p.stunTime = PHYSICS.STUN_DURATION;
      this.spawnExplosionParticles(p.pos, '#fbbf24', 24);
      this.dealSuperJumpDamage(p);
    }
  }

  private dealSuperJumpDamage(p: Brawler): void {
    const radius = 180;
    for (const b of this.state.brawlers) {
      if (b.team === p.team || b.health <= 0) continue;
      if (dist(b.pos, p.pos) < radius) {
        b.health = Math.max(0, b.health - p.stats.superDamage);
        b.stunTime = PHYSICS.STUN_DURATION;
        applyKnockback(b, normalize({ x: b.pos.x - p.pos.x, y: b.pos.y - p.pos.y }), 300, 0.4);
        this.addDamageNumber(b.pos, Math.round(p.stats.superDamage), '#fb7185');
        if (b.health <= 0) this.onBrawlerDeath(b);
      }
    }
    playSound('IMPACT', 0.6);
  }

  private getTilesInRadius(center: { x: number; y: number }, radius: number): Tile[] {
    const found: Tile[] = [];
    const minTx = Math.floor((center.x - radius) / TILE_SIZE) - 1;
    const maxTx = Math.floor((center.x + radius) / TILE_SIZE) + 1;
    const minTy = Math.floor((center.y - radius) / TILE_SIZE) - 1;
    const maxTy = Math.floor((center.y + radius) / TILE_SIZE) + 1;
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        const t = getTileAt(this.state.tiles, tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE);
        if (t) found.push(t);
      }
    }
    return found;
  }

  private spawnExplosionParticles(pos: { x: number; y: number }, color: string, count: number): void {
    const spawned: Particle[] = [];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 90 + 30;
      const life = Math.random() * 0.4 + 0.3;
      const p: Particle = {
        pos: { ...pos },
        vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
        life,
        maxLife: life,
        color,
        size: Math.random() * 4 + 3,
      };
      spawned.push(p);
      this.state.particles.push(p);
    }
  }

  private damageBrawler(target: Brawler, amount: number, attacker: Brawler | null): void {
    if (target.health <= 0) return;
    target.health = Math.max(0, target.health - amount);
    target.revealTime = PHYSICS.BUSH_REVEAL_TIME;
    target.lastDamageTime = performance.now();
    target.regenTimer = 0;
    this.addDamageNumber(target.pos, Math.round(amount), '#fb7185');
    if (attacker) {
      attacker.superCharge = Math.min(attacker.maxSuperCharge, attacker.superCharge + BALANCE.SUPER_CHARGE_PER_HIT);
    }
    target.superCharge = Math.min(target.maxSuperCharge, target.superCharge + BALANCE.SUPER_CHARGE_PER_HIT_TAKEN);
    if (target.health <= 0) {
      this.onBrawlerDeath(target);
    } else {
      this.shakeTrauma = Math.min(1, this.shakeTrauma + 0.12);
    }
  }

  private onBrawlerDeath(b: Brawler): void {
    if (b.team === 'RED') {
      this.spawnExplosionParticles(b.pos, '#ef4444', 16);
      playSound('DEFEAT', 0.5);
    }
    if (this.mode === 'GEM_GRAB') {
      const gemsToDrop = this.gemsHeld[b.team];
      this.gemsHeld[b.team] = 0;
      for (let i = 0; i < gemsToDrop; i++) {
        const angle = Math.random() * Math.PI * 2;
        this.state.gems.push({
          pos: { x: b.pos.x + Math.cos(angle) * 8, y: b.pos.y + Math.sin(angle) * 8 },
          value: 1,
          collected: false,
        });
      }
    }
    setTimeout(() => this.respawnBrawler(b), 4000);
  }

  private respawnBrawler(b: Brawler): void {
    const centerX = MAP_WIDTH / 2;
    const centerY = MAP_HEIGHT / 2;
    const spawns: { x: number; y: number }[] = [
      { x: centerX - 300, y: centerY - 300 },
      { x: centerX + 300, y: centerY + 300 },
      { x: centerX - 300, y: centerY + 300 },
      { x: centerX + 300, y: centerY - 300 },
    ];
    const teamSpawns = b.team === 'BLUE' ? [spawns[0], spawns[2]] : [spawns[1], spawns[3]];
    const spawn = teamSpawns[Math.floor(Math.random() * teamSpawns.length)];
    b.pos = { ...spawn };
    b.vel = { x: 0, y: 0 };
    b.health = b.maxHealth;
    b.powerCubes = 0;
    b.stunTime = 0;
    b.revealTime = 0;
  }

  private addDamageNumber(pos: { x: number; y: number }, text: number | string, color: string): void {
    this.state.damageNumbers.push({
      pos: { x: pos.x, y: pos.y - 20 },
      text: String(text),
      life: 1.0,
      maxLife: 1.0,
      color,
      vel: { x: 0, y: -40 },
    });
  }

  private update(dt: number): void {
    if (this.screen !== 'PLAYING') return;
    const p = this.player;
    if (!p) return;

    this.state.time += dt;
    this.shakeTrauma = Math.max(0, this.shakeTrauma - dt * 2.5);

    this.updateInputMovement(p, dt);
    this.updateBrawler(p, dt);

    const now = performance.now();

    if (p.ammo < p.maxAmmo) {
      const sinceShot = (now - p.lastShotTime) / 1000;
      if (sinceShot >= p.stats.reloadTime) {
        const slotsToFill = Math.floor(sinceShot / p.stats.reloadTime);
        p.ammo = Math.min(p.maxAmmo, p.ammo + slotsToFill);
        p.lastShotTime = now - ((sinceShot % p.stats.reloadTime) * 1000);
      }
    }

    if (p.superCharge < p.maxSuperCharge) {
      p.superCharge = Math.min(p.maxSuperCharge, p.superCharge + dt * 16);
    }

    if ((now - p.lastDamageTime) / 1000 > PHYSICS.REGEN_DELAY && p.health < p.maxHealth) {
      p.regenTimer += dt;
      if (p.regenTimer >= PHYSICS.REGEN_INTERVAL) {
        p.regenTimer = 0;
        p.health = Math.min(p.maxHealth, p.health + p.maxHealth * PHYSICS.REGEN_AMOUNT);
      }
    }

    if (this.input.state.shootJustPressed && p.ammo > 0) {
      const aim = this.input.getAimWorldPos(this.state.camera);
      const projs = createProjectile(p, aim);
      for (const pr of projs) { pr.ownerId = this.playerId; this.state.projectiles.push(pr); }
      p.ammo--;
      p.lastShotTime = now;
      playSound('SHOT', 0.5, p.archetype);
      p.revealTime = PHYSICS.BUSH_REVEAL_TIME;
      this.shakeTrauma = Math.min(1, this.shakeTrauma + 0.08);
    }

    this.updateProjectiles(dt);
    this.updateBots(dt);
    this.updateParticles(dt);
    this.updateDamageNumbers(dt);
    this.updateGems(dt);
    this.updatePowerCubes(dt);
    this.updateToxicCloud(dt);
    this.checkWinConditions(dt);

    const camTargetX = clamp(p.pos.x, this.canvas.width / 2, MAP_WIDTH - this.canvas.width / 2);
    const camTargetY = clamp(p.pos.y, this.canvas.height / 2, MAP_HEIGHT - this.canvas.height / 2);
    this.state.camera.x = lerp(this.state.camera.x, camTargetX, dt * 8);
    this.state.camera.y = lerp(this.state.camera.y, camTargetY, dt * 8);
    this.renderer.setCamera(this.state.camera.x, this.state.camera.y);
    this.renderer.setShakeTrauma(this.shakeTrauma);
    this.renderer.updateShake(dt);

    this.updateHUD();
  }

  private updateInputMovement(p: Brawler, dt: number): void {
    if (p.stunTime > 0) return;
    const move = this.input.getMoveDir();
    let vx = move.x * p.stats.moveSpeed;
    let vy = move.y * p.stats.moveSpeed;
    if (p.knockbackTime > 0) {
      vx += p.knockbackVel.x;
      vy += p.knockbackVel.y;
    }
    p.vel = { x: vx, y: vy };
    const result = resolveCircleVsTiles(p.pos, p.radius, p.vel, this.state.tiles, TILE_SIZE);
    p.pos = result.pos;
    p.vel = result.vel;
    updateKnockback(p, dt);
    if (move.x !== 0 || move.y !== 0) {
      p.facing = move;
    }
    const tile = getTileAt(this.state.tiles, p.pos.x, p.pos.y, TILE_SIZE);
    p.inBush = tile ? (tile.type === 'BUSH') : false;
  }

  private updateBrawler(b: Brawler, dt: number): void {
    if (b.knockbackTime > 0) {
      const result = resolveCircleVsTiles(b.pos, b.radius, b.knockbackVel, this.state.tiles, TILE_SIZE);
      b.pos = result.pos;
    }
    updateKnockback(b, dt);
    if (b.stunTime > 0) b.stunTime = Math.max(0, b.stunTime - dt);
    if (b.revealTime > 0) b.revealTime = Math.max(0, b.revealTime - dt);
    if (b.isSuperActive) {
      b.superActiveTime += dt;
      if (b.superActiveTime > 2.0) b.isSuperActive = false;
    }
    const tile = getTileAt(this.state.tiles, b.pos.x, b.pos.y, TILE_SIZE);
    b.inBush = tile ? (tile.type === 'BUSH') : false;
  }

  private updateBots(dt: number): void {
    const enemies = this.state.brawlers.filter((b) => b.team !== this.player!.team && b.health > 0);
    for (const b of this.state.brawlers) {
      if (!b.isBot || b.health <= 0) continue;

      const target = this.ai.getAimTarget(b, enemies);
      if (target) {
        const d = dist(b.pos, target);
        if (d < b.stats.attackRange && b.ammo > 0) {
          const now = performance.now();
          const sinceShot = (now - b.lastShotTime) / 1000;
          if (sinceShot >= b.stats.attackCooldown) {
            const projs = createProjectile(b, target);
            for (const pr of projs) { pr.ownerId = -2; this.state.projectiles.push(pr); }
            b.ammo = Math.max(0, b.ammo - 1);
            b.lastShotTime = now;
            b.revealTime = PHYSICS.BUSH_REVEAL_TIME;
          }
        }
      }

      this.ai.update(b, dt, this.player!, enemies, this.state.projectiles, this.state.gems, this.state.powerCubes, this.state.tiles, TILE_SIZE);

      if (b.superCharge >= b.maxSuperCharge && this.ai.shouldUseSuper(b, enemies)) {
        const t = this.ai.getAimTarget(b, enemies);
        if (t && b.superType === 'JUMP') {
          b.isSuperActive = true;
          b.superActiveTime = 0;
          b.superCharge = 0;
          const dir = normalize({ x: t.x - b.pos.x, y: t.y - b.pos.y });
          const jumpDist = 400;
          b.pos.x += dir.x * jumpDist;
          b.pos.y += dir.y * jumpDist;
          b.stunTime = PHYSICS.STUN_DURATION;
          this.dealSuperJumpDamageBot(b);
        } else if (t) {
          this.activateSuper(b);
          const projs = createSuperProjectiles(b, t);
          for (const pr of projs) { pr.ownerId = -2; this.state.projectiles.push(pr); }
        }
      }
      this.updateBrawler(b, dt);
    }
  }

  private dealSuperJumpDamageBot(b: Brawler): void {
    const radius = 180;
    for (const target of this.state.brawlers) {
      if (target.team === b.team || target.health <= 0) continue;
      if (dist(target.pos, b.pos) < radius) {
        target.health = Math.max(0, target.health - b.stats.superDamage);
        target.stunTime = PHYSICS.STUN_DURATION;
        applyKnockback(target, normalize({ x: target.pos.x - b.pos.x, y: target.pos.y - b.pos.y }), 300, 0.4);
        this.addDamageNumber(target.pos, Math.round(b.stats.superDamage), '#fb7185');
        if (target.health <= 0) this.onBrawlerDeath(target);
      }
    }
    playSound('IMPACT', 0.6);
  }

  private updateProjectiles(dt: number): void {
    for (const pr of this.state.projectiles) {
      if (pr.markForRemoval) continue;
      pr.lifetime -= dt;

      if (pr.lifetime <= 0) {
        if (pr.explosive) {
          this.triggerExplosion(pr.pos, pr.explodeRadius, pr.damage, pr.ownerTeam, pr.ownerId);
        }
        pr.markForRemoval = true;
        continue;
      }

      let nextX = pr.pos.x + pr.vel.x * dt;
      let nextY = pr.pos.y + pr.vel.y * dt;

      if (pr.lobbed) {
        const progress = 1 - pr.lifetime / pr.maxLifetime;
        const arc = Math.sin(progress * Math.PI) * pr.arcHeight;
        nextY -= arc;
      }

      if (!pr.lobbed) {
        const tiles = this.getTilesAroundPoint(pr.pos, pr.radius);
        for (const t of tiles) {
          if (t.type === 'WALL_INDESTRUCTIBLE' || t.type === 'WALL_DESTRUCTIBLE') {
            const r = { x: t.x * TILE_SIZE, y: t.y * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE };
            const closestX = clamp(pr.pos.x, r.x, r.x + r.w);
            const closestY = clamp(pr.pos.y, r.y, r.y + r.h);
            const dx = pr.pos.x - closestX;
            const dy = pr.pos.y - closestY;
            if (dx * dx + dy * dy < pr.radius * pr.radius) {
              pr.markForRemoval = true;
              if (t.type === 'WALL_DESTRUCTIBLE') {
                t.hp--;
                if (t.hp <= 0) {
                  t.type = 'FLOOR';
                  playSound('WALL_BREAK', 0.4);
                } else {
                  playSound('IMPACT', 0.3);
                }
              } else {
                playSound('IMPACT', 0.3);
              }
              break;
            }
          }
        }
      }

      if (!pr.markForRemoval) {
        pr.pos = { x: nextX, y: nextY };
      }

      this.checkProjectileHits(pr);
    }

    this.state.projectiles = this.state.projectiles.filter((pr) => !pr.markForRemoval && pr.lifetime > 0);
  }

  private triggerExplosion(center: { x: number; y: number }, radius: number, damage: number, ownerTeam: Team, ownerId: number): void {
    this.spawnExplosionParticles(center, '#fbbf24', 12);
    playSound('IMPACT', 0.5);
    for (const b of this.state.brawlers) {
      if (b.health <= 0 || b.team === ownerTeam) continue;
      if (distSq(b.pos, center) < radius * radius) {
        const d = dist(b.pos, center);
        const dmg = Math.round(damage * (1 - d / radius) * 0.8 + damage * 0.2);
        b.health = Math.max(0, b.health - dmg);
        b.revealTime = PHYSICS.BUSH_REVEAL_TIME;
        b.lastDamageTime = performance.now();
        b.regenTimer = 0;
        const knockDir = normalize({ x: b.pos.x - center.x, y: b.pos.y - center.y });
        applyKnockback(b, knockDir, 200, 0.3);
        this.addDamageNumber(b.pos, String(dmg), '#fb7185');
        if (b.health <= 0) this.onBrawlerDeath(b);
      }
    }
    const attacker = this.state.brawlers.find((x) => x.team === ownerTeam && x.health > 0);
    if (attacker && ownerId >= 0) {
      attacker.superCharge = Math.min(attacker.maxSuperCharge, attacker.superCharge + BALANCE.SUPER_CHARGE_PER_HIT);
    }
  }

  private getTilesAroundPoint(pos: { x: number; y: number }, radius: number): Tile[] {
    const found: Tile[] = [];
    const minTx = Math.floor((pos.x - radius) / TILE_SIZE) - 1;
    const maxTx = Math.floor((pos.x + radius) / TILE_SIZE) + 1;
    const minTy = Math.floor((pos.y - radius) / TILE_SIZE) - 1;
    const maxTy = Math.floor((pos.y + radius) / TILE_SIZE) + 1;
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        const t = getTileAt(this.state.tiles, tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE);
        if (t) found.push(t);
      }
    }
    return found;
  }

  private checkProjectileHits(pr: Projectile): void {
    for (const b of this.state.brawlers) {
      if (b.health <= 0) continue;
      if (b.team === pr.ownerTeam) continue;
      const d = distSq(pr.pos, b.pos);
      const minDist = pr.radius + b.radius;
      if (d < minDist * minDist) {
        let damage = pr.damage;
        const player = this.player;
        if (pr.type === 'CONE' && player && pr.ownerId === this.playerId) {
          const dToOwner = dist(pr.pos, player.pos);
          damage = Math.round(damage * (1 + Math.max(0, 1 - dToOwner / (player.stats.attackRange * 1.5))));
        }
        b.health = Math.max(0, b.health - damage);
        b.revealTime = PHYSICS.BUSH_REVEAL_TIME;
        b.lastDamageTime = performance.now();
        b.regenTimer = 0;
        const knockDir = normalize({ x: b.pos.x - pr.pos.x, y: b.pos.y - pr.pos.y });
        applyKnockback(b, knockDir, 260, 0.25);
        this.addDamageNumber(b.pos, Math.round(damage), '#fb7185');
        this.spawnExplosionParticles(b.pos, '#ef4444', 4);
        playSound('IMPACT', 0.4);
        const attacker = this.state.brawlers.find((x) => x.team === pr.ownerTeam && x.health > 0);
        if (attacker) {
          attacker.superCharge = Math.min(attacker.maxSuperCharge, attacker.superCharge + BALANCE.SUPER_CHARGE_PER_HIT);
        }
        if (pr.explosive) {
          const explodeRadius = pr.explodeRadius;
          for (const t2 of this.state.brawlers) {
            if (t2 === b || t2.health <= 0 || t2.team === pr.ownerTeam) continue;
            if (distSq(t2.pos, pr.pos) < explodeRadius * explodeRadius) {
              t2.health = Math.max(0, t2.health - Math.round(damage * 0.7));
              applyKnockback(t2, normalize({ x: t2.pos.x - pr.pos.x, y: t2.pos.y - pr.pos.y }), 200, 0.3);
              this.addDamageNumber(t2.pos, Math.round(damage * 0.7), '#fb7185');
              if (t2.health <= 0) this.onBrawlerDeath(t2);
            }
          }
        }
        if (b.health <= 0) this.onBrawlerDeath(b);
        if (!pr.explosive) pr.markForRemoval = true;
        if (pr.pierce <= 0 && !pr.explosive) pr.markForRemoval = true;
        return;
      }
    }
  }

  private updateGems(dt: number): void {
    const player = this.player!;
    for (const g of this.state.gems) {
      if (g.collected) continue;
      if (distSq(player.pos, g.pos) < 30 * 30) {
        g.collected = true;
        this.gemsHeld[player.team]++;
        playSound('GEM_PICKUP', 0.5);
        this.addDamageNumber(g.pos, '+1 Gema', '#22d3ee');
        if (this.gemsHeld[player.team] >= GAME.GEMS_TO_COUNTDOWN && !this.showCountdown) {
          this.showCountdown = true;
          this.countdownTimer = GAME.GEM_COUNTDOWN_TIME;
        }
      }
    }
    this.state.gems = this.state.gems.filter((g) => !g.collected);

    this.state.gemSpawnTimer += dt;
    if (this.state.gemSpawnTimer >= GAME.GEM_SPAWN_INTERVAL && this.mode === 'GEM_GRAB') {
      this.state.gemSpawnTimer = 0;
      this.state.gems.push(spawnGem());
    }
  }

  private updatePowerCubes(dt: number): void {
    const player = this.player!;
    for (const c of this.state.powerCubes) {
      if (c.collected) continue;
      if (distSq(player.pos, c.pos) < 30 * 30) {
        c.collected = true;
        player.powerCubes++;
        player.maxHealth += GAME.SHOWDOWN_POWER_CUBE_HP;
        player.health = player.maxHealth;
        playSound('GEM_PICKUP', 0.5);
        this.addDamageNumber(c.pos, '+400 HP', '#f59e0b');
      }
    }
    this.state.powerCubes = this.state.powerCubes.filter((c) => !c.collected);
  }

  private updateToxicCloud(dt: number): void {
    if (this.mode !== 'SHOWDOWN') return;
    this.toxicDamageTimer += dt;
    const maxRadius = Math.max(MAP_WIDTH, MAP_HEIGHT) / 2 + 300;
    const closeTime = GAME.TOXIC_CLOSE_TIME;
    this.toxicRadius = Math.min(maxRadius, (this.state.time / closeTime) * maxRadius);
    if (this.toxicDamageTimer >= 1.0) {
      this.toxicDamageTimer = 0;
      const centerX = MAP_WIDTH / 2;
      const centerY = MAP_HEIGHT / 2;
      for (const b of this.state.brawlers) {
        if (b.health <= 0) continue;
        const d = dist(b.pos, { x: centerX, y: centerY });
        if (d > this.toxicRadius) {
          const damage = GAME.TOXIC_DAMAGE_PER_SECOND * (1 + (d - this.toxicRadius) / 200);
          b.health = Math.max(0, b.health - damage);
          b.revealTime = PHYSICS.BUSH_REVEAL_TIME;
          this.addDamageNumber(b.pos, Math.round(damage), '#fb7185');
          if (b.health <= 0) this.onBrawlerDeath(b);
        }
      }
    }
  }

  private updateParticles(dt: number): void {
    for (const p of this.state.particles) {
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      p.life -= dt;
    }
    this.state.particles = this.state.particles.filter((p) => p.life > 0);
  }

  private updateDamageNumbers(dt: number): void {
    for (const d of this.state.damageNumbers) {
      d.pos.x += d.vel.x * dt;
      d.pos.y += d.vel.y * dt;
      d.life -= dt;
    }
    this.state.damageNumbers = this.state.damageNumbers.filter((d) => d.life > 0);
  }

  private checkWinConditions(dt: number): void {
    if (this.mode === 'GEM_GRAB') {
      if (this.showCountdown) {
        this.countdownTimer -= dt;
        if (this.countdownTimer <= 0) {
          this.endGame(this.player!.team);
        }
      }
    }
    const aliveTeams = new Set(this.state.brawlers.filter((b) => b.health > 0).map((b) => b.team));
    if (this.mode === 'SHOWDOWN' && aliveTeams.size <= 1) {
      const winner = aliveTeams.has('BLUE') ? 'BLUE' : 'RED';
      this.endGame(winner);
    }
  }

  private endGame(winnerTeam: Team): void {
    this.winner = winnerTeam;
    this.running = false;
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    if (this.winner === this.player!.team) {
      playSound('VICTORY', 0.7);
      this.showMessage('VITÓRIA', 'msg-victory');
    } else {
      playSound('DEFEAT', 0.7);
      this.showMessage('DERROTA', 'msg-defeat');
    }
    this.showScreen('GAME_OVER');
    this.updateGameOverUI();
  }

  private showMessage(text: string, cls: string): void {
    const banner = document.getElementById('msgBanner')!;
    const msgText = document.getElementById('msgText')!;
    msgText.textContent = text;
    banner.className = 'msg-banner visible ' + cls;
    setTimeout(() => banner.classList.remove('visible'), 2500);
  }

  private updateGameOverUI(): void {
    const result = document.getElementById('goResult')!;
    const stats = document.getElementById('goStats')!;
    const player = this.player!;
    result.textContent = this.winner === player.team ? 'VITÓRIA' : 'DERROTA';
    result.className = `game-over-result ${this.winner === player.team ? 'result-victory' : 'result-defeat'}`;
    stats.innerHTML = `Gemas: ${this.gemsHeld[player.team]} • Cubos: ${player.powerCubes} • Tempo: ${Math.floor(this.state.time)}s`;
  }

  private updateHUD(): void {
    const player = this.player!;
    if (!player) return;
    const healthFill = document.getElementById('healthFill') as HTMLDivElement;
    const superFill = document.getElementById('superFill') as HTMLDivElement;
    const superReady = document.getElementById('superReady') as HTMLDivElement;
    const ammoEl = document.getElementById('ammoSlots')!;
    const modeTitle = document.getElementById('modeTitle')!;
    const modeSub = document.getElementById('modeSub')!;
    const gemCounter = document.getElementById('gemCounter')!;
    const gemCount = document.getElementById('gemCount')!;

    if (healthFill) healthFill.style.width = `${(player.health / player.maxHealth) * 100}%`;
    if (superFill) superFill.style.width = `${(player.superCharge / player.maxSuperCharge) * 100}%`;
    if (superReady) superReady.style.display = player.superCharge >= player.maxSuperCharge ? 'block' : 'none';

    ammoEl.innerHTML = '';
    for (let i = 0; i < player.maxAmmo; i++) {
      const slot = document.createElement('div');
      slot.className = `ammo-slot ${i < player.ammo ? 'ready' : 'empty'}`;
      ammoEl.appendChild(slot);
    }

    if (this.mode === 'GEM_GRAB') {
      modeTitle.textContent = 'PIQUE-GEMA';
      modeSub.textContent = 'Segure 10+ gemas para iniciar a contagem';
      gemCounter.style.display = 'flex';
      gemCount.textContent = String(this.gemsHeld[player.team]);
    } else {
      modeTitle.textContent = 'COMBATE SOLO';
      modeSub.textContent = 'Colete cubos de poder e sobreviva';
      gemCounter.style.display = 'none';
    }
  }

  private render(): void {
    const ctx = this.renderer;
    ctx.clear();

    ctx.renderMap(this.state.tiles, TILE_SIZE, this.state.camera);
    ctx.renderShadows(this.state.brawlers);
    ctx.renderBrawlers(this.state.brawlers, this.playerId, TILE_SIZE, this.state.tiles);
    ctx.renderProjectiles(this.state.projectiles);
    ctx.renderGems(this.state.gems);
    ctx.renderPowerCubes(this.state.powerCubes);
    ctx.renderParticles(this.state.particles);
    ctx.renderDamageNumbers(this.state.damageNumbers);

    const player = this.player;
    if (player) {
      const aim = this.input.getAimWorldPos(this.state.camera);
      ctx.renderAimReticle(aim as { x: number; y: number }, player, this.state.camera);
      ctx.renderHealthBar(player, this.state.camera);
      ctx.renderAmmoSlots(player, this.state.camera);
      ctx.renderSuperCharge(player, this.state.camera);
      ctx.renderBushOverlay(player, this.state.tiles, TILE_SIZE);
    }
  }

  private loop(): void {
    const now = performance.now();
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    dt = Math.min(dt, 0.05);

    this.update(dt);
    this.render();

    if (this.running) {
      this.animFrame = requestAnimationFrame(() => this.loop());
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new Game();
});
