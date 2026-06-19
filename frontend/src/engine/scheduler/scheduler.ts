import type {
  ConflictEntry,
  DaySchedule,
  Nurse,
  Patient,
  ScheduledVisit,
  VisitRequirement,
  Weekday,
  WeekSchedule,
} from '../types';
import { WEEKDAYS } from '../types';
import { findAvailableSlot, fromMinutes, isDuringBreak, toMinutes } from '../../utils/timeUtils';

// Přičteme ke každé době jízdy jako organizační buffer
const TRAVEL_BUFFER_MIN = 10;

// Podíl nejdelších úkonů dne, které se plánují přednostně a vyváženě mezi sestry
const LONG_TASK_FRACTION = 0.2;

// Povinná přestávka na odpočinek: 30 min, start nejpozději ve 13:00.
const REST_MIN = 30;
const REST_DEADLINE_MIN = 13 * 60; // 13:00

// Komfortní pauza mezi návštěvami při nižším vytížení dne (5–20 min, krok 5).
const PAUSE_MIN = 5;
const PAUSE_MAX = 20;

// Zaokrouhlení nahoru na nejbližší 15 minut
function roundTo15(min: number): number {
  return Math.ceil(min / 15) * 15;
}

/**
 * Zaokrouhlí čas příjezdu na nejbližší celé desítky minut (10:11→10:10, 12:36→12:40).
 * Vybere nejbližší násobek 10, který leží v [floor, ceil], není v přestávce a vejde se
 * návštěvou. Pokud žádný nevyhovuje, vrátí původní (proveditelnou) hodnotu beze změny.
 */
function snapTo10(
  base: number,
  floor: number,
  ceil: number,
  durationMin: number,
  breaks: { start: string; end: string }[],
): number {
  const nearest = Math.round(base / 10) * 10;
  const candidates = [nearest, nearest - 10, nearest + 10, nearest - 20, nearest + 20, nearest - 30, nearest + 30];
  for (const c of candidates) {
    if (c >= floor && c <= ceil && !isDuringBreak(c, c + durationMin, breaks)) return c;
  }
  return base;
}

/**
 * Doba jízdy v minutách (včetně bufferu).
 * Vrátí 0, pokud je některý index neplatný nebo čas 0 (stejné místo nebo neznámé souřadnice).
 */
function getTravelMin(fromIdx: number, toIdx: number, matrix: number[][]): number {
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return 0;
  const sec = matrix[fromIdx]?.[toIdx] ?? 0;
  return sec > 0 ? Math.ceil(sec / 60) + TRAVEL_BUFFER_MIN : 0;
}

interface NurseState {
  nurse: Nurse;
  currentTimeMin: number;  // konec posledního bloku (po návštěvě)
  lastPatientIdx: number;  // index v matici; −1 = neznámá poloha
  visitCount: number;
  scheduledMin: number;    // součet délek naplánovaných úkonů (pro vyvážení dle minut)
}

interface WorkItem {
  patient: Patient;
  req: VisitRequirement;
}

/**
 * Konkrétní umístění návštěvy v čase pro danou sestru (bez zápisu do plánu).
 */
interface Placement {
  patIdx: number;
  slotStart: number;
  slotEnd: number;
  travelMin: number;
  idleMin: number;        // doba čekání sestry po příjezdu (než smí návštěva začít)
  windowStartMin: number; // spodní mez příjezdu (okno/směna) — pro re-timing
  latestStartMin: number; // horní mez příjezdu (okno/směna) — pro re-timing
}

/**
 * Mód pro výběr časového okna:
 *   'ideal'  – windowStart/windowEnd z požadavku (může být 'ANY')
 *   'backup' – backupWindowStart/End (pokud existuje), jinak 'ANY'
 *   'none'   – žádné okno → pouze limity směny
 */
type WindowMode = 'ideal' | 'backup' | 'none';

// ── Hlavní plánovač ──────────────────────────────────────────────────────────

