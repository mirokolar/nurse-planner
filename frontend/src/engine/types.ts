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
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface VisitRequirement {
  patientId: string;
  day: Weekday;
  windowStart: string | 'ANY';
  windowEnd: string | 'ANY';
  durationMin: number;
  preferredNurse: string | 'ANY';
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
  warnings: string[];
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
