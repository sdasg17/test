import React, { useEffect, useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Bounds, centreOf } from '../services/ClimateData';

interface AreaMapProps {
  area: Bounds;
  fitToken: number;
  onAreaDrawn: (b: Bounds) => void;
  onReady?: () => void;
  onDrawControl?: (start: () => void, drawing: boolean) => void;
  compact?: boolean;
}

const MIN_SPAN_DEG = 0.01;

export const AreaMap: React.FC<AreaMapProps> = ({
  area,
  fitToken,
  onAreaDrawn,
  onReady,
  onDrawControl,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [L, setL] = useState<any>(null);
  const [map, setMap] = useState<any>(null);
  const [drawing, setDrawing] = useState(false);
  const rectRef = useRef<any>(null);
  const pinRef = useRef<any>(null);
  const onAreaDrawnRef = useRef(onAreaDrawn);

  useEffect(() => {
    onAreaDrawnRef.current = onAreaDrawn;
  }, [onAreaDrawn]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const leaflet = (await import('leaflet')).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      const m = leaflet.map(containerRef.current, { zoomControl: true });
      // Plain OpenStreetMap. The styled basemaps all want an API key now,
      // and a key cannot be kept secret in a static site anyway.
      leaflet
        .tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19,
        })
        .addTo(m);
      m.fitBounds([
        [area.south, area.west],
        [area.north, area.east],
      ]);
      mapRef.current = m;
      setL(leaflet);
      setMap(m);
      onReady?.();
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Draw the priced area and its index point
  useEffect(() => {
    if (!map || !L) return;
    rectRef.current && map.removeLayer(rectRef.current);
    pinRef.current && map.removeLayer(pinRef.current);

    rectRef.current = L.rectangle(
      [
        [area.south, area.west],
        [area.north, area.east],
      ],
      { color: '#1b2026', weight: 2, fillColor: '#ff7a55', fillOpacity: 0.14, dashArray: '4 4' }
    ).addTo(map);

    const c = centreOf(area);
    pinRef.current = L.circleMarker([c.lat, c.lon], {
      radius: 6,
      color: '#ffffff',
      weight: 2,
      fillColor: '#e0401c',
      fillOpacity: 1,
    })
      .bindTooltip('Index point: every policy in this area pays on the temperature here', {
        direction: 'top',
      })
      .addTo(map);
  }, [map, L, area]);

  useEffect(() => {
    if (!map || fitToken === 0) return;
    map.fitBounds(
      [
        [area.south, area.west],
        [area.north, area.east],
      ],
      { padding: [30, 30] }
    );
  }, [fitToken, map]);

  const startDrawing = useCallback(() => {
    if (!map || !L) return;
    setDrawing(true);
    toast.info('Click and drag to draw the area to price. Esc cancels.');

    let start: any = null;
    let temp: any = null;

    const finish = () => {
      map.off('mousedown', down);
      map.off('mousemove', move);
      map.off('mouseup', up);
      document.removeEventListener('keydown', key);
      map.dragging.enable();
      setDrawing(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      temp && map.removeLayer(temp);
      finish();
    };
    const down = (e: any) => {
      start = e.latlng;
      temp = L.rectangle([start, start], { color: '#c2410c', weight: 2, fillOpacity: 0.14 }).addTo(map);
    };
    const move = (e: any) => {
      if (start && temp) temp.setBounds([start, e.latlng]);
    };
    const up = () => {
      if (!temp) return;
      const b = temp.getBounds();
      map.removeLayer(temp);
      finish();
      if (b.getNorth() - b.getSouth() < MIN_SPAN_DEG || b.getEast() - b.getWest() < MIN_SPAN_DEG) {
        toast.warning('That area is too small to price. Drag a larger rectangle.');
        return;
      }
      onAreaDrawnRef.current({
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      });
    };

    map.dragging.disable();
    map.on('mousedown', down);
    map.on('mousemove', move);
    map.on('mouseup', up);
    document.addEventListener('keydown', key);
  }, [map, L]);

  useEffect(() => {
    if (map) onDrawControl?.(startDrawing, drawing);
  }, [map, startDrawing, drawing]);

  return (
    <div className="relative size-full">
      <div ref={containerRef} className="size-full" />
    </div>
  );
};
