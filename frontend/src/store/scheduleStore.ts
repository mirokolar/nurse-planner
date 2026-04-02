import { create } from 'zustand';
import type { Nurse, Patient, WeekSchedule } from '../engine/types';

type Stage = 'upload' | 'geocoding' | 'routing' | 'scheduling' | 'done' | 'error';

interface ProgressState {
  stage: Stage;
  message: string;
  current: number;
  total: number;
}

interface ScheduleStore {
  nurses: Nurse[];
  patients: Patient[];
  schedule: WeekSchedule | null;
  parseErrors: string[];
  progress: ProgressState;
  selectedDay: string | null;

  setNurses: (nurses: Nurse[]) => void;
  setPatients: (patients: Patient[]) => void;
  setSchedule: (schedule: WeekSchedule) => void;
  setParseErrors: (errors: string[]) => void;
  setProgress: (progress: Partial<ProgressState>) => void;
  setSelectedDay: (day: string | null) => void;
  reset: () => void;
}

const defaultProgress: ProgressState = {
  stage: 'upload',
  message: '',
  current: 0,
  total: 0,
};

export const useScheduleStore = create<ScheduleStore>((set) => ({
  nurses: [],
  patients: [],
  schedule: null,
  parseErrors: [],
  progress: defaultProgress,
  selectedDay: null,

  setNurses: (nurses) => set({ nurses }),
  setPatients: (patients) => set({ patients }),
  setSchedule: (schedule) => set({ schedule }),
  setParseErrors: (parseErrors) => set({ parseErrors }),
  setProgress: (progress) =>
    set((s) => ({ progress: { ...s.progress, ...progress } })),
  setSelectedDay: (selectedDay) => set({ selectedDay }),
  reset: () =>
    set({
      nurses: [],
      patients: [],
      schedule: null,
      parseErrors: [],
      progress: defaultProgress,
      selectedDay: null,
    }),
}));
