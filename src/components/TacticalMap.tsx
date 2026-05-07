import { useRef, useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { STATIONS } from '../data/portfolio';
import { useT } from '../i18n/useT';

// ── World constants (must match GameEngine.ts) ──────────────────────────────
const ROAD_W      = 10;
const SIDEWALK_W  = 3.5;
const STREET_X    = [-28, 0, 28];
const STREET_Z    = [-28, 0, 28];
const EXT         = 54;  // streets extend from -EXT to +EXT
const BLOCKS_DATA = [
  { cx:  14, cz: -14 }, { cx: -14, cz: -14 },
  { cx:  14, cz:  14 }, { cx: -14, cz:  14 },
  { cx:  42, cz: -14 }, { cx:  42, cz:  14 },
  { cx: -42, cz: -14 }, { cx: -42, cz:  14 },
  { cx:  14, cz: -42 }, { cx: -14, cz: -42 },
  { cx:  14, cz:  42 }, { cx: -14, cz:  42 },
  { cx:  42, cz: -42 }, { cx: -42, cz: -42 },
  { cx:  42, cz:  42 }, { cx: -42, cz:  42 },
];
const BLOCK_SIZE  = 11;
const HZ_POS: [number, number][] = [[0,0],[42,0],[-42,0],[0,42],[0,-42]];

// ── Canvas coordinate helpers ────────────────────────────────────────────────
const MAP        = 520;
const WORLD_SPAN = 116;  // show -58..58, slight margin
const S          = MAP / WORLD_SPAN;
const pw         = (w: number) => MAP / 2 + w * S;  // world → canvas px

// ── Static canvas draw (called once on mount) ────────────────────────────────
function drawStaticLayer(ctx: CanvasRenderingContext2D) {
  ctx.clearRect(0, 0, MAP, MAP);

  // 1 — Background / bare ground
  ctx.fillStyle = '#07091a';
  ctx.fillRect(0, 0, MAP, MAP);

  // 2 — Subtle ground dot grid (atmosphere)
  ctx.fillStyle = 'rgba(0,180,160,0.06)';
  for (let wx = -54; wx <= 54; wx += 7) {
    for (let wz = -54; wz <= 54; wz += 7) {
      ctx.fillRect(pw(wx) - 0.5, pw(wz) - 0.5, 1.5, 1.5);
    }
  }

  // 3 — Sidewalk strips (laid first so roads overdraw overlap)
  ctx.fillStyle = '#0d1020';
  STREET_Z.forEach(z => {
    const y0 = pw(z - ROAD_W / 2 - SIDEWALK_W);
    const y1 = pw(z - ROAD_W / 2);
    const y2 = pw(z + ROAD_W / 2);
    const y3 = pw(z + ROAD_W / 2 + SIDEWALK_W);
    ctx.fillRect(pw(-EXT), y0, pw(EXT) - pw(-EXT), y1 - y0);
    ctx.fillRect(pw(-EXT), y2, pw(EXT) - pw(-EXT), y3 - y2);
  });
  STREET_X.forEach(x => {
    const x0 = pw(x - ROAD_W / 2 - SIDEWALK_W);
    const x1 = pw(x - ROAD_W / 2);
    const x2 = pw(x + ROAD_W / 2);
    const x3 = pw(x + ROAD_W / 2 + SIDEWALK_W);
    ctx.fillRect(x0, pw(-EXT), x1 - x0, pw(EXT) - pw(-EXT));
    ctx.fillRect(x2, pw(-EXT), x3 - x2, pw(EXT) - pw(-EXT));
  });

  // 4 — Roads (horizontal Z-axis)
  ctx.fillStyle = '#0f1220';
  STREET_Z.forEach(z => {
    ctx.fillRect(pw(-EXT), pw(z - ROAD_W / 2), pw(EXT) - pw(-EXT), ROAD_W * S);
  });
  // Roads (vertical X-axis)
  STREET_X.forEach(x => {
    ctx.fillRect(pw(x - ROAD_W / 2), pw(-EXT), ROAD_W * S, pw(EXT) - pw(-EXT));
  });

  // 5 — Building block footprints
  BLOCKS_DATA.forEach(b => {
    const bx  = pw(b.cx - BLOCK_SIZE / 2);
    const bz  = pw(b.cz - BLOCK_SIZE / 2);
    const bpx = BLOCK_SIZE * S;
    // Fill — dark solid block
    const grad = ctx.createLinearGradient(bx, bz, bx + bpx, bz + bpx);
    grad.addColorStop(0, '#090c20');
    grad.addColorStop(1, '#0a0d1a');
    ctx.fillStyle = grad;
    ctx.fillRect(bx, bz, bpx, bpx);
    // Neon border
    ctx.strokeStyle = 'rgba(0,255,213,0.22)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, bz + 0.5, bpx - 1, bpx - 1);
    // Inner highlight (top-left corner gleam)
    ctx.strokeStyle = 'rgba(0,255,213,0.08)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 2, bz + 2, bpx - 4, bpx - 4);
  });

  // 6 — Lane center dashes (yellow, horizontal roads)
  ctx.strokeStyle = 'rgba(255,242,0,0.4)';
  ctx.lineWidth = 1;
  ctx.setLineDash([S * 2.5, S * 2]);
  STREET_Z.forEach(z => {
    ctx.beginPath();
    ctx.moveTo(pw(-EXT + 2), pw(z));
    ctx.lineTo(pw(EXT - 2), pw(z));
    ctx.stroke();
  });
  STREET_X.forEach(x => {
    ctx.beginPath();
    ctx.moveTo(pw(x), pw(-EXT + 2));
    ctx.lineTo(pw(x), pw(EXT - 2));
    ctx.stroke();
  });
  ctx.setLineDash([]);

  // 7 — Crosswalk stripes at intersections (white marks on sidewalk)
  ctx.fillStyle = 'rgba(200,210,255,0.12)';
  const stripeW = 0.28 * S;
  const stripeL = SIDEWALK_W * S;
  STREET_X.forEach(x => {
    STREET_Z.forEach(z => {
      // North crosswalk (above intersection)
      for (let i = -6; i <= 6; i++) {
        const sx = pw(x) + i * (0.42 * S);
        ctx.fillRect(sx - stripeW / 2, pw(z - ROAD_W / 2) - stripeL, stripeW, stripeL);
        ctx.fillRect(sx - stripeW / 2, pw(z + ROAD_W / 2), stripeW, stripeL);
      }
      for (let i = -6; i <= 6; i++) {
        const sz = pw(z) + i * (0.42 * S);
        ctx.fillRect(pw(x - ROAD_W / 2) - stripeL, sz - stripeW / 2, stripeL, stripeW);
        ctx.fillRect(pw(x + ROAD_W / 2), sz - stripeW / 2, stripeL, stripeW);
      }
    });
  });

  // 8 — Intersection overlays (glow tint at crossings)
  STREET_X.forEach(x => {
    STREET_Z.forEach(z => {
      ctx.fillStyle = 'rgba(0,255,213,0.03)';
      ctx.fillRect(pw(x - ROAD_W / 2), pw(z - ROAD_W / 2), ROAD_W * S, ROAD_W * S);
    });
  });

  // 9 — Arena boundary circle
  ctx.strokeStyle = 'rgba(0,255,213,0.2)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.arc(MAP / 2, MAP / 2, 48 * S, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // 10 — Compass labels
  ctx.fillStyle = 'rgba(0,255,213,0.3)';
  ctx.font = `bold ${Math.round(S * 2.2)}px "Orbitron", monospace`;
  ctx.textAlign = 'center';
  ctx.fillText('N', MAP / 2, 10);
  ctx.fillText('S', MAP / 2, MAP - 3);
  ctx.textAlign = 'left';
  ctx.fillText('W', 3, MAP / 2 + 4);
  ctx.textAlign = 'right';
  ctx.fillText('E', MAP - 3, MAP / 2 + 4);
}

// ── Component ────────────────────────────────────────────────────────────────
type Tooltip = { label: string; sub: string; color: string } | null;

export default function TacticalMap() {
  const dronePositions = useGameStore((s) => s.dronePositions);
  const playerPos      = useGameStore((s) => s.playerPos);
  const hzStates       = useGameStore((s) => s.hzStates);
  const discovered     = useGameStore((s) => s.discovered);
  const t              = useT();
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const [tip, setTip]  = useState<Tooltip>(null);
  const [tipPos, setTipPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    drawStaticLayer(ctx);
  }, []);

  const showTip = (
    e: React.MouseEvent<HTMLDivElement>,
    label: string,
    sub: string,
    color: string
  ) => {
    setTip({ label, sub, color });
    setTipPos({ x: e.nativeEvent.offsetX + 14, y: e.nativeEvent.offsetY - 8 });
  };

  return (
    <div id="tac-map-wrap">
      <canvas ref={canvasRef} width={MAP} height={MAP} id="tac-canvas" />

      {/* ── Stations ── */}
      {STATIONS.map((s) => {
        const [wx, , wz] = s.position;
        const col  = '#' + s.color.toString(16).padStart(6, '0');
        const disc = discovered.has(s.id);
        return (
          <div
            key={s.id}
            className="tac-station"
            style={{
              left: pw(wx), top: pw(wz),
              borderColor: col,
              boxShadow: disc
                ? `0 0 12px ${col}aa, 0 0 4px ${col}`
                : 'none',
              opacity: disc ? 1 : 0.4,
            }}
            onMouseMove={(e) =>
              showTip(e, s.title, disc ? t.tacStation.found : t.tacStation.unknown, col)
            }
            onMouseLeave={() => setTip(null)}
          >
            {disc && <div className="tac-station-pulse" style={{ borderColor: col }} />}
          </div>
        );
      })}

      {/* ── Health zones ── */}
      {HZ_POS.map(([wx, wz], i) => {
        const ready = hzStates[i] !== false;
        return (
          <div
            key={i}
            className={`tac-hz${ready ? '' : ' cooldown'}`}
            style={{ left: pw(wx), top: pw(wz) }}
            onMouseMove={(e) =>
              showTip(e, t.tacHealth.label, ready ? t.tacHealth.ready : t.tacHealth.cd, '#00ff55')
            }
            onMouseLeave={() => setTip(null)}
          />
        );
      })}

      {/* ── Enemy drones ── */}
      {dronePositions.map((d, i) => (
        <div
          key={i}
          className="tac-drone"
          style={{ left: pw(d.x), top: pw(d.z) }}
          onMouseMove={(e) =>
            showTip(e, t.tacDrone.label, t.tacDrone.sub, '#ff3860')
          }
          onMouseLeave={() => setTip(null)}
        />
      ))}

      {/* ── Player ── */}
      <div
        className="tac-player"
        style={{
          left: pw(playerPos.x),
          top:  pw(playerPos.z),
          transform: `translate(-50%,-50%) rotate(${-playerPos.angle}rad)`,
        }}
      />

      {/* ── Tooltip ── */}
      {tip && (
        <div
          className="tac-tip"
          style={{ left: tipPos.x, top: tipPos.y, borderColor: tip.color }}
        >
          <div className="tac-tip-label" style={{ color: tip.color }}>{tip.label}</div>
          <div className="tac-tip-sub">{tip.sub}</div>
        </div>
      )}
    </div>
  );
}
