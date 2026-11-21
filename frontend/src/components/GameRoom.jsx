import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Bot, Check, CheckCheck, ChevronRight, Clock3, Copy, Crown,
  Flag, Ghost, HelpCircle, LoaderCircle, Map, MessageCircle, Radio, RadioTower, Rocket,
  Settings2, ShieldCheck, Skull, Sparkles, Terminal, UsersRound, WifiOff, Zap,
} from 'lucide-react';
import { KILL_DISTANCE, MIN_PLAYERS, USE_DISTANCE, colorFor, distance } from '../../../shared/constants.js';
import { hasLineOfSight } from '../../../shared/physics.js';
import RoomCanvas from '../game/RoomCanvas.jsx';
import Joystick from '../game/Joystick.jsx';
import Crewmate from './Crewmate.jsx';
import Chat from './Chat.jsx';
import Meeting from './Meeting.jsx';
import TaskDialog from './TaskDialog.jsx';
import { Ejection, GameEnd, RoleReveal, RoomEffects } from './GameOverlays.jsx';

export default function GameRoom({ room, roomRef, settings, status, ping, request, notify, onDialog, dialog, onLeave }) {
  const settingsRef = useRef(settings);
  const interactionsRef = useRef({ blocked: false, joystick: { active: false, x: 0, y: 0 } });
  const [sidebarTab, setSidebarTab] = useState(null);
  const [task, setTask] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef(null);
  const actionRef = useRef(null);
  const isLobby = room.phase === 'lobby';
  const isPlaying = room.phase === 'playing';
  const impostor = room.self.role === 'impostor';
  const self = room.players.find(player => player.id === room.self.id);
  const nearTask = !impostor && self && room.self.tasks.find(task => !task.done && distance(self, task) <= USE_DISTANCE);
  const nearBody = self && room.bodies.find(body => !body.reported && distance(self, body) <= USE_DISTANCE && hasLineOfSight('ship', self, body));
  const nearTarget = impostor && self && room.players.filter(player => player.id !== self.id && player.alive && distance(self, player) <= KILL_DISTANCE && hasLineOfSight('ship', self, player)).sort((a, b) => distance(self, a) - distance(self, b))[0];
  const nearMeeting = self && distance(self, { x: 556, y: 126 }) <= 45 && room.self.emergencies > 0;
  const cooldown = Math.max(0, Math.ceil((room.self.killReadyAt - room.serverTime) / 1000));
  const activeTab = isLobby && sidebarTab === 'tasks' ? 'crew' : sidebarTab || (isLobby ? 'crew' : 'tasks');
  const closeTask = useCallback(() => setTask(null), []);

  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => {
    interactionsRef.current.blocked = Boolean(dialog || task || status !== 'online' || !['lobby', 'playing'].includes(room.phase));
  }, [dialog, task, status, room.phase]);
  useEffect(() => { if (!isPlaying) setTask(null); }, [isPlaying]);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  const run = async (event, payload = {}) => {
    setBusy(true);
    try { await request(event, payload); }
    catch (error) { notify(error.message, 'error'); }
    finally { setBusy(false); }
  };
  const act = async action => {
    if (action === 'map') { if (!dialog || dialog === 'map') onDialog(dialog === 'map' ? null : 'map'); return; }
    if (!isPlaying || dialog || task || busy) return;
    if (action === 'use' && nearTask) {
      try { const result = await request('task:start', { taskId: nearTask.id }); setTask(result); }
      catch (error) { notify(error.message, 'error'); }
    }
    if (action === 'kill' && nearTarget && !cooldown && room.self.alive) run('player:kill', { targetId: nearTarget.id });
    if (action === 'report' && nearBody && room.self.alive) run('meeting:start', { bodyId: nearBody.id });
    if (action === 'meeting' && nearMeeting && room.self.alive) run('meeting:start');
  };
  useEffect(() => { actionRef.current = act; });
  useEffect(() => {
    const keyboard = event => {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      const action = { e: 'use', q: 'kill', r: 'report', b: 'meeting', m: 'map' }[event.key.toLowerCase()];
      if (action) { event.preventDefault(); actionRef.current?.(action); }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) event.preventDefault();
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/?sala=${room.id}`);
      setCopied(true); clearTimeout(copiedTimer.current); copiedTimer.current = setTimeout(() => setCopied(false), 2500);
      notify('Convite copiado. Agora só falta uma boa tripulação.', 'success');
    } catch { notify(`Seu código é ${room.id}. Compartilhe com seus amigos.`, 'info'); }
  };

  return <main className="game-main">
    <div className="game-breadcrumb"><button onClick={onLeave}><ArrowLeft size={13}/>Voltar</button><ChevronRight size={12}/><span>{room.practice ? 'TREINO LIVRE' : `SALA ${room.id}`}</span><span className="game-breadcrumb-map"><span className="tiny-dot"/>THE SKELD <i/> {room.practice ? <><Bot size={12}/>VOCÊ + 4 BOTS</> : <><UsersRound size={12}/>{room.players.length}/{room.maxPlayers} TRIPULANTES</>}</span></div>
    <div className="game-section-heading"><div><span className="eyebrow">{isLobby ? 'TODOS A BORDO.' : !room.self.alive ? 'HÁ VIDA DEPOIS DA ELIMINAÇÃO.' : 'OLHOS ABERTOS. ÁLIBI EM DIA.'}</span><h1>{isLobby ? 'A tripulação está chegando.' : !room.self.alive ? 'Sua missão ainda não acabou.' : 'Parece uma missão tranquila.'}<span>{isLobby ? '✦' : '?'}</span></h1></div><button className="game-help-button" onClick={() => onDialog('help')}><HelpCircle size={15}/><span>Manual de bordo</span><ArrowRight size={13}/></button></div>
    <div className={`game-layout ${isLobby ? 'lobby-layout' : ''}`}>
      <section className="map-stage" aria-label={isLobby ? 'Sala de espera da tripulação' : 'Mapa jogável The Skeld'}>
        <RoomCanvas roomRef={roomRef} settingsRef={settingsRef} interactionsRef={interactionsRef}/>
        <div className="stage-vignette"/>
        <div className="stage-topbar"><span className="stage-location"><span className="tiny-dot"/>{isLobby ? 'DOCA DE EMBARQUE' : 'THE SKELD / EM MISSÃO'}</span><span className="stage-connection"><Radio size={11}/>{ping === null ? 'CONECTADO' : `${ping} MS`}<i/>30 TICKS</span></div>
        {status !== 'online' && <div className="reconnecting-banner"><WifiOff size={15}/>Reconectando... Sua vaga fica reservada por 20 segundos.</div>}
        {isLobby ? <><div className="lobby-stage-label"><span className="stage-coordinate">CÂMERA 01 / INTERIOR DA NAVE</span><span>AGUARDANDO TRIPULAÇÃO<span className="loading-dots">...</span></span></div><div className="stage-lobby-bottom"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>Explore a sala de espera</span></span><span><ShieldCheck size={12}/>SALA SEGURA. POR ENQUANTO.</span></div><Joystick interactionsRef={interactionsRef}/></> : <>
          <div className="stage-task-progress"><div><span>TAREFAS DA TRIPULAÇÃO</span><strong>{room.tasks.completed}<span>/{room.tasks.total}</span></strong></div><div className="crew-task-track"><span style={{ width: `${room.tasks.total ? room.tasks.completed / room.tasks.total * 100 : 0}%` }}/></div></div>
          <button className="stage-map-button" onClick={() => onDialog('map')}><Map size={16}/><span>Mapa da nave</span><kbd>M</kbd></button>
          {!room.self.alive && <div className="ghost-note"><Ghost size={15}/><span>Você é um fantasma.<br/><strong>Continue suas tarefas para ajudar a tripulação.</strong></span></div>}
          {isPlaying && <><Joystick interactionsRef={interactionsRef}/><div className="game-actions">{impostor ? <button className={`ability-button kill-ability ${nearTarget && !cooldown ? 'ready' : ''}`} onClick={() => act('kill')} disabled={!room.self.alive || !nearTarget || Boolean(cooldown) || busy}><span className="ability-icon">{cooldown ? <strong>{cooldown}</strong> : <Skull size={23}/>}</span><span>Eliminar</span><kbd>Q</kbd></button> : <button className={`ability-button use-ability ${nearTask ? 'ready' : ''}`} onClick={() => act('use')} disabled={!nearTask || busy}><span className="ability-icon"><Terminal size={23}/></span><span>Usar</span><kbd>E</kbd></button>}<button className={`ability-button report-ability ${nearBody ? 'ready' : ''}`} onClick={() => act('report')} disabled={!room.self.alive || !nearBody || busy}><span className="ability-icon"><Flag size={22}/></span><span>Reportar</span><kbd>R</kbd></button><button className={`ability-button meeting-ability ${nearMeeting ? 'ready' : ''}`} onClick={() => act('meeting')} disabled={!room.self.alive || !nearMeeting || busy}><span className="ability-icon"><RadioTower size={22}/></span><span>Reunião</span><kbd>B</kbd></button></div><div className="stage-move-help"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span>MOVER <i/> {nearTask ? `PRESSIONE E PARA ${nearTask.title.toUpperCase()}` : impostor ? 'PAREÇA OCUPADO. ESPERE A OPORTUNIDADE.' : 'PROCURE OS TERMINAIS MARCADOS COM !'}</div></>}
        </>}
        <span className="stage-corner corner-tl"/><span className="stage-corner corner-tr"/><span className="stage-corner corner-bl"/><span className="stage-corner corner-br"/>
      </section>

      <aside className="game-sidebar">
        <div className="room-code-card"><span className="micro-label">{room.practice ? 'SIMULAÇÃO PRIVADA' : 'CÓDIGO DA SALA'}</span><div><strong>{room.id}</strong><button className="icon-button" onClick={copy} aria-label="Copiar convite da sala">{copied ? <CheckCheck size={18}/> : <Copy size={17}/>}</button></div><span>{room.practice ? 'Só você e os bots. Pode errar à vontade.' : 'Compartilhe. A desconfiança vem depois.'}</span></div>
        <div className="sidebar-tabs" role="tablist" aria-label="Painel da missão">{!isLobby && <button role="tab" aria-selected={activeTab === 'tasks'} className={activeTab === 'tasks' ? 'active' : ''} onClick={() => setSidebarTab('tasks')}><Zap size={13}/>Missão</button>}<button role="tab" aria-selected={activeTab === 'crew'} className={activeTab === 'crew' ? 'active' : ''} onClick={() => setSidebarTab('crew')}><UsersRound size={13}/>Tripulação</button><button role="tab" aria-selected={activeTab === 'chat'} className={activeTab === 'chat' ? 'active' : ''} onClick={() => setSidebarTab('chat')}><MessageCircle size={13}/>Chat{room.messages.length > 0 && <span className="chat-count">{room.messages.length}</span>}</button></div>
        <div className="sidebar-content">
          {activeTab === 'crew' && <div className="crew-list"><div className="crew-list-heading"><span>A BORDO</span><span>{room.players.length}/{room.maxPlayers}</span></div>{room.players.map(player => <div className={`crew-member ${!player.alive ? 'is-ghost' : ''}`} key={player.id}><span className="crew-member-avatar" style={{ '--avatar-glow': colorFor(player.color).hex }}><Crewmate color={player.color} ghost={!player.alive}/></span><span className="crew-member-info"><strong>{player.name}{player.id === room.self.id && <small>VOCÊ</small>}</strong><span>{!player.alive ? 'FANTASMA' : player.bot ? 'BOT DE TREINO' : player.id === room.hostId ? 'CAPITÃO DA NAVE' : 'TRIPULANTE'}</span></span>{player.id === room.hostId ? <Crown size={14} className="captain-icon"/> : player.bot ? <Bot size={13} className="bot-icon"/> : <span className={`member-status ${player.connected ? 'connected' : ''}`}/>}</div>)}{isLobby && Array.from({ length: Math.min(room.maxPlayers - room.players.length, 3) }, (_, index) => <div className="empty-crew-slot" key={`empty-${index}`}><span>+</span><div>Um lugar para seu amigo.<small>Aguardando embarque</small></div></div>)}</div>}
          {activeTab === 'tasks' && <div className="mission-panel"><div className={`your-role ${impostor ? 'role-impostor' : ''}`}><span>{impostor ? <Skull size={17}/> : !room.self.alive ? <Ghost size={17}/> : <ShieldCheck size={17}/>}</span><div><small>SUA FUNÇÃO</small><strong>{impostor ? 'Impostor' : !room.self.alive ? 'Fantasma da tripulação' : 'Tripulante'}</strong></div></div><p className="mission-description">{impostor ? 'Misture-se à tripulação. Encontre um alvo sozinho e volte a parecer ocupado.' : 'Encontre os terminais na nave e conclua suas tarefas. Juntos, vocês mantêm a missão viva.'}</p>{impostor ? <div className="impostor-tips"><div><span>01</span><p>Use o mapa para conhecer os corredores.</p></div><div><span>02</span><p>Aproxime-se de um tripulante e pressione <kbd>Q</kbd>.</p></div><div><span>03</span><p>O intervalo entre eliminações é de 18 segundos.</p></div></div> : <div className="personal-tasks">{room.self.tasks.map(item => <div className={`personal-task ${item.done ? 'done' : ''} ${nearTask?.id === item.id ? 'near' : ''}`} key={item.id}><span>{item.done ? <Check size={13}/> : <Zap size={13}/>}</span><div><small>{item.room}</small><strong>{item.title}</strong><span>{item.done ? 'Tarefa concluída' : nearTask?.id === item.id ? 'Perto de você · pressione E' : 'Encontre o terminal no mapa'}</span></div>{item.done && <CheckCheck size={13}/>}</div>)}</div>}<button className="task-map-link" onClick={() => onDialog('map')}><Map size={14}/>Ver os terminais no mapa<ArrowRight size={12}/></button></div>}
          {activeTab === 'chat' && <Chat room={room} request={request} notify={notify}/>}
        </div>
        <div className="sidebar-bottom">{isLobby ? <><div className="launch-requirements"><span className="tiny-dot"/>{room.players.length >= MIN_PLAYERS ? 'TRIPULAÇÃO PRONTA PARA A MISSÃO' : `AGUARDANDO MAIS ${MIN_PLAYERS - room.players.length} TRIPULANTE${MIN_PLAYERS - room.players.length === 1 ? '' : 'S'}`}</div>{room.hostId === room.self.id ? <button className="button button-primary launch-button" disabled={room.players.filter(player => player.connected).length < MIN_PLAYERS || busy || status !== 'online'} onClick={() => run('game:start')}>{busy ? 'Preparando...' : 'Iniciar missão'}{busy ? <LoaderCircle className="spinning" size={17}/> : <Rocket size={17}/>}</button> : <div className="waiting-for-host"><Clock3 size={16}/>Aguardando o capitão iniciar</div>}<p>A missão começa com pelo menos 3 jogadores.</p></> : <div className="sidebar-player"><Crewmate color={room.self.color}/><div><strong>{self?.name}</strong><span>{room.practice ? 'TREINO EM ANDAMENTO' : 'VOCÊ FAZ PARTE DESSA HISTÓRIA'}</span></div><span className="tiny-dot"/></div>}</div>
      </aside>
    </div>
    <footer className="game-footer"><span><ShieldCheck size={12}/>REGRAS VALIDADAS NO SERVIDOR</span><span>CONFIANÇA NÃO INCLUSA.<span className="tiny-dot"/>ORBITAL EDITION 2.0</span></footer>
    {task && isPlaying && <TaskDialog task={task} request={request} onClose={closeTask}/>}
    {room.phase === 'countdown' && <RoleReveal room={room}/>}
    {room.phase === 'meeting' && <Meeting room={room} request={request} notify={notify}/>}
    {room.phase === 'ejection' && <Ejection room={room}/>}
    {room.phase === 'ended' && <GameEnd room={room} settings={settings} onReset={() => run('game:reset')} onLeave={onLeave} busy={busy}/>}
    <RoomEffects roomRef={roomRef}/>
  </main>;
}
