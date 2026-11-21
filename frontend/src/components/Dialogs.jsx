import { useState } from 'react';
import { ArrowRight, AudioLines, Check, Code2, Crosshair, Download, Eye, Gamepad2, Heart, Keyboard, LoaderCircle, Orbit, Radio, ShieldCheck, Sparkles, UsersRound, WandSparkles, Waves, Zap } from 'lucide-react';
import Modal from './Modal.jsx';
import Crewmate from './Crewmate.jsx';
import { colorFor } from '../../../shared/constants.js';

export function MapDialog({ room, onClose }) {
  const self = room?.players.find(player => player.id === room.self.id);
  return <Modal title="Conheça a The Skeld" eyebrow="UM MAPA. MUITOS ÁLIBIS." onClose={onClose} wide className="map-modal">
    <p className="modal-description">Cada corredor tem uma história. Só não acredite em todas.</p>
    <div className="ship-map"><img src="/assets/map/skled.png" alt="Mapa da nave The Skeld: Cafeteria ao norte, Reator a oeste, Navegação a leste e Armazém ao centro-sul."/>{self && <span className="map-you" style={{ left: `${self.x / 1000 * 100}%`, top: `${self.y / 560 * 100}%`, '--marker-color': colorFor(self.color).hex }} title="Você está aqui"><i/></span>}{room?.self.tasks.filter(task => !task.done).map(task => <span className="map-task" key={task.id} style={{ left: `${task.x / 1000 * 100}%`, top: `${task.y / 560 * 100}%` }} title={`${task.room}: ${task.title}`}>!</span>)}</div>
    <div className="map-legend"><span><i className="legend-you"/>Você</span><span><i className="legend-task"/>Tarefa pendente</span><span className="muted">Use <kbd>M</kbd> para abrir ou fechar durante a missão.</span></div>
    {room?.self.tasks.length > 0 && <div className="map-task-list">{room.self.tasks.map(task => <div key={task.id} className={task.done ? 'done' : ''}>{task.done ? <Check size={15}/> : <Zap size={15}/>}<span>{task.room}<strong>{task.title}</strong></span>{task.done && <small>OK</small>}</div>)}</div>}
  </Modal>;
}

function Toggle({ checked, onChange, label, detail, icon: Icon }) {
  return <div className="setting-row"><span className="setting-icon"><Icon size={19}/></span><div><strong>{label}</strong><p>{detail}</p></div><button type="button" role="switch" aria-checked={checked} aria-label={label} className={`toggle ${checked ? 'checked' : ''}`} onClick={() => onChange(!checked)}><span/></button></div>;
}

