import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import Header from './components/Header.jsx';
import Home from './components/Home.jsx';
import Dialogs from './components/Dialogs.jsx';
import Starfield from './components/Starfield.jsx';
import Toasts from './components/Toasts.jsx';
import { useGameClient } from './lib/client.js';
import { useStoredState, useToasts } from './lib/hooks.js';
import { audio } from './lib/audio.js';

const GameRoom = lazy(() => import('./components/GameRoom.jsx'));
const defaultSettings = {
  sound: false, volume: 0.35, particles: true, shake: true,
  reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
};

export default function App() {
  const [settings, setSettings] = useStoredState('orbital-settings', defaultSettings);
  const [profile, setProfile] = useStoredState('orbital-profile', { name: '', color: 'coral' });
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(null);
  const [attempted, setAttempted] = useState(false);
  const { toasts, notify, dismiss } = useToasts();
  const client = useGameClient(notify);
  const closeDialog = useCallback(() => setDialog(null), []);

  const phase = client.room?.phase;
  useEffect(() => {
    if (phase && !['lobby', 'playing'].includes(phase)) setDialog(null);
  }, [phase]);

  useEffect(() => {
    document.documentElement.dataset.motion = settings.reducedMotion ? 'reduced' : 'full';
    audio.configure(settings);
    if (settings.sound) audio.unlock();
  }, [settings]);
  useEffect(() => {
    const unlock = () => audio.unlock();
    document.addEventListener('pointerdown', unlock, { passive: true });
    document.addEventListener('keydown', unlock);
    return () => { document.removeEventListener('pointerdown', unlock); document.removeEventListener('keydown', unlock); };
  }, []);

  const play = async (action, payload) => {
    if (busy) return;
    const practice = action === 'practice:start';
    let name = String(profile.name || '').trim();
    if (name.length < 2 && !practice) {
      setAttempted(true);
      notify('Primeiro, escolha um nome com pelo menos 2 caracteres.', 'error');
      document.getElementById('player-name')?.focus();
      return;
    }
    if (name.length < 2) name = 'Tripulante';
    setBusy(action);
    try {
      await client.request('profile:update', { name, color: profile.color });
      const result = await client.request(action, payload);
      setProfile(previous => ({ ...previous, name, color: result?.color || previous.color }));
      setDialog(null);
      audio.play('join');
      window.scrollTo({ top: 0, behavior: 'instant' });
    } catch (error) { notify(error.message, 'error'); }
    finally { setBusy(null); }
  };
  const leaveNow = async () => {
    if (busy) return;
    setBusy('room:leave');
    try {
      await client.request('room:leave');
      setDialog(null);
      const url = new URL(window.location.href);
      url.searchParams.delete('sala');
      window.history.replaceState({}, '', url);
    } catch (error) { notify(error.message, 'error'); }
    finally { setBusy(null); }
  };
  const leave = () => { if (client.room?.phase === 'ended') leaveNow(); else setDialog('leave'); };
  const home = () => {
    if (client.room) leave();
    else window.scrollTo({ top: 0, behavior: settings.reducedMotion ? 'instant' : 'smooth' });
  };
  const refresh = async () => { try { await client.refreshRooms(); } catch (error) { notify(error.message, 'error'); } };

  return <div className={`app-shell ${client.room ? 'in-game' : ''}`}>
    <Starfield reduced={settings.reducedMotion} particles={settings.particles}/>
    <Header status={client.status} settings={settings} setSettings={setSettings} onDialog={setDialog} onHome={home} inGame={Boolean(client.room)}/>
    {client.room ? <Suspense fallback={<div className="game-module-loading"><LoaderCircle className="spinning" size={30}/><span>Preparando a nave...</span></div>}><GameRoom key={client.room.id} room={client.room} roomRef={client.roomRef} settings={settings} status={client.status} ping={client.ping} request={client.request} notify={notify} onDialog={setDialog} dialog={dialog} onLeave={leave}/></Suspense> : <Home profile={profile} setProfile={setProfile} rooms={client.rooms} status={client.status} ping={client.ping} busy={busy} invalidName={attempted && String(profile.name || '').trim().length < 2} onPlay={play} onDialog={setDialog} onRefresh={refresh}/>}
    {dialog && <Dialogs type={dialog} onClose={closeDialog} settings={settings} setSettings={setSettings} onPlay={play} busy={busy} status={client.status} room={client.room} onLeave={leaveNow}/>}
    <Toasts items={toasts} dismiss={dismiss}/>
  </div>;
}
