import { useGameStore } from '../store/gameStore';

export default function KillFeed() {
  const killFeed = useGameStore((s) => s.killFeed);
  return (
    <div id="kill-feed">
      {killFeed.map((msg, i) => (
        <div key={i} className="kill-row">{msg}</div>
      ))}
    </div>
  );
}
