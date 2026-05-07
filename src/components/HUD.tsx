import { forwardRef } from 'react';
import { useGameStore } from '../store/gameStore';
import { useT } from '../i18n/useT';
import { STATIONS } from '../data/portfolio';
import Toast from './Toast';
import KillFeed from './KillFeed';

interface Props {
  minimapRef: React.RefObject<HTMLCanvasElement | null>;
}

const HUD = forwardRef<HTMLDivElement, Props>(function HUD({ minimapRef }, ref) {
  const health      = useGameStore((s) => s.health);
  const ammo        = useGameStore((s) => s.ammo);
  const ammoMax     = useGameStore((s) => s.ammoMax);
  const discovered  = useGameStore((s) => s.discovered);
  const enemyCount  = useGameStore((s) => s.enemyCount);
  const gameStarted = useGameStore((s) => s.gameStarted);
  const fps         = useGameStore((s) => s.fps);
  const muted          = useGameStore((s) => s.muted);
  const setMuted       = useGameStore((s) => s.setMuted);
  const waypoint       = useGameStore((s) => s.waypoint);
  const waypointScreen = useGameStore((s) => s.waypointScreen);
  const setWaypoint    = useGameStore((s) => s.setWaypoint);
  const t = useT();
  const allFound = discovered.size === STATIONS.length;

  return (
    <div id="hud" ref={ref} className={gameStarted ? 'active' : ''}>
      <div className="damage-vignette" id="damage-vignette" />
      <div className="crosshair"><div className="dot" /></div>
      <div className="hit-marker" id="hit-marker" />

      {/* Top-left — Circular radar */}
      <div id="minimap-wrap">
        <div className="minimap-label">{t.radar}</div>
        <div className="minimap-circle-wrap">
          <canvas ref={minimapRef as React.RefObject<HTMLCanvasElement>} id="minimap" width={200} height={200} />
          <div className="minimap-compass">
            <span className="cn">N</span>
            <span className="cs">S</span>
            <span className="ce">E</span>
            <span className="cw">W</span>
          </div>
        </div>
        <div id="minimap-legend">
          {STATIONS.map((s) => {
            const col = '#' + s.color.toString(16).padStart(6, '0');
            const found = discovered.has(s.id);
            return (
              <div key={s.id} className={`legend-row${found ? ' found' : ''}`}
                style={{ '--col': col } as React.CSSProperties}>
                <div className="dot" style={{ background: col }} />
                <div className="name">{s.title}</div>
                {found && <span className="check">✓</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Top-center — Valorant-style match panel */}
      <div id="hud-topbar">
        <div className="topbar-side topbar-left">
          <span className="topbar-label">{t.found}</span>
          <span className="topbar-val">{discovered.size}</span>
        </div>
        <div className="topbar-center">
          <div className="topbar-title">DEV · ARENA</div>
          <div className="topbar-pips">
            {STATIONS.map((s) => {
              const col = '#' + s.color.toString(16).padStart(6, '0');
              return (
                <div key={s.id}
                  className={`topbar-pip${discovered.has(s.id) ? ' found' : ''}`}
                  style={{ '--col': col } as React.CSSProperties}
                  title={s.title}
                />
              );
            })}
          </div>
          <div className="topbar-sub">
            {allFound ? t.objAll : t.objGoal(STATIONS.length)}
          </div>
        </div>
        <div className="topbar-side topbar-right">
          <span className="topbar-label">{t.drones}</span>
          <span className={`topbar-val${enemyCount > 0 ? ' threat' : ''}`}>{enemyCount}</span>
        </div>
      </div>

      {/* Bottom-left — Health (Valorant style) */}
      <div id="hud-health">
        <div className="hp-top">
          <span className="hp-icon">♥</span>
          <span className={`hp-num${health < 35 ? ' danger' : ''}`}>{health}</span>
          <span className="hp-max">/ 100</span>
        </div>
        <div className="hp-bar-wrap">
          <div
            className={`hp-bar-fill${health < 35 ? ' danger' : health < 60 ? ' warn' : ''}`}
            style={{ width: `${health}%` }}
          />
        </div>
        <div className="hp-label">{health < 35 ? t.vitalsCrit : t.vitalsOk}</div>
      </div>

      {/* Bottom-center — Station discovery slots (ability bar) */}
      <div id="hud-stations">
        {STATIONS.map((s) => {
          const col = '#' + s.color.toString(16).padStart(6, '0');
          const found = discovered.has(s.id);
          return (
            <div key={s.id}
              className={`station-slot${found ? ' found' : ''}`}
              style={{ '--col': col } as React.CSSProperties}
              title={s.title}>
              <div className="slot-letter">{s.title.charAt(0)}</div>
              <div className="slot-name">{s.title}</div>
              {found && <div className="slot-check">✓</div>}
            </div>
          );
        })}
      </div>

      {/* Bottom-right — Ammo counter */}
      <div id="hud-ammo">
        <div className="ammo-weapon">{t.weapon}</div>
        <div className="ammo-count-row">
          <span className={`ammo-current${ammo === 0 ? ' danger' : ammo <= 10 ? ' warn' : ''}`}>{ammo}</span>
          <span className="ammo-divider">|</span>
          <span className="ammo-reserve">{ammoMax}</span>
        </div>
        <div className="ammo-dots">
          {Array.from({ length: ammoMax }, (_, i) => (
            <span key={i} className={`ammo-dot${i < ammo ? ' loaded' : ''}`} />
          ))}
        </div>
      </div>

      <div id="fps-counter" className={fps < 30 ? 'danger' : fps < 50 ? 'warn' : ''}>
        {fps} <span className="fps-unit">FPS</span>
      </div>

      <button
        id="hud-mute-btn"
        className={muted ? 'muted' : ''}
        onClick={() => setMuted(!muted)}
        title={muted ? 'Unmute' : 'Mute'}
      >
        {muted ? '🔇' : '🔊'}
      </button>

      {/* Waypoint indicator */}
      {waypoint && waypointScreen && (
        <div
          className={`waypoint-indicator${waypointScreen.onscreen ? ' onscreen' : ' offscreen'}${waypoint.type === 'heal' ? ' heal' : ''}`}
          style={{
            left: waypointScreen.x,
            top:  waypointScreen.y,
            transform: waypointScreen.onscreen
              ? 'translate(-50%, -120%)'
              : `translate(-50%, -50%) rotate(${waypointScreen.angle + Math.PI / 2}rad)`,
          }}
          onClick={() => setWaypoint(null)}
          title="Click to dismiss"
        >
          {waypointScreen.onscreen ? (
            <div className="wp-label">
              {waypoint.type === 'heal' ? '✚ HEAL ZONE' : `▶ ${waypoint.id.toUpperCase()}`}
            </div>
          ) : (
            <div className="wp-arrow">▲</div>
          )}
        </div>
      )}

      <KillFeed />
      <Toast />
    </div>
  );
});

export default HUD;
