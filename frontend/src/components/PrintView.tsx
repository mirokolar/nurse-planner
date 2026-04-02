import type { WeekSchedule } from '../engine/types';
import { WEEKDAYS, WEEKDAY_LABELS } from '../engine/types';

const NURSE_COLORS: Record<number, { bg: string; border: string; text: string }> = {
  0: { bg: '#dbeafe', border: '#60a5fa', text: '#1e3a8a' },
  1: { bg: '#d1fae5', border: '#34d399', text: '#064e3b' },
  2: { bg: '#ede9fe', border: '#a78bfa', text: '#3b0764' },
  3: { bg: '#fef3c7', border: '#fbbf24', text: '#78350f' },
  4: { bg: '#ffe4e6', border: '#fb7185', text: '#881337' },
  5: { bg: '#cffafe', border: '#22d3ee', text: '#164e63' },
};

interface PrintViewProps {
  schedule: WeekSchedule;
}

export function PrintView({ schedule }: PrintViewProps) {
  // sbíráme unikátní sestry
  const nurseNames = Array.from(
    new Set(
      WEEKDAYS.flatMap((d) => schedule.days[d].visits.map((v) => v.nurse.name)),
    ),
  );

  const colorOf = (name: string) => NURSE_COLORS[nurseNames.indexOf(name) % 6];

  return (
    <div className="print-area">
      {/* Hlavička */}
      <div style={{ marginBottom: '6mm', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1 style={{ margin: 0, fontSize: '14pt', fontWeight: 700 }}>
          Plán návštěv domácí péče — {schedule.weekId}
        </h1>
        <span style={{ fontSize: '8pt', color: '#6b7280' }}>
          Vytištěno: {new Date().toLocaleDateString('cs-CZ')}
        </span>
      </div>

      {/* Tabulka */}
      <table>
        <thead>
          <tr>
            <th style={{ width: '130px', textAlign: 'left' }}>Sestra</th>
            {WEEKDAYS.map((d) => (
              <th key={d} style={{ textAlign: 'center' }}>
                {WEEKDAY_LABELS[d]}
                <br />
                <span style={{ fontWeight: 400, fontSize: '8pt', color: '#6b7280' }}>
                  {schedule.days[d].visits.length} návštěv
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {nurseNames.map((nurseName) => {
            const c = colorOf(nurseName);
            return (
              <tr key={nurseName}>
                <td style={{ fontWeight: 600, fontSize: '9pt', verticalAlign: 'middle' }}>
                  {nurseName}
                </td>
                {WEEKDAYS.map((day) => {
                  const visits = schedule.days[day].visits
                    .filter((v) => v.nurse.name === nurseName)
                    .sort((a, b) => a.arrivalTime.localeCompare(b.arrivalTime));
                  return (
                    <td key={day}>
                      {visits.map((v, i) => (
                        <div
                          key={i}
                          className="visit-block"
                          style={{
                            backgroundColor: c.bg,
                            borderColor: c.border,
                            color: c.text,
                          }}
                        >
                          <strong style={{ fontSize: '8pt' }}>{v.patient.name}</strong>
                          <br />
                          <span style={{ fontSize: '7.5pt' }}>
                            {v.arrivalTime}–{v.departureTime}
                          </span>
                          {v.travelFromPrevMin > 0 && (
                            <span style={{ fontSize: '7pt', color: '#6b7280' }}>
                              {' '}(+{v.travelFromPrevMin} min)
                            </span>
                          )}
                          {v.warnings.length > 0 && (
                            <span style={{ fontSize: '7pt', color: '#b45309' }}> ⚠</span>
                          )}
                        </div>
                      ))}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Legenda */}
      <div className="print-legend">
        {nurseNames.map((name) => {
          const c = colorOf(name);
          return (
            <span
              key={name}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: c.bg,
                border: `1px solid ${c.border}`,
                color: c.text,
                fontSize: '8pt',
              }}
            >
              {name}
            </span>
          );
        })}
      </div>

      {/* Neplánované návštěvy */}
      {schedule.unscheduled.length > 0 && (
        <div style={{ marginTop: '6mm', fontSize: '8pt' }}>
          <strong style={{ color: '#b91c1c' }}>
            Neplánované návštěvy ({schedule.unscheduled.length}):
          </strong>
          <ul style={{ margin: '2mm 0 0 4mm', paddingLeft: '10px' }}>
            {schedule.unscheduled.map((c, i) => (
              <li key={i}>
                <strong>{c.patientName}</strong> — {WEEKDAY_LABELS[c.requirement.day]}
                {c.requirement.windowStart !== 'ANY' && ` ${c.requirement.windowStart}–${c.requirement.windowEnd}`}
                : {c.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
