import { ArrowUpRight, Radio, Settings2, Volume2, VolumeX } from 'lucide-react';
import Crewmate from './Crewmate.jsx';

export function Brand({ compact = false }) {
  return <span className={`brand ${compact ? 'brand-compact' : ''}`}><Crewmate color="white" className="brand-crew"/><span className="brand-word">among<span>us</span><small>ORBITAL EDITION</small></span></span>;
}
export default function Header({ status, settings, setSettings, onDialog, inGame = false, onHome }) {
  return <header className={`site-header ${inGame ? 'header-in-game' : ''}`}>
    <button className="brand-button" onClick={onHome} aria-label="Among Us — início"><Brand/></button>
    {!inGame && <nav aria-label="Navegação principal"><button className="nav-link active" onClick={onHome}><span className="tiny-dot"/>Jogar</button><button className="nav-link" onClick={() => onDialog('help')}>Como jogar <ArrowUpRight size={13}/></button><button className="nav-link" onClick={() => onDialog('updates')}>O que há de novo</button></nav>}
    <div className="header-actions"><span className={`connection ${status === 'online' ? 'is-online' : ''}`}><Radio size={13}/><span>{status === 'online' ? 'Sistemas online' : status === 'connecting' ? 'Conectando...' : 'Reconectando...'}</span></span><span className="header-divider"/><button className={`icon-button ${settings.sound ? 'sound-on' : ''}`} title={settings.sound ? 'Desativar som' : 'Ativar som'} aria-label={settings.sound ? 'Desativar som' : 'Ativar som'} onClick={() => setSettings(previous => ({ ...previous, sound: !previous.sound }))}>{settings.sound ? <Volume2 size={19}/> : <VolumeX size={19}/>}</button><button className="icon-button" aria-label="Configurações" onClick={() => onDialog('settings')}><Settings2 size={19}/></button></div>
  </header>;
}
