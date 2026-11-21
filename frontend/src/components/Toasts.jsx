import { Check, CircleAlert, Info, X } from 'lucide-react';
export default function Toasts({ items, dismiss }) {
  return <div className="toast-stack" aria-live="polite" aria-atomic="false">{items.map(item => <div className={`toast toast-${item.type}`} key={item.id} role={item.type === 'error' ? 'alert' : 'status'}><span className="toast-icon">{item.type === 'success' ? <Check size={17}/> : item.type === 'error' ? <CircleAlert size={17}/> : <Info size={17}/>}</span><span>{item.message}</span><button onClick={() => dismiss(item.id)} aria-label="Dispensar notificação"><X size={15}/></button></div>)}</div>;
}
