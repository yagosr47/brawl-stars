import { useEffect, useRef, useState } from 'react';
import { Orbit, RefreshCw } from 'lucide-react';

export default function RoomCanvas({ roomRef, settingsRef, interactionsRef }) {
  const parent = useRef(null);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let disposed = false, game;
    Promise.all([import('phaser'), import('./OrbitalScene.js')]).then(([{ default: Phaser }, { OrbitalScene }]) => {
      if (disposed || !parent.current) return;
      const scene = new OrbitalScene({
        room: roomRef, settings: settingsRef, interactions: interactionsRef,
        onProgress: value => { if (!disposed) setProgress(value); },
        onReady: () => { if (!disposed) setReady(true); },
      });
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: parent.current,
        width: parent.current.clientWidth,
        height: parent.current.clientHeight,
        backgroundColor: '#0a121d',
        scene: [scene],
        transparent: false,
        banner: false,
        disableContextMenu: true,
        autoFocus: false,
        antialias: true,
        roundPixels: false,
        scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
        fps: { target: 60, min: 25 },
        input: { keyboard: { capture: [] }, touch: true },
        render: { pixelArt: false, antialias: true, powerPreference: 'default' },
      });
    }).catch(error => { console.error('Game initialization:', error); if (!disposed) setError(true); });
    return () => { disposed = true; game?.destroy(true); };
  }, [roomRef, settingsRef, interactionsRef, retry]);
  return <><div className="phaser-parent" ref={parent}/>{(!ready || error) && <div className="canvas-loading">{error ? <><RefreshCw size={29}/><strong>A nave perdeu o sinal.</strong><p>Não foi possível inicializar os gráficos.</p><button className="button button-secondary" onClick={() => { setError(false); setReady(false); setRetry(value => value + 1); }}>Tentar novamente</button></> : <><Orbit size={36}/><strong>Preparando sua órbita...</strong><div className="loading-track"><span style={{ width: `${Math.max(progress * 100, 7)}%` }}/></div><span>CARREGANDO MAPA E ANIMAÇÕES · {Math.round(progress * 100)}%</span></>}</div>}</>;
}
