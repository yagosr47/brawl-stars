import express from 'express';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Server } from 'socket.io';
import { GameError, GameService } from './game.js';
import { TICK_RATE, VERSION } from '../../shared/constants.js';

const production = process.env.NODE_ENV === 'production';
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
const allowedOrigin = (origin, request) => {
  if (!origin || !production) return true;
  if (allowedOrigins.includes(origin)) return true;
  try {
    const originUrl = new URL(origin);
    const host = request?.headers?.host;
    // A same-origin production deployment requires no CORS configuration.
    return Boolean(host && originUrl.host === host);
  } catch { return false; }
};

export function createGameServer() {
  const app = express();
  app.disable('x-powered-by');
  const server = createServer(app);
  const io = new Server(server, {
    maxHttpBufferSize: 12_000,
    pingTimeout: 15_000,
    pingInterval: 10_000,
    cors: {
      origin(origin, callback) {
        // REST is read-only. Socket authorization below also checks the request host.
        callback(null, !production || !origin || allowedOrigins.includes(origin));
      },
      methods: ['GET', 'POST'],
    },
    allowRequest(request, callback) { callback(null, allowedOrigin(request.headers.origin, request)); },
  });
  const socketsByPlayer = new Map();
  const service = new GameService({
    onState: (id, state) => io.to(`player:${id}`).emit('room:state', state),
    onEvent: (id, event) => io.to(`player:${id}`).emit('room:event', event),
    onRooms: rooms => io.emit('rooms:updated', rooms),
    onMembership(id, previous, next) {
      const socket = socketsByPlayer.get(id);
      if (!socket) return;
      if (previous) socket.leave(`room:${previous}`);
      if (next) socket.join(`room:${next}`);
    },
  });

  app.use((request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (allowedOrigins.includes(request.headers.origin)) {
      response.setHeader('Access-Control-Allow-Origin', request.headers.origin);
      response.setHeader('Vary', 'Origin');
    }
    next();
  });
  app.get('/api/health', (_request, response) => response.json({ status: 'online', version: VERSION, tickRate: TICK_RATE }));
  // Never serialize an internal room, a session token, or a player's secret role here.
  app.get('/api/rooms', (_request, response) => response.json({ rooms: service.summaries() }));
  app.use('/api', (_request, response) => response.status(404).json({ error: 'Rota não encontrada.' }));

  io.use((socket, next) => {
    try {
      const session = service.connect(socket.handshake.auth?.sessionToken);
      socket.data.playerId = session.id;
      socket.data.session = session;
      next();
    } catch (error) { next(new Error(error instanceof GameError ? error.message : 'Não foi possível entrar na nave.')); }
  });

  io.on('connection', socket => {
    const id = socket.data.playerId;
    const previous = socketsByPlayer.get(id);
    if (previous && previous.id !== socket.id) {
      previous.emit('session:replaced');
      previous.disconnect(true);
    }
    socketsByPlayer.set(id, socket);
    const player = service.player(id);
    player.connected = true;
    player.disconnectedAt = null;
    socket.join(`player:${id}`);
    if (player.roomId) socket.join(`room:${player.roomId}`);
    socket.emit('session', socket.data.session);
    socket.emit('rooms:updated', service.summaries());
    if (player.roomId) service.publish(service.rooms.get(player.roomId));
    else socket.emit('room:state', null);

    const limits = new Map();
    function action(event, handler, max = 8, interval = 1000) {
      socket.on(event, (payload, acknowledgement) => {
        const reply = typeof acknowledgement === 'function' ? acknowledgement : () => {};
        try {
          const now = Date.now();
          let bucket = limits.get(event);
          if (!bucket || now - bucket.time > interval) {
            bucket = { time: now, count: 0 }; limits.set(event, bucket);
          }
          if (++bucket.count > max) throw new GameError('Muitos comandos. Aguarde um instante.', 'RATE_LIMIT');
          if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) throw new GameError('Comando inválido.');
          const data = handler(payload);
          reply({ ok: true, data: data ?? null });
        } catch (error) {
          if (!(error instanceof GameError)) console.error(`[${event}]`, error);
          reply({ ok: false, code: error.code || 'SERVER_ERROR', error: error instanceof GameError ? error.message : 'Algo saiu de órbita. Tente novamente.' });
        }
      });
    }
    action('profile:update', payload => service.profile(id, payload));
    action('room:create', payload => service.create(id, payload), 2, 5000);
    action('room:join', payload => service.join(id, payload), 5, 5000);
    action('room:leave', () => service.leave(id), 3, 3000);
    action('practice:start', payload => service.create(id, payload, true), 2, 5000);
    action('game:start', () => service.start(id), 2, 3000);
    action('game:reset', () => service.reset(id), 2, 3000);
    action('player:input', payload => service.input(id, payload), 70);
    action('player:kill', payload => service.kill(id, payload), 5);
    action('meeting:start', payload => service.meeting(id, payload), 3, 3000);
    action('meeting:vote', payload => service.vote(id, payload), 3);
    action('task:start', payload => service.beginTask(id, payload), 5);
    action('task:complete', payload => service.completeTask(id, payload), 5);
    action('chat:send', payload => service.chat(id, payload), 3, 2000);
    action('ping:check', () => ({ time: Date.now() }), 2, 2000);
    socket.on('disconnect', () => {
      if (socketsByPlayer.get(id)?.id !== socket.id) return;
      socketsByPlayer.delete(id);
      service.disconnect(id);
    });
  });

  const frontend = fileURLToPath(new URL('../../frontend/dist', import.meta.url));
  if (existsSync(path.join(frontend, 'index.html'))) {
    app.use(express.static(frontend, { maxAge: production ? '1h' : 0 }));
    app.get('/{*splat}', (_request, response) => response.sendFile(path.join(frontend, 'index.html')));
  } else app.get('/', (_request, response) => response.json({ app: 'Among Us · Orbital', frontend: 'npm run dev or npm run build', status: 'online' }));

  const timer = setInterval(() => service.advance(), 1000 / TICK_RATE);
  timer.unref();
  const close = async () => {
    clearInterval(timer);
    await new Promise(resolve => io.close(resolve));
    if (server.listening) await new Promise(resolve => server.close(resolve));
  };
  return { app, server, io, service, close };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const instance = createGameServer();
  const port = Number(process.env.PORT || 3000);
  instance.server.listen(port, '0.0.0.0', () => console.log(`Among Us multiplayer · 0.0.0.0:${instance.server.address().port}`));
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await instance.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
