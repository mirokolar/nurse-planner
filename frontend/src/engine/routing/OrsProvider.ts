import type { LatLng } from '../types';
import type { IRoutingProvider } from './IRoutingProvider';

const BASE = 'https://api.openrouteservice.org';

export class OrsProvider implements IRoutingProvider {
  constructor(private readonly apiKey: string) {}

  async geocode(address: string): Promise<LatLng | null> {
    // Nominatim (OSM) — přesnější pro česká místní jména než ORS/Pelias
    const url =
      'https://nominatim.openstreetmap.org/search?' +
      new URLSearchParams({
        q: address,
        format: 'json',
        countrycodes: 'cz',
        limit: '1',
        addressdetails: '0',
      });

    const res = await fetch(url, {
      headers: { 'Accept-Language': 'cs', 'User-Agent': 'NursePlanner/1.0' },
    });
    if (!res.ok) {
      console.error('Nominatim geocode error', res.status, await res.text());
      return null;
    }
    const json = await res.json();
    const hit = json?.[0];
    if (!hit) return null;
    // BUG #13 fix: parseFloat může vrátit NaN pro nevalidní data z API
    const lat = parseFloat(hit.lat);
    const lng = parseFloat(hit.lon);
    if (isNaN(lat) || isNaN(lng)) return null;
    return { lat, lng };
  }

  async getDurationMatrix(points: LatLng[]): Promise<number[][]> {
    if (points.length === 0) return [];
    if (points.length === 1) return [[0]];

    const body = {
      locations: points.map((p) => [p.lng, p.lat]),
      metrics: ['duration'],
      units: 'km',
    };

    const res = await fetch(`${BASE}/v2/matrix/driving-car`, {
      method: 'POST',
      headers: {
        Authorization: this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error('ORS matrix error', res.status, await res.text());
      // fallback: nulová matice (žádné cestovní časy)
      return points.map(() => points.map(() => 0));
    }

    const json = await res.json();
    return json.durations as number[][];
  }
}
