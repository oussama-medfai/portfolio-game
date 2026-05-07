import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { useT } from '../i18n/useT';
import TacticalMap from './TacticalMap';

interface Props {
  onContinue: () => void;
  onRestart: () => void;
  onLobby: () => void;
}

export default function PauseMenu({ onContinue, onRestart, onLobby }: Props) {
  const lang     = useGameStore((s) => s.lang);
  const setLang  = useGameStore((s) => s.setLang);
  const muted    = useGameStore((s) => s.muted);
  const setMuted = useGameStore((s) => s.setMuted);
  const t = useT();
  const [showMap, setShowMap] = useState(false);

  return (
    <div id="pause-menu" onMouseDown={(e) => e.stopPropagation()}>
      {showMap ? (
        <>
          <div className="pause-tag">{t.tacMap}</div>
          <TacticalMap />
          <button className="pause-back-btn" onClick={() => setShowMap(false)}>
            ← {t.tacBack}
          </button>
        </>
      ) : (
        <>
          <div className="pause-tag">{t.paused}</div>
          <div className="pause-buttons">
            <button onClick={onContinue}>{t.continue_}</button>
            <button onClick={onRestart}>{t.restart}</button>
            <button onClick={onLobby}>{t.lobby}</button>
            <button onClick={() => setShowMap(true)}>🗺 {t.tacMap}</button>
          </div>
          <div className="pause-lang">
            <span className="pause-lang-label">{t.language}</span>
            <button className="lang-toggle" onClick={() => setLang(lang === 'en' ? 'fr' : 'en')}>
              <span className={`lang-opt${lang === 'en' ? ' active' : ''}`}>EN</span>
              <span className={`lang-opt${lang === 'fr' ? ' active' : ''}`}>FR</span>
            </button>
          </div>
          <div className="pause-lang">
            <button
              className={`sound-toggle${muted ? ' muted' : ''}`}
              onClick={() => setMuted(!muted)}
            >
              {muted ? t.soundOff : t.soundOn}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
