import { useScheduleStore } from '../store/scheduleStore';
import { createRoutingProvider } from '../engine/routing/routingFactory';
import { schedule } from '../engine/scheduler/scheduler';
import type { Patient, Weekday } from '../engine/types';

export function useScheduler() {
  const { nurses, patients, setSchedule, setProgress } = useScheduleStore();

  const run = async (weekId: string, startDay: Weekday = 'Po') => {
    const provider = createRoutingProvider();

    try {
      // --- Geocoding ---
      setProgress({ stage: 'geocoding', message: 'Geocoduji adresy pacientů…', current: 0, total: patients.length });

      const geocodedPatients: Patient[] = [];
      for (let i = 0; i < patients.length; i++) {
        const p = patients[i];
        setProgress({ current: i + 1, message: `Geocoduji: ${p.name}` });
        let coords = p.coordinates;
        if (!coords) {
          // Nominatim rate limit: max 1 req/s
          if (i > 0) await new Promise((r) => setTimeout(r, 1100));
          coords = (await provider.geocode(p.address)) ?? undefined;
        }
        geocodedPatients.push({ ...p, coordinates: coords });
      }

      // --- Distance matrix ---
      setProgress({ stage: 'routing', message: 'Počítám cestovní matici…', current: 0, total: 1 });

      // Indexy pacientů, kteří mají souřadnice (v plném poli geocodedPatients)
      const geocodedIndices = geocodedPatients
        .map((p, i) => (p.coordinates ? i : -1))
        .filter((i) => i >= 0);
      const points = geocodedIndices.map((i) => geocodedPatients[i].coordinates!);

      // Výchozí N×N matice nul (pro pacienty bez souřadnic zůstane 0)
      const N = geocodedPatients.length;
      const matrix: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));

      if (points.length > 1) {
        try {
          // ORS vrátí M×M matici (M = počet geocodovaných pacientů)
          const orsMatrix = await provider.getDurationMatrix(points);
          // Přemapujeme M×M → N×N podle skutečných indexů pacientů
          for (let pi = 0; pi < geocodedIndices.length; pi++) {
            for (let pj = 0; pj < geocodedIndices.length; pj++) {
              matrix[geocodedIndices[pi]][geocodedIndices[pj]] = orsMatrix[pi]?.[pj] ?? 0;
            }
          }
        } catch (e) {
          console.error('Routing matrix error, using zeros:', e);
        }
      }

      // --- Scheduling ---
      setProgress({ stage: 'scheduling', message: 'Sestavuji plán…', current: 1, total: 1 });

      const result = schedule(nurses, geocodedPatients, matrix, weekId, startDay);

      setSchedule(result);
      setProgress({ stage: 'done', message: 'Plán je připraven.', current: 1, total: 1 });
    } catch (err) {
      // BUG #11 fix: zachytíme nečekanou chybu a informujeme UI místo zmrazení
      console.error('Scheduler run failed:', err);
      setProgress({
        stage: 'error',
        message: `Chyba: ${err instanceof Error ? err.message : String(err)}`,
        current: 0,
        total: 0,
      });
    }
  };

  return { run };
}
