/* ============================================================
   ARENA BRAWLER — Game loop, telas, modos de jogo e HUD
   ============================================================ */

import './style.css';
import type { AttackDef, Entity, GameMode, GameScreen, Projectile, Vec2, World } from './types';
import {
  ATTACK_COOLDOWN,
  AUTO_AIM_EXTRA_RANGE,
  CAMERA_LERP,
  COLOR,
  CRATE_HP,
  FIXED_DT_MAX,
  GEM_COUNTDOWN_TIME,
  GEM_RESPAWN_TIME,
  GEM_SPAWN_INTERVAL,
  GEM_WIN_COUNT,
  MAP_TILES_X,
  MAP_TILES_Y,
  MAX_AMMO,
  PICKUP_MAGNET,
  PICKUP_RADIUS,
  POISON_BASE_DPS,
  POISON_DAMAGE_TICK,
  POISON_DPS_GROWTH,
  POISON_START_DELAY,
  POISON_STEP_INTERVAL,
  POWER_CUBE_DMG_BONUS,
  POWER_CUBE_HP_BONUS,
  REGEN_DELAY,
  REGEN_INTERVAL,
  REGEN_PERCENT,
  SHAKE_DECAY,
  SHOWDOWN_CRATE_COUNT,
  VIEW_HEIGHT,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  clamp,
  deg2rad,
  dist,
  lerp,
  normalize,
  pick,
  randRange,
} from './constants';
import { BRAWLERS, BRAWLER_ICONS, BRAWLER_IDS, BOT_NAMES } from './brawlers';
import { GameMap, getMapCenter, getSpawns } from './map';
import {
  applyKnockback,
  isEntityVisible,
  moveEntity,
  projectileHitsTile,
  resolveCircleTiles,
  revealEntity,
} from './physics';
import { AudioEngine } from './audio';
import { InputManager, toggleFullscreen } from './input';
import { updateBotAI, type AIContext } from './ai';
import { Renderer, type Camera } from './renderer';

/* ============================ HELPERS ============================ */

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Elemento #${id} não encontrado`);
  return node as T;
}

function createEntity(
  def: Entity['def'],
  name: string,
  team: Entity['team'],
  isBot: boolean,
  pos: Vec2,
  id: number,
): Entity {
  return {
    id,
    def,
    name,
    team,
    isBot,
    pos: { x: pos.x, y: pos.y },
    vel: { x: 0, y: 0 },
    facing: team === 'RED' ? Math.PI : 0,
    radius: def.radius,
    hp: def.maxHp,
    maxHp: def.maxHp,
    speed: def.speed,
    ammo: MAX_AMMO,
    attackCooldown: 0,
    timeSinceAttack: 99,
    timeSinceDamage: 99,
    regenTick: 0,
    superCharge: 0,
    gems: 0,
    powerCubes: 0,
    stunTimer: 0,
    revealTimer: 0,
    invulnTimer: 1,
    hitFlash: 0,
    alive: true,
    respawnTimer: 0,
    eliminated: false,
    knockback: { x: 0, y: 0 },
    jump: { active: false, from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, t: 0, duration: 1 },
    aiState: 'IDLE',
    aiTimer: 0,
    aiTargetId: -1,
    aiStrafeDir: Math.random() < 0.5 ? 1 : -1,
    wanderTarget: { x: pos.x, y: pos.y },
    stats: { kills: 0, damageDealt: 0, gemsCollected: 0 },
  };
}

/* ============================ GAME ============================ */

class Game {
  private canvas = el<HTMLCanvasElement>('game-canvas');
  private renderer: Renderer;
  private input: InputManager;
  private audio = new AudioEngine();

  private map: GameMap | null = null;
  private world: World | null = null;
  private player: Entity | null = null;
  private cam: Camera = { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2, zoom: 1, trauma: 0 };
  private camTarget: Vec2 = { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };

  private screen: GameScreen = 'MENU';
  private selectedMode: GameMode = 'GEM_GRAB';
  private selectedBrawler = 'scarlet';
  private lastTime = performance.now();
  private poisonDmgAcc = 0;

  private aiCtx: AIContext = {
    fire: (e, angle, useSuper, targetPos) => this.fireWeapon(e, angle, useSuper, targetPos),
  };

  constructor() {
    this.renderer = new Renderer(this.canvas);
    this.input = new InputManager(this.canvas, el('super-btn'));
  }

  init(): void {
    this.buildBrawlerGrid();
    this.wireUI();
    this.setScreen('MENU');
    requestAnimationFrame(this.loop);
  }

  /* ----------------------- UI / Telas ----------------------- */

