import { useState } from 'react';
import { Check, CheckCheck, Clock3, Ghost, LoaderCircle, RadioTower, ShieldQuestion, SkipForward, UsersRound } from 'lucide-react';
import Modal from './Modal.jsx';
import Crewmate from './Crewmate.jsx';
import Chat from './Chat.jsx';

export default function Meeting({ room, request, notify }) {
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const seconds = Math.max(0, Math.ceil((room.meeting.endAt - room.serverTime) / 1000));
  const voted = room.self.voted;
  const eligible = room.self.alive;
  const vote = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try { await request('meeting:vote', { targetId: selected }); }
    catch (error) { notify(error.message, 'error'); }
    finally { setBusy(false); }
  };
  // Meetings cannot be dismissed locally. Only the authoritative server ends them.
  const noop = () => {};
  return <Modal title="Quem está mentindo?" eyebrow={room.meeting.reason === 'report' ? 'CORPO REPORTADO' : 'REUNIÃO DE EMERGÊNCIA'} onClose={noop} wide className="meeting-modal">
    <div className="meeting-summary"><span><RadioTower size={14}/><strong>{room.meeting.callerName}</strong> convocou a tripulação.</span><span className={seconds < 10 ? 'timer urgent' : 'timer'}><Clock3 size={14}/><strong>{seconds.toString().padStart(2, '0')}</strong>s</span></div>
    <div className="meeting-timer-track"><span style={{ width: `${seconds / 45 * 100}%` }}/></div>
    <div className="meeting-layout"><div className="vote-area"><div className="vote-area-header"><UsersRound size={14}/><span>TRIPULAÇÃO</span><strong>{room.meeting.votedCount}/{room.meeting.eligibleCount} votos</strong></div><div className="vote-grid">{room.players.map(player => <button key={player.id} className={`vote-tile ${selected === player.id ? 'selected' : ''} ${!player.alive ? 'dead' : ''}`} onClick={() => setSelected(player.id)} disabled={!player.alive || voted || !eligible || busy} aria-pressed={selected === player.id}><span className="vote-avatar"><Crewmate color={player.color} ghost={!player.alive}/></span><span className="vote-player-name"><strong>{player.name}</strong><span>{player.id === room.self.id ? 'VOCÊ' : player.bot ? 'BOT DE TREINO' : !player.alive ? 'FANTASMA' : 'TRIPULANTE'}</span></span>{player.voted ? <span className="voted-badge" title="Voto registrado"><CheckCheck size={13}/></span> : !player.alive ? <Ghost size={14} className="vote-ghost"/> : <span className="vote-radio">{selected === player.id && <Check size={10}/>}</span>}</button>)}</div><button className={`skip-vote ${selected === 'skip' ? 'selected' : ''}`} onClick={() => setSelected('skip')} disabled={voted || !eligible || busy} aria-pressed={selected === 'skip'}><SkipForward size={16}/><span>Ninguém parece suspeito. <strong>Pular voto</strong></span><span className="vote-radio">{selected === 'skip' && <Check size={10}/>}</span></button><div className="vote-footer">{voted ? <div className="vote-confirmed"><CheckCheck size={19}/><span>Voto registrado.<small>Agora é esperar a verdade aparecer.</small></span></div> : !eligible ? <div className="vote-confirmed ghost"><Ghost size={19}/><span>Fantasmas não votam.<small>Mas podem acompanhar a conversa.</small></span></div> : <><span><ShieldQuestion size={15}/>Escolha com cuidado.<br/>Um voto muda a missão.</span><button className="button button-primary" onClick={vote} disabled={!selected || busy}>{busy ? 'Enviando...' : 'Confirmar voto'}{busy ? <LoaderCircle size={15} className="spinning"/> : <Check size={15}/>}</button></>}</div></div><Chat room={room} request={request} notify={notify} compact/></div>
  </Modal>;
}
