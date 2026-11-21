import { useState } from 'react';
import {
  ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronDown, CircleDot,
  Fingerprint, Gamepad2, Globe2, LoaderCircle, Radio, RefreshCw,
  Satellite, ScanLine, ShieldCheck, Sparkles, UsersRound, Zap,
} from 'lucide-react';
import { COLORS, VERSION, colorFor } from '../../../shared/constants.js';
import Crewmate from './Crewmate.jsx';

const ALIBIS = ['eu estava na elétrica.', 'não fui eu. juro.', 'o vermelho é suspeito.', 'só estava fazendo task.'];
function HeroArt() {
  const [alibi, setAlibi] = useState(0);
  return <div className="hero-art" aria-label="Tripulantes flutuando no espaço">
    <div className="hero-orbit orbit-one"/><div className="hero-orbit orbit-two"/>
    <div className="orbit-point point-a"/><div className="orbit-point point-b"/>
    <span className="space-cross cross-one">+</span><span className="space-cross cross-two">+</span><span className="space-cross cross-three">+</span>
    <div className="hero-planet"><span/></div>
    <div className="hero-crew crew-cyan"><Crewmate color="cyan"/></div>
    <div className="hero-crew crew-purple"><Crewmate color="purple"/></div>
    <button className="hero-crew crew-coral" onClick={() => setAlibi(value => (value + 1) % ALIBIS.length)} aria-label="Trocar álibi do tripulante"><Crewmate color="coral" patch/></button>
    <div className="alibi-bubble" key={alibi}><span className="tiny-dot"/>{ALIBIS[alibi]}</div>
    <div className="hero-coordinate"><span>LOCALIZAÇÃO DESCONHECIDA</span><strong>ALGUÉM ESTÁ MENTINDO.</strong><span className="coordinate-line"/></div>
    <span className="hero-little-star star-a">✦</span><span className="hero-little-star star-b">✦</span>
    <div className="hero-version">EST. 2018 <span>—</span> REIMAGINADO {VERSION}</div>
  </div>;
}

function EmptyRadar() {
  return <div className="empty-radar" aria-hidden="true"><div className="radar-grid"/><div className="radar-sweep"/><span className="radar-ring ring-one"/><span className="radar-ring ring-two"/><Satellite size={26}/><i/></div>;
}

