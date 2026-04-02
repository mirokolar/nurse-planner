import type {
  ConflictEntry,
  DaySchedule,
  Nurse,
  Patient,
  ScheduledVisit,
  Weekday,
  WeekSchedule,
} from '../types';
import { WEEKDAYS } from '../types';
import { findAvailableSlot, fromMinutes, toMinutes } from '../../utils/timeUtils';

interface NurseState {
  nurse: Nurse;
  currentTimeMin: number; // konec posledního bloku (jízda + návštěva)
  lastPatientIdx: number; // index v poli points pro výpočet vzdálenosti
  visitCount: number;     // počet přiřazených návštěv v daném dni (pro vyvažování zátěže)
}

/**
 * Hlavní greedy plánovač.
 * @param nurses      seznam sester
 * @param patients    seznam pacientů (s vyplněnými coordinates)
 * @param durationMatrix  matice dob jízdy v sekundách (indexy dle patients)
 * @param weekId      identifikátor týdne (např. "2026-W15")
 * @param startDay    první den, od kterého se plánuje (výchozí: 'Po')
 */
export function schedule(
  nurses: Nurse[],
  patients: Patient[],
  durationMatrix: number[][],
  weekId: string,
  startDay: Weekday = 'Po',
): WeekSchedule {
  const patientIndexMap = new Map<string, number>(
    patients.map((p, i) => [p.id, i]),
  );

  const days: Record<Weekday, DaySchedule> = {} as Record<Weekday, DaySchedule>;
  WEEKDAYS.forEach((d) => (days[d] = { day: d, visits: [] }));

  // Plánujeme pouze dny od startDay dále
  const activeDays = WEEKDAYS.slice(WEEKDAYS.indexOf(startDay));

  const unscheduled: ConflictEntry[] = [];

  for (const day of activeDays) {
    // shromáždíme všechny požadavky pro tento den
    const dayRequirements = patients.flatMap((p) =>
      p.visits.filter((v) => v.day === day).map((v) => ({ patient: p, req: v })),
    );

    if (dayRequirements.length === 0) continue;

    // inicializujeme stav sester pro tento den
    const nurseStates = new Map<string, NurseState>();
    for (const nurse of nurses) {
      const avail = nurse.availability.find((a) => a.day === day);
      if (!avail) continue;
      nurseStates.set(nurse.name, {
        nurse,
        currentTimeMin: toMinutes(avail.start),
        lastPatientIdx: -1,
        visitCount: 0,
      });
    }

    // třídíme požadavky: nejdříve ty s pevným oknem
    const sorted = [...dayRequirements].sort((a, b) => {
      const aFixed = a.req.windowStart !== 'ANY' ? 0 : 1;
      const bFixed = b.req.windowStart !== 'ANY' ? 0 : 1;
      if (aFixed !== bFixed) return aFixed - bFixed;
      if (a.req.windowStart !== 'ANY' && b.req.windowStart !== 'ANY') {
        return toMinutes(a.req.windowStart) - toMinutes(b.req.windowStart);
      }
      return 0;
    });

    for (const { patient, req } of sorted) {
      const scheduled = trySchedule(
        req.preferredNurse,
        day,
        patient,
        req.durationMin,
        req.windowStart,
        req.windowEnd,
        nurseStates,
        patientIndexMap,
        durationMatrix,
        days,
      );

      if (!scheduled) {
        unscheduled.push({
          requirement: req,
          patientName: patient.name,
          reason: 'Žádná sestra nemá dostupný slot odpovídající časovému oknu pacienta.',
        });
      }
    }
  }

  return { weekId, days, unscheduled };
}

function trySchedule(
  preferredNurseName: string | 'ANY',
  day: Weekday,
  patient: Patient,
  durationMin: number,
  windowStart: string | 'ANY',
  windowEnd: string | 'ANY',
  nurseStates: Map<string, NurseState>,
  patientIndexMap: Map<string, number>,
  durationMatrix: number[][],
  days: Record<Weekday, DaySchedule>,
): boolean {
  // Fallback sestry: vzestupně podle visitCount, sekundárně abecedně (BUG #2 fix)
  const fallbacks = Array.from(nurseStates.values())
    .filter((s) => s.nurse.name !== preferredNurseName)
    .sort((a, b) =>
      a.visitCount !== b.visitCount
        ? a.visitCount - b.visitCount
        : a.nurse.name.localeCompare(b.nurse.name, 'cs'),
    );

  // Preferovaná sestra jako první, pak ostatní od nejméně vytížené
  const candidates: NurseState[] = [];
  if (preferredNurseName !== 'ANY') {
    const pref = nurseStates.get(preferredNurseName);
    if (pref) candidates.push(pref);
  }
  candidates.push(...fallbacks);

  for (const state of candidates) {
    const avail = state.nurse.availability.find((a) => a.day === day);
    if (!avail) continue;

    const shiftStartMin = toMinutes(avail.start);
    const shiftEndMin = toMinutes(avail.end);

    // cestovní čas od předchozí pozice (sekundy → minuty, zaokrouhleno nahoru)
    const patIdx = patientIndexMap.get(patient.id) ?? -1;
    let travelMin = 0;
    if (state.lastPatientIdx >= 0 && patIdx >= 0) {
      const seconds = durationMatrix[state.lastPatientIdx]?.[patIdx] ?? 0;
      travelMin = Math.ceil(seconds / 60);
    }

    // nejdříve možný start = max(aktuální čas sestry + cestovní čas, okno pacienta)
    let earliestStart = state.currentTimeMin + travelMin;
    if (windowStart !== 'ANY') {
      earliestStart = Math.max(earliestStart, toMinutes(windowStart));
    }
    // nesmíme začít dříve než začátek směny
    earliestStart = Math.max(earliestStart, shiftStartMin);

    // horní hranice příjezdu: sestra musí dorazit nejpozději v CAS_DO,
    // návštěva pak může skončit až za CAS_DO (CAS_DO = latest arrival, ne end)
    // zároveň musí návštěva skončit před koncem směny sestry
    let latestStart = shiftEndMin - durationMin;
    if (windowEnd !== 'ANY') {
      latestStart = Math.min(latestStart, toMinutes(windowEnd));
    }

    if (earliestStart > latestStart) continue;

    const slotStart = findAvailableSlot(
      earliestStart,
      durationMin,
      latestStart + durationMin, // shiftEnd pro findAvailableSlot
      avail.breaks,
    );

    if (slotStart === null) continue;
    if (slotStart > latestStart) continue;

    const slotEnd = slotStart + durationMin;

    const warnings: string[] = [];
    if (preferredNurseName !== 'ANY' && state.nurse.name !== preferredNurseName) {
      warnings.push(`Přiřazena náhradní sestra (požadována: ${preferredNurseName})`);
    }
    // BUG #4 fix: varování pro pacienta bez geocodovaných souřadnic
    if (!patient.coordinates) {
      warnings.push('Adresa nebyla geocodována — cestovní čas nezohledněn');
    }

    const visit: ScheduledVisit = {
      patient,
      nurse: state.nurse,
      day,
      arrivalTime: fromMinutes(slotStart),
      departureTime: fromMinutes(slotEnd),
      travelFromPrevMin: travelMin,
      warnings,
    };

    days[day].visits.push(visit);

    // aktualizujeme stav sestry
    state.currentTimeMin = slotEnd;
    state.lastPatientIdx = patIdx;
    state.visitCount++;

    return true;
  }

  return false;
}
