import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, Check, CheckCheck, CircleCheck, LoaderCircle, Radio, Wifi, Zap } from 'lucide-react';
import Modal from './Modal.jsx';
import { audio } from '../lib/audio.js';

const WIRE_COLORS = ['#ef777a', '#79d4dc', '#c4ef76'];
export default function TaskDialog({ task, request, onClose }) {
  const [progress, setProgress] = useState(0);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [frequency, setFrequency] = useState(50);
  const [connected, setConnected] = useState([]);
  const [selected, setSelected] = useState(null);
  const completeRef = useRef(null);
  const aligned = Math.abs(frequency - task.challenge) <= 3;
  const complete = async () => {
    if (busy || finished) return;
    setBusy(true); setError('');
    try {
      await request('task:complete', { token: task.token, answer: task.type === 'signal' ? frequency : task.type === 'wires' ? task.challenge : null });
      setFinished(true);
      audio.play('success');
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  };
  useEffect(() => { completeRef.current = complete; });
  useEffect(() => { const timer = setTimeout(() => setReady(true), task.duration + 120); return () => clearTimeout(timer); }, [task.duration]);
  useEffect(() => {
    if (!started || task.type !== 'download') return;
    const start = performance.now();
    let frame;
    const update = () => {
      const value = Math.min(100, (performance.now() - start) / 3100 * 100);
      setProgress(value);
      if (value < 100) frame = requestAnimationFrame(update);
      else completeRef.current();
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [started, task.type]);
  useEffect(() => { if (!finished) return; const timer = setTimeout(onClose, 1100); return () => clearTimeout(timer); }, [finished, onClose]);
  const connect = right => {
    if (selected === null || connected.includes(selected)) return;
    if (task.challenge[selected] !== right) { setError('Combine os fios da mesma cor.'); audio.play('click'); return; }
    setConnected(current => [...current, selected]); setSelected(null); setError(''); audio.play('click');
  };
  return <Modal title={finished ? 'Conexão estabelecida.' : task.title} eyebrow={`${task.room.toUpperCase()} / TERMINAL DE BORDO`} onClose={onClose} className={`task-modal task-${task.type} ${finished ? 'task-finished' : ''}`}>
    {finished ? <div className="task-success"><span><CheckCheck size={40}/></span><h3>Tarefa concluída!</h3><p>A nave agradece. Sua tripulação também.</p><div className="success-sparks">{Array.from({ length: 8 }, (_, index) => <i key={index} style={{ '--i': index }}/>)}</div></div> : <>
      {task.type === 'download' && <><p className="modal-description">Transfira os registros para o computador central da nave.</p><div className={`download-display ${started ? 'transferring' : ''}`}><div className="download-terminal"><div className="terminal-screen"><Radio size={30}/><span>{started ? 'TRANSMITINDO' : 'ARQUIVO LOCAL'}</span></div><span>CAFETERIA_07</span></div><div className="data-packets"><i/><i/><i/><i/><span/></div><div className="download-terminal destination"><div className="terminal-screen"><Wifi size={30}/><span>DESTINO SEGURO</span></div><span>NAVE_CENTRAL</span></div></div><div className="download-stats"><span>{progress >= 100 ? 'Verificando integridade...' : started ? 'Enviando registros criptografados...' : 'Pronto para a transferência.'}</span><strong>{Math.floor(progress)}%</strong></div><div className="task-progress"><span style={{ width: `${progress}%` }}/></div><button className="button button-primary" disabled={started && !error} onClick={() => { if (error && progress >= 100) complete(); else { setStarted(true); audio.play('click'); } }}>{busy ? 'Verificando...' : started ? 'Transferência em andamento' : 'Iniciar transferência'}{started ? <LoaderCircle className="spinning" size={17}/> : <ArrowDownToLine size={17}/>}</button></>}
      {task.type === 'wires' && <><p className="modal-description">Selecione um conector à esquerda e depois a mesma cor à direita. Ligue os três circuitos.</p><div className="wire-board"><div className="wire-grooves"/><svg className="wire-lines" viewBox="0 0 360 220" preserveAspectRatio="none" aria-hidden="true">{connected.map(left => <path key={left} d={`M 36 ${39 + left * 71} C 150 ${39 + left * 71}, 210 ${39 + task.challenge[left] * 71}, 324 ${39 + task.challenge[left] * 71}`} fill="none" stroke={WIRE_COLORS[left]} strokeWidth="5" strokeLinecap="round"/>)}</svg><div className="wire-side">{WIRE_COLORS.map((color, index) => <button className={`wire-pin ${selected === index ? 'selected' : ''} ${connected.includes(index) ? 'connected' : ''}`} key={color} style={{ '--wire': color }} aria-label={`Selecionar fio ${index + 1}`} disabled={connected.includes(index)} onClick={() => setSelected(index)}><span/>{connected.includes(index) ? <Check size={15}/> : <span className="wire-mark">{['I', 'II', 'III'][index]}</span>}</button>)}</div><div className="wire-side right">{[0, 1, 2].map(index => { const left = task.challenge.indexOf(index); return <button className={`wire-pin ${connected.includes(left) ? 'connected' : ''}`} key={index} style={{ '--wire': WIRE_COLORS[left] }} aria-label={`Conectar na saída ${['I', 'II', 'III'][left]}`} disabled={connected.includes(left)} onClick={() => connect(index)}><span/>{connected.includes(left) ? <Check size={15}/> : <span className="wire-mark">{['I', 'II', 'III'][left]}</span>}</button>; })}</div></div><div className="circuit-status"><span>{connected.length}/3 CIRCUITOS RESTAURADOS</span><div>{[0, 1, 2].map(index => <i className={connected.includes(index) ? 'on' : ''} key={index}/>)}</div></div><button className="button button-primary" disabled={connected.length < 3 || !ready || busy} onClick={complete}>Confirmar conexões{busy ? <LoaderCircle size={17} className="spinning"/> : <Zap size={17}/>}</button></>}
      {task.type === 'signal' && <><p className="modal-description">Ajuste a frequência do distribuidor até sincronizar com o sinal da nave.</p><div className={`signal-display ${aligned ? 'aligned' : ''}`}><div className="signal-grid"/><svg viewBox="0 0 400 120" aria-hidden="true"><path d={Array.from({ length: 81 }, (_, index) => `${index ? 'L' : 'M'}${index * 5} ${60 + Math.sin(index / 5 + frequency / 12) * (25 + frequency / 5)}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="2.5"/><path d={Array.from({ length: 81 }, (_, index) => `${index ? 'L' : 'M'}${index * 5} ${60 + Math.sin(index / 5 + task.challenge / 12) * (25 + task.challenge / 5)}`).join(' ')} fill="none" stroke="#a5c3d6" strokeWidth="1.5" strokeDasharray="4 5" opacity=".35"/></svg><span><span className={aligned ? 'tiny-dot' : 'tiny-dot offline'}/>{aligned ? 'SINAL SINCRONIZADO' : 'PROCURANDO FREQUÊNCIA'}</span></div><div className="signal-values"><span>SEU SINAL<strong>{frequency}<small>MHz</small></strong></span><Radio size={23}/><span>ALVO DA NAVE<strong>{task.challenge}<small>MHz</small></strong></span></div><label className="sr-only" htmlFor="signal-range">Frequência do sinal</label><input id="signal-range" className="signal-range" type="range" min="0" max="100" value={frequency} onChange={event => setFrequency(Number(event.target.value))}/><button className="button button-primary" disabled={!aligned || !ready || busy} onClick={complete}>Calibrar distribuidor{busy ? <LoaderCircle size={17} className="spinning"/> : <Check size={17}/>}</button></>}
      {error && <p className="task-error" role="alert">{error}</p>}
    </>}
  </Modal>;
}
