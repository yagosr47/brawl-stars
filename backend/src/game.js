import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import {
  COLORS, MIN_PLAYERS, MAX_PLAYERS, SHIP_SPAWNS, LOBBY_SPAWNS, TASKS,
  COUNTDOWN_DURATION, DISCONNECT_GRACE, EJECTION_DURATION, INPUT_TIMEOUT,
  KILL_COOLDOWN, KILL_DISTANCE, MEETING_DURATION, USE_DISTANCE, clamp, distance,
} from '../../shared/constants.js';
import { findPath, hasLineOfSight, movePosition, nearestWalkable } from '../../shared/physics.js';

export class GameError extends Error {
  constructor(message, code = 'INVALID_ACTION') { super(message); this.code = code; }
}
const requireThat = (condition, message, code) => { if (!condition) throw new GameError(message, code); };
const cleanName = value => String(value || '').replace(/[\p{C}<>]/gu, '').trim().slice(0, 16);
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const publicCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
const zeroInput = () => ({ x: 0, y: 0, seq: 0, time: 0 });

/** All game rules live here. The network adapter never accepts a player ID as identity. */
export class GameService {
  constructor({ now = () => Date.now(), onState = () => {}, onEvent = () => {}, onRooms = () => {}, onMembership = () => {} } = {}) {
    this.now = now;
    this.onState = onState;
    this.onEvent = onEvent;
    this.onRooms = onRooms;
    this.onMembership = onMembership;
    this.players = new Map();
    this.sessions = new Map();
    this.rooms = new Map();
    this.lastTick = now();
    this.lastSnapshot = 0;
    this.lastCleanup = 0;
  }

  connect(sessionToken) {
    let player = typeof sessionToken === 'string' && this.players.get(this.sessions.get(sessionToken));
    if (!player) {
      requireThat(this.players.size < 1500, 'A nave está lotada. Tente novamente em instantes.');
      player = {
        id: randomUUID(), token: randomBytes(32).toString('hex'), name: 'Tripulante', color: 'coral',
        roomId: null, connected: true, disconnectedAt: null, createdAt: this.now(),
        alive: true, role: 'crewmate', x: 0, y: 0, direction: 1, moving: false,
        input: zeroInput(), tasks: [], taskSession: null, emergencies: 1, killReadyAt: 0,
      };
      this.players.set(player.id, player);
      this.sessions.set(player.token, player.id);
    }
    player.connected = true;
    player.disconnectedAt = null;
    player.input = zeroInput();
    const room = this.rooms.get(player.roomId);
    if (room) this.publish(room);
    return { id: player.id, token: player.token, profile: { name: player.name, color: player.color } };
  }

  disconnect(playerId) {
    const player = this.players.get(playerId);
    if (!player) return;
    player.connected = false;
    player.disconnectedAt = this.now();
    player.input = zeroInput();
    const room = this.rooms.get(player.roomId);
    if (room) this.publish(room);
  }

  player(id) {
    const player = this.players.get(id);
    requireThat(player, 'Sessão expirada. Atualize a página.', 'SESSION_EXPIRED');
    return player;
  }

  roomFor(id) {
    const player = this.player(id);
    const room = this.rooms.get(player.roomId);
    requireThat(room && room.players.has(id), 'Você não está em uma sala.');
    return { player, room };
  }

  profile(id, data = {}) {
    const player = this.player(id);
    const room = this.rooms.get(player.roomId);
    requireThat(!room || room.phase === 'lobby', 'Espere a partida terminar para trocar o traje.');
    const name = cleanName(data.name);
    requireThat(name.length >= 2, 'Use um nome com pelo menos 2 caracteres.');
    requireThat(COLORS.some(color => color.id === data.color), 'Escolha uma cor válida.');
    if (room) {
      requireThat(![...room.players.values()].some(p => p.id !== id && p.color === data.color), 'Essa cor já está na nave.');
    }
    player.name = name;
    player.color = data.color;
    if (room) { this.publish(room); this.publishRooms(); }
    return { id, name, color: player.color };
  }

