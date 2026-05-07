import { useRef, useEffect, useState } from 'react';
import { useGameStore } from './store/gameStore';
import { PORTFOLIO, STATIONS } from './data/portfolio';
import type { MapTarget } from './store/gameStore';
import { useT } from './i18n/useT';
import { T } from './i18n/translations';
import GameCanvas   from './components/GameCanvas';
import Loader       from './components/Loader';
import StartScreen  from './components/StartScreen';
import HUD          from './components/HUD';
import StationModal from './components/StationModal';
import MapModal     from './components/MapModal';
import PauseMenu    from './components/PauseMenu';
import AiAssistant  from './components/AiAssistant';

type EngineHandle = {
  startGame(): void;
  stopGame(): void;
  restart(): void;
  onModalClose(): void;
  onMapClose(): void;
};
const engine = () => (window as { __engine?: EngineHandle }).__engine;

type MissedStation = { title: string; color: string };

export default function App() {
  const loading       = useGameStore((s) => s.loading);
  const gameStarted   = useGameStore((s) => s.gameStarted);
  const paused         = useGameStore((s) => s.paused);
  const pauseMenuOpen  = useGameStore((s) => s.pauseMenuOpen);
  const dead           = useGameStore((s) => s.dead);
  const activeStation  = useGameStore((s) => s.activeStation);
  const setGameStarted = useGameStore((s) => s.setGameStarted);
  const setPaused      = useGameStore((s) => s.setPaused);
  const resetGame      = useGameStore((s) => s.resetGame);
  const closePauseMenu = useGameStore((s) => s.closePauseMenu);
  const closeStation   = useGameStore((s) => s.closeStation);
  const openMap        = useGameStore((s) => s.openMap);
  const closeMap       = useGameStore((s) => s.closeMap);

  const t = useT();
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const [deathMissed, setDeathMissed] = useState<MissedStation[]>([]);

  // Visitor counter — fire once on mount, best-effort
  useEffect(() => {
    fetch('/api/visits')
      .then((r) => r.json())
      .then(({ count }: { count: number }) => useGameStore.getState().setVisitorCount(count))
      .catch(() => {});
  }, []);

  // On death: snapshot unexplored stations, then return to lobby after 2.5 s
  useEffect(() => {
    if (!dead) return;
    const disc = useGameStore.getState().discovered;
    setDeathMissed(
      STATIONS.filter((s) => !disc.has(s.id)).map((s) => ({
        title: s.title,
        color: '#' + s.color.toString(16).padStart(6, '0'),
      }))
    );
    const t = setTimeout(() => {
      resetGame();
      engine()?.stopGame();
      setGameStarted(false);
    }, 3500);
    return () => clearTimeout(t);
  }, [dead]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStart = () => {
    setGameStarted(true);
    engine()?.startGame();
  };

  const handleCloseStation = () => {
    closeStation();
    engine()?.onModalClose(); // resets engine.modalOpen flag
    setPaused(true);          // show "click to re-engage" hint
  };

  const handleCloseMap = () => {
    closeMap();
    engine()?.onMapClose();   // resets engine.modalOpen flag
    setPaused(true);          // show "click to re-engage" hint
  };

  const handleResume = () => {
    closePauseMenu();
    // No lockPointer here — user clicks canvas to re-engage (standard FPS pattern)
  };

  const handleRestart = () => {
    resetGame();
    engine()?.restart();
    closePauseMenu();
  };

  const handleReturnToLobby = () => {
    resetGame();
    engine()?.stopGame();
    setGameStarted(false);
  };

  const handleOpenEduMap = (i: number) => {
    const e    = PORTFOLIO.education[i];
    const lang = useGameStore.getState().lang;
    const role = lang === 'fr' && e.roleFr ? e.roleFr : e.role;
    const desc = lang === 'fr' && e.descFr ? e.descFr : e.desc;
    const at   = lang === 'fr' ? 'à' : 'at';
    closeStation();
    openMap({
      lat: e.map.lat, lng: e.map.lng, zoom: e.map.zoom, name: e.map.name,
      desc: `${role} ${at} ${e.where} — ${e.when}. ${desc}`,
      color: 'yellow',
    });
  };

  const handleOpenLocationMap = () => {
    const loc  = PORTFOLIO.contact.location;
    const lang = useGameStore.getState().lang;
    closeStation();
    openMap({
      lat: loc.lat, lng: loc.lng, zoom: loc.zoom, name: loc.name,
      desc: T[lang].locationNote(loc.name),
      color: 'neon',
    } satisfies MapTarget);
  };

  return (
    <>
      {loading && <Loader />}

      <GameCanvas minimapRef={minimapRef} />

      {!gameStarted && <StartScreen onStart={handleStart} />}

      <HUD ref={null} minimapRef={minimapRef} />

      {pauseMenuOpen && gameStarted && !activeStation && (
        <PauseMenu
          onContinue={handleResume}
          onRestart={handleRestart}
          onLobby={handleReturnToLobby}
        />
      )}

      {paused && !pauseMenuOpen && gameStarted && !activeStation && (
        <div id="click-to-play">
          <div className="big">{t.clickPlay}</div>
        </div>
      )}

      {dead && gameStarted && (
        <div id="death-screen">
          <div className="death-title">{t.missionFailed}</div>
          <div className="death-explore-count">
            {deathMissed.length === 0
              ? t.allExplored(STATIONS.length)
              : t.explored(STATIONS.length - deathMissed.length, STATIONS.length)}
          </div>
          {deathMissed.length > 0 && (
            <div className="death-missed">
              <div className="death-missed-label">{t.unexplored}</div>
              <div className="death-missed-list">
                {deathMissed.map((s) => (
                  <span
                    key={s.title}
                    className="death-missed-tag"
                    style={{ color: s.color, borderColor: s.color, boxShadow: `0 0 10px ${s.color}55` }}
                  >
                    {s.title}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="death-sub">{t.returningLobby}</div>
        </div>
      )}

      {activeStation && (
        <StationModal
          onClose={handleCloseStation}
          onOpenMap={handleOpenEduMap}
          onOpenLocationMap={handleOpenLocationMap}
        />
      )}

      <MapModal onClose={handleCloseMap} />

      <AiAssistant />
    </>
  );
}
