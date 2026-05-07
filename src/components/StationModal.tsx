import { useGameStore } from '../store/gameStore';
import { useT } from '../i18n/useT';
import { PORTFOLIO } from '../data/portfolio';
import type { StationId } from '../data/portfolio';

function useLang() { return useGameStore((s) => s.lang); }
function fr<T>(lang: string, frVal: T | undefined, enVal: T): T {
  return lang === 'fr' && frVal !== undefined ? frVal : enVal;
}

interface Props {
  onClose: () => void;
  onOpenMap: (eduIndex: number) => void;
  onOpenLocationMap: () => void;
}

export default function StationModal({ onClose, onOpenMap, onOpenLocationMap }: Props) {
  const activeStation = useGameStore((s) => s.activeStation);
  const lang          = useGameStore((s) => s.lang);

  if (!activeStation) return null;

  const close = onClose;

  return (
    <div id="modal" className="active" onClick={(e) => { if ((e.target as HTMLElement).id === 'modal') close(); }}>
      <div className="modal-box">
        <button className="close-btn" onClick={close}>✕</button>
        <div className="modal-tag">// STATION_{stationIndex(activeStation)} //</div>
        <h2 className="modal-title">{stationTitle(activeStation, lang)}</h2>
        <div className="modal-body">
          <StationBody id={activeStation} onOpenMap={onOpenMap} onOpenLocationMap={onOpenLocationMap} />
        </div>
      </div>
    </div>
  );
}

function stationIndex(id: StationId): string {
  const map: Record<StationId, string> = { about:'01', experience:'02', education:'03', contact:'04', location:'05', projects:'06' };
  return map[id] ?? '??';
}

function stationTitle(id: StationId, lang: string): string {
  const en: Record<StationId, string> = {
    about: PORTFOLIO.name,
    experience: 'EXPERIENCE.LOG',
    education: 'EDUCATION.LOG',
    contact: 'CONTACT.PROTOCOL',
    location: 'BASE.OF.OPERATIONS',
    projects: 'PROJECTS.DIR',
  };
  const frMap: Record<StationId, string> = {
    about: PORTFOLIO.name,
    experience: 'EXPÉRIENCE.LOG',
    education: 'FORMATION.LOG',
    contact: 'CONTACT.PROTOCOLE',
    location: 'BASE.D.OPÉRATIONS',
    projects: 'PROJETS.DIR',
  };
  return (lang === 'fr' ? frMap[id] : en[id]) ?? id.toUpperCase();
}

function StationBody({ id, onOpenMap, onOpenLocationMap }: { id: StationId; onOpenMap: (i: number) => void; onOpenLocationMap: () => void }) {
  switch (id) {
    case 'about':      return <AboutBody />;
    case 'experience': return <ExperienceBody />;
    case 'education':  return <EducationBody onOpenMap={onOpenMap} />;
    case 'contact':    return <ContactBody />;
    case 'location':   return <LocationBody onOpenMap={onOpenLocationMap} />;
    case 'projects':   return <ProjectsBody />;
  }
}

function AboutBody() {
  const t = useT();
  const lang = useLang();
  return (
    <>
      <h3>{fr(lang, PORTFOLIO.taglineFr, PORTFOLIO.tagline)}</h3>
      <p>{fr(lang, PORTFOLIO.about.introFr, PORTFOLIO.about.intro)}</p>
      <h3>{t.coreStack}</h3>
      <div className="skills">
        {PORTFOLIO.about.skills.map((s) => <span key={s}>{s}</span>)}
      </div>
    </>
  );
}

function ExperienceBody() {
  const lang = useLang();
  return (
    <>
      {PORTFOLIO.experience.map((e, i) => (
        <div key={i} className="item">
          <div className="role">{fr(lang, e.roleFr, e.role)}</div>
          <div className="where">{e.where}</div>
          <div className="when">{e.when}</div>
          <p style={{ marginTop: '.4rem' }}>{fr(lang, e.descFr, e.desc)}</p>
        </div>
      ))}
    </>
  );
}

function EducationBody({ onOpenMap }: { onOpenMap: (i: number) => void }) {
  const t = useT();
  const lang = useLang();
  return (
    <>
      {PORTFOLIO.education.map((e, i) => (
        <div key={i} className="item">
          <div className="role">{fr(lang, e.roleFr, e.role)}</div>
          <div className="where">{e.where}</div>
          <div className="when">{e.when}</div>
          <p style={{ marginTop: '.4rem' }}>{fr(lang, e.descFr, e.desc)}</p>
          <button
            className="contact-card"
            style={{ marginTop: '.6rem', cursor: 'pointer', background: 'rgba(255,242,0,.06)', border: '1px solid rgba(255,242,0,.4)', width: 'auto', display: 'inline-block' }}
            onClick={() => onOpenMap(i)}
          >
            <div className="lbl" style={{ color: 'var(--yellow)' }}>{t.viewOnMap}</div>
            <div className="val" style={{ fontSize: '.8rem', color: '#fff' }}>{e.map.name}</div>
          </button>
        </div>
      ))}
    </>
  );
}

function ContactBody() {
  const t = useT();
  const c = PORTFOLIO.contact;
  return (
    <>
      <p>{t.contactIntro}</p>
      <div className="contact-grid">
        <a className="contact-card" href={`mailto:${c.email}`}><div className="lbl">EMAIL</div><div className="val">{c.email}</div></a>
        <a className="contact-card" href={`tel:${c.phone.replace(/\s/g, '')}`}><div className="lbl">PHONE</div><div className="val">{c.phone}</div></a>
        <a className="contact-card" href={`https://${c.github}`} target="_blank" rel="noopener noreferrer"><div className="lbl">GITHUB</div><div className="val">{c.github}</div></a>
        <a className="contact-card" href={`https://${c.linkedin}`} target="_blank" rel="noopener noreferrer"><div className="lbl">LINKEDIN</div><div className="val">{c.linkedin}</div></a>
        <a className="contact-card resume-card" href="/resume.pdf" download><div className="lbl">RESUME</div><div className="val">{t.downloadResume}</div></a>
      </div>
    </>
  );
}

function LocationBody({ onOpenMap }: { onOpenMap: () => void }) {
  const t = useT();
  const loc = PORTFOLIO.contact.location;
  return (
    <>
      <p>{t.locationNote(loc.name)}</p>
      <button
        className="contact-card"
        style={{ cursor: 'pointer', borderColor: 'var(--neon)', width: 'auto', display: 'inline-block', marginTop: '.8rem', border: '1px solid var(--neon)', background: 'rgba(0,255,213,.05)' }}
        onClick={onOpenMap}
      >
        <div className="lbl">{t.openMap}</div>
        <div className="val">{loc.name}</div>
      </button>
    </>
  );
}

function ProjectsBody() {
  const t = useT();
  const lang = useLang();
  return (
    <>
      <h3>{t.selectedWorks}</h3>
      {PORTFOLIO.projects.map((p, i) => (
        <div key={i} className="item">
          <div className="role">{p.title}</div>
          <p style={{ marginTop: '.4rem' }}>{fr(lang, p.descFr, p.desc)}</p>
          <div className="skills" style={{ marginTop: '.4rem' }}>
            {p.stack.map((s) => <span key={s}>{s}</span>)}
          </div>
          {p.link && (
            <a className="contact-card" href={p.link} target="_blank" rel="noopener noreferrer" style={{ marginTop: '.6rem', display: 'inline-block' }}>
              <div className="lbl">{t.viewProject}</div>
            </a>
          )}
        </div>
      ))}
    </>
  );
}