/**
 * Pořadí obsazování (constrainedMode):
 *   1. Nejdelší úkony (horních 20 % dne dle délky) — vyváženě mezi sestry dle minut.
 *   2. Klienti objednaní na přesný čas — geograficky (nejbližší soused), bez vyvažování.
 *   3. Zbytek (kratší úkony / bez pevného času) — geograficky.
 * Cokoli se nevejde do ideálních oken, padá do fallbacku: náhradní okna → bez oken.
 *
 * Pauzy mezi návštěvami se minimalizují: výběr další návštěvy preferuje nejnižší
 * součet jízda + čekání, takže sestra raději jede dál, než aby měla velkou pauzu.
 *
 * @param nurses          sestry (s vyplněnou dostupností)
 * @param patients        pacienti (s vyplněnými coordinates po geocodingu)
 * @param durationMatrix  matice sekund jízdy; indexy 0..N-1 = pacienti, N..N+M-1 = domovy sester
 * @param weekId          identifikátor týdne (např. "2026-W15")
 * @param startDay        první den plánování (výchozí: 'Po')
 * @param constrainedMode true = respektovat okna; false = ideální plán bez oken
 * @param nurseHomeMap    jméno sestry → index domova v matici (první cesta dne vede z domova)
 */
export function schedule(
  nurses: Nurse[],
  patients: Patient[],
  durationMatrix: number[][],
  weekId: string,
  startDay: Weekday = 'Po',
  constrainedMode = true,
  nurseHomeMap: Map<string, number> = new Map(),
): WeekSchedule {
  const patientIndexMap = new Map<string, number>(
    patients.map((p, i) => [p.id, i]),
  );

  const days: Record<Weekday, DaySchedule> = {} as Record<Weekday, DaySchedule>;
  WEEKDAYS.forEach((d) => (days[d] = { day: d, visits: [] }));

  const activeDays = WEEKDAYS.slice(WEEKDAYS.indexOf(startDay));
  const unscheduled: ConflictEntry[] = [];

  for (const day of activeDays) {
    const dayItems: WorkItem[] = patients.flatMap((p) =>
      p.visits.filter((v) => v.day === day).map((v) => ({ patient: p, req: v })),
    );
    if (dayItems.length === 0) continue;

    // Inicializujeme stav sester — start ze svého domova (nurseHomeMap), jinak neznámá poloha.
    const nurseStates = new Map<string, NurseState>();
    for (const nurse of nurses) {
      const avail = nurse.availability.find((a) => a.day === day);
      if (!avail) continue;
      nurseStates.set(nurse.name, {
        nurse,
        currentTimeMin: toMinutes(avail.start),
        lastPatientIdx: nurseHomeMap.get(nurse.name) ?? -1,
        visitCount: 0,
        scheduledMin: 0,
      });
    }

    const remaining = new Set<WorkItem>(dayItems);

    // ── Kategorizace položek dne ────────────────────────────────────────────
    // 1) Nejdelší úkony: horních 20 % dne podle délky úkonu.
    const longCount = Math.ceil(dayItems.length * LONG_TASK_FRACTION);
    const longSet = new Set<WorkItem>(
      [...dayItems]
        .sort((a, b) => b.req.durationMin - a.req.durationMin)
        .slice(0, longCount),
    );

    const ctx = { nurseStates, patientIndexMap, durationMatrix, daySchedule: days[day] };

    if (constrainedMode) {
      // 2) Pevný čas (z těch, co nejsou mezi dlouhými úkony).
      const fixedSet = new Set<WorkItem>(
        dayItems.filter((it) => !longSet.has(it) && it.req.windowStart !== 'ANY'),
      );
      // 3) Zbytek.
      const restSet = new Set<WorkItem>(
        dayItems.filter((it) => !longSet.has(it) && !fixedSet.has(it)),
      );

      // Pass 1: dlouhé úkony — vyváženě mezi sestry dle minut, ideální okna.
      scheduleBalanced(longSet, remaining, ctx, 'ideal');

      // Pass 2: pevný čas — geograficky (nejbližší soused), ideální okna.
      scheduleNearestNeighbor(fixedSet, remaining, ctx, 'ideal', false);

      // Pass 3: zbytek — geograficky, ideální okna.
      scheduleNearestNeighbor(restSet, remaining, ctx, 'ideal', false);

      // Fallback: náhradní okna, pak bez oken — na vše, co se dosud nevešlo.
      if (remaining.size > 0) {
        scheduleNearestNeighbor(remaining, remaining, ctx, 'backup', true);
      }
      if (remaining.size > 0) {
        scheduleNearestNeighbor(remaining, remaining, ctx, 'none', true);
      }

      // Re-timing: vložit 30min přestávku (start ≤ 13:00) a rozprostřít volný čas
      // jako komfortní pauzy 5–20 min mezi návštěvy. Aplikuje se jen na reálný plán.
      applyRestAndPauses(days[day], nurses);
    } else {
      // Ideální plán: bez časových oken. Stále nejprve dlouhé úkony vyváženě, pak zbytek.
      const restSet = new Set<WorkItem>(dayItems.filter((it) => !longSet.has(it)));
      scheduleBalanced(longSet, remaining, ctx, 'none');
      scheduleNearestNeighbor(restSet, remaining, ctx, 'none', false);
      if (remaining.size > 0) {
        scheduleNearestNeighbor(remaining, remaining, ctx, 'none', true);
      }
      // Zaokrouhlení příjezdů na celé desítky minut (ideální plán nemá re-timing).
      roundArrivalsTo10(days[day], nurses);
    }

    for (const item of remaining) {
      unscheduled.push({
        requirement: item.req,
        patientName: item.patient.name,
        reason: constrainedMode
          ? 'Nepodařilo se naplánovat ani po uvolnění všech časových omezení — nedostatek kapacity.'
          : 'Nedostatek kapacity (ideální plán).',
      });
    }
  }

  return { weekId, days, unscheduled };
}

