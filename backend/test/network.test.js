import test from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { createGameServer } from '../src/server.js';

async function environment(t) {
  const instance = createGameServer();
  await new Promise(resolve => instance.server.listen(0, '0.0.0.0', resolve));
  const url = `http://127.0.0.1:${instance.server.address().port}`;
  const sockets = [];
  t.after(async () => { for (const socket of sockets) socket.disconnect(); await instance.close(); });
  const connect = async token => {
    const socket = io(url, { autoConnect: false, reconnection: false, transports: ['websocket'], auth: { sessionToken: token } });
    sockets.push(socket);
    const states = [];
    socket.on('room:state', state => states.push(state));
    const session = await new Promise((resolve, reject) => {
      socket.once('session', resolve);
      socket.once('connect_error', reject);
      socket.connect();
    });
    const request = (event, data = {}) => socket.timeout(2500).emitWithAck(event, data);
    return { socket, session, request, states };
  };
  return { ...instance, url, connect };
}

test('real HTTP and Socket.IO: public room summaries contain no internal state', async t => {
  const env = await environment(t);
  const host = await env.connect();
  assert.equal((await host.request('profile:update', { name: 'Yago', color: 'coral' })).ok, true);
  const response = await host.request('room:create', { maxPlayers: 6 });
  assert.equal(response.ok, true);
  const health = await (await fetch(`${env.url}/api/health`)).json();
  assert.equal(health.status, 'online');
  const { rooms } = await (await fetch(`${env.url}/api/rooms`)).json();
  assert.equal(rooms[0].code, response.data.code);
  assert.equal(rooms[0].count, 1);
  const json = JSON.stringify(rooms);
  for (const forbidden of ['role', 'token', 'impostor', 'imposter', 'killReadyAt', 'state']) assert.ok(!json.includes(forbidden));
  assert.ok(!json.includes(host.session.token));
});

test('real sockets: malformed packets are rejected without crashing the server', async t => {
  const env = await environment(t), client = await env.connect();
  for (const payload of [null, 'not an object', [], { roomId: '__proto__', playerId: 'outsider' }]) {
    const response = await client.request('meeting:start', payload);
    assert.equal(response.ok, false);
  }
  assert.equal((await fetch(`${env.url}/api/health`)).status, 200);
  assert.equal((await client.request('ping:check')).ok, true);
});

test('real sockets: client-supplied identities cannot control the host or start a foreign room', async t => {
  const env = await environment(t), host = await env.connect(), outsider = await env.connect();
  await host.request('profile:update', { name: 'Yago', color: 'coral' });
  const { data } = await host.request('room:create');
  const response = await outsider.request('game:start', { roomId: data.code, playerId: host.session.id, hostId: host.session.id });
  assert.equal(response.ok, false);
  assert.equal(env.service.rooms.get(data.code).phase, 'lobby');
  const movement = await outsider.request('player:input', { roomId: data.code, playerId: host.session.id, id: host.session.id, x: 99999, y: -99999, seq: 1 });
  assert.equal(movement.ok, false);
});

test('real sockets: reconnection restores the same identity and room', async t => {
  const env = await environment(t), first = await env.connect();
  await first.request('profile:update', { name: 'Yago', color: 'coral' });
  const { data } = await first.request('room:create');
  first.socket.disconnect();
  const second = await env.connect(first.session.token);
  assert.equal(second.session.id, first.session.id);
  assert.equal(env.service.player(second.session.id).roomId, data.code);
  await second.request('ping:check');
  assert.ok(second.states.some(state => state?.id === data.code));
});

test('real sockets: action rate limiting rejects repeated room creation', async t => {
  const env = await environment(t), client = await env.connect();
  await client.request('room:create');
  await client.request('room:create');
  const result = await client.request('room:create');
  assert.equal(result.ok, false);
  assert.equal(result.code, 'RATE_LIMIT');
});

test('real sockets: reconnecting after room removal clears stale client state', async t => {
  const env = await environment(t), first = await env.connect();
  const { data } = await first.request('room:create');
  first.socket.disconnect();
  env.service.leave(first.session.id);
  assert.equal(env.service.rooms.has(data.code), false);
  const resumed = await env.connect(first.session.token);
  await resumed.request('ping:check');
  assert.equal(resumed.session.id, first.session.id);
  assert.equal(env.service.player(resumed.session.id).roomId, null);
  assert.ok(resumed.states.includes(null), 'an explicit null snapshot clears the old room UI');
});

test('real sockets: replacing a session disconnects only the old connection', async t => {
  const env = await environment(t), first = await env.connect();
  const { data } = await first.request('room:create');
  const replaced = new Promise(resolve => first.socket.once('session:replaced', resolve));
  const second = await env.connect(first.session.token);
  await replaced;
  await second.request('ping:check');
  assert.equal(second.session.id, first.session.id);
  assert.equal(first.socket.connected, false);
  assert.equal(env.service.player(second.session.id).connected, true);
  assert.equal(env.service.player(second.session.id).roomId, data.code);
  assert.ok(second.states.some(state => state?.id === data.code));
});
