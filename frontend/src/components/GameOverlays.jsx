import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Clock3, LoaderCircle, RadioTower, RotateCcw, ShieldCheck, Skull, Sparkles } from 'lucide-react';
import Crewmate from './Crewmate.jsx';
import { gameBus } from '../lib/client.js';
import { audio } from '../lib/audio.js';

export function RoleReveal({ room }) {
  const impostor = room.self.role === 'impostor';
  const seconds = Math.max(1, Math.ceil((room.deadline - room.serverTime) / 1000));
  return <div className={`role-reveal ${impostor ? 'is-impostor' : ''}`} role="status" aria-live="polite"><div className="role-beam"/><span className="role-shhh">SHHH...</span><div className="role-portrait"><div className="role-portrait-orbit"/><Crewmate color={room.self.color} patch/><span className="portrait-spark spark-1">✦</span><span className="portrait-spark spark-2">+</span></div><span className="role-you-are">SUA MISSÃO É CONFIDENCIAL</span><h2>{impostor ? 'Impostor' : 'Tripulante'}</h2><p>{impostor ? 'Uma nave. Uma chance. Não deixe testemunhas.' : 'Complete suas tarefas. Proteja a tripulação.'}<br/><span>{impostor ? 'Seu melhor disfarce é parecer ocupado.' : 'Há um impostor entre vocês. Mantenha os olhos abertos.'}</span></p><div className="launch-countdown"><span className="tiny-dot"/>DECOLANDO EM <strong>0{seconds}</strong></div>{room.practice && <span className="role-practice">TREINO PRIVADO · VOCÊ + 4 BOTS</span>}</div>;
}

export function Ejection({ room }) {
  const result = room.ejection;
  if (!result) return null;
  return <div className="ejection-overlay" role="status"><div className="ejection-stars"/><span className="eyebrow">RESULTADO DA VOTAÇÃO</span>{result.targetId ? <><div className="ejected-crewmate"><Crewmate color={result.color}/></div><div className="ejection-copy"><h2><strong>{result.name}</strong> {result.wasImpostor ? 'era o impostor.' : 'não era o impostor.'}</h2><p>{result.wasImpostor ? 'O espaço acaba de ficar um pouco mais seguro.' : 'Às vezes, a desconfiança aponta para o lado errado.'}</p></div></> : <div className="ejection-copy no-ejection"><div className="no-ejection-orbit"><ShieldCheck size={32}/></div><h2>Ninguém foi ejetado.</h2><p>{result.tie ? 'A votação terminou empatada.' : 'A tripulação decidiu dar mais uma chance.'}<br/>A missão continua. E as suspeitas também.</p></div>}<span className="ejection-bottom">A NAVE AGUARDA O PRÓXIMO CAPÍTULO<span className="blink-cursor">_</span></span></div>;
}

export function GameEnd({ room, onReset, onLeave, busy, settings }) {
  const won = room.result.winner === room.self.role;
  const team = room.players.filter(player => player.role === room.result.winner);
  const elapsed = Math.max(0, Math.round((room.result.endedAt - room.startedAt) / 1000));
  return <div className={`game-end ${won ? 'victory' : 'defeat'}`} role="status"><div className="end-spotlight"/>{won && settings.particles && <div className="victory-particles" aria-hidden="true">{Array.from({ length: 24 }, (_, index) => <i key={index} style={{ '--i': index, left: `${(index * 37 + 13) % 100}%`, animationDelay: `${index % 7 * -0.7}s` }}/>)}</div>}<span className="eyebrow">MISSÃO ENCERRADA / {room.practice ? 'TREINO LIVRE' : room.id}</span><span className="end-subtitle">{won ? 'PODE RESPIRAR.' : 'NEM TODO ÁLIBI CONVENCE.'}</span><h2>{won ? 'Vitória.' : 'Dessa vez, não.'}<span>✦</span></h2><p>{room.result.reason}</p><div className="winning-team">{team.map((player, index) => <div className="winning-player" key={player.id} style={{ '--team-index': index }}><Crewmate color={player.color} patch={player.id === room.self.id}/><strong>{player.name}</strong><span>{player.role === 'impostor' ? 'IMPOSTOR' : 'TRIPULANTE'}{player.id === room.self.id ? ' · VOCÊ' : ''}</span></div>)}</div><div className="end-stats"><span><Clock3 size={13}/>{Math.floor(elapsed / 60)}:{(elapsed % 60).toString().padStart(2, '0')} de missão</span><i/><span><Check size={13}/>{room.tasks.completed}/{room.tasks.total} tarefas concluídas</span></div><div className="end-actions">{room.hostId === room.self.id ? <button className="button button-primary" disabled={busy} onClick={onReset}>{room.practice ? 'Mais um treino' : 'Voltar ao lobby'}{busy ? <LoaderCircle size={17} className="spinning"/> : <RotateCcw size={17}/>}</button> : <span className="waiting-for-host"><LoaderCircle size={16} className="spinning"/>Aguardando o capitão preparar a próxima missão.</span>}<button className="text-button" onClick={onLeave}>Voltar ao início <ArrowRight size={15}/></button></div></div>;
}

export function RoomEffects({ roomRef }) {
  const [effect, setEffect] = useState(null);
  const timer = useRef(null);
  useEffect(() => {
    const listener = event => {
      const data = event.detail;
      if (data.type === 'countdown') audio.play('start');
      if (data.type === 'meeting') audio.play('meeting');
      if (data.type === 'ejection') audio.play('ejection');
      if (data.type === 'player-joined') audio.play('join');
      if (data.type === 'game-ended' && data.winner === roomRef.current?.self.role) audio.play('success');
      if (!['meeting', 'your-death', 'task-complete'].includes(data.type)) return;
      clearTimeout(timer.current);
      setEffect(data);
      timer.current = setTimeout(() => setEffect(null), data.type === 'your-death' ? 2300 : data.type === 'meeting' ? 1450 : 1000);
    };
    gameBus.addEventListener('effect', listener);
    return () => { gameBus.removeEventListener('effect', listener); clearTimeout(timer.current); };
  }, [roomRef]);
  if (!effect) return null;
  if (effect.type === 'meeting') return <div className="meeting-splash" aria-hidden="true"><div className="meeting-speed-lines"/><RadioTower size={52}/><span>{effect.reason === 'report' ? 'CORPO REPORTADO' : 'REUNIÃO DE EMERGÊNCIA'}</span><strong>Vamos conversar.</strong></div>;
  if (effect.type === 'your-death') return <div className="death-splash" role="status"><div className="death-slash slash-one"/><div className="death-slash slash-two"/><div className="death-splash-content"><span className="eyebrow">SEU ÁLIBI NÃO FOI SUFICIENTE</span><div className="death-portrait"><Crewmate color={effect.killerColor}/><Skull size={31}/></div><h2>Fim da linha.</h2><p>Mas não da missão.<br/>Continue ajudando nas tarefas como fantasma.</p></div></div>;
  return <div className="task-complete-flash" aria-hidden="true"><Sparkles size={26}/><strong>+1 TAREFA CONCLUÍDA</strong></div>;
}
