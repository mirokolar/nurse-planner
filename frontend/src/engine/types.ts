export type Weekday = 'Po' | 'Ut' | 'St' | 'Ct' | 'Pa';

export const WEEKDAYS: Weekday[] = ['Po', 'Ut', 'St', 'Ct', 'Pa'];
export const WEEKDAY_LABELS: Record<Weekday, string> = {
  Po: 'Pondělí',
  Ut: 'Úterý',
  St: 'Středa',
  Ct: 'Čtvrtek',
  Pa: 'Pátek',
};

export interface TimeInterval {
  start: string; // "HH:MM"
  end: string;
}

export interface DayAvailability {
  day: Weekday;
  start: string;
  end: string;
  breaks: TimeInterval[];
}

export interface Nurse {
  name: string;
  availability: DayAvailability[];
  homeCoordinates?: LatLng;  // adresa pečovatelky pro výpočet startu trasy
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface VisitRequirement {
  patientId: string;
  day: Weekday;
  windowStart: string | 'ANY';   // ideální čas příjezdu – od
  windowEnd: string | 'ANY';     // ideální čas příjezdu – do
  backupWindowStart?: string;    // náhradní čas – od (pokud existuje)
  backupWindowEnd?: string;      // náhradní čas – do (pokud existuje)
  durationMin: number;
}

export interface Patient {
  id: string;
  name: string;
  address: string;
  coordinates?: LatLng;
  visits: VisitRequirement[];
}

export interface ScheduledVisit {
  patient: Patient;
  nurse: Nurse;
  day: Weekday;
  arrivalTime: string;
  departureTime: string;
  travelFromPrevMin: number;
  usedBackupTime: boolean;   // true = naplánováno v náhradním čase, ne ideálním
  warnings: string[];
  // 30min přestávka na odpočinek vložená re-timingem (zobrazení v itineráři).
  restBefore?: TimeInterval;  // přestávka těsně PŘED touto návštěvou
  restAfter?: TimeInterval;   // přestávka PO této (poslední) návštěvě
  // Interní meze příjezdu pro re-timing (spodní/horní mez); UI je ignoruje.
  _windowStartMin?: number;
  _latestArrivalMin?: number;
}

export interface DaySchedule {
  day: Weekday;
  visits: ScheduledVisit[];
}

export interface ConflictEntry {
  requirement: VisitRequirement;
  patientName: string;
  reason: string;
}

export interface WeekSchedule {
  weekId: string;
  days: Record<Weekday, DaySchedule>;
  unscheduled: ConflictEntry[];
}

export interface ParseResult<T> {
  data: T[];
  errors: string[];
}
