import { useEffect, useRef } from 'react';

export default function Starfield({ reduced = false, particles = true }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas.getContext('2d');
    if (!context) return;
    let frame, width, height;
    let stars = [];
    const pointer = { x: 0, y: 0 };
    const resize = () => {
      width = window.innerWidth; height = window.innerHeight;
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = width * dpr; canvas.height = height * dpr;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = Array.from({ length: particles ? Math.min(95, width / 15) : 22 }, (_, index) => ({
        x: ((index * 127.9 + 71) % 997) / 997 * width,
        y: ((index * 97.3 + 31) % 701) / 701 * height,
        r: index % 7 === 0 ? 1.3 : 0.6, speed: 0.1 + (index % 4) * 0.04, phase: index * 2.4,
      }));
    };
    const move = event => { pointer.x = (event.clientX / width - 0.5) * 8; pointer.y = (event.clientY / height - 0.5) * 8; };
    const draw = time => {
      context.clearRect(0, 0, width, height);
      for (const star of stars) {
        const drift = reduced ? 0 : (time * star.speed * 0.008) % height;
        const x = star.x + (reduced ? 0 : pointer.x * star.speed);
        const y = (star.y + drift) % height + (reduced ? 0 : pointer.y * star.speed);
        context.globalAlpha = reduced ? 0.3 : 0.2 + (Math.sin(time * 0.0006 + star.phase) + 1) * 0.18;
        context.fillStyle = '#bacade';
        context.beginPath(); context.arc(x, y, star.r, 0, Math.PI * 2); context.fill();
      }
      if (!reduced && !document.hidden) frame = requestAnimationFrame(draw);
    };
    const visibility = () => { cancelAnimationFrame(frame); draw(performance.now()); };
    resize(); draw(0);
    window.addEventListener('resize', visibilityResize);
    window.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('visibilitychange', visibility);
    function visibilityResize() { resize(); if (reduced) draw(0); }
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', visibilityResize);
      window.removeEventListener('pointermove', move);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [reduced, particles]);
  return <canvas ref={ref} className="starfield" aria-hidden="true"/>;
}
