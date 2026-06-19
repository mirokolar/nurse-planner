import type { WeekSchedule } from '../engine/types';
import { WEEKDAYS, WEEKDAY_LABELS } from '../engine/types';

interface Props {
  schedule: WeekSchedule;
}

export function BackupTimeReport({ schedule }: Props) {
  const backupVisits = WEEKDAYS.flatMap((day) =>
    schedule.days[day].visits
      .filter((v) => v.usedBackupTime)
      .map((v) => ({ ...v, day })),
  );

  if (backupVisits.length === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 mb-6 no-print">
      <p className="font-semibold text-amber-900 mb-3">
        ⚠ Klienti naplánovaní v náhradním čase ({backupVisits.length}) — informujte je o změně
      </p>
      <div className="divide-y divide-amber-200">
        {backupVisits.map((v, i) => {
          // Najdeme info o ideálním a náhradním okně z warnings
          const warning = v.warnings.find((w) => w.startsWith('Naplánováno v náhradním čase'));
          return (
            <div key={i} className="py-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm">
              <span className="font-semibold text-amber-900">{v.patient.name}</span>
              <span className="text-amber-700">{WEEKDAY_LABELS[v.day]}</span>
              <span className="text-amber-700">příjezd {v.arrivalTime}</span>
              {warning && (
                <span className="text-amber-600 text-xs">{warning}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
