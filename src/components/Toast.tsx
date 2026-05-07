import { useGameStore } from '../store/gameStore';

export default function Toast() {
  const toast = useGameStore((s) => s.toast);

  return (
    <div id="toast" className={toast ? 'show' : ''}>
      <div className="big">{toast?.big}</div>
      <div className="small">{toast?.small}</div>
    </div>
  );
}