// ── Společný kontext pro plánovací rutiny ────────────────────────────────────

interface PassContext {
  nurseStates: Map<string, NurseState>;
  patientIndexMap: Map<string, number>;
  durationMatrix: number[][];
  daySchedule: DaySchedule;
}

// ── Pass: dlouhé úkony — vyvážené dle minut ──────────────────────────────────

/**
 * Plánuje položky z `pool` tak, aby byl součet minut úkonů rovnoměrně rozdělen
 * mezi sestry. V každém kole vybere nejméně vytíženou sestru (dle scheduledMin),
 * která dokáže umístit nějakou položku, a přidělí jí geograficky nejvýhodnější
 * (nejnižší jízda + čekání) úkon z poolu. Po každém přidělení se znovu vyhodnotí
 * vytíženost.
 */
function scheduleBalanced(
  pool: Set<WorkItem>,
  remaining: Set<WorkItem>,
  ctx: PassContext,
  windowMode: WindowMode,
): void {
  let madeProgress = true;

  while (madeProgress && pool.size > 0) {
    madeProgress = false;

    // Sestry vzestupně dle naplánovaných minut (nejméně vytížená první).
    const sortedNurses = Array.from(ctx.nurseStates.values()).sort((a, b) =>
      a.scheduledMin !== b.scheduledMin
        ? a.scheduledMin - b.scheduledMin
        : a.visitCount !== b.visitCount
          ? a.visitCount - b.visitCount
          : a.nurse.name.localeCompare(b.nurse.name, 'cs'),
    );

    for (const state of sortedNurses) {
      const best = pickBest(pool, state, ctx, windowMode, true);
      if (best) {
        commitPlacement(best.item, state, best.place, ctx.daySchedule, windowMode);
        pool.delete(best.item);
        remaining.delete(best.item);
        madeProgress = true;
        break; // po přidělení znovu seřadit dle vytíženosti (udrží vyvážení minut)
      }
    }
  }
}

// ── Pass: nejbližší soused (nurse-centric) ───────────────────────────────────

/**
 * Každá sestra v každém kole vybere ze zbývajících položek `pool` tu, kterou
 * zvládne naplánovat s nejnižším součtem jízda + čekání (preferuje, aby sestra
 * raději jela dál, než aby měla velkou pauzu). Iteruje, dokud někdo pokračuje.
 *
 * @param durationFirst  true = při shodě nákladu preferovat delší úkon
 */
function scheduleNearestNeighbor(
  pool: Set<WorkItem>,
  remaining: Set<WorkItem>,
  ctx: PassContext,
  windowMode: WindowMode,
  durationFirst: boolean,
): void {
  let madeProgress = true;

  while (madeProgress && pool.size > 0) {
    madeProgress = false;

    // Sestry seřazené vzestupně dle visitCount (vyvažování zátěže).
    const sortedNurses = Array.from(ctx.nurseStates.values()).sort((a, b) =>
      a.visitCount !== b.visitCount
        ? a.visitCount - b.visitCount
        : a.nurse.name.localeCompare(b.nurse.name, 'cs'),
    );

    for (const state of sortedNurses) {
      const best = pickBest(pool, state, ctx, windowMode, durationFirst);
      if (best) {
        commitPlacement(best.item, state, best.place, ctx.daySchedule, windowMode);
        pool.delete(best.item);
        remaining.delete(best.item);
        madeProgress = true;
        // bez break: každá sestra dostane v tomto kole šanci na jednu návštěvu
      }
    }
  }
}