  create(id, data = {}, practice = false) {
    const player = this.player(id);
    requireThat(!player.roomId, 'Saia da sala atual antes de criar outra.');
    requireThat(this.rooms.size < 100, 'Todas as docas estão ocupadas. Tente novamente.');
    let code;
    do { code = publicCode(); } while (this.rooms.has(code));
    const room = {
      id: code, name: `Nave de ${player.name}`, hostId: id, phase: 'lobby', map: 'lobby',
      maxPlayers: [6, 8, 10].includes(data.maxPlayers) ? data.maxPlayers : MAX_PLAYERS,
      private: practice, practice, practiceRole: data.role === 'impostor' ? 'impostor' : 'crewmate',
      players: new Map(), bodies: [], messages: [], meeting: null, ejection: null, result: null,
      deadline: 0, createdAt: this.now(), lastActivity: this.now(), round: 0, startedAt: 0,
    };
    this.rooms.set(code, room);
    this.join(id, { code });
    if (practice) {
      const botNames = ['Luna', 'Pixel', 'Nova', 'Atlas'];
      const botColors = COLORS.filter(color => color.id !== player.color);
      for (let index = 0; index < botNames.length; index++) {
        const bot = {
          id: `bot-${randomUUID()}`, name: botNames[index], color: botColors[(index + 1) % botColors.length].id,
          roomId: code, connected: true, alive: true, role: 'crewmate', bot: true,
          input: zeroInput(), tasks: [], taskSession: null, emergencies: 0, killReadyAt: 0,
          x: 0, y: 0, direction: index % 2 ? -1 : 1, moving: false, botIndex: index,
          path: [], nextThink: 0,
        };
        room.players.set(bot.id, bot);
      }
      this.start(id);
    }
    this.publishRooms();
    return { code, practice };
  }

  join(id, { code } = {}) {
    const player = this.player(id);
    requireThat(typeof code === 'string' && /^[A-Z2-9]{6}$/.test(code.toUpperCase()), 'O código da sala tem 6 caracteres.');
    const room = this.rooms.get(code.toUpperCase());
    requireThat(room && (!room.private || room.hostId === id), 'Sala não encontrada. Confira o código.');
    if (player.roomId === room.id) { this.publish(room); return { code: room.id }; }
    requireThat(!player.roomId, 'Você já está em outra sala.');
    requireThat(room.phase === 'lobby', 'Essa missão já começou. Aguarde a próxima.');
    requireThat(room.players.size < room.maxPlayers, 'Essa sala está cheia.');
    const available = COLORS.find(color => ![...room.players.values()].some(p => p.color === color.id));
    if ([...room.players.values()].some(p => p.color === player.color)) player.color = available.id;
    player.roomId = room.id;
    player.alive = true;
    player.role = 'crewmate';
    player.input = zeroInput();
    const spawn = nearestWalkable('lobby', LOBBY_SPAWNS[room.players.size]);
    Object.assign(player, spawn);
    room.players.set(id, player);
    room.lastActivity = this.now();
    this.onMembership(id, null, room.id);
    this.event(room, { type: 'player-joined', name: player.name, color: player.color });
    this.publish(room);
    this.publishRooms();
    return { code: room.id, color: player.color };
  }

  leave(id) {
    const player = this.player(id);
    const room = this.rooms.get(player.roomId);
    const previous = player.roomId;
    player.roomId = null;
    player.input = zeroInput();
    player.taskSession = null;
    this.onMembership(id, previous, null);
    this.onState(id, null);
    if (!room) return;
    room.players.delete(id);
    room.lastActivity = this.now();
    if (![...room.players.values()].some(p => !p.bot)) {
      this.rooms.delete(room.id);
      this.publishRooms();
      return;
    }
    if (room.hostId === id) room.hostId = [...room.players.values()].find(p => !p.bot)?.id;
    this.event(room, { type: 'player-left', name: player.name });
    if (room.phase === 'meeting') this.maybeFinishMeeting(room);
    if (['playing', 'countdown'].includes(room.phase)) this.checkWin(room);
    this.publish(room);
    this.publishRooms();
  }

