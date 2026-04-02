import { useState } from 'react';
import type { ScheduledVisit, WeekSchedule, Weekday } from '../../engine/types';
import { WEEKDAYS, WEEKDAY_LABELS } from '../../engine/types';
import { DayDetail } from './DayDetail';

const NURSE_COLORS = [
  'bg-blue-100 border-blue-400 text-blue-900',
  'bg-emerald-100 border-emerald-400 text-emerald-900',
  'bg-violet-100 border-violet-400 text-violet-900',
  'bg-amber-100 border-amber-400 text-amber-900',
  'bg-rose-100 border-rose-400 text-rose-900',
  'bg-cyan-100 border-cyan-400 text-cyan-900',
];

interface WeeklyGridProps {
  schedule: WeekSchedule;
}

export function WeeklyGrid({ schedule }: WeeklyGridProps) {
  const [selectedDay, setSelectedDay] = useState<Weekday | null>(null);

  // sbíráme všechna unikátní jména sester a přiřazujeme barvy
  const nurseNames = Array.from(
    new Set(
      WEEKDAYS.flatMap((d) =>
        schedule.days[d].visits.map((v) => v.nurse.name),
      ),
    ),
  );
  const nurseColorMap = new Map(
    nurseNames.map((name, i) => [name, NURSE_COLORS[i % NURSE_COLORS.length]]),
  );

  if (selectedDay) {
    return (
      <DayDetail
        daySchedule={schedule.days[selectedDay]}
        nurseColorMap={nurseColorMap}
        onBack={() => setSelectedDay(null)}
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse">
        <thead>
          <tr>
            <th className="w-40 p-3 text-left text-sm font-semibold text-gray-500 border-b">
              Sestra
            </th>
            {WEEKDAYS.map((d) => (
              <th
                key={d}
                className="p-3 text-center text-sm font-semibold text-gray-700 border-b cursor-pointer hover:bg-gray-50"
                onClick={() => setSelectedDay(d)}
              >
                {WEEKDAY_LABELS[d]}
                <span className="ml-1 text-xs text-gray-400">
                  ({schedule.days[d].visits.length})
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {nurseNames.map((nurseName) => (
            <tr key={nurseName} className="border-b hover:bg-gray-50">
              <td className="p-3 text-sm font-medium text-gray-800">{nurseName}</td>
              {WEEKDAYS.map((day) => {
                const visits = schedule.days[day].visits.filter(
                  (v) => v.nurse.name === nurseName,
                );
                return (
                  <td
                    key={day}
                    className="p-2 align-top cursor-pointer"
                    onClick={() => setSelectedDay(day)}
                  >
                    <div className="flex flex-col gap-1 min-h-[3rem]">
                      {visits.map((v, i) => (
                        <VisitBlock key={i} visit={v} colorClass={nurseColorMap.get(nurseName)!} />
                      ))}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* legenda */}
      <div className="flex flex-wrap gap-3 mt-4 px-2">
        {nurseNames.map((name) => (
          <div key={name} className="flex items-center gap-1.5 text-sm">
            <span className={`w-3 h-3 rounded-full border ${nurseColorMap.get(name)} inline-block`} />
            <span className="text-gray-700">{name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function VisitBlock({ visit, colorClass }: { visit: ScheduledVisit; colorClass: string }) {
  return (
    <div className={`border rounded px-2 py-1 text-xs ${colorClass} ${visit.warnings.length > 0 ? 'ring-1 ring-yellow-400' : ''}`}>
      <div className="font-semibold truncate max-w-[120px]">{visit.patient.name}</div>
      <div className="opacity-75">{visit.arrivalTime}–{visit.departureTime}</div>
      {visit.travelFromPrevMin > 0 && (
        <div className="opacity-60 text-[10px]">jízda {visit.travelFromPrevMin} min</div>
      )}
      {visit.warnings.length > 0 && (
        <div className="text-yellow-700 text-[10px]">⚠ náhrada</div>
      )}
    </div>
  );
}
