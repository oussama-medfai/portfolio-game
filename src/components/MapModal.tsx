import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { useGameStore } from '../store/gameStore';
import { useT } from '../i18n/useT';

const MAP_STYLES = {
  dark:     'https://tiles.openfreemap.org/styles/dark'     as string,
  liberty:  'https://tiles.openfreemap.org/styles/liberty'  as string,
  positron: 'https://tiles.openfreemap.org/styles/positron' as string,
};

type StyleKey = keyof typeof MAP_STYLES;

interface Props {
  onClose: () => void;
}

export default function MapModal({ onClose }: Props) {
  const mapTarget = useGameStore((s) => s.mapTarget);
  const t = useT();

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<maplibregl.Map | null>(null);
  const markerRef    = useRef<maplibregl.Marker | null>(null);
  const [liveCoords, setLiveCoords] = useState('0.0000, 0.0000 · Z 0');
  const [activeStyle, setActiveStyle] = useState<StyleKey>('dark');

  // Init or fly when target changes
  useEffect(() => {
    if (!mapTarget || !containerRef.current) return;

    const updateCoords = () => {
      const m = mapRef.current;
      if (!m) return;
      const c = m.getCenter();
      setLiveCoords(`${c.lat.toFixed(4)}, ${c.lng.toFixed(4)} · Z ${m.getZoom().toFixed(1)}`);
    };

    const setMarker = (lat: number, lng: number) => {
      if (markerRef.current) { markerRef.current.remove(); markerRef.current = null; }
      const el = document.createElement('div');
      el.className = `cm-marker ${mapTarget.color}`;
      el.innerHTML = `<div class="pulse"></div><div class="ring"></div><div class="core"></div>`;
      markerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([lng, lat])
        .setPopup(new maplibregl.Popup({ offset: 22, closeButton: false }).setHTML(`<span class="lbl">${t.pinLabel}</span><b>${mapTarget.name}</b>`))
        .addTo(mapRef.current!);
      setTimeout(() => markerRef.current?.togglePopup(), 600);
    };

    if (!mapRef.current) {
      mapRef.current = new maplibregl.Map({
        container: containerRef.current,
        style: MAP_STYLES.dark,
        center: [mapTarget.lng, mapTarget.lat],
        zoom: mapTarget.zoom,
        attributionControl: { compact: true },
      });
      mapRef.current.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
      mapRef.current.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
      mapRef.current.on('move', updateCoords);
      mapRef.current.on('zoom', updateCoords);
      mapRef.current.on('load', () => {
        mapRef.current!.resize();
        setMarker(mapTarget.lat, mapTarget.lng);
        updateCoords();
        setTimeout(() => mapRef.current?.easeTo({ pitch: 45, bearing: -10, duration: 1500 }), 300);
      });
    } else {
      mapRef.current.flyTo({ center: [mapTarget.lng, mapTarget.lat], zoom: mapTarget.zoom, pitch: 45, bearing: 0, duration: 1500 });
      setTimeout(() => { mapRef.current?.resize(); setMarker(mapTarget.lat, mapTarget.lng); updateCoords(); }, 100);
    }
  }, [mapTarget]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  const switchStyle = (key: StyleKey) => {
    if (!mapRef.current || !mapTarget) return;
    setActiveStyle(key);
    mapRef.current.setStyle(MAP_STYLES[key]);
    mapRef.current.once('styledata', () => {
      if (!markerRef.current || !mapTarget) return;
      const el = document.createElement('div');
      el.className = `cm-marker ${mapTarget.color}`;
      el.innerHTML = `<div class="pulse"></div><div class="ring"></div><div class="core"></div>`;
      if (markerRef.current) markerRef.current.remove();
      markerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([mapTarget.lng, mapTarget.lat])
        .addTo(mapRef.current!);
    });
  };

  const recenter = () => {
    if (!mapRef.current || !mapTarget) return;
    mapRef.current.flyTo({ center: [mapTarget.lng, mapTarget.lat], zoom: mapTarget.zoom, pitch: 45, bearing: 0, duration: 1200 });
  };

  if (!mapTarget) return null;

  return (
    <div id="map-modal" className="active">
      <div className="map-box">
        <div className="map-header">
          <div>
            <div className="modal-tag">{t.geoRecon}</div>
            <h2 className="modal-title" style={{ fontSize: '1.4rem', margin: 0 }}>{mapTarget.name}</h2>
          </div>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="map-content">
          <aside className="map-sidebar">
            <div className="info-tag">{t.locationInfo}</div>
            <h3>{mapTarget.name}</h3>
            <div className="coords">
              <div className="coords-line"><span className="lbl">LAT</span><span>{mapTarget.lat.toFixed(5)}° N</span></div>
              <div className="coords-line"><span className="lbl">LNG</span><span>{mapTarget.lng.toFixed(5)}° E</span></div>
              <div className="coords-line"><span className="lbl">ZOOM</span><span>{mapTarget.zoom}</span></div>
            </div>
            <div className="desc">{mapTarget.desc || t.noIntel}</div>

            <div className="info-tag" style={{ marginTop: '.4rem' }}>{t.mapStyle}</div>
            <div className="map-style-switcher" id="map-styles">
              {(['dark', 'liberty', 'positron'] as StyleKey[]).map((k) => (
                <button key={k} className={activeStyle === k ? 'active' : ''} onClick={() => switchStyle(k)}>
                  {k === 'dark' ? t.mapDark : k === 'liberty' ? t.mapLiberty : t.mapLight}
                </button>
              ))}
            </div>

            <div className="info-tag">{t.actions}</div>
            <div className="map-actions">
              <a className="map-action" href={`https://www.google.com/maps/search/?api=1&query=${mapTarget.lat},${mapTarget.lng}`} target="_blank" rel="noopener noreferrer">
                {t.openGoogle}
              </a>
              <a className="map-action" href={`https://www.openstreetmap.org/?mlat=${mapTarget.lat}&mlon=${mapTarget.lng}#map=${mapTarget.zoom}/${mapTarget.lat}/${mapTarget.lng}`} target="_blank" rel="noopener noreferrer">
                {t.openOSM}
              </a>
              <a className="map-action pink" href={`https://www.google.com/maps/dir/?api=1&destination=${mapTarget.lat},${mapTarget.lng}`} target="_blank" rel="noopener noreferrer">
                {t.getDir}
              </a>
              <button className="map-action pink" onClick={recenter}>
                {t.recenter}
              </button>
            </div>
          </aside>

          <div className="map-frame">
            <div className="corner tl" /><div className="corner tr" />
            <div className="corner bl" /><div className="corner br" />
            <div className="map-hud-overlay">{t.liveFeed}</div>
            <div className="map-coords-live">{liveCoords}</div>
            <div ref={containerRef} id="maplibre-map" />
          </div>
        </div>
      </div>
    </div>
  );
}
