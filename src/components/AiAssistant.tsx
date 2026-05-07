import { useEffect, useState, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import { useT } from '../i18n/useT';
import { STATIONS } from '../data/portfolio';

type Status = 'idle' | 'listening' | 'thinking';

// Health zone positions — must match GameEngine spawnHealthZones
const HZ_POSITIONS: [number, number][] = [
  [  0,  0],
  [ 42,  0],
  [-42,  0],
  [  0, 42],
  [  0,-42],
];

export default function AiAssistant() {
  const [status,     setStatus]     = useState<Status>('idle');
  const [subtitle,   setSubtitle]   = useState('');
  const [transcript, setTranscript] = useState('');
  const lang        = useGameStore((s) => s.lang);
  const gameStarted = useGameStore((s) => s.gameStarted);
  const setWaypoint = useGameStore((s) => s.setWaypoint);
  const t           = useT();
  const voicesRef   = useRef<SpeechSynthesisVoice[]>([]);
  const streamRef   = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef   = useRef<Blob[]>([]);
  const subTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const txTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const msgs        = useRef<{ role: string; text: string }[]>([]);
  const statusRef   = useRef<Status>('idle');

  useEffect(() => { statusRef.current = status; }, [status]);

  useEffect(() => {
    if (!window.speechSynthesis) return;
    const load = () => { voicesRef.current = window.speechSynthesis.getVoices(); };
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  useEffect(() => {
    if (!gameStarted) return;
    const timer = setTimeout(() => {
      showSubtitle(t.ariaWelcome, 12000);
      speak(t.ariaWelcome);
    }, 1500);
    return () => clearTimeout(timer);
  }, [gameStarted]); // eslint-disable-line react-hooks/exhaustive-deps

  const speak = (text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt   = new SpeechSynthesisUtterance(text);
    const target = lang === 'fr' ? 'fr' : 'en';
    utt.lang  = lang === 'fr' ? 'fr-FR' : 'en-US';
    utt.rate  = 0.95;
    utt.pitch = 1.15;

    // Prefer a female voice matching the language
    const voices = voicesRef.current;
    const female = voices.find(v =>
      v.lang.toLowerCase().startsWith(target) &&
      /female|woman|girl|samantha|karen|victoria|moira|fiona|tessa|veena|zira|aria|google\s+\w+\s+english\s+female/i.test(v.name)
    ) ?? voices.find(v =>
      v.lang.toLowerCase().startsWith(target) && !v.name.toLowerCase().includes('male')
    );
    if (female) utt.voice = female;

    window.speechSynthesis.speak(utt);
  };

  const showSubtitle = (text: string, duration = 7000) => {
    if (subTimer.current) clearTimeout(subTimer.current);
    setSubtitle(text);
    subTimer.current = setTimeout(() => setSubtitle(''), duration);
  };

  const buildContext = () => {
    const s = useGameStore.getState();
    const angle = s.playerPos.angle;
    // Forward and right unit vectors from player heading
    const fwdX  = -Math.sin(angle), fwdZ  = -Math.cos(angle);
    const rgtX  =  Math.cos(angle), rgtZ  = -Math.sin(angle);

    const relDir = (tx: number, tz: number): string => {
      const dx = tx - s.playerPos.x;
      const dz = tz - s.playerPos.z;
      const fwd = dx * fwdX + dz * fwdZ;
      const rgt = dx * rgtX + dz * rgtZ;
      const f = Math.abs(fwd), r = Math.abs(rgt);
      const threshold = 0.4; // ratio below which we say "diagonal"
      if (f < 1 && r < 1) return 'HERE';
      if (r / (f + r) < threshold) return fwd > 0 ? 'FORWARD' : 'BEHIND';
      if (f / (f + r) < threshold) return rgt > 0 ? 'RIGHT'   : 'LEFT';
      return `${fwd > 0 ? 'FORWARD' : 'BEHIND'}-${rgt > 0 ? 'RIGHT' : 'LEFT'}`;
    };

    const compassFacing = (() => {
      const deg = ((angle * 180 / Math.PI) % 360 + 360) % 360;
      const dirs = ['NORTH','NORTH-EAST','EAST','SOUTH-EAST','SOUTH','SOUTH-WEST','WEST','NORTH-WEST'];
      return dirs[Math.round(deg / 45) % 8];
    })();

    return {
      playerPos: { x: Math.round(s.playerPos.x), z: Math.round(s.playerPos.z) },
      playerFacing: compassFacing,
      health: s.health,
      stations: STATIONS.map((st) => ({
        id:         st.id,
        label:      st.title,
        x:          st.position[0],
        z:          st.position[2],
        discovered: s.discovered.has(st.id),
        relativeDir: relDir(st.position[0], st.position[2]),
        distance:   Math.round(Math.hypot(st.position[0] - s.playerPos.x, st.position[2] - s.playerPos.z)),
      })),
      healZones: HZ_POSITIONS.map(([x, z], i) => ({
        x, z,
        ready:       s.hzStates[i] !== false,
        relativeDir: relDir(x, z),
        distance:    Math.round(Math.hypot(x - s.playerPos.x, z - s.playerPos.z)),
      })),
    };
  };

  const handleReply = (reply: string) => {
    // Strip HEARD line
    const heardMatch = reply.match(/^HEARD:\s*(.+)/m);
    const playerText = heardMatch?.[1]?.trim() ?? '';
    const cleanReply = reply.replace(/^HEARD:.*\n?/m, '').replace(/ACTION:\{[^}]+\}/g, '').trim();

    if (playerText) {
      if (txTimer.current) clearTimeout(txTimer.current);
      setTranscript(playerText);
      txTimer.current = setTimeout(() => setTranscript(''), 8000);
      msgs.current = [...msgs.current, { role: 'user', text: playerText }].slice(-10);
    }

    msgs.current = [...msgs.current, { role: 'assistant', text: cleanReply }].slice(-10);
    showSubtitle(cleanReply);
    speak(cleanReply);

    // Parse ACTION — waypoint only, station opens only when physically shot
    const stationMatch = reply.match(/ACTION:\{"type":"station","id":"(\w+)"\}/);
    if (stationMatch) {
      setWaypoint({ type: 'station', id: stationMatch[1] });
    }

    const healMatch = reply.match(/ACTION:\{"type":"heal"\}/);
    if (healMatch) {
      setWaypoint({ type: 'heal' });
    }
  };

  const sendAudio = async (mimeType: string) => {
    const blob   = new Blob(chunksRef.current, { type: mimeType });
    const base64 = await new Promise<string>((resolve) => {
      const reader    = new FileReader();
      reader.onload   = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(blob);
    });

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...msgs.current, { role: 'user', text: '' }],
          lang,
          audio: base64,
          audioMime: mimeType.split(';')[0],
          context: buildContext(),
        }),
      });
      const { reply } = (await res.json()) as { reply: string };
      handleReply(reply);
    } catch {
      showSubtitle(t.aiError);
      speak(t.aiError);
    } finally {
      setStatus('idle');
    }
  };

  const startRecording = async () => {
    if (statusRef.current !== 'idle') return;
    try {
      if (!streamRef.current) {
        streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/ogg;codecs=opus';

      chunksRef.current = [];
      const recorder        = new MediaRecorder(streamRef.current, { mimeType });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop          = () => sendAudio(mimeType);
      recorderRef.current      = recorder;
      recorder.start();
      setStatus('listening');
    } catch {
      setStatus('idle');
    }
  };

  const stopRecording = () => {
    if (statusRef.current !== 'listening') return;
    recorderRef.current?.stop();
    setStatus('thinking');
  };

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyT' && !e.repeat) { e.preventDefault(); startRecording(); }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyT') { e.preventDefault(); stopRecording(); }
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    window.speechSynthesis?.cancel();
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  return (
    <>
      <div id="voice-hint" className={status !== 'idle' ? 'hidden' : ''}>
        {t.voiceHint}
      </div>
      {status === 'listening' && (
        <div id="voice-status" className="listening">{t.voiceListening}</div>
      )}
      {status === 'thinking' && (
        <div id="voice-status" className="thinking">{t.voiceThinking}</div>
      )}
      {transcript && (
        <div id="voice-transcript">{transcript}</div>
      )}
      {subtitle && (
        <div id="voice-subtitle">
          <span className="aria-speaker">[ ARIA ]</span>
          {subtitle}
        </div>
      )}
    </>
  );
}
