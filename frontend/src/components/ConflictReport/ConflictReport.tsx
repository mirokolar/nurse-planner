import type { ConflictEntry } from '../../engine/types';
import { WEEKDAY_LABELS } from '../../engine/types';

interface ConflictReportProps {
  conflicts: ConflictEntry[];
}

export function ConflictReport({ conflicts }: ConflictReportProps) {
  if (conflicts.length === 0) return null;

  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
      <h3 className="font-semibold text-red-800 mb-3">
        Neplánované návštěvy ({conflicts.length})
      </h3>
      <div className="divide-y divide-red-100">
        {conflicts.map((c, i) => (
          <div key={i} className="py-2 text-sm">
            <span className="font-medium text-red-900">{c.patientName}</span>
            <span className="text-red-700 ml-2">
              {WEEKDAY_LABELS[c.requirement.day]}
              {c.requirement.windowStart !== 'ANY' && ` ${c.requirement.windowStart}–${c.requirement.windowEnd}`}
            </span>
            <p className="text-red-600 text-xs mt-0.5">{c.reason}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