// ── Výběr nejlepší položky pro danou sestru ──────────────────────────────────

/**
 * Z `pool` vybere položku s nejnižším nákladem = jízda + čekání (idle).
 * Tím se minimalizují velké pauzy: sestra preferuje klienta, ke kterému dojede
 * a rovnou ho obslouží, před klientem, u kterého by dlouho čekala.
 *
 * Při shodě nákladu: (volitelně) delší úkon první, pak dřívější časové okno.
 */
function pickBest(
  pool: Set<WorkItem>,
  state: NurseState,
  ctx: PassContext,
  windowMode: WindowMode,
  durationFirst: boolean,
): { item: WorkItem; place: Placement } | null {
  let best: { item: WorkItem; place: Placement } | null = null;

  for (const item of pool) {
    const place = evaluatePlacement(item, state, ctx, windowMode);
    if (!place) continue;

    if (best === null) {
      best = { item, place };
      continue;
    }

    const cost = place.travelMin + place.idleMin;
    const bestCost = best.place.travelMin + best.place.idleMin;
    if (cost !== bestCost) {
      if (cost < bestCost) best = { item, place };
      continue;
    }

    // Shodný náklad → tie-break
    if (durationFirst && item.req.durationMin !== best.item.req.durationMin) {
      if (item.req.durationMin > best.item.req.durationMin) best = { item, place };
      continue;
    }

    const ws = item.req.windowStart !== 'ANY' ? toMinutes(item.req.windowStart) : Infinity;
    const bws = best.item.req.windowStart !== 'ANY' ? toMinutes(best.item.req.windowStart) : Infinity;
    if (ws < bws) best = { item, place };
  }

  return best;
}

// ── Vyhodnocení umístění (bez zápisu) ────────────────────────────────────────

/**
 * Spočítá proveditelné umístění `item` pro `state` v daném okenním módu.
 * Vrátí null, pokud se návštěva nevejde.
 */
function evaluatePlacement(
  item: WorkItem,
  state: NurseState,
  ctx: PassContext,
  windowMode: WindowMode,
): Placement | null {
  const { patient, req } = item;
  const avail = state.nurse.availability.find((a) => a.day === req.day);
  if (!avail) return null;

  const shiftStartMin = toMinutes(avail.start);
  const shiftEndMin = toMinutes(avail.end);
  const { durationMin } = req;

  const patIdx = ctx.patientIndexMap.get(patient.id) ?? -1;
  const travelMin = getTravelMin(state.lastPatientIdx, patIdx, ctx.durationMatrix);

  // Výběr časového okna dle módu
  let windowStart: string | 'ANY' = 'ANY';
  let windowEnd: string | 'ANY' = 'ANY';

  if (windowMode === 'ideal') {
    windowStart = req.windowStart;
    windowEnd = req.windowEnd;
  } else if (windowMode === 'backup' && req.backupWindowStart && req.backupWindowEnd) {
    windowStart = req.backupWindowStart;
    windowEnd = req.backupWindowEnd;
  }
  // 'none' nebo backup bez náhradního času → zůstane ANY

  // Nejdříve možný příjezd (zaokrouhleno na 15 min), s ohledem na začátek směny
  const arrivalReady = Math.max(roundTo15(state.currentTimeMin + travelMin), shiftStartMin);

  // Spodní mez příjezdu daná oknem/směnou (nezávislá na předchozí návštěvě)
  const windowStartMin = windowStart !== 'ANY'
    ? Math.max(toMinutes(windowStart), shiftStartMin)
    : shiftStartMin;

  let earliestStart = Math.max(arrivalReady, windowStartMin);

  // Nejpozdější start (příjezd k pacientovi)
  let latestStart = shiftEndMin - durationMin;
  if (windowEnd !== 'ANY') {
    latestStart = Math.min(latestStart, toMinutes(windowEnd));
  }

  if (earliestStart > latestStart) return null;

  const slotStart = findAvailableSlot(
    earliestStart,
    durationMin,
    latestStart + durationMin,
    avail.breaks,
  );
  if (slotStart === null || slotStart > latestStart) return null;

  return {
    patIdx,
    slotStart,
    slotEnd: slotStart + durationMin,
    travelMin,
    idleMin: Math.max(0, slotStart - arrivalReady),
    windowStartMin,
    latestStartMin: latestStart,
  };
}

