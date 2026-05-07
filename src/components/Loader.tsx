import { useT } from '../i18n/useT';

export default function Loader() {
  const t = useT();
  return (
    <div id="loader">
      <div className="txt">{t.initArena}</div>
      <div className="bar" />
    </div>
  );
}