export default function Dialogs({ type, onClose, settings, setSettings, onPlay, busy, status, room, onLeave }) {
  const [practiceRole, setPracticeRole] = useState('crewmate');
  if (!type) return null;
  if (type === 'map') return <MapDialog room={room} onClose={onClose}/>;
  if (type === 'leave') return <Modal title="Já vai deixar a nave?" eyebrow="DESEMBARQUE AUTORIZADO" onClose={onClose} className="leave-modal"><div className="leave-icon"><Orbit size={30}/></div><p>{room?.practice ? 'Seu treino será encerrado. Você pode começar uma nova simulação quando quiser.' : 'Você sairá da sala atual. Se a missão já começou, não será possível entrar nela novamente.'}</p><div className="leave-actions"><button className="button button-secondary" onClick={onClose} disabled={Boolean(busy)}>Ficar a bordo</button><button className="button button-danger" onClick={onLeave} disabled={Boolean(busy)}>{busy ? 'Desembarcando...' : 'Sair da nave'}{busy ? <LoaderCircle className="spinning" size={15}/> : <ArrowRight size={15}/>}</button></div></Modal>;
  if (type === 'settings') return <Modal title="Do seu jeito." eyebrow="AJUSTES DE BORDO" onClose={onClose} className="settings-modal">
    <p className="modal-description">Uma boa missão também precisa de conforto.</p>
    <Toggle checked={settings.sound} onChange={sound => setSettings(previous => ({ ...previous, sound }))} label="Efeitos sonoros" detail="Sinais da nave, ações e pequenas vitórias." icon={AudioLines}/>
    <div className="volume-setting"><label htmlFor="sound-volume">Volume <span>{Math.round(settings.volume * 100)}%</span></label><input id="sound-volume" aria-label="Volume dos efeitos" type="range" min="0" max="1" step="0.05" value={settings.volume} onChange={event => setSettings(previous => ({ ...previous, volume: Number(event.target.value) }))}/></div>
    <Toggle checked={settings.particles} onChange={particles => setSettings(previous => ({ ...previous, particles }))} label="Partículas e atmosfera" detail="Poeira estelar, passos e rastros de energia." icon={Sparkles}/>
    <Toggle checked={settings.shake} onChange={shake => setSettings(previous => ({ ...previous, shake }))} label="Impacto de câmera" detail="Um toque de intensidade nas eliminações." icon={Crosshair}/>
    <Toggle checked={settings.reducedMotion} onChange={reducedMotion => setSettings(previous => ({ ...previous, reducedMotion }))} label="Movimento reduzido" detail="Menos animações e transições mais suaves." icon={Waves}/>
    <div className="settings-note"><Eye size={15}/><span>Sua preferência de movimento do sistema é respeitada na primeira visita. Os ajustes ficam salvos neste navegador.</span></div>
    <button className="button button-primary" onClick={onClose}>Tudo ajustado <Check size={17}/></button>
  </Modal>;
  if (type === 'practice') return <Modal title="Primeiro, conheça a nave." eyebrow="TREINO LIVRE · 4 BOTS" onClose={onClose} className="practice-modal">
    <p className="modal-description">Sem pressão e sem amigos para culpar. Escolha um papel e experimente os controles em uma missão privada.</p>
    <div className="practice-roles"><button className={`practice-role ${practiceRole === 'crewmate' ? 'selected' : ''}`} onClick={() => setPracticeRole('crewmate')} aria-pressed={practiceRole === 'crewmate'}><Crewmate color="cyan"/><span className="role-check">{practiceRole === 'crewmate' && <Check size={13}/>}</span><strong>Tripulante</strong><span>Explore e complete tarefas.</span></button><button className={`practice-role impostor ${practiceRole === 'impostor' ? 'selected' : ''}`} onClick={() => setPracticeRole('impostor')} aria-pressed={practiceRole === 'impostor'}><Crewmate color="coral"/><span className="role-check">{practiceRole === 'impostor' && <Check size={13}/>}</span><strong>Impostor</strong><span>Encontre sua oportunidade.</span></button></div>
    <div className="practice-note"><Gamepad2 size={17}/><span>Os bots caminham pela nave e participam das reuniões. No treino, eles sempre pulam a votação.</span></div>
    <button className="button button-primary" disabled={Boolean(busy) || status !== 'online'} onClick={() => onPlay('practice:start', { role: practiceRole })}>{busy ? 'Preparando o treino...' : 'Embarcar no treino'}{busy ? <LoaderCircle size={18} className="spinning"/> : <ArrowRight size={18}/>}</button>
  </Modal>;
  if (type === 'help') return <Modal title="Confiança é um recurso limitado." eyebrow="MANUAL DO TRIPULANTE" onClose={onClose} wide className="help-modal">
    <p className="modal-description">Um impostor está entre vocês. O resto é trabalho em equipe. Ou quase.</p>
    <div className="how-grid"><article><span className="how-number">01 / TRABALHE</span><div className="how-art"><Crewmate color="cyan"/><Zap size={28}/></div><h3>Mantenha a nave viva.</h3><p>Como tripulante, encontre os terminais marcados e conclua suas tarefas. Fantasmas também podem ajudar.</p></article><article><span className="how-number">02 / DESCONFIE</span><div className="how-art"><Crewmate color="coral"/><Eye size={28}/></div><h3>Nem todo mundo é amigo.</h3><p>O impostor precisa eliminar sem ser descoberto. Observe os corredores e prepare um bom álibi.</p></article><article><span className="how-number">03 / CONVERSE</span><div className="how-art"><Crewmate color="lime"/><UsersRound size={28}/></div><h3>A verdade vai para votação.</h3><p>Reporte corpos ou use a mesa central da Cafeteria. Converse, vote em um suspeito ou pule a votação.</p></article></div>
    <div className="controls-heading"><Keyboard size={17}/><strong>Seu painel de comandos</strong><span>No celular, use o joystick e os botões na tela.</span></div><div className="key-guide"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Mover</span><span><kbd>E</kbd> Usar terminal</span><span><kbd>Q</kbd> Eliminar</span><span><kbd>R</kbd> Reportar</span><span><kbd>B</kbd> Reunião</span><span><kbd>M</kbd> Mapa</span></div>
    <button className="button button-primary" onClick={onClose}>Entendido. Não fui eu. <ArrowRight size={17}/></button>
  </Modal>;
  if (type === 'updates') return <Modal title="A mesma nave. Outra atmosfera." eyebrow="ORBITAL UPDATE 2.0" onClose={onClose} className="updates-modal">
    <p className="modal-description">Reimaginamos os detalhes para deixar cada missão mais viva.</p>
    <div className="release-list"><article><span><WandSparkles size={22}/></span><div><h3>Mais vida em cada passo</h3><p>Movimento interpolado, animações originais retrabalhadas, flutuação e partículas reativas.</p></div></article><article><span><Orbit size={22}/></span><div><h3>Pequenos grandes momentos</h3><p>Revelação de papéis, transições de reunião, expulsões no espaço e efeitos de eliminação.</p></div></article><article><span><ShieldCheck size={22}/></span><div><h3>O segredo fica no servidor</h3><p>Movimento, votos e eliminações validados no servidor. Nada de entregar o impostor na lista de salas.</p></div></article><article><span><Gamepad2 size={22}/></span><div><h3>Pratique antes de desconfiar</h3><p>Treino com quatro bots, três tarefas interativas e controles para teclado ou toque.</p></div></article><article><span><Heart size={22}/></span><div><h3>Acessibilidade a bordo</h3><p>Movimento reduzido, ajustes de som, navegação por teclado e interface em português.</p></div></article></div>
    <button className="button button-primary" onClick={onClose}>Vamos jogar <ArrowRight size={17}/></button>
  </Modal>;
  return <Modal title="Feito para jogar junto." eyebrow="CRÉDITOS & COMPANHIA" onClose={onClose} className="credits-modal"><div className="credits-art"><Crewmate color="cyan"/><Crewmate color="coral"/><Crewmate color="lime"/></div><p>Uma recriação do projeto aberto <a href="https://github.com/arizkhalid/among-us-clone" target="_blank" rel="noreferrer">arizkhalid/among-us-clone</a>, com interface, efeitos, animações e regras multiplayer retrabalhados.</p><p>Construído com React, Phaser e Socket.IO. Ícones Lucide e fonte Space Grotesk. Código sob licença MIT; confira os avisos em LICENSE e NOTICE.md.</p><div className="credits-disclaimer"><Code2 size={18}/><p>Among Us pertence à Innersloth. Este projeto independente de fãs não é oficial, afiliado ou endossado por ela.</p></div><button className="button button-secondary" onClick={onClose}>Voltar à nave <ArrowRight size={16}/></button></Modal>;
}