  start(id) {
    const { player, room } = this.roomFor(id);
    requireThat(room.hostId === id, 'Só o capitão pode iniciar a missão.');
    requireThat(room.phase === 'lobby', 'A missão já está em andamento.');
    requireThat(room.players.size >= MIN_PLAYERS, `São necessários pelo menos ${MIN_PLAYERS} tripulantes.`);
    requireThat([...room.players.values()].filter(p => p.connected).length >= MIN_PLAYERS, 'Aguarde a tripulação reconectar.');
    const all = [...room.players.values()];
    const impostor = room.practice
      ? room.practiceRole === 'impostor' ? player : all.find(p => p.bot)
      : all[randomInt(all.length)];
    room.round++;
    room.map = 'ship';
    room.phase = 'countdown';
    room.deadline = this.now() + COUNTDOWN_DURATION;
    room.startedAt = room.deadline;
    room.bodies = [];
    room.messages = [];
    room.meeting = null;
    room.ejection = null;
    room.result = null;
    all.forEach((p, index) => {
      Object.assign(p, nearestWalkable('ship', SHIP_SPAWNS[index]));
      p.role = p.id === impostor.id ? 'impostor' : 'crewmate';
      p.alive = true;
      p.moving = false;
      p.direction = index % 2 ? -1 : 1;
      p.input = zeroInput();
      p.emergencies = 1;
      p.killReadyAt = room.deadline + (room.practice && !p.bot ? 3000 : 12_000);
      p.tasks = p.role === 'crewmate' ? TASKS.map(task => ({ ...task, ...nearestWalkable('ship', { x: task.x, y: task.y }), done: false })) : [];
      p.taskSession = null;
      p.path = [];
      p.nextThink = room.deadline + index * 1000;
    });
    this.event(room, { type: 'countdown' });
    this.publish(room);
    this.publishRooms();
  }

  reset(id) {
    const { room } = this.roomFor(id);
    requireThat(room.hostId === id, 'Só o capitão pode preparar uma nova missão.');
    requireThat(room.phase === 'ended', 'A missão ainda não acabou.');
    room.phase = 'lobby';
    room.map = 'lobby';
    room.result = null;
    room.ejection = null;
    room.bodies = [];
    room.meeting = null;
    room.deadline = 0;
    [...room.players.values()].forEach((p, index) => {
      Object.assign(p, nearestWalkable('lobby', LOBBY_SPAWNS[index]));
      p.alive = true;
      p.role = 'crewmate';
      p.tasks = [];
      p.input = zeroInput();
      p.moving = false;
    });
    if (room.practice) return this.start(id);
    this.publish(room);
    this.publishRooms();
  }

  input(id, data = {}) {
    const { player, room } = this.roomFor(id);
    if (!['lobby', 'playing'].includes(room.phase)) return;
    requireThat(Number.isFinite(data.x) && Number.isFinite(data.y) && Number.isSafeInteger(data.seq), 'Comando de movimento inválido.');
    if (data.seq <= player.input.seq) return;
    player.input = { x: clamp(data.x, -1, 1), y: clamp(data.y, -1, 1), seq: data.seq, time: this.now() };
  }

