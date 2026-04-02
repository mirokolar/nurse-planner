import type { DaySchedule, ScheduledVisit } from '../../engine/types';
import { WEEKDAY_LABELS } from '../../engine/types';
import { RouteMap } from '../RouteMap/RouteMap';

interface DayDetailProps {
  daySchedule: DaySchedule;
  nurseColorMap: Map<string, string>;
  onBack: () => void;
}

export function DayDetail({ daySchedule, nurseColorMap, onBack }: DayDetailProps) {
  // seskupíme návštěvy podle sester
  const byNurse = new Map<string, ScheduledVisit[]>();
  for (const v of daySchedule.visits) {
    if (!byNurse.has(v.nurse.name)) byNurse.set(v.nurse.name, []);
    byNurse.get(v.nurse.name)!.push(v);
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          ← Zpět na týdenní přehled
        </button>
        <h2 className="text-xl font-bold text-gray-800">
          {WEEKDAY_LABELS[daySchedule.day]} — denní itinerář
        </h2>
      </div>

      {byNurse.size === 0 && (
        <p className="text-gray-500 text-sm">Žádné návštěvy naplánované.</p>
      )}

      {/* Mapa trasy */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Mapa tras
        </h3>
        <RouteMap daySchedule={daySchedule} nurseColorMap={nurseColorMap} />
      </div>

      <div className="grid gap-6">
        {Array.from(byNurse.entries()).map(([nurseName, visits]) => {
          const sorted = [...visits].sort((a, b) => a.arrivalTime.localeCompare(b.arrivalTime));
          return (
            <div key={nurseName} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className={`px-4 py-2 text-sm font-semibold ${nurseColorMap.get(nurseName) ?? 'bg-gray-100'}`}>
                {nurseName}
              </div>
              <div className="divide-y">
                {sorted.map((v, i) => (
                  <div key={i} className="px-4 py-3 flex items-start gap-4">
                    <div className="text-sm font-mono text-gray-600 w-24 shrink-0">
                      {v.arrivalTime}–{v.departureTime}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-gray-800">{v.patient.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{v.patient.address}</div>
                      {v.travelFromPrevMin > 0 && (
                        <div className="text-xs text-gray-400 mt-0.5">
                          Příjezd: +{v.travelFromPrevMin} min jízdy
                        </div>
                      )}
                      {v.warnings.map((w, wi) => (
                        <div key={wi} className="text-xs text-yellow-700 mt-0.5">⚠ {w}</div>
                      ))}
                    </div>
                    <div className="text-xs text-gray-400 shrink-0">
                      {v.patient.id}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
