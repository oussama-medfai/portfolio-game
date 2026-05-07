import { create } from 'zustand';
import type { StationId } from '../data/portfolio';
import type { Lang } from '../i18n/translations';

export interface MapTarget {
  lat: number;
  lng: number;
  zoom: number;
  name: string;
  desc: string;
  color: 'neon' | 'yellow' | 'pink';
}

export type WaypointTarget =
  | { type: 'station'; id: string }
  | { type: 'heal' };

export interface WaypointScreen {
  x: number;
  y: number;
  onscreen: boolean;
  angle: number; // radians, used for edge arrow rotation
}

interface GameStore {
  loading: boolean;
  gameStarted: boolean;
  health: number;
  ammo: number;
  ammoMax: number;
  discovered: Set<string>;
  enemyCount: number;
  dead: boolean;
  paused: boolean;
  activeStation: StationId | null;
  mapTarget: MapTarget | null;
  toast: { big: string; small: string } | null;
  fps: number;
  lang: Lang;
  killFeed: string[];
  killCount: number;
  achievements: Set<string>;
  muted: boolean;
  visitorCount: number | null;
  dronePositions: { x: number; z: number }[];
  playerPos:      { x: number; z: number; angle: number };
  hzStates:       boolean[];
  waypoint:       WaypointTarget | null;
  waypointScreen: WaypointScreen | null;

  setTacticalData(
    drones: { x: number; z: number }[],
    player: { x: number; z: number; angle: number },
    hz: boolean[]
  ): void;

  setLoading(v: boolean): void;
  setFps(v: number): void;
  setGameStarted(v: boolean): void;
  setHealth(v: number): void;
  setAmmo(ammo: number, max: number): void;
  discoverStation(id: string): void;
  setEnemyCount(v: number): void;
  setDead(v: boolean): void;
  setPaused(v: boolean): void;
  pauseMenuOpen: boolean;
  openPauseMenu(): void;
  closePauseMenu(): void;
  openStation(id: StationId): void;
  closeStation(): void;
  openMap(t: MapTarget): void;
  closeMap(): void;
  showToast(big: string, small: string): void;
  setMuted(v: boolean): void;
  setLang(l: Lang): void;
  addKill(msg: string): void;
  addKillCount(): void;
  unlockAchievement(key: string, big: string, small: string): void;
  setVisitorCount(n: number): void;
  setWaypoint(w: WaypointTarget | null): void;
  setWaypointScreen(s: WaypointScreen | null): void;
  resetGame(): void;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useGameStore = create<GameStore>((set) => ({
  loading: true,
  gameStarted: false,
  health: 100,
  ammo: 30,
  ammoMax: 30,
  discovered: new Set(),
  enemyCount: 0,
  dead: false,
  paused: false,
  pauseMenuOpen: false,
  activeStation: null,
  mapTarget: null,
  toast: null,
  fps: 0,
  lang: 'en',
  killFeed: [],
  killCount: 0,
  achievements: new Set(),
  muted: false,
  visitorCount: null,
  dronePositions: [],
  playerPos: { x: 0, z: 0, angle: 0 },
  hzStates: [],
  waypoint: null,
  waypointScreen: null,

  setTacticalData: (drones, player, hz) =>
    set({ dronePositions: drones, playerPos: player, hzStates: hz }),

  setLoading: (v) => set({ loading: v }),
  setFps: (v) => set({ fps: v }),
  setGameStarted: (v) => set({ gameStarted: v }),
  setHealth: (v) => set({ health: Math.max(0, Math.round(v)) }),
  setAmmo: (ammo, max) => set({ ammo, ammoMax: max }),
  discoverStation: (id) =>
    set((s) => ({ discovered: new Set([...s.discovered, id]) })),
  setEnemyCount: (v) => set({ enemyCount: v }),
  setDead: (v) => set({ dead: v }),
  setPaused: (v) => set({ paused: v }),
  openPauseMenu: () => set({ pauseMenuOpen: true }),
  closePauseMenu: () => set({ pauseMenuOpen: false }),
  openStation: (id) => set({ activeStation: id }),
  closeStation: () => set({ activeStation: null }),
  openMap: (t) => set({ mapTarget: t }),
  closeMap: () => set({ mapTarget: null }),
  showToast: (big, small) => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toast: { big, small } });
    toastTimer = setTimeout(() => set({ toast: null }), 2200);
  },
  setMuted: (v) => set({ muted: v }),
  setLang: (l) => set({ lang: l }),
  addKill: (msg) => {
    set((s) => ({ killFeed: [msg, ...s.killFeed].slice(0, 5) }));
    setTimeout(() => set((s) => ({ killFeed: s.killFeed.slice(0, -1) })), 3000);
  },
  addKillCount: () => set((s) => ({ killCount: s.killCount + 1 })),
  unlockAchievement: (key, big, small) =>
    set((s) => {
      if (s.achievements.has(key)) return s;
      const achievements = new Set(s.achievements);
      achievements.add(key);
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => set({ toast: null }), 3000);
      return { achievements, toast: { big, small } };
    }),
  setVisitorCount: (n) => set({ visitorCount: n }),
  setWaypoint: (w) => set({ waypoint: w }),
  setWaypointScreen: (s) => set({ waypointScreen: s }),
  resetGame: () =>
    set({
      health: 100,
      ammo: 30,
      ammoMax: 30,
      discovered: new Set(),
      enemyCount: 0,
      dead: false,
      paused: false,
      pauseMenuOpen: false,
      activeStation: null,
      mapTarget: null,
      toast: null,
      waypoint: null,
      waypointScreen: null,
    }),
}));