  kill(id, { targetId } = {}) {
    const { player, room } = this.roomFor(id);
    const target = room.players.get(targetId);
    requireThat(room.phase === 'playing', 'Aguarde a reunião terminar.');
    requireThat(player.alive && player.role === 'impostor', 'Somente o impostor pode eliminar.');
    requireThat(this.now() >= player.killReadyAt, 'A eliminação ainda está recarregando.');
    requireThat(target && target.id !== id && target.alive && target.role !== 'impostor', 'Escolha um alvo válido.');
    requireThat(distance(player, target) <= KILL_DISTANCE, 'Chegue mais perto do alvo.');
    requireThat(hasLineOfSight('ship', player, target), 'Há uma parede entre você e o alvo.');
    target.alive = false;
    target.taskSession = null;
    target.input = zeroInput();
    target.moving = false;
    player.killReadyAt = this.now() + KILL_COOLDOWN;
    player.x = target.x;
    player.y = target.y;
    room.bodies.push({ id: target.id, name: target.name, color: target.color, x: target.x, y: target.y, reported: false });
    this.event(room, { type: 'elimination', targetId, name: target.name, color: target.color, x: target.x, y: target.y });
    if (!target.bot) this.onEvent(targetId, { type: 'your-death', killerColor: player.color, serverTime: this.now() });
    this.checkWin(room);
    this.publish(room);
  }

  meeting(id, { bodyId } = {}) {
    const { player, room } = this.roomFor(id);
    requireThat(room.phase === 'playing' && player.alive, 'Você não pode chamar uma reunião agora.');
    let reason = 'emergency';
    if (bodyId) {
      const body = room.bodies.find(body => body.id === bodyId && !body.reported);
      requireThat(body && distance(player, body) <= USE_DISTANCE, 'Chegue mais perto do corpo para reportar.');
      requireThat(hasLineOfSight('ship', player, body), 'O corpo está do outro lado de uma parede.');
      body.reported = true;
      reason = 'report';
    } else {
      requireThat(player.emergencies > 0, 'Você já usou sua reunião de emergência.');
      requireThat(distance(player, { x: 556, y: 126 }) <= 45, 'Use a mesa central da Cafeteria para chamar uma reunião.');
      player.emergencies--;
    }
    room.phase = 'meeting';
    room.deadline = this.now() + MEETING_DURATION;
    room.meeting = { callerId: id, callerName: player.name, reason, votes: new Map(), endAt: room.deadline };
    for (const p of room.players.values()) { p.input = zeroInput(); p.moving = false; p.taskSession = null; }
    this.event(room, { type: 'meeting', reason, callerName: player.name });
    this.publish(room);
  }

  vote(id, { targetId } = {}) {
    const { player, room } = this.roomFor(id);
    requireThat(room.phase === 'meeting' && room.meeting, 'Não há votação em andamento.');
    requireThat(player.alive, 'Fantasmas não podem votar.');
    requireThat(!room.meeting.votes.has(id), 'Seu voto já foi registrado.');
    requireThat(targetId === 'skip' || room.players.get(targetId)?.alive, 'Escolha um tripulante vivo ou pule o voto.');
    room.meeting.votes.set(id, targetId);
    this.maybeFinishMeeting(room);
    this.publish(room);
  }

  maybeFinishMeeting(room) {
    if (room.phase !== 'meeting') return;
    const alive = [...room.players.values()].filter(p => p.alive);
    if (alive.every(p => room.meeting.votes.has(p.id))) this.finishMeeting(room);
  }

