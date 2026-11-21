import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

function readToken() { try { return sessionStorage.getItem('orbital-session'); } catch { return null; } }
const socket = io(import.meta.env.VITE_SERVER_URL || undefined, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
  auth: callback => callback({ sessionToken: readToken() }),
  reconnectionDelay: 800,
  reconnectionDelayMax: 4000,
  timeout: 10_000,
});

export const gameBus = new EventTarget();
export const emitGame = (type, detail) => gameBus.dispatchEvent(new CustomEvent(type, { detail }));
let sequence = 0;
export const sendInput = (x, y) => {
  if (socket.connected) socket.emit('player:input', { x, y, seq: ++sequence });
};
export const request = (event, data = {}) => new Promise((resolve, reject) => {
  if (!socket.connected) return reject(new Error('Estamos reconectando com a nave. Tente em instantes.'));
  socket.timeout(8000).emit(event, data, (timeout, result) => {
    if (timeout) return reject(new Error('A nave demorou para responder. Tente novamente.'));
    if (!result?.ok) return reject(new Error(result?.error || 'Não foi possível completar a ação.'));
    resolve(result.data);
  });
});

export function useGameClient(notify) {
  const [status, setStatus] = useState('connecting');
  const [room, setRoom] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [ping, setPing] = useState(null);
  const roomRef = useRef(null);
  const profileRef = useRef(null);
  useEffect(() => {
    const connect = () => setStatus('online');
    const disconnect = () => setStatus('offline');
    const session = data => {
      try { sessionStorage.setItem('orbital-session', data.token); } catch { /* Private browsing. */ }
      profileRef.current = data;
      setStatus('online');
    };
    const state = data => { roomRef.current = data; setRoom(data); };
    const list = data => setRooms(Array.isArray(data) ? data : []);
    const event = data => {
      emitGame('effect', data);
      if (data.type === 'task-complete') notify(`${data.title}: tarefa concluída!`, 'success');
      if (data.type === 'player-left') notify(`${data.name} saiu da nave.`, 'info');
    };
    const replaced = () => notify('Essa sessão foi aberta em outra aba. Atualize para reconectar.', 'error');
    socket.on('connect', connect);
    socket.on('disconnect', disconnect);
    socket.on('connect_error', disconnect);
    socket.on('session', session);
    socket.on('room:state', state);
    socket.on('rooms:updated', list);
    socket.on('room:event', event);
    socket.on('session:replaced', replaced);
    socket.connect();
    const measure = async () => {
      if (!socket.connected) return;
      const start = performance.now();
      try { await request('ping:check'); setPing(Math.max(1, Math.round(performance.now() - start))); } catch { /* Reconnection handles this. */ }
    };
    measure();
    const timer = setInterval(measure, 5000);
    return () => {
      clearInterval(timer);
      socket.off('connect', connect);
      socket.off('disconnect', disconnect);
      socket.off('connect_error', disconnect);
      socket.off('session', session);
      socket.off('room:state', state);
      socket.off('rooms:updated', list);
      socket.off('room:event', event);
      socket.off('session:replaced', replaced);
      socket.disconnect();
    };
  }, [notify]);
  const refreshRooms = async () => {
    const response = await fetch(`${import.meta.env.VITE_SERVER_URL || ''}/api/rooms`);
    if (!response.ok) throw new Error('Não foi possível buscar as salas.');
    const data = await response.json();
    setRooms(data.rooms || []);
  };
  return { status, room, roomRef, rooms, ping, request, refreshRooms, profileRef };
}
