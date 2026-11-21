import { useEffect, useRef } from 'react';
import { Move } from 'lucide-react';

export default function Joystick({ interactionsRef }) {
  const root = useRef(null), thumb = useRef(null), pointer = useRef(null);
  const reset = () => {
    pointer.current = null;
    interactionsRef.current.joystick = { active: false, x: 0, y: 0 };
    if (thumb.current) thumb.current.style.transform = 'translate(0px, 0px)';
    root.current?.classList.remove('engaged');
  };
  useEffect(() => {
    const blur = () => { interactionsRef.current.joystick = { active: false, x: 0, y: 0 }; };
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('blur', blur); blur(); };
  }, [interactionsRef]);
  const move = event => {
    if (pointer.current !== event.pointerId) return;
    const box = root.current.getBoundingClientRect();
    const dx = event.clientX - box.left - box.width / 2, dy = event.clientY - box.top - box.height / 2;
    const length = Math.hypot(dx, dy), max = box.width * 0.29;
    const x = length > max ? dx / length : dx / max;
    const y = length > max ? dy / length : dy / max;
    interactionsRef.current.joystick = { active: true, x: Math.abs(x) < 0.08 ? 0 : x, y: Math.abs(y) < 0.08 ? 0 : y };
    thumb.current.style.transform = `translate(${x * max}px, ${y * max}px)`;
  };
  return <div className="touch-joystick" ref={root} role="group" aria-label="Controle de movimento por toque" onPointerDown={event => { event.preventDefault(); pointer.current = event.pointerId; root.current.setPointerCapture(event.pointerId); root.current.classList.add('engaged'); move(event); }} onPointerMove={move} onPointerUp={reset} onPointerCancel={reset} onLostPointerCapture={reset}><span className="joystick-cross horizontal"/><span className="joystick-cross vertical"/><span className="joystick-thumb" ref={thumb}><Move size={22}/></span></div>;
}