  finishMeeting(room) {
    if (room.phase !== 'meeting' || !room.meeting) return;
    const counts = {};
    for (const [id, target] of room.meeting.votes) {
      if (!room.players.get(id)?.alive) continue;
      if (target !== 'skip' && !room.players.get(target)?.alive) continue;
      counts[target] = (counts[target] || 0) + 1;
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const tie = !sorted.length || (sorted.length > 1 && sorted[0][1] === sorted[1][1]);
    const targetId = !tie && sorted[0][0] !== 'skip' ? sorted[0][0] : null;
    const ejected = targetId && room.players.get(targetId);
    if (ejected) { ejected.alive = false; ejected.input = zeroInput(); ejected.taskSession = null; }
    room.ejection = {
      id: randomUUID(), targetId: targetId || null, name: ejected?.name || null,
      color: ejected?.color || null, wasImpostor: ejected?.role === 'impostor', tie, counts,
    };
    room.phase = 'ejection';
    room.deadline = this.now() + EJECTION_DURATION;
    this.event(room, { type: 'ejection', ...room.ejection });
    this.publish(room);
  }

  beginTask(id, { taskId } = {}) {
    const { player, room } = this.roomFor(id);
    const task = player.tasks.find(task => task.id === taskId);
    requireThat(room.phase === 'playing' && player.role === 'crewmate', 'Essa tarefa não está disponível agora.');
    requireThat(task && !task.done, 'Essa tarefa já foi concluída.');
    requireThat(distance(player, task) <= USE_DISTANCE, 'Chegue mais perto do terminal.');
    const challenge = task.type === 'signal' ? randomInt(25, 76) : task.type === 'wires' ? [0, 1, 2].sort(() => randomInt(2) ? 1 : -1) : null;
    player.taskSession = { taskId, token: randomBytes(16).toString('hex'), startedAt: this.now(), challenge };
    return { ...task, token: player.taskSession.token, challenge };
  }

  completeTask(id, data = {}) {
    const { player, room } = this.roomFor(id);
    const session = player.taskSession;
    requireThat(room.phase === 'playing' && session && session.token === data.token, 'O terminal foi desconectado. Abra a tarefa novamente.');
    const task = player.tasks.find(task => task.id === session.taskId);
    requireThat(task && !task.done && distance(player, task) <= USE_DISTANCE + 4, 'Você se afastou do terminal.');
    requireThat(this.now() - session.startedAt >= task.duration, 'Aguarde a tarefa terminar.');
    if (task.type === 'signal') requireThat(Number.isFinite(data.answer) && Math.abs(data.answer - session.challenge) <= 3, 'O sinal ainda não está alinhado.');
    if (task.type === 'wires') requireThat(Array.isArray(data.answer) && data.answer.length === 3 && data.answer.every((value, index) => value === session.challenge[index]), 'Confira as conexões dos fios.');
    task.done = true;
    player.taskSession = null;
    this.onEvent(id, { type: 'task-complete', taskId: task.id, title: task.title, serverTime: this.now() });
    this.checkWin(room);
    this.publish(room);
  }

  chat(id, { text } = {}) {
    const { player, room } = this.roomFor(id);
    requireThat(['lobby', 'meeting', 'ended'].includes(room.phase), 'Use o chat durante a reunião ou no lobby.');
    requireThat(typeof text === 'string', 'Mensagem inválida.');
    const message = text.replace(/[\p{C}]/gu, '').trim().slice(0, 160);
    requireThat(message.length > 0, 'Escreva uma mensagem.');
    requireThat(!player.lastMessageAt || this.now() - player.lastMessageAt >= 800, 'Espere um instante antes da próxima mensagem.');
    player.lastMessageAt = this.now();
    room.messages.push({ id: randomUUID(), playerId: id, name: player.name, color: player.color, text: message, ghost: !player.alive, time: this.now() });
    room.messages = room.messages.slice(-50);
    this.publish(room);
  }

  checkWin(room) {
    if (!['playing', 'countdown', 'ejection'].includes(room.phase)) return false;
    const players = [...room.players.values()];
    const impostors = players.filter(p => p.alive && p.role === 'impostor');
    const crew = players.filter(p => p.alive && p.role === 'crewmate');
    let winner = null, reason = '';
    if (!impostors.length) { winner = 'crewmate'; reason = 'O impostor foi descoberto. A nave está segura.'; }
    else if (crew.length <= impostors.length) { winner = 'impostor'; reason = 'A tripulação perdeu o controle da nave.'; }
    else {
      const tasks = players.filter(p => p.role === 'crewmate').flatMap(p => p.tasks);
      if (tasks.length && tasks.every(task => task.done)) { winner = 'crewmate'; reason = 'Todas as tarefas foram concluídas. Missão cumprida.'; }
    }
    if (!winner) return false;
    room.phase = 'ended';
    room.deadline = 0;
    room.result = { winner, reason, endedAt: this.now() };
    for (const p of players) { p.input = zeroInput(); p.moving = false; }
    this.event(room, { type: 'game-ended', winner });
    this.publishRooms();
    return true;
  }

  updateBots(room, seconds, now) {
    const destinations = [
      ...TASKS.map(task => nearestWalkable('ship', task)),
      { x: 500, y: 189 }, { x: 620, y: 108 }, { x: 738, y: 219 },
      { x: 553, y: 401 }, { x: 379, y: 232 }, { x: 530, y: 145 },
    ];
    for (const bot of room.players.values()) {
      if (!bot.bot || !bot.alive) continue;
      if (now >= bot.nextThink) {
        const goal = destinations[(Math.floor((now - room.startedAt) / 8000) + bot.botIndex * 2) % destinations.length];
        bot.path = findPath(bot, goal);
        bot.nextThink = now + 8000 + bot.botIndex * 450;
      }
      const target = bot.path?.[0];
      if (target) {
        const d = distance(bot, target);
        if (d < 3) bot.path.shift();
        else {
          const input = { x: (target.x - bot.x) / d, y: (target.y - bot.y) / d };
          Object.assign(bot, movePosition('ship', bot, input, seconds * 0.7));
          bot.direction = input.x > 0.1 ? 1 : input.x < -0.1 ? -1 : bot.direction;
          bot.moving = true;
        }
      } else bot.moving = false;
      if (bot.role === 'crewmate') {
        const completed = Math.min(bot.tasks.length, Math.floor((now - room.startedAt - bot.botIndex * 8000) / 25_000));
        bot.tasks.forEach((task, index) => { if (index < completed) task.done = true; });
      }
      // Practice bots never eliminate during the first 45 seconds: time to explore.
      if (bot.role === 'impostor' && now - room.startedAt > 45_000 && now >= bot.killReadyAt) {
        const target = [...room.players.values()].find(p => p.id !== bot.id && p.alive && p.role !== 'impostor' && distance(bot, p) < KILL_DISTANCE && hasLineOfSight('ship', bot, p));
        if (target) {
          // Bots use the exact same validated action as human players.
          this.players.set(bot.id, bot);
          try { this.kill(bot.id, { targetId: target.id }); } finally { this.players.delete(bot.id); }
        }
      }
    }
  }

  advance(now = this.now()) {
    const seconds = clamp((now - this.lastTick) / 1000, 0, 0.1);
    this.lastTick = now;
    for (const room of this.rooms.values()) {
      if (room.phase === 'countdown' && now >= room.deadline) {
        room.phase = 'playing'; room.deadline = 0;
        this.event(room, { type: 'mission-started' });
      } else if (room.phase === 'meeting') {
        if (room.practice) {
          for (const bot of room.players.values()) {
            if (!bot.bot || !bot.alive || room.meeting.votes.has(bot.id)) continue;
            if (now > room.meeting.endAt - MEETING_DURATION + 4000 + bot.botIndex * 2400) {
              // Bots skip rather than magically knowing the impostor's identity.
              room.meeting.votes.set(bot.id, 'skip');
            }
          }
          this.maybeFinishMeeting(room);
        }
        if (room.phase === 'meeting' && now >= room.deadline) this.finishMeeting(room);
      } else if (room.phase === 'ejection' && now >= room.deadline) {
        if (!this.checkWin(room)) {
          room.phase = 'playing'; room.deadline = 0; room.meeting = null;
          room.bodies = [];
          [...room.players.values()].forEach((p, index) => {
            Object.assign(p, nearestWalkable('ship', SHIP_SPAWNS[index]));
            p.killReadyAt = Math.max(p.killReadyAt, now + 6000);
            p.input = zeroInput();
          });
        }
      }
      if (['lobby', 'playing'].includes(room.phase)) {
        for (const player of room.players.values()) {
          if (player.bot) continue;
          const input = player.connected && now - player.input.time < INPUT_TIMEOUT ? player.input : { x: 0, y: 0 };
          player.moving = Boolean(input.x || input.y);
          if (Math.abs(input.x) > 0.1) player.direction = input.x > 0 ? 1 : -1;
          Object.assign(player, movePosition(room.map, player, input, seconds, !player.alive));
        }
        if (room.phase === 'playing' && room.practice) { this.updateBots(room, seconds, now); this.checkWin(room); }
      }
      if (now - this.lastSnapshot >= 1000 / 15) this.publish(room);
    }
    if (now - this.lastSnapshot >= 1000 / 15) this.lastSnapshot = now;
    if (now - this.lastCleanup > 5000) {
      this.lastCleanup = now;
      for (const player of this.players.values()) {
        if (!player.connected && player.disconnectedAt !== null && now - player.disconnectedAt > DISCONNECT_GRACE && player.roomId) this.leave(player.id);
        if (!player.connected && !player.roomId && now - (player.disconnectedAt || player.createdAt) > 3_600_000) {
          this.players.delete(player.id); this.sessions.delete(player.token);
        }
      }
    }
  }

  serialize(room, viewerId) {
    const viewer = room.players.get(viewerId);
    if (!viewer) return null;
    const all = [...room.players.values()];
    const tasks = all.filter(p => p.role === 'crewmate').flatMap(p => p.tasks);
    return {
      id: room.id, name: room.name, phase: room.phase, map: room.map, hostId: room.hostId,
      maxPlayers: room.maxPlayers, practice: room.practice, round: room.round, deadline: room.deadline,
      serverTime: this.now(), startedAt: room.startedAt,
      players: all.map(p => ({
        id: p.id, name: p.name, color: p.color, alive: p.alive, connected: p.connected, bot: Boolean(p.bot),
        x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100, direction: p.direction, moving: p.moving,
        voted: Boolean(room.meeting?.votes.has(p.id)), ...(room.phase === 'ended' ? { role: p.role } : {}),
      })),
      self: {
        id: viewer.id, color: viewer.color, role: room.phase === 'lobby' ? null : viewer.role,
        alive: viewer.alive, tasks: viewer.tasks, killReadyAt: viewer.killReadyAt,
        emergencies: viewer.emergencies, voted: Boolean(room.meeting?.votes.has(viewer.id)),
        inputSeq: viewer.input.seq,
      },
      tasks: { completed: tasks.filter(task => task.done).length, total: tasks.length },
      bodies: room.bodies,
      meeting: room.meeting ? {
        callerName: room.meeting.callerName, reason: room.meeting.reason, endAt: room.meeting.endAt,
        votedCount: all.filter(p => p.alive && room.meeting.votes.has(p.id)).length,
        eligibleCount: all.filter(p => p.alive).length,
      } : null,
      ejection: room.phase === 'ejection' ? room.ejection : null,
      result: room.result,
      messages: room.messages.filter(message => !message.ghost || !viewer.alive || room.phase === 'ended'),
    };
  }

  summaries() {
    return [...this.rooms.values()].filter(room => !room.private && room.phase === 'lobby').map(room => ({
      code: room.id, name: room.name, hostName: room.players.get(room.hostId)?.name || 'Tripulante',
      count: room.players.size, maxPlayers: room.maxPlayers, map: 'The Skeld',
      colors: [...room.players.values()].map(player => player.color),
    }));
  }
  publish(room) {
    for (const player of room.players.values()) {
      if (!player.bot && player.connected) this.onState(player.id, this.serialize(room, player.id));
    }
  }
  publishRooms() { this.onRooms(this.summaries()); }
  event(room, event) {
    for (const player of room.players.values()) {
      if (!player.bot && player.connected) this.onEvent(player.id, { ...event, serverTime: this.now() });
    }
  }
}
