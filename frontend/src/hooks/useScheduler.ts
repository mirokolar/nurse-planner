import { useScheduleStore } from '../store/scheduleStore';
import { createRoutingProvider } from '../engine/routing/routingFactory';
import { schedule } from '../engine/scheduler/scheduler';
import type { LatLng, Nurse, Patient, Weekday } from '../engine/types';

// Sestry z Excelu mají hidden pole _homeAddress — interně ho použijeme pro geocoding
type NurseWithHome = Nurse & { _homeAddress?: string };

export function useScheduler() {
  const { nurses, patients, setSchedule, setIdealSchedule, setProgress } = useScheduleStore();

  const run = async (weekId: string, startDay: Weekday = 'Po') => {
    const provider = createRoutingProvider();

    try {
      // ── 1. Geocoding klientů ────────────────────────────────
      setProgress({
        stage: 'geocoding',
        message: 'Geocoduji adresy klientů…',
        current: 0,
        total: patients.length,
      });

      const geocodedPatients: Patient[] = [];
      for (let i = 0; i < patients.length; i++) {
        const p = patients[i];
        setProgress({ current: i + 1, message: `Geocoduji klienta: ${p.name}` });
        let coords = p.coordinates;
        if (!coords && p.address) {
          if (i > 0) await new Promise((r) => setTimeout(r, 1100));
          coords = (await provider.geocode(p.address)) ?? undefined;
        }
        geocodedPatients.push({ ...p, coordinates: coords });
      }

      // ── 2. Geocoding domovů pečovatelek ────────────────────
      const nursesTyped = nurses as NurseWithHome[];
      const nursesWithCoords: NurseWithHome[] = [];

      const nursesToGeocode = nursesTyped.filter((n) => n._homeAddress && !n.homeCoordinates);
      setProgress({
        stage: 'geocoding',
        message: 'Geocoduji adresy pečovatelek…',
        current: 0,
        total: nursesToGeocode.length,
      });

      for (let i = 0; i < nursesTyped.length; i++) {
        const nurse = nursesTyped[i];
        let homeCoords: LatLng | undefined = nurse.homeCoordinates;
        if (!homeCoords && nurse._homeAddress) {
          await new Promise((r) => setTimeout(r, 1100));
          homeCoords = (await provider.geocode(nurse._homeAddress)) ?? undefined;
        }
        nursesWithCoords.push({ ...nurse, homeCoordinates: homeCoords });
      }

      // ── 3. Rozšířená matice: pacienti (0..N-1) + domovy sester (N..N+M-1) ──
      setProgress({ stage: 'routing', message: 'Počítám cestovní matici…', current: 0, total: 1 });

      const N = geocodedPatients.length;
      const M = nursesWithCoords.length;

      // Indexy a souřadnice geocodovaných pacientů
      const geocodedPatientIndices = geocodedPatients
        .map((p, i) => (p.coordinates ? i : -1))
        .filter((i) => i >= 0);
      const patientPoints = geocodedPatientIndices.map((i) => geocodedPatients[i].coordinates!);

      // Indexy a souřadnice pečovatelek s adresou
      const nurseHomeIndices: number[] = [];       // index v matici (N + j)
      const nurseHomePoints: LatLng[] = [];
      const nurseHomeMap = new Map<string, number>(); // name → matrix index

      nursesWithCoords.forEach((nurse, j) => {
        if (nurse.homeCoordinates) {
          const matrixIdx = N + j;
          nurseHomeIndices.push(matrixIdx);
          nurseHomePoints.push(nurse.homeCoordinates);
          nurseHomeMap.set(nurse.name, matrixIdx);
        }
      });

      // Inicializujeme (N+M)×(N+M) matici nulami
      const totalSize = N + M;
      const matrix: number[][] = Array.from({ length: totalSize }, () =>
        new Array(totalSize).fill(0),
      );

      // Všechny body v pořadí: [pacienti, domovy sester]
      const allPoints = [...patientPoints, ...nurseHomePoints];
      const allIndices = [...geocodedPatientIndices, ...nurseHomeIndices];

      if (allPoints.length > 1) {
        try {
          const orsMatrix = await provider.getDurationMatrix(allPoints);
          for (let pi = 0; pi < allIndices.length; pi++) {
            for (let pj = 0; pj < allIndices.length; pj++) {
              matrix[allIndices[pi]][allIndices[pj]] = orsMatrix[pi]?.[pj] ?? 0;
            }
          }
        } catch (e) {
          console.error('Routing matrix error, using zeros:', e);
        }
      }

      // ── 4. Plán s časovými okny ─────────────────────────────
      setProgress({ stage: 'scheduling', message: 'Sestavuji plán…', current: 0, total: 2 });

      const result = schedule(
        nursesWithCoords,
        geocodedPatients,
        matrix,
        weekId,
        startDay,
        true,          // constrainedMode: respektovat okna
        nurseHomeMap,
      );

      setSchedule(result);
      setProgress({ current: 1, message: 'Sestavuji ideální plán…' });

      // ── 5. Ideální plán bez časových oken ───────────────────
      const idealResult = schedule(
        nursesWithCoords,
        geocodedPatients,
        matrix,
        weekId,
        startDay,
        false,         // constrainedMode: ignorovat okna
        nurseHomeMap,
      );

      setIdealSchedule(idealResult);
      setProgress({ stage: 'done', message: 'Plán je připraven.', current: 2, total: 2 });
    } catch (err) {
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
