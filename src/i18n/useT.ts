import { useGameStore } from '../store/gameStore';
import { T } from './translations';

export function useT() {
  const lang = useGameStore((s) => s.lang);
  return T[lang];
}
