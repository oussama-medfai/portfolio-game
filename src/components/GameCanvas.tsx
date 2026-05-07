import { useEffect, useRef } from 'react';
import { GameEngine } from '../engine/GameEngine';
import type { GameCallbacks } from '../engine/GameEngine';
import { useGameStore } from '../store/gameStore';
import type { StationId } from '../data/portfolio';
import type { MapTarget } from '../store/gameStore';
import { T } from '../i18n/translations';

interface Props {
  minimapRef: React.RefObject<HTMLCanvasElement | null>;
}

export default function GameCanvas({ minimapRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);

  useEffect(() => {
    const canvas   = canvasRef.current!;
    const mmCanvas = minimapRef.current ?? document.getElementById('minimap') as HTMLCanvasElement;
    if (!canvas || !mmCanvas) return;

    const callbacks: GameCallbacks = {
      onHealthChange:     (h) => useGameStore.getState().setHealth(h),
      onAmmoChange:       (a, m) => useGameStore.getState().setAmmo(a, m),
      onDiscoverStation:  (id) => {
        const store = useGameStore.getState();
        store.discoverStation(id);
        if (store.discovered.size === 0) store.unlockAchievement('first', 'INTEL ACQUIRED', 'First station unlocked');
      },
      onKill: () => {
        const store = useGameStore.getState();
        store.addKill('DRONE ELIMINATED');
        store.addKillCount();
        const kc = store.killCount + 1;
        if (kc === 1)  store.unlockAchievement('kill1',  'FIRST BLOOD',  'Drone eliminated');
        if (kc === 5)  store.unlockAchievement('kill5',  'DRONE HUNTER', '5 drones down');
        if (kc === 10) store.unlockAchievement('kill10', 'EXTERMINATOR', '10 drones eliminated');
      },
      onOpenStation:      (id: StationId) => useGameStore.getState().openStation(id),
      onOpenMap:          (t: MapTarget) => useGameStore.getState().openMap(t),
      onEnemyCountChange: (n) => useGameStore.getState().setEnemyCount(n),
      onToast: (b, s) => {
        const { lang } = useGameStore.getState();
        const tr = T[lang];
        let big = b, small = s;
        if (b === 'STATION UNLOCKED')          [big, small] = tr.toastStation(s);
        else if (b === 'ALL STATIONS DISCOVERED') [big, small] = tr.toastAllDone;
        else if (b === 'RESPAWNED')            [big, small] = tr.toastRespawn;
        else if (b === 'HEALTH PACK')          [big, small] = tr.toastHealth;
        useGameStore.getState().showToast(big, small);
      },
      onDead:             () => useGameStore.getState().setDead(true),
      onRespawn:          () => useGameStore.getState().setDead(false),
      onFpsUpdate:        (fps) => useGameStore.getState().setFps(fps),
      onLock:             () => { useGameStore.getState().setPaused(false); useGameStore.getState().closePauseMenu(); },
      onUnlock:           () => { useGameStore.getState().setPaused(true);  useGameStore.getState().openPauseMenu();  },
      // ESC key handler inside the engine calls this to close any open modal
      closeStation: () => {
        const state = useGameStore.getState();
        state.closeStation();   // activeStation = null
        state.closeMap();       // mapTarget = null (covers map modal too)
        state.setPaused(true);  // show "CLICK TO RE-ENGAGE" hint
      },
    };

    const engine = new GameEngine(canvas, mmCanvas, callbacks);
    engineRef.current = engine;

    setTimeout(() => {
      useGameStore.getState().setLoading(false);
      engine.startLoop();
    }, 800);

    return () => engine.destroy();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Expose engine on window so App.tsx can call engine methods from click handlers
  useEffect(() => {
    (window as { __engine?: GameEngine }).__engine = engineRef.current ?? undefined;
  });

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, display: 'block', width: '100%', height: '100%' }}
    />
  );
}
