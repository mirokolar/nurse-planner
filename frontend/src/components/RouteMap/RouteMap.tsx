import { useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { DaySchedule, ScheduledVisit } from '../../engine/types';

const NURSE_COLORS_HEX = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#8b5cf6', // violet
  '#f59e0b', // amber
  '#f43f5e', // rose
  '#06b6d4', // cyan
];

interface RouteMapProps {
  daySchedule: DaySchedule;
  nurseColorMap: Map<string, string>;
}

export function RouteMap({ daySchedule }: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  // seskupíme a seřadíme návštěvy podle sestry
  const byNurse = useMemo(() => {
    const m = new Map<string, ScheduledVisit[]>();
    for (const v of daySchedule.visits) {
      if (!m.has(v.nurse.name)) m.set(v.nurse.name, []);
      m.get(v.nurse.name)!.push(v);
    }
    m.forEach((visits) => visits.sort((a, b) => a.arrivalTime.localeCompare(b.arrivalTime)));
    return m;
  }, [daySchedule]);

  const nurseNames = useMemo(() => Array.from(byNurse.keys()), [byNurse]);

  const allPositions = useMemo<L.LatLngTuple[]>(() => {
    const pts: L.LatLngTuple[] = [];
    byNurse.forEach((visits) => {
      visits.forEach((v) => {
        if (v.patient.coordinates) {
          pts.push([v.patient.coordinates.lat, v.patient.coordinates.lng]);
        }
      });
    });
    return pts;
  }, [byNurse]);

  useEffect(() => {
    if (!containerRef.current || allPositions.length === 0) return;

    // BUG #8 fix: Leaflet v React Strict Mode — container může mít _leaflet_id
    // po prvním mount/unmount cyklu i přesto, že mapRef.current je null.
    const container = containerRef.current;
    if (!mapRef.current) {
      // Odstraníme zastaralý _leaflet_id z předchozího (Strict Mode) cyklu
      if ((container as unknown as Record<string, unknown>)['_leaflet_id']) {
        delete (container as unknown as Record<string, unknown>)['_leaflet_id'];
      }
      mapRef.current = L.map(container, { scrollWheelZoom: true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(mapRef.current);
    }

    const map = mapRef.current;

    // vyčistíme předchozí vrstvy (ne tile layer)
    map.eachLayer((layer) => {
      if (!(layer instanceof L.TileLayer)) map.removeLayer(layer);
    });

    // přidáme vrstvy pro každou sestru
    byNurse.forEach((visits, nurseName) => {
      const idx = nurseNames.indexOf(nurseName);
      const color = NURSE_COLORS_HEX[idx % NURSE_COLORS_HEX.length];
      const routePoints: L.LatLngTuple[] = visits
        .filter((v) => v.patient.coordinates)
        .map((v) => [v.patient.coordinates!.lat, v.patient.coordinates!.lng]);

      // polyline trasy
      if (routePoints.length > 1) {
        L.polyline(routePoints, {
          color,
          weight: 3,
          opacity: 0.8,
          dashArray: '8 5',
        }).addTo(map);
      }

      // pořadové číslo zastávky
      visits
        .filter((v) => v.patient.coordinates)
        .forEach((v, i) => {
          const pos: L.LatLngTuple = [v.patient.coordinates!.lat, v.patient.coordinates!.lng];
          const warnings = v.warnings.map((w) => `<p style="color:#b45309;font-size:11px">⚠ ${w}</p>`).join('');
          const travel = v.travelFromPrevMin > 0
            ? `<p style="color:#9ca3af;font-size:11px">jízda ${v.travelFromPrevMin} min</p>`
            : '';

          // číslo zastávky jako badge přes marker
          const numIcon = L.divIcon({
            className: '',
            html: `
              <div style="position:relative;width:24px;height:24px">
                <div style="width:24px;height:24px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:700">${i + 1}</div>
              </div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
            popupAnchor: [0, -14],
          });

          L.marker(pos, { icon: numIcon })
            .bindPopup(`
              <div style="font-family:system-ui,sans-serif;min-width:160px">
                <p style="font-weight:600;margin:0 0 2px">${v.patient.name}</p>
                <p style="color:#6b7280;font-size:11px;margin:0 0 4px">${v.patient.address}</p>
                <p style="margin:0"><span style="color:${color};font-weight:500">${nurseName}</span> · ${v.arrivalTime}–${v.departureTime}</p>
                ${travel}${warnings}
              </div>
            `)
            .addTo(map);
        });
    });

    // přizpůsobíme výřez
    if (allPositions.length === 1) {
      map.setView(allPositions[0], 14);
    } else {
      map.fitBounds(L.latLngBounds(allPositions), { padding: [40, 40] });
    }

    // oprava rozměrů (container mohl být hidden při inicializaci)
    setTimeout(() => map.invalidateSize(), 50);
  }, [byNurse, nurseNames, allPositions]);

  // cleanup při unmount
  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  if (allPositions.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 bg-gray-100 rounded-xl text-sm text-gray-500">
        Žádné geocodované souřadnice — spusťte plánování pro zobrazení mapy.
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
      <div ref={containerRef} style={{ height: '420px', width: '100%' }} />

      {/* Legenda */}
      <div className="flex flex-wrap gap-4 px-3 py-2 bg-white border-t border-gray-100 text-xs">
        {nurseNames.map((name, i) => (
          <div key={name} className="flex items-center gap-1.5">
            <span
              className="inline-block w-6 border-t-2 border-dashed"
              style={{ borderColor: NURSE_COLORS_HEX[i % NURSE_COLORS_HEX.length] }}
            />
            <span className="text-gray-700">{name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