export default function Home({ profile, setProfile, rooms, status, ping, busy, invalidName, onPlay, onDialog, onRefresh }) {
  const [tab, setTab] = useState(() => new URLSearchParams(window.location.search).has('sala') ? 'join' : 'create');
  const [code, setCode] = useState(() => (new URLSearchParams(window.location.search).get('sala') || '').replace(/[^a-z2-9]/gi, '').toUpperCase().slice(0, 6));
  const [maxPlayers, setMaxPlayers] = useState(10);
  const [refreshing, setRefreshing] = useState(false);
  const palette = colorFor(profile.color);
  const online = status === 'online';
  const refresh = async () => { setRefreshing(true); try { await onRefresh(); } finally { setRefreshing(false); } };
  return <main className="home-main">
    <section className="hero">
      <div className="hero-copy">
        <div className="hero-eyebrow"><span className="live-dot"/><span>TRIPULAÇÃO, PREPARAR.</span><span className="eyebrow-dash"/> <span className="muted">NAVEGAÇÃO LIVRE</span></div>
        <h1>Boas amizades.<br/><span>Péssimos álibis.</span><span className="heading-spark">✳</span></h1>
        <p>Reúna a tripulação. Cumpra sua missão.<br/>E pense duas vezes antes de confiar em alguém.</p>
        <div className="hero-facts"><span><UsersRound size={15}/>3–10 jogadores</span><i/><span><Globe2 size={15}/>Direto no navegador</span><i/><span><Zap size={15}/>Grátis, sem instalar</span></div>
        <a className="jump-link" href="#mission-control" aria-label="Ir para os controles de jogo"><ArrowDown size={15}/><span>SUA PRÓXIMA MISSÃO COMEÇA AQUI</span></a>
      </div>
      <HeroArt/>
    </section>

    <section id="mission-control" className="mission-control" aria-label="Preparar partida">
      <div className="section-kicker"><span><span className="bracket">[</span> CONTROLE DA MISSÃO <span className="bracket">]</span></span><span className="kicker-right"><CircleDot size={12}/>THE SKELD · SETOR 07</span></div>
      <div className="control-grid">
        <section className="panel identity-panel" aria-labelledby="identity-title">
          <div className="panel-title"><span className="step-number">01</span><h2 id="identity-title">Sua identidade</h2><Fingerprint size={17}/></div>
          <div className="identity-body">
            <div className="avatar-preview" style={{ '--crew-color': palette.hex }}><div className="avatar-platform"/><Crewmate color={profile.color} key={profile.color} className="preview-character"/><span className="avatar-coordinate">ID: VOCÊ</span></div>
            <div className="identity-fields">
              <label className="field-label" htmlFor="player-name">COMO VÃO TE CHAMAR?</label>
              <div className={`name-field ${invalidName ? 'invalid' : ''}`}><input id="player-name" type="text" autoComplete="nickname" maxLength={16} value={profile.name} placeholder="Seu nome" aria-invalid={invalidName} onChange={event => setProfile(previous => ({ ...previous, name: event.target.value }))}/><span>{profile.name.length}/16</span></div>
              <span className="field-label suit-label">ESCOLHA SEU TRAJE <span>{palette.name}</span></span>
              <div className="color-grid" role="group" aria-label="Cor do traje">{COLORS.map(color => <button key={color.id} className={`color-swatch ${profile.color === color.id ? 'selected' : ''}`} style={{ '--swatch': color.hex }} title={color.name} aria-label={`Cor: ${color.name}`} aria-pressed={profile.color === color.id} onClick={() => setProfile(previous => ({ ...previous, color: color.id }))}>{profile.color === color.id && <Check size={13} strokeWidth={3}/>}</button>)}</div>
            </div>
          </div>
          <div className="identity-footer"><ShieldCheck size={14}/><span>Seu traje está pronto. E o seu álibi?</span></div>
        </section>

        <section className="panel play-panel" aria-labelledby="play-title">
          <div className="panel-title"><span className="step-number">02</span><h2 id="play-title">Escolha sua missão</h2><Sparkles size={17}/></div>
          <div className="play-tabs" role="tablist" aria-label="Modo de entrada" onKeyDown={event => { if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); setTab(value => value === 'create' ? 'join' : 'create'); } }}><button id="create-tab" role="tab" aria-selected={tab === 'create'} aria-controls="play-tab-content" className={tab === 'create' ? 'selected' : ''} onClick={() => setTab('create')}>Criar sala</button><button id="join-tab" role="tab" aria-selected={tab === 'join'} aria-controls="play-tab-content" className={tab === 'join' ? 'selected' : ''} onClick={() => setTab('join')}>Entrar com código</button></div>
          <div id="play-tab-content" role="tabpanel" aria-labelledby={`${tab}-tab`} className="play-tab-content" key={tab}>
            {tab === 'create' ? <>
              <div className="map-choice"><div className="map-thumbnail"><img src="/assets/map/skled.png" alt=""/><span className="map-orbit"/></div><div><span className="micro-label">DESTINO DA MISSÃO</span><strong>The Skeld</strong><span>O clássico. Nenhum lugar seguro.</span></div><button className="map-info-button" title="Conhecer o mapa" aria-label="Ver mapa The Skeld" onClick={() => onDialog('map')}><ArrowUpRight size={17}/></button></div>
              <div className="room-config"><label htmlFor="max-players"><UsersRound size={14}/>Tripulantes</label><div className="select-wrap"><select id="max-players" value={maxPlayers} onChange={event => setMaxPlayers(Number(event.target.value))}><option value={6}>Até 6</option><option value={8}>Até 8</option><option value={10}>Até 10</option></select><ChevronDown size={12}/></div><span className="impostor-count"><span/>1 impostor</span></div>
              <button className="button button-primary create-button" disabled={Boolean(busy) || !online} onClick={() => onPlay('room:create', { maxPlayers })}><span>{busy === 'room:create' ? 'Preparando a nave...' : 'Criar minha sala'}</span>{busy === 'room:create' ? <LoaderCircle className="spinning" size={19}/> : <ArrowRight size={19}/>}</button>
            </> : <>
              <p className="join-copy">Recebeu um convite?<br/><span>Seu próximo álibi começa com 6 caracteres.</span></p>
              <label className="sr-only" htmlFor="room-code">Código da sala</label><input id="room-code" className="code-input" value={code} maxLength={6} placeholder="ABCDEF" autoComplete="off" autoCapitalize="characters" spellCheck={false} onChange={event => setCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))} onKeyDown={event => { if (event.key === 'Enter' && code.length === 6 && !busy && online) onPlay('room:join', { code }); }}/>
              <button className="button button-primary create-button" disabled={Boolean(busy) || !online || code.length !== 6} onClick={() => onPlay('room:join', { code })}><span>{busy === 'room:join' ? 'Embarcando...' : 'Entrar na missão'}</span>{busy === 'room:join' ? <LoaderCircle className="spinning" size={19}/> : <ArrowRight size={19}/>}</button>
            </>}
          </div>
          <div className="practice-link"><Gamepad2 size={16}/><span>Primeira vez na nave?</span><button disabled={Boolean(busy)} onClick={() => onDialog('practice')}>Jogar treino <ArrowUpRight size={13}/></button></div>
        </section>

        <section className="panel rooms-panel" aria-labelledby="rooms-title">
          <div className="panel-title"><span className="step-number">03</span><h2 id="rooms-title">Salas em órbita</h2><span className="room-count">{rooms.length.toString().padStart(2, '0')}</span><button className="icon-button refresh-button" aria-label="Atualizar salas" disabled={refreshing} onClick={refresh}><RefreshCw size={15} className={refreshing ? 'spinning' : ''}/></button></div>
          {rooms.length ? <div className="room-list">{rooms.map(room => <button className="room-card" key={room.code} onClick={() => onPlay('room:join', { code: room.code })} disabled={Boolean(busy) || room.count >= room.maxPlayers}><span className="room-card-avatar"><Crewmate color={room.colors?.[0] || 'coral'}/></span><span className="room-card-copy"><strong>{room.hostName}</strong><span>{room.code} <i/>The Skeld</span></span><span className="room-card-occupancy"><UsersRound size={12}/>{room.count}<span>/{room.maxPlayers}</span></span><ArrowUpRight size={15}/></button>)}</div> : <div className="empty-rooms"><EmptyRadar/><strong>{online ? 'Nenhum sinal. Por enquanto.' : 'Procurando outras naves...'}</strong><p>Chame seus amigos e crie uma sala.<br/>A próxima tripulação pode ser a sua.</p></div>}
          <div className="rooms-footer"><span><span className={online ? 'tiny-dot' : 'tiny-dot offline'}/>{online ? 'ESPAÇO AÉREO LIVRE' : 'BUSCANDO CONEXÃO'}</span><span><Radio size={11}/>{ping === null ? '—' : `${ping} ms`}</span></div>
        </section>
      </div>
    </section>

    <section className="update-strip" aria-label="Melhorias da versão"><div className="update-badge"><span className="tiny-dot"/>ORBITAL UPDATE {VERSION}</div><p>Uma nova atmosfera. O mesmo velho <span>“não fui eu”.</span></p><button onClick={() => onDialog('updates')}>Veja o que mudou <ArrowRight size={15}/></button><div className="update-orbit" aria-hidden="true"><ScanLine size={26}/></div></section>
    <div className="bottom-facts"><span><ShieldCheck size={14}/>Sem cadastro. Sem downloads. Só desconfiança.</span><span><span className="tiny-square"/>EFEITOS REIMAGINADOS <i/>MULTIPLAYER EM TEMPO REAL</span></div>
    <footer className="site-footer"><span>Um projeto de fãs, feito para jogar junto. <span className="footer-muted">Não afiliado à Innersloth.</span></span><button onClick={() => onDialog('credits')}>Créditos & companhia <ArrowUpRight size={12}/></button></footer>
  </main>;
}