// ── Zápis návštěvy do plánu ──────────────────────────────────────────────────

function commitPlacement(
  item: WorkItem,
  state: NurseState,
  place: Placement,
  daySchedule: DaySchedule,
  windowMode: WindowMode,
): void {
  const { patient, req } = item;
  const notifyClient = windowMode !== 'ideal';

  const warnings: string[] = [];
  if (!patient.coordinates) {
    warnings.push('Adresa nebyla geocodována — cestovní čas nezohledněn');
  }
  if (windowMode === 'backup' && req.backupWindowStart) {
    warnings.push(
      `Naplánováno v náhradním čase (${req.backupWindowStart}–${req.backupWindowEnd}), ideální čas (${req.windowStart}${req.windowEnd !== 'ANY' ? '–' + req.windowEnd : ''}) nebyl dostupný`,
    );
  } else if (windowMode === 'none' && req.windowStart !== 'ANY') {
    warnings.push(
      `Naplánováno bez časového omezení — původní čas ${req.windowStart}${req.windowEnd !== 'ANY' ? '–' + req.windowEnd : ''} nebyl dostupný`,
    );
  }

  const visit: ScheduledVisit = {
    patient,
    nurse: state.nurse,
    day: req.day,
    arrivalTime: fromMinutes(place.slotStart),
    departureTime: fromMinutes(place.slotEnd),
    travelFromPrevMin: place.travelMin,
    usedBackupTime: notifyClient && req.windowStart !== 'ANY',
    warnings,
    _windowStartMin: place.windowStartMin,
    _latestArrivalMin: place.latestStartMin,
  };

  daySchedule.visits.push(visit);
  state.currentTimeMin = place.slotEnd;
  state.lastPatientIdx = place.patIdx;
  state.visitCount++;
  state.scheduledMin += req.durationMin;
}

// ── Re-timing: přestávka na odpočinek + komfortní pauzy ──────────────────────

/**
 * Po přiřazení návštěv upraví časy v rámci dne pro každou sestru:
 *   • vloží jednu 30min přestávku na odpočinek (start nejpozději ve 13:00),
 *   • při nižším vytížení rozprostře volný čas jako pauzy 5–20 min mezi návštěvy,
 *   • respektuje časová okna (meze příjezdu) i přestávky z dostupnosti sestry.
 * Pořadí ani přiřazení návštěv se nemění — pouze se posouvají časy.
 */
function applyRestAndPauses(daySchedule: DaySchedule, nurses: Nurse[]): void {
  const byNurse = new Map<string, ScheduledVisit[]>();
  for (const v of daySchedule.visits) {
    const arr = byNurse.get(v.nurse.name);
    if (arr) arr.push(v);
    else byNurse.set(v.nurse.name, [v]);
  }

  for (const [name, visits] of byNurse) {
    const nurse = nurses.find((n) => n.name === name);
    const avail = nurse?.availability.find((a) => a.day === daySchedule.day);
    if (!avail) continue;
    visits.sort((a, b) => a.arrivalTime.localeCompare(b.arrivalTime));
    reTimeNurseDay(visits, toMinutes(avail.start), toMinutes(avail.end), avail.breaks);
  }
}

/**
 * Zaokrouhlí příjezdy na celé desítky minut (pro plán bez re-timingu).
 * Zachová pořadí, nepřekrytí návštěv téže sestry, okna i přestávky.
 */
function roundArrivalsTo10(daySchedule: DaySchedule, nurses: Nurse[]): void {
  const byNurse = new Map<string, ScheduledVisit[]>();
  for (const v of daySchedule.visits) {
    const arr = byNurse.get(v.nurse.name);
    if (arr) arr.push(v);
    else byNurse.set(v.nurse.name, [v]);
  }

  for (const [name, visits] of byNurse) {
    const nurse = nurses.find((n) => n.name === name);
    const avail = nurse?.availability.find((a) => a.day === daySchedule.day);
    if (!avail) continue;
    const shiftStart = toMinutes(avail.start);
    const shiftEnd = toMinutes(avail.end);
    visits.sort((a, b) => a.arrivalTime.localeCompare(b.arrivalTime));

    let cursor = shiftStart;
    for (const v of visits) {
      const dur = toMinutes(v.departureTime) - toMinutes(v.arrivalTime);
      const lo = v._windowStartMin ?? shiftStart;
      const hi = v._latestArrivalMin ?? shiftEnd - dur;
      const floor = Math.max(cursor, lo, shiftStart);
      const a = snapTo10(toMinutes(v.arrivalTime), floor, hi, dur, avail.breaks);
      v.arrivalTime = fromMinutes(a);
      v.departureTime = fromMinutes(a + dur);
      cursor = a + dur;
    }
  }
}

