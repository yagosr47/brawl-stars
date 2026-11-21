import { useEffect, useRef, useState } from 'react';
import { Ghost, MessageCircle, Send } from 'lucide-react';
import { colorFor } from '../../../shared/constants.js';

export default function Chat({ room, request, notify, compact = false }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const ref = useRef(null);
  const lastId = room.messages.at(-1)?.id;
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [lastId]);
  const submit = async event => {
    event.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    try { await request('chat:send', { text }); setText(''); }
    catch (error) { notify(error.message, 'error'); }
    finally { setSending(false); }
  };
  const allowed = ['lobby', 'meeting', 'ended'].includes(room.phase);
  return <section className={`chat ${compact ? 'chat-compact' : ''}`} aria-label="Chat da tripulação"><div className="chat-heading"><MessageCircle size={15}/><span>CANAL DA TRIPULAÇÃO</span>{!room.self.alive && <Ghost size={14}/>}</div><div className="chat-messages" ref={ref} role="log" aria-live="polite">{!room.messages.length && <div className="chat-empty"><MessageCircle size={26}/><p>{room.phase === 'meeting' ? 'Quem estava onde? Comece a conversa.' : 'Sua tripulação está ouvindo.'}</p><small>{room.self.alive ? 'Um bom álibi começa aqui.' : 'Suas mensagens só serão vistas por outros fantasmas.'}</small></div>}{room.messages.map(message => <div className={`chat-message ${message.playerId === room.self.id ? 'own' : ''} ${message.ghost ? 'ghost-message' : ''}`} key={message.id}><span className="message-avatar" style={{ background: colorFor(message.color).hex }}/><div><strong style={{ color: colorFor(message.color).hex }}>{message.name}{message.playerId === room.self.id && <small>VOCÊ</small>}{message.ghost && <Ghost size={10}/>}</strong><p>{message.text}</p></div></div>)}</div><form onSubmit={submit} className="chat-input"><label className="sr-only" htmlFor={`chat-${compact ? 'meeting' : 'room'}`}>Mensagem para a tripulação</label><input id={`chat-${compact ? 'meeting' : 'room'}`} disabled={!allowed} value={text} maxLength={160} autoComplete="off" placeholder={allowed ? 'Qual é o seu álibi?' : 'Chat disponível nas reuniões'} onChange={event => setText(event.target.value)}/><button aria-label="Enviar mensagem" disabled={!allowed || !text.trim() || sending}><Send size={16}/></button></form></section>;
}
