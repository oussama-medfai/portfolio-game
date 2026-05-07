import { useGameStore } from '../store/gameStore';
import { useT } from '../i18n/useT';

interface Props {
  onStart: () => void;
}

export default function StartScreen({ onStart }: Props) {
  const gameStarted = useGameStore((s) => s.gameStarted);
  const lang        = useGameStore((s) => s.lang);
  const setLang     = useGameStore((s) => s.setLang);
  const t = useT();
  if (gameStarted) return null;

  return (
    <div id="start-screen">
      <button className="lang-toggle" onClick={() => setLang(lang === 'en' ? 'fr' : 'en')}>
        <span className={`lang-opt${lang === 'en' ? ' active' : ''}`}>EN</span>
        <span className={`lang-opt${lang === 'fr' ? ' active' : ''}`}>FR</span>
      </button>
      <div className="start-inner">
        <div className="tag-line">
          {t.tagline}<span className="blink">_</span>
        </div>
        <h1 className="title">DEV.ARENA</h1>
        <div className="title-sub">{t.subtitle}</div>

        <p className="story">{t.story}</p>

        <div className="controls-grid">
          <div className="ctrl"><span className="key">W A S D</span><div className="lbl">{t.ctrlMove}</div></div>
          <div className="ctrl"><span className="key">MOUSE</span><div className="lbl">{t.ctrlLook}</div></div>
          <div className="ctrl"><span className="key">CLICK</span><div className="lbl">{t.ctrlShoot}</div></div>
          <div className="ctrl"><span className="key">SHIFT</span><div className="lbl">{t.ctrlSprint}</div></div>
          <div className="ctrl"><span className="key">SPACE</span><div className="lbl">{t.ctrlJump}</div></div>
          <div className="ctrl"><span className="key">ESC</span><div className="lbl">{t.ctrlPause}</div></div>
        </div>

        <button id="start-btn" onClick={onStart}>{t.enterArena}</button>
      </div>
      <div className="footer-tag">// BUILT WITH THREE.JS · REACT · TYPESCRIPT //</div>
    </div>
  );
}