/**
 * Přepočítá časy návštěv jedné sestry v jednom dni (v daném pořadí).
 */
function reTimeNurseDay(
  visits: ScheduledVisit[],
  shiftStart: number,
  shiftEnd: number,
  breaks: { start: string; end: string }[],
): void {
  const n = visits.length;
  if (n === 0) return;

  const dur = visits.map((v) => toMinutes(v.departureTime) - toMinutes(v.arrivalTime));
  const travel = visits.map((v) => v.travelFromPrevMin);
  const lo = visits.map((v) => v._windowStartMin ?? shiftStart);
  const hi = visits.map((v, i) => v._latestArrivalMin ?? shiftEnd - dur[i]);

  const sumDur = dur.reduce((a, b) => a + b, 0);
  const sumTravel = travel.reduce((a, b) => a + b, 0);
  const gaps = Math.max(0, n - 1);

  // Volný čas po odečtení práce, jízd a povinné přestávky → komfortní pauza na mezeru.
  const slack = shiftEnd - shiftStart - sumDur - sumTravel - REST_MIN;
  const perGap = gaps > 0 ? slack / gaps : 0;
  const pause = perGap >= PAUSE_MIN
    ? Math.min(PAUSE_MAX, Math.floor(perGap / 5) * 5)
    : 0;

  // Umístí návštěvu i: vrátí příjezd (zaokrouhlený na 10 min) respektující pauzu,
  // okno, směnu i přestávky a nepřekrývající předchozí návštěvu.
  const placeVisit = (i: number, cursor: number, withPause: boolean): number => {
    const earliest = Math.max(cursor + (withPause ? pause : 0) + travel[i], lo[i], shiftStart);
    const slot = findAvailableSlot(earliest, dur[i], hi[i] + dur[i], breaks);
    const base = slot ?? Math.min(earliest, hi[i]);
    // Spodní mez pro zaokrouhlení: nepřekrýt předchozí návštěvu (cursor), okno, směnu.
    const floor = Math.max(cursor, lo[i], shiftStart);
    return snapTo10(base, floor, hi[i], dur[i], breaks);
  };

  // Pass A: bez přestávky — zjistíme volné časy pro výběr pozice přestávky.
  const freeBefore: number[] = new Array(n);
  let c = shiftStart;
  for (let i = 0; i < n; i++) {
    freeBefore[i] = c;
    const a = placeVisit(i, c, i > 0);
    c = a + dur[i];
  }
  const freeAfter = c;

  // Pozice přestávky: nejpozdější příležitost se startem ≤ 13:00.
  // Pokud sestra končí všechny návštěvy do 13:00, dáme přestávku až za poslední.
  let restIdx = 0;
  for (let i = 0; i < n; i++) {
    if (freeBefore[i] <= REST_DEADLINE_MIN) restIdx = i;
  }
  const restAfterLast = freeAfter <= REST_DEADLINE_MIN;

  // Pass B: finální časy včetně 30min přestávky.
  c = shiftStart;
  for (let i = 0; i < n; i++) {
    visits[i].restBefore = undefined;
    visits[i].restAfter = undefined;

    if (!restAfterLast && i === restIdx) {
      const rs = c;
      c += REST_MIN;
      visits[i].restBefore = { start: fromMinutes(rs), end: fromMinutes(rs + REST_MIN) };
    }

    const a = placeVisit(i, c, i > 0);
    visits[i].arrivalTime = fromMinutes(a);
    visits[i].departureTime = fromMinutes(a + dur[i]);
    c = a + dur[i];
  }

  if (restAfterLast) {
    visits[n - 1].restAfter = { start: fromMinutes(c), end: fromMinutes(c + REST_MIN) };
  }
}