  private wireUI(): void {
    const muteBtn = el<HTMLButtonElement>('btn-mute');
    const fsBtn = el<HTMLButtonElement>('btn-fs');

    el('btn-play').addEventListener('click', () => {
      this.audio.unlock();
      this.audio.uiClick();
      this.setScreen('MODE_SELECT');
    });

    document.querySelectorAll<HTMLButtonElement>('.mode-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.audio.unlock();
        this.audio.uiClick();
        this.selectedMode = btn.dataset.mode === 'SHOWDOWN' ? 'SHOWDOWN' : 'GEM_GRAB';
        this.setScreen('BRAWLER_SELECT');
      });
    });

    el('btn-back-menu').addEventListener('click', () => {
      this.audio.uiClick();
      this.setScreen('MENU');
    });
    el('btn-back-mode').addEventListener('click', () => {
      this.audio.uiClick();
      this.setScreen('MODE_SELECT');
    });
    el('btn-fight').addEventListener('click', () => {
      this.audio.unlock();
      this.audio.uiClick();
      this.startMatch();
    });
    el('btn-again').addEventListener('click', () => {
      this.audio.uiClick();
      this.startMatch();
    });
    el('btn-go-menu').addEventListener('click', () => {
      this.audio.uiClick();
      this.setScreen('MENU');
    });

    muteBtn.addEventListener('click', () => {
      this.audio.unlock();
      this.audio.setEnabled(!this.audio.enabled);
      muteBtn.textContent = this.audio.enabled ? '🔊' : '🔇';
    });
    fsBtn.addEventListener('click', () => {
      this.audio.uiClick();
      toggleFullscreen();
    });

    window.addEventListener('pointerdown', () => this.audio.unlock(), { once: true });
    window.addEventListener('keydown', () => this.audio.unlock(), { once: true });
  }

  private setScreen(screen: GameScreen): void {
    this.screen = screen;
    const map: Record<GameScreen, string> = {
      MENU: 'screen-menu',
      MODE_SELECT: 'screen-mode',
      BRAWLER_SELECT: 'screen-brawler',
      PLAYING: 'screen-playing',
      GAME_OVER: 'screen-gameover',
    };
    for (const id of ['screen-menu', 'screen-mode', 'screen-brawler', 'screen-gameover']) {
      el(id).classList.add('hidden');
    }
    const target = map[screen];
    if (target !== 'screen-playing') el(target).classList.remove('hidden');
  }

  private buildBrawlerGrid(): void {
    const grid = el('brawler-grid');
    grid.innerHTML = '';
    for (const id of BRAWLER_IDS) {
      const def = BRAWLERS[id];
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'brawler-card' + (id === this.selectedBrawler ? ' selected' : '');
      const hpPct = clamp((def.maxHp / 7000) * 100, 10, 100);
      const dmgPct = clamp(((def.attack.damage * def.attack.projectileCount) / 1300) * 100, 10, 100);
      const rangePct = clamp((def.attack.range / 430) * 100, 10, 100);
      card.innerHTML = `
        <div class="brawler-avatar" style="background:${def.bodyColor}">${BRAWLER_ICONS[id]}</div>
        <div class="brawler-name">${def.name}</div>
        <div class="brawler-role">${def.role}</div>
        <div class="brawler-blurb">${def.blurb}</div>
        <div class="brawler-stat"><span>❤️</span><div class="stat-bar"><i style="width:${hpPct}%"></i></div></div>
        <div class="brawler-stat"><span>⚔️</span><div class="stat-bar"><i style="width:${dmgPct}%"></i></div></div>
        <div class="brawler-stat"><span>🎯</span><div class="stat-bar"><i style="width:${rangePct}%"></i></div></div>
      `;
      card.addEventListener('click', () => {
        this.audio.unlock();
        this.audio.uiClick();
        this.selectedBrawler = id;
        this.buildBrawlerGrid();
      });
      grid.appendChild(card);
    }
  }

  /* ----------------------- Partida ----------------------- */

  private startMatch(): void {
    const map = new GameMap();
    this.map = map;
    const spawns = getSpawns(this.selectedMode);
    const world: World = {
      map,
      mode: this.selectedMode,
      time: 0,
      entities: [],
      projectiles: [],
      pickups: [],
      crates: [],
      particles: [],
      floaters: [],
      spawnPoints: spawns,
      gemTimer: GEM_SPAWN_INTERVAL * 0.4,
      countdown: 0,
      countdownActive: false,
      countdownTeam: 'NEUTRAL',
      poisonRadius: Math.max(MAP_TILES_X, MAP_TILES_Y) / 2 + 2,
      poisonTimer: 0,
      poisonLevel: 0,
      nextId: 1,
      gameOver: false,
      winner: '',
      result: 'DEFEAT',
      playerPlacement: 0,
    };
    this.world = world;
    this.poisonDmgAcc = 0;

    const playerDef = BRAWLERS[this.selectedBrawler];
    const otherIds = BRAWLER_IDS.filter((id) => id !== this.selectedBrawler);
    let playerEntity: Entity;

    if (world.mode === 'GEM_GRAB') {
      playerEntity = createEntity(playerDef, 'Você', 'BLUE', false, spawns.BLUE[0], world.nextId++);
      world.entities.push(playerEntity);
      for (let i = 0; i < 2; i++) {
        const def = BRAWLERS[otherIds[i % otherIds.length]];
        world.entities.push(
          createEntity(def, pick(BOT_NAMES), 'BLUE', true, spawns.BLUE[i + 1], world.nextId++),
        );
      }
      for (let i = 0; i < 3; i++) {
        const def = BRAWLERS[pick(otherIds)];
        world.entities.push(
          createEntity(def, pick(BOT_NAMES), 'RED', true, spawns.RED[i], world.nextId++),
        );
      }
    } else {
      playerEntity = createEntity(playerDef, 'Você', 'NEUTRAL', false, spawns.NEUTRAL[0], world.nextId++);
      world.entities.push(playerEntity);
      for (let i = 1; i < spawns.NEUTRAL.length; i++) {
        const def = BRAWLERS[pick(otherIds)];
        world.entities.push(
          createEntity(def, pick(BOT_NAMES), 'NEUTRAL', true, spawns.NEUTRAL[i], world.nextId++),
        );
      }
      const spots = map.findCrateSpots(SHOWDOWN_CRATE_COUNT);
      for (const s of spots) {
        world.crates.push({
          id: world.nextId++,
          pos: { x: s.x, y: s.y },
          hp: CRATE_HP,
          maxHp: CRATE_HP,
          radius: 22,
          hitFlash: 0,
        });
      }
    }

    this.player = playerEntity;
    this.cam.x = playerEntity.pos.x;
    this.cam.y = playerEntity.pos.y;
    this.cam.trauma = 0;
    this.camTarget = { x: playerEntity.pos.x, y: playerEntity.pos.y };
    this.setScreen('PLAYING');
  }

  /* ----------------------- Game loop ----------------------- */

  private loop = (now: number): void => {
    requestAnimationFrame(this.loop);
    const dt = Math.min((now - this.lastTime) / 1000, FIXED_DT_MAX);
    this.lastTime = now;

    if (this.screen === 'PLAYING' && this.world && !this.world.gameOver) {
      this.update(dt);
    } else if (this.world) {
      this.cam.trauma = Math.max(0, this.cam.trauma - SHAKE_DECAY * dt);
    }
    this.render();
    this.updateHUD();
  };

  private render(): void {
    const showAim =
      this.screen === 'PLAYING' &&
      !!this.player &&
      this.player.alive &&
      (this.input.aiming || (this.input.mouse.active && !this.input.touchMode));
    this.renderer.draw(this.world, this.player, this.cam, this.input, showAim);
  }

  /* ----------------------- Update ----------------------- */

  private update(dt: number): void {
    const world = this.world;
    const player = this.player;
    const map = this.map;
    if (!world || !player || !map) return;

    world.time += dt;
    this.input.poll();

    if (player.alive && !player.eliminated) {
      this.handlePlayerInput();
    } else {
      // Descarta ações enfileiradas enquanto morto (evita disparo fantasma no respawn).
      this.input.takeFire();
      this.input.takeSuper();
    }

    for (const e of world.entities) {
      if (e.isBot && e.alive && !e.eliminated) updateBotAI(e, world, this.aiCtx, dt);
    }

    for (const e of world.entities) this.updateEntityTimers(e, dt);

    for (const e of world.entities) {
      if (!e.alive || e.eliminated) continue;
      if (e.jump.active) {
        this.updateJump(e, dt);
      } else {
        moveEntity(e, dt, world.map);
      }
    }

    this.updateProjectiles(dt);
    this.updatePickups(dt);
    this.updateParticles(dt);
    this.updateCrates(dt);
    this.updateRespawns(dt);
    this.updateGemGrab(dt);
    this.updateShowdown(dt);
    this.updateCamera(dt);
  }

  private updateEntityTimers(e: Entity, dt: number): void {
    e.stunTimer = Math.max(0, e.stunTimer - dt);
    e.revealTimer = Math.max(0, e.revealTimer - dt);
    e.invulnTimer = Math.max(0, e.invulnTimer - dt);
    e.hitFlash = Math.max(0, e.hitFlash - dt);
    e.attackCooldown = Math.max(0, e.attackCooldown - dt);
    e.timeSinceAttack += dt;
    e.timeSinceDamage += dt;

    if (!e.alive || e.eliminated) return;

    // Recarga contínua de munição (3 barras individuais)
    if (e.ammo < MAX_AMMO) {
      e.ammo = Math.min(MAX_AMMO, e.ammo + dt / e.def.attack.reloadTime);
    }

    // Regeneração passiva
    if (
      e.timeSinceAttack >= REGEN_DELAY &&
      e.timeSinceDamage >= REGEN_DELAY &&
      e.hp < e.maxHp
    ) {
      e.regenTick += dt;
      if (e.regenTick >= REGEN_INTERVAL) {
        e.regenTick = 0;
        const heal = e.maxHp * REGEN_PERCENT;
        e.hp = Math.min(e.maxHp, e.hp + heal);
        this.addFloater(e.pos.x, e.pos.y - e.radius - 14, `+${Math.round(heal)}`, COLOR.healText, 14);
      }
    } else {
      e.regenTick = 0;
    }
  }

  /* ----------------------- Input do jogador ----------------------- */

  private handlePlayerInput(): void {
    const player = this.player;
    const world = this.world;
    if (!player || !world) return;

    // Mira via mouse (PC)
    if (!this.input.aimStick.active && this.input.mouse.active && !this.input.touchMode) {
      const wx = this.cam.x + (this.input.mouse.x - this.renderer.viewWidth / 2) / this.cam.zoom;
      const wy = this.cam.y + (this.input.mouse.y - this.renderer.viewHeight / 2) / this.cam.zoom;
      const n = normalize(wx - player.pos.x, wy - player.pos.y);
      if (n.x !== 0 || n.y !== 0) {
        this.input.aimVec = n;
        this.input.aiming = true;
      }
    }

    // Movimento
    if (player.stunTimer <= 0 && !player.jump.active) {
      player.vel.x = this.input.moveVec.x * player.speed;
      player.vel.y = this.input.moveVec.y * player.speed;
      if ((this.input.moveVec.x !== 0 || this.input.moveVec.y !== 0) && !this.input.aiming) {
        player.facing = Math.atan2(this.input.moveVec.y, this.input.moveVec.x);
      }
    } else {
      player.vel.x = 0;
      player.vel.y = 0;
    }
    if (this.input.aiming) {
      player.facing = Math.atan2(this.input.aimVec.y, this.input.aimVec.x);
    }

    // Tiro normal
    const fire = this.input.takeFire();
    if (fire.queued) {
      let angle = Math.atan2(this.input.aimVec.y, this.input.aimVec.x);
      let targetPos: Vec2 | undefined;
      if (fire.autoAim) {
        const t = this.findAutoAimTarget(player, player.def.attack.range + AUTO_AIM_EXTRA_RANGE);
        if (t) {
          targetPos = { x: t.pos.x, y: t.pos.y };
          angle = Math.atan2(t.pos.y - player.pos.y, t.pos.x - player.pos.x);
        }
      }
      this.fireWeapon(player, angle, false, targetPos);
    }

    // Super
    const sup = this.input.takeSuper();
    if (sup.queued) {
      const leap = player.def.super.leap;
      const superRange = leap ? leap.range : player.def.super.attack.range;
      let angle = Math.atan2(this.input.aimVec.y, this.input.aimVec.x);
      let targetPos: Vec2 | undefined;
      const wantsAuto = sup.autoAim || (sup.aim.x === 0 && sup.aim.y === 0 && !this.input.mouse.active);
      if (wantsAuto) {
        const t = this.findAutoAimTarget(player, superRange + AUTO_AIM_EXTRA_RANGE);
        if (t) {
          targetPos = { x: t.pos.x, y: t.pos.y };
          angle = Math.atan2(t.pos.y - player.pos.y, t.pos.x - player.pos.x);
        }
      }
      if (sup.aim.x !== 0 || sup.aim.y !== 0) {
        angle = Math.atan2(sup.aim.y, sup.aim.x);
      }
      this.fireWeapon(player, angle, true, targetPos);
    }
  }

  private findAutoAimTarget(e: Entity, maxRange: number): Entity | null {
    const world = this.world;
    if (!world) return null;
    let best: Entity | null = null;
    let bestD = maxRange;
    for (const o of world.entities) {
      if (o.id === e.id || !o.alive || o.eliminated) continue;
      if (world.mode !== 'SHOWDOWN' && o.team === e.team) continue;
      if (!isEntityVisible(o, e, world)) continue;
      const d = dist(e.pos.x, e.pos.y, o.pos.x, o.pos.y);
      if (d < bestD + o.radius) {
        bestD = d;
        best = o;
      }
    }
    return best;
  }

  /* ----------------------- Combate ----------------------- */

  private fireWeapon(e: Entity, angle: number, useSuper: boolean, targetPos?: Vec2): void {
    const world = this.world;
    if (!world || !e.alive || e.eliminated || e.stunTimer > 0 || e.jump.active) return;

    if (useSuper) {
      if (e.superCharge < 1) return;
      const leap = e.def.super.leap;
      e.superCharge = 0;
      revealEntity(e);
      if (leap) {
        const dir = { x: Math.cos(angle), y: Math.sin(angle) };
        let leapDist = leap.range;
        if (targetPos) {
          leapDist = Math.min(
            leap.range,
            dist(e.pos.x, e.pos.y, targetPos.x, targetPos.y),
          );
        }
        e.jump = {
          active: true,
          from: { x: e.pos.x, y: e.pos.y },
          to: { x: e.pos.x + dir.x * leapDist, y: e.pos.y + dir.y * leapDist },
          t: 0,
          duration: leap.duration,
        };
        e.invulnTimer = Math.max(e.invulnTimer, leap.duration);
        this.audio.leap();
      } else {
        e.timeSinceAttack = 0;
        this.spawnAttack(e, e.def.super.attack, angle, true, targetPos);
        this.audio.shootSuper();
      }
      return;
    }

    if (e.ammo < 1 || e.attackCooldown > 0) return;
    e.ammo -= 1;
    e.attackCooldown = ATTACK_COOLDOWN;
    e.timeSinceAttack = 0;
    revealEntity(e);
    this.spawnAttack(e, e.def.attack, angle, false, targetPos);
    this.audio.shoot(e.def.id);
  }

  private spawnAttack(
    e: Entity,
    def: AttackDef,
    angle: number,
    isSuper: boolean,
    targetPos?: Vec2,
  ): void {
    const world = this.world;
    if (!world) return;
    const count = def.projectileCount;
    for (let i = 0; i < count; i++) {
      const spreadFrac = count <= 1 ? 0 : (i / (count - 1) - 0.5) * deg2rad(def.spreadDeg);
      const a = angle + spreadFrac;
      const dir = { x: Math.cos(a), y: Math.sin(a) };
      const id = world.nextId++;

      const base: Projectile = {
        id,
        ownerId: e.id,
        ownerTeam: e.team,
        kind: def.type,
        pos: {
          x: e.pos.x + dir.x * (e.radius + def.radius * 0.5 + 4),
          y: e.pos.y + dir.y * (e.radius + def.radius * 0.5 + 4),
        },
        vel: { x: dir.x * def.speed, y: dir.y * def.speed },
        dir,
        start: { x: e.pos.x, y: e.pos.y },
        target: { x: e.pos.x + dir.x * def.range, y: e.pos.y + dir.y * def.range },
        radius: def.radius,
        damage: def.damage * (1 + POWER_CUBE_DMG_BONUS * e.powerCubes),
        speed: def.speed,
        traveled: 0,
        maxRange: def.range,
        life: 6,
        isSuper,
        color: def.color,
        pierce: def.pierce,
        hitIds: [],
        knockback: def.knockback,
        explodeRadius: def.explodeRadius,
        flightTime: def.flightTime,
        flightT: 0,
        arcHeight: def.arcHeight,
        stun: def.stun,
        destroyWalls: def.destroyWalls,
        dead: false,
      };

      if (def.type === 'LOBBED') {
        let tx = e.pos.x + dir.x * def.range;
        let ty = e.pos.y + dir.y * def.range;
        if (targetPos) {
          const baseA = Math.atan2(targetPos.y - e.pos.y, targetPos.x - e.pos.x);
          const d = Math.min(dist(e.pos.x, e.pos.y, targetPos.x, targetPos.y), def.range);
          const perpX = -Math.sin(baseA);
          const perpY = Math.cos(baseA);
          const off = spreadFrac * def.range * 1.2;
          tx = e.pos.x + Math.cos(baseA) * d + perpX * off;
          ty = e.pos.y + Math.sin(baseA) * d + perpY * off;
        }
        base.start = { x: e.pos.x, y: e.pos.y };
        base.target = { x: tx, y: ty };
        base.pos = { x: e.pos.x, y: e.pos.y };
        base.vel = { x: 0, y: 0 };
      }
      world.projectiles.push(base);
    }
  }

  private updateProjectiles(dt: number): void {
    const world = this.world;
    const map = this.map;
    if (!world || !map) return;

    for (const p of world.projectiles) {
      if (p.dead) continue;

      if (p.kind === 'LOBBED') {
        p.flightT += dt;
        const t = clamp(p.flightT / Math.max(0.001, p.flightTime), 0, 1);
        p.pos.x = lerp(p.start.x, p.target.x, t);
        p.pos.y = lerp(p.start.y, p.target.y, t);
        if (t >= 1) {
          this.explodeAt(p);
          p.dead = true;
        }
        continue;
      }

      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      p.traveled += p.speed * dt;
      p.life -= dt;

      // Tiles
      if (projectileHitsTile(world.map, p.pos.x, p.pos.y)) {
        if (p.destroyWalls && map.destroyTileAt(p.pos.x, p.pos.y)) {
          this.audio.wallBreak();
          this.burst(p.pos.x, p.pos.y, COLOR.breakableTop, 10);
          this.addTrauma(0.32);
        } else {
          this.burst(p.pos.x, p.pos.y, p.color, 5);
        }
        if (!p.pierce) {
          p.dead = true;
          continue;
        }
      }

      // Caixas
      for (const c of world.crates) {
        if (c.hp <= 0) continue;
        if (dist(p.pos.x, p.pos.y, c.pos.x, c.pos.y) < p.radius + c.radius) {
          this.damageCrate(c, p.damage);
          if (!p.pierce) {
            p.dead = true;
          }
          break;
        }
      }
      if (p.dead) continue;

      // Entidades
      for (const e of world.entities) {
        if (!e.alive || e.eliminated || e.id === p.ownerId) continue;
        if (p.hitIds.includes(e.id)) continue;
        if (world.mode !== 'SHOWDOWN' && e.team === p.ownerTeam) continue;
        if (e.jump.active && e.invulnTimer > 0) continue;
        if (dist(p.pos.x, p.pos.y, e.pos.x, e.pos.y) < p.radius + e.radius) {
          p.hitIds.push(e.id);
          const owner = world.entities.find((o) => o.id === p.ownerId) ?? null;
          this.damageEntity(e, p.damage, owner);
          if (p.knockback > 0) applyKnockback(e, p.dir.x, p.dir.y, p.knockback);
          if (p.stun > 0) e.stunTimer = Math.max(e.stunTimer, p.stun);
          this.burst(p.pos.x, p.pos.y, p.color, 6);
          if (!p.pierce) {
            p.dead = true;
            break;
          }
        }
      }

      if (p.traveled >= p.maxRange || p.life <= 0) {
        if (p.explodeRadius > 0) this.explodeAt(p);
        else this.burst(p.pos.x, p.pos.y, p.color, 3);
        p.dead = true;
      }
    }
    world.projectiles = world.projectiles.filter((p) => !p.dead);
  }

  private explodeAt(p: Projectile): void {
    const world = this.world;
    const map = this.map;
    if (!world || !map) return;

    this.audio.explosion();
    this.addTrauma(p.isSuper ? 0.7 : 0.45);
    this.burstRing(p.pos.x, p.pos.y, p.color, p.explodeRadius);

    if (p.destroyWalls) {
      const destroyed = map.destroyTilesInRadius(p.pos.x, p.pos.y, p.explodeRadius);
      if (destroyed > 0) this.audio.wallBreak();
    }

    const owner = world.entities.find((o) => o.id === p.ownerId) ?? null;
    for (const e of world.entities) {
      if (!e.alive || e.eliminated || e.id === p.ownerId) continue;
      if (world.mode !== 'SHOWDOWN' && e.team === p.ownerTeam) continue;
      if (e.jump.active && e.invulnTimer > 0) continue;
      const d = dist(p.pos.x, p.pos.y, e.pos.x, e.pos.y);
      if (d <= p.explodeRadius + e.radius) {
        this.damageEntity(e, p.damage, owner);
        applyKnockback(e, e.pos.x - p.pos.x, e.pos.y - p.pos.y, p.knockback);
      }
    }
    for (const c of world.crates) {
      if (c.hp <= 0) continue;
      if (dist(p.pos.x, p.pos.y, c.pos.x, c.pos.y) <= p.explodeRadius + c.radius) {
        this.damageCrate(c, p.damage * 1.2);
      }
    }
  }

  private damageEntity(target: Entity, amount: number, attacker: Entity | null): void {
    const world = this.world;
    if (!world || !target.alive || target.eliminated) return;
    if (target.invulnTimer > 0) return;

    let dmg = amount;
    if (attacker && attacker.id !== target.id) {
      dmg *= 1 + POWER_CUBE_DMG_BONUS * attacker.powerCubes;
    }
    const rounded = Math.max(1, Math.round(dmg));
    target.hp -= rounded;
    target.timeSinceDamage = 0;
    target.hitFlash = 0.12;
    revealEntity(target);

    if (attacker && attacker.id !== target.id) {
      attacker.stats.damageDealt += rounded;
      attacker.superCharge = clamp(
        attacker.superCharge + rounded / attacker.def.superDamageNeeded,
        0,
        1,
      );
    }

    this.addFloater(
      target.pos.x + randRange(-8, 8),
      target.pos.y - target.radius - 10,
      `${rounded}`,
      COLOR.damageText,
      17,
    );
    this.audio.hit();

    if (target.hp <= 0) {
      this.killEntity(target, attacker);
    }
  }

  private killEntity(target: Entity, attacker: Entity | null): void {
    const world = this.world;
    if (!world) return;
    target.hp = 0;
    target.alive = false;
    target.vel = { x: 0, y: 0 };
    this.burst(target.pos.x, target.pos.y, target.def.bodyColor, 18);
    this.burstRing(target.pos.x, target.pos.y, '#ffffff', 40);
    if (attacker && attacker.id !== target.id) attacker.stats.kills += 1;

    // Derruba gemas com física de espalhamento
    const droppedGems = target.gems;
    for (let i = 0; i < droppedGems; i++) {
      const a = (i / Math.max(1, droppedGems)) * Math.PI * 2 + randRange(-0.4, 0.4);
      world.pickups.push({
        id: world.nextId++,
        kind: 'GEM',
        pos: { x: target.pos.x, y: target.pos.y },
        vel: { x: Math.cos(a) * randRange(90, 190), y: Math.sin(a) * randRange(90, 190) },
        radius: PICKUP_RADIUS,
        life: 9999,
        bob: Math.random() * 6,
      });
    }
    target.gems = 0;

    // Derruba cubos de poder (Showdown)
    for (let i = 0; i < target.powerCubes; i++) {
      const a = Math.random() * Math.PI * 2;
      world.pickups.push({
        id: world.nextId++,
        kind: 'POWER_CUBE',
        pos: { x: target.pos.x, y: target.pos.y },
        vel: { x: Math.cos(a) * randRange(80, 160), y: Math.sin(a) * randRange(80, 160) },
        radius: PICKUP_RADIUS,
        life: 9999,
        bob: Math.random() * 6,
      });
    }
    target.powerCubes = 0;

    if (world.mode === 'GEM_GRAB') {
      target.respawnTimer = GEM_RESPAWN_TIME;
    } else {
      target.eliminated = true;
    }
  }

  private damageCrate(c: World['crates'][number], amount: number): void {
    if (c.hp <= 0) return;
    c.hp -= amount;
    c.hitFlash = 0.1;
    this.burst(c.pos.x, c.pos.y, COLOR.crate, 4);
    if (c.hp <= 0) {
      c.hp = 0;
      this.audio.wallBreak();
      this.burst(c.pos.x, c.pos.y, COLOR.crateDark, 12);
      this.burstRing(c.pos.x, c.pos.y, COLOR.cube, 30);
      const world = this.world;
      if (!world) return;
      const cubes = 1 + (Math.random() < 0.35 ? 1 : 0);
      for (let i = 0; i < cubes; i++) {
        const a = Math.random() * Math.PI * 2;
        world.pickups.push({
          id: world.nextId++,
          kind: 'POWER_CUBE',
          pos: { x: c.pos.x, y: c.pos.y },
          vel: { x: Math.cos(a) * randRange(60, 130), y: Math.sin(a) * randRange(60, 130) },
          radius: PICKUP_RADIUS,
          life: 9999,
          bob: Math.random() * 6,
        });
      }
    }
  }

  private updateJump(e: Entity, dt: number): void {
    const world = this.world;
    if (!world || !e.jump.active) return;
    e.jump.t += dt;
    const k = clamp(e.jump.t / e.jump.duration, 0, 1);
    e.pos.x = lerp(e.jump.from.x, e.jump.to.x, k);
    e.pos.y = lerp(e.jump.from.y, e.jump.to.y, k);
    if (k >= 1) {
      e.jump.active = false;
      const leap = e.def.super.leap;
      if (leap) {
        this.audio.land();
        this.addTrauma(0.55);
        this.burstRing(e.pos.x, e.pos.y, e.def.accentColor, leap.landRadius);
        this.burst(e.pos.x, e.pos.y, e.def.accentColor, 14);
        for (const o of world.entities) {
          if (!o.alive || o.eliminated || o.id === e.id) continue;
          if (world.mode !== 'SHOWDOWN' && o.team === e.team) continue;
          const d = dist(e.pos.x, e.pos.y, o.pos.x, o.pos.y);
          if (d <= leap.landRadius + o.radius) {
            this.damageEntity(o, leap.landDamage * (1 + POWER_CUBE_DMG_BONUS * e.powerCubes), e);
            o.stunTimer = Math.max(o.stunTimer, leap.landStun);
            applyKnockback(o, o.pos.x - e.pos.x, o.pos.y - e.pos.y, 260);
          }
        }
      }
    }
  }

  /* ----------------------- Itens / partículas ----------------------- */

  private updatePickups(dt: number): void {
    const world = this.world;
    const map = this.map;
    if (!world || !map) return;

    for (const p of world.pickups) {
      if (p.life <= 0) continue;
      p.bob += dt * 2;
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      resolveCircleTiles(p.pos, p.radius, map);
      const decay = Math.exp(-4.2 * dt);
      p.vel.x *= decay;
      p.vel.y *= decay;

      for (const e of world.entities) {
        if (!e.alive || e.eliminated) continue;
        const d = dist(p.pos.x, p.pos.y, e.pos.x, e.pos.y);
        if (d < PICKUP_MAGNET + e.radius && d > 1) {
          const n = normalize(e.pos.x - p.pos.x, e.pos.y - p.pos.y);
          p.pos.x += n.x * 150 * dt;
          p.pos.y += n.y * 150 * dt;
        }
        if (d < PICKUP_RADIUS + e.radius + 4) {
          if (p.kind === 'GEM') {
            e.gems += 1;
            e.stats.gemsCollected += 1;
            this.audio.gemPickup();
            this.addFloater(e.pos.x, e.pos.y - e.radius - 22, '+1 💎', COLOR.gemLight, 13);
          } else {
            e.powerCubes += 1;
            e.maxHp += POWER_CUBE_HP_BONUS;
            e.hp = Math.min(e.maxHp, e.hp + POWER_CUBE_HP_BONUS);
            this.audio.cubePickup();
            this.addFloater(e.pos.x, e.pos.y - e.radius - 22, '+400 ❤️', COLOR.cubeLight, 13);
          }
          p.life = 0;
          break;
        }
      }
    }
    world.pickups = world.pickups.filter((p) => p.life > 0);
  }

  private updateParticles(dt: number): void {
    const world = this.world;
    if (!world) return;
    for (const pt of world.particles) {
      pt.life -= dt;
      pt.pos.x += pt.vel.x * dt;
      pt.pos.y += pt.vel.y * dt;
      pt.vel.y += pt.gravity * dt;
      pt.vel.x *= Math.exp(-2.2 * dt);
      pt.vel.y *= Math.exp(-2.2 * dt);
    }
    world.particles = world.particles.filter((pt) => pt.life > 0);

    for (const f of world.floaters) {
      f.life -= dt;
      f.pos.y += f.vy * dt;
      f.vy *= Math.exp(-1.6 * dt);
    }
    world.floaters = world.floaters.filter((f) => f.life > 0);
  }

  private updateCrates(dt: number): void {
    const world = this.world;
    if (!world) return;
    for (const c of world.crates) {
      c.hitFlash = Math.max(0, c.hitFlash - dt);
    }
  }

  private updateRespawns(dt: number): void {
    const world = this.world;
    const map = this.map;
    if (!world || !map) return;
    if (world.mode !== 'GEM_GRAB') return;

    for (const e of world.entities) {
      if (e.alive || e.eliminated) continue;
      e.respawnTimer -= dt;
      if (e.respawnTimer <= 0) {
        const spawns = world.spawnPoints[e.team];
        const sp = spawns.length > 0 ? spawns[e.id % spawns.length] : { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };
        e.pos.x = sp.x;
        e.pos.y = sp.y;
        e.hp = e.maxHp;
        e.ammo = MAX_AMMO;
        e.alive = true;
        e.invulnTimer = 1.2;
        e.superCharge = Math.min(1, e.superCharge + 0.25);
        this.burst(e.pos.x, e.pos.y, e.def.accentColor, 12);
      }
    }
  }

  /* ----------------------- Modos de jogo ----------------------- */

  private teamGemCount(team: Entity['team']): number {
    const world = this.world;
    if (!world) return 0;
    let total = 0;
    for (const e of world.entities) {
      if (e.team === team && e.alive && !e.eliminated) total += e.gems;
    }
    return total;
  }

  private updateGemGrab(dt: number): void {
    const world = this.world;
    const map = this.map;
    if (!world || !map || world.mode !== 'GEM_GRAB') return;

    // Spawner central: 1 gema a cada 7s
    world.gemTimer -= dt;
    if (world.gemTimer <= 0) {
      world.gemTimer = GEM_SPAWN_INTERVAL;
      const center = getMapCenter();
      const a = Math.random() * Math.PI * 2;
      world.pickups.push({
        id: world.nextId++,
        kind: 'GEM',
        pos: { x: center.x, y: center.y },
        vel: { x: Math.cos(a) * 70, y: Math.sin(a) * 70 },
        radius: PICKUP_RADIUS,
        life: 9999,
        bob: Math.random() * 6,
      });
    }

    const blue = this.teamGemCount('BLUE');
    const red = this.teamGemCount('RED');

    if (blue >= GEM_WIN_COUNT || red >= GEM_WIN_COUNT) {
      const team: Entity['team'] = blue >= GEM_WIN_COUNT ? 'BLUE' : 'RED';
      if (!world.countdownActive) {
        world.countdownActive = true;
        world.countdownTeam = team;
        world.countdown = GEM_COUNTDOWN_TIME;
        this.audio.countdownTick(false);
      } else if (world.countdownTeam === team) {
        const prev = Math.ceil(world.countdown);
        world.countdown -= dt;
        const now = Math.ceil(world.countdown);
        if (now < prev && now >= 0) this.audio.countdownTick(now <= 3);
        if (world.countdown <= 0) {
          const playerWon = this.player !== null && this.player.team === team;
          this.endGame(
            playerWon ? 'VICTORY' : 'DEFEAT',
            playerWon ? 'Seu time segurou 10 gemas!' : `O time ${team === 'BLUE' ? 'azul' : 'vermelho'} venceu!`,
          );
        }
      } else {
        world.countdownTeam = team;
        world.countdown = GEM_COUNTDOWN_TIME;
      }
    } else if (world.countdownActive) {
      const held = this.teamGemCount(world.countdownTeam);
      if (held < GEM_WIN_COUNT) {
        world.countdownActive = false;
        world.countdownTeam = 'NEUTRAL';
      }
    }
  }

  private updateShowdown(dt: number): void {
    const world = this.world;
    const player = this.player;
    if (!world || !player || world.mode !== 'SHOWDOWN') return;

    // Nuvens tóxicas fechando das bordas para o centro
    if (world.time > POISON_START_DELAY) {
      world.poisonTimer += dt;
      if (world.poisonTimer >= POISON_STEP_INTERVAL) {
        world.poisonTimer = 0;
        world.poisonLevel += 1;
        world.poisonRadius = Math.max(2, Math.max(MAP_TILES_X, MAP_TILES_Y) / 2 + 2 - world.poisonLevel * 1.6);
      }
    }

    // Dano por tick
    this.poisonDmgAcc += dt;
    if (this.poisonDmgAcc >= POISON_DAMAGE_TICK) {
      const tickDmg = (POISON_BASE_DPS + POISON_DPS_GROWTH * world.poisonLevel) * this.poisonDmgAcc;
      this.poisonDmgAcc = 0;
      const cxTile = MAP_TILES_X / 2;
      const cyTile = MAP_TILES_Y / 2;
      for (const e of world.entities) {
        if (!e.alive || e.eliminated) continue;
        const tx = Math.floor(e.pos.x / 32);
        const ty = Math.floor(e.pos.y / 32);
        const dCheb = Math.max(Math.abs(tx - cxTile), Math.abs(ty - cyTile));
        if (dCheb > world.poisonRadius) {
          e.hp -= tickDmg;
          e.timeSinceDamage = 0;
          this.addFloater(e.pos.x, e.pos.y - e.radius - 10, `${Math.round(tickDmg)}`, '#e070ff', 14);
          if (e.hp <= 0) this.killEntity(e, null);
        }
      }
    }

    // Eliminação do jogador
    if (player.eliminated && !world.gameOver) {
      const alive = world.entities.filter((e) => e.alive && !e.eliminated).length;
      world.playerPlacement = alive + 1;
      this.endGame('DEFEAT', `Você ficou em #${world.playerPlacement}º lugar`);
      return;
    }

    // Vitória: último de pé
    const alive = world.entities.filter((e) => e.alive && !e.eliminated);
    if (alive.length === 1 && alive[0].id === player.id && !world.gameOver) {
      this.endGame('VICTORY', 'Você é o último de pé!');
    }
  }

  private endGame(result: 'VICTORY' | 'DEFEAT', subtitle: string): void {
    const world = this.world;
    const player = this.player;
    if (!world || !player || world.gameOver) return;
    world.gameOver = true;
    world.result = result;
    world.winner = subtitle;

    const title = el('go-title');
    title.textContent = result === 'VICTORY' ? '🏆 VITÓRIA!' : '💀 DERROTA';
    title.className = 'go-title ' + (result === 'VICTORY' ? 'win' : 'lose');
    el('go-subtitle').textContent = subtitle;

    const stats = el('go-stats');
    stats.innerHTML = `
      <div class="go-stat"><b>${player.stats.kills}</b><span>Abates</span></div>
      <div class="go-stat"><b>${player.stats.gemsCollected}</b><span>Gemas</span></div>
      <div class="go-stat"><b>${player.stats.damageDealt.toLocaleString('pt-BR')}</b><span>Dano</span></div>
      <div class="go-stat"><b>${player.powerCubes}</b><span>Cubos</span></div>
    `;

    if (result === 'VICTORY') this.audio.victory();
    else this.audio.defeat();
    this.setScreen('GAME_OVER');
  }

  /* ----------------------- Câmera / efeitos ----------------------- */

  private updateCamera(dt: number): void {
    const player = this.player;
    if (player && player.alive && !player.eliminated) {
      this.camTarget = { x: player.pos.x, y: player.pos.y };
    }
    const k = 1 - Math.exp(-CAMERA_LERP * dt);
    this.cam.x = lerp(this.cam.x, this.camTarget.x, k);
    this.cam.y = lerp(this.cam.y, this.camTarget.y, k);

    const zoomTarget = clamp(this.renderer.viewHeight / VIEW_HEIGHT, 0.5, 1.6);
    this.cam.zoom = lerp(this.cam.zoom, zoomTarget, 0.08);

    const halfW = this.renderer.viewWidth / (2 * this.cam.zoom);
    const halfH = this.renderer.viewHeight / (2 * this.cam.zoom);
    if (halfW * 2 < WORLD_WIDTH) this.cam.x = clamp(this.cam.x, halfW, WORLD_WIDTH - halfW);
    else this.cam.x = WORLD_WIDTH / 2;
    if (halfH * 2 < WORLD_HEIGHT) this.cam.y = clamp(this.cam.y, halfH, WORLD_HEIGHT - halfH);
    else this.cam.y = WORLD_HEIGHT / 2;

    this.cam.trauma = Math.max(0, this.cam.trauma - SHAKE_DECAY * dt);
  }

  private addTrauma(v: number): void {
    this.cam.trauma = clamp(this.cam.trauma + v, 0, 1);
  }

  private burst(x: number, y: number, color: string, count: number): void {
    const world = this.world;
    if (!world) return;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = randRange(60, 260);
      world.particles.push({
        pos: { x, y },
        vel: { x: Math.cos(a) * sp, y: Math.sin(a) * sp - 40 },
        life: randRange(0.25, 0.6),
        maxLife: 0.6,
        size: randRange(2.5, 5.5),
        color,
        kind: Math.random() < 0.5 ? 'SPARK' : 'CIRCLE',
        gravity: 240,
      });
    }
  }

  private burstRing(x: number, y: number, color: string, radius: number): void {
    const world = this.world;
    if (!world) return;
    world.particles.push({
      pos: { x, y },
      vel: { x: 0, y: 0 },
      life: 0.42,
      maxLife: 0.42,
      size: Math.max(18, radius * 0.55),
      color,
      kind: 'RING',
      gravity: 0,
    });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      world.particles.push({
        pos: { x: x + Math.cos(a) * radius * 0.35, y: y + Math.sin(a) * radius * 0.35 },
        vel: { x: Math.cos(a) * radius * 1.6, y: Math.sin(a) * radius * 1.6 },
        life: 0.38,
        maxLife: 0.38,
        size: 5,
        color,
        kind: 'SMOKE',
        gravity: -30,
      });
    }
  }

  private addFloater(x: number, y: number, text: string, color: string, size: number): void {
    const world = this.world;
    if (!world) return;
    world.floaters.push({
      pos: { x, y },
      text,
      color,
      life: 0.85,
      maxLife: 0.85,
      vy: -68,
      size,
    });
  }

  /* ----------------------- HUD ----------------------- */

  private updateHUD(): void {
    const hud = el('hud');
    const superBtn = el('super-btn');
    const world = this.world;
    const player = this.player;

    if (this.screen !== 'PLAYING' || !world || !player) {
      hud.classList.add('hidden');
      superBtn.classList.add('hidden');
      return;
    }
    hud.classList.remove('hidden');
    superBtn.classList.remove('hidden');

    const charge = clamp(player.superCharge, 0, 1);
    superBtn.style.background = `conic-gradient(#ffe14d ${charge * 360}deg, rgba(255,255,255,0.18) 0deg)`;
    superBtn.classList.toggle('ready', charge >= 1);

    const left = el('hud-blue-count');
    const right = el('hud-red-count');
    const center = el('hud-center-text');

    if (world.mode === 'GEM_GRAB') {
      left.textContent = `${this.teamGemCount('BLUE')}`;
      right.textContent = `${this.teamGemCount('RED')}`;
      if (world.countdownActive) {
        center.textContent = `⏱ ${Math.max(0, Math.ceil(world.countdown))}s`;
      } else {
        const mins = Math.floor(world.time / 60);
        const secs = Math.floor(world.time % 60);
        center.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
      }
    } else {
      left.textContent = `🍊 ${player.powerCubes}`;
      const alive = world.entities.filter((e) => e.alive && !e.eliminated).length;
      right.textContent = `☠️ ${alive}`;
      if (world.time > POISON_START_DELAY) {
        center.textContent = `☠️ Veneno ${world.poisonLevel}`;
      } else {
        center.textContent = `⏱ ${Math.ceil(POISON_START_DELAY - world.time)}s`;
      }
    }
  }
}

/* ============================ BOOT ============================ */

const game = new Game();
game.init();
