import { useRef, useState } from 'react';
import { WeeklyGrid } from './components/WeeklyGrid/WeeklyGrid';
import { ConflictReport } from './components/ConflictReport/ConflictReport';
import { BackupTimeReport } from './components/BackupTimeReport';
import { ProgressBar } from './components/ProgressBar';
import { PrintView } from './components/PrintView';
import { parseExcel } from './engine/parser/excelParser';
import { useScheduleStore } from './store/scheduleStore';
import { useScheduler } from './hooks/useScheduler';
import { WEEKDAYS, WEEKDAY_LABELS, type Weekday } from './engine/types';

type PlanTab = 'normal' | 'ideal';

function App() {
  const {
    nurses, patients, schedule, idealSchedule, parseErrors,
    progress, setNurses, setPatients, setParseErrors, reset,
  } = useScheduleStore();
  const { run } = useScheduler();

  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName]     = useState<string>('');
  const [fileStatus, setFileStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [planTab, setPlanTab]       = useState<PlanTab>('normal');
  const [startDay, setStartDay]     = useState<Weekday>('Po');
  const [weekId, setWeekId]         = useState(() => {
    const now = new Date();
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  });

  const isRunning  = ['geocoding', 'routing', 'scheduling'].includes(progress.stage);
  const canSchedule = nurses.length > 0 && patients.length > 0 &&
    (progress.stage === 'upload' || progress.stage === 'error');

  const handleFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        const result = parseExcel(buffer);

        const allErrors = [...result.patients.errors, ...result.nurses.errors];
        setParseErrors(allErrors);

        if (result.patients.data.length === 0 && result.nurses.data.length === 0) {
          setFileStatus('error');
          return;
        }

        setPatients(result.patients.data);
        setNurses(result.nurses.data as never);
        setFileStatus(allErrors.length > 0 ? 'error' : 'ok');
      } catch (err) {
        setParseErrors([`Nelze přečíst soubor: ${err instanceof Error ? err.message : String(err)}`]);
        setFileStatus('error');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleRun = async () => {
    await run(weekId, startDay);
  };

  const activeSchedule = planTab === 'normal' ? schedule : idealSchedule;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Nurse Planner</h1>
          <p className="text-xs text-gray-500 mt-0.5">Plánování návštěv domácí péče</p>
        </div>
        {schedule && (
          <button
            onClick={() => {
              reset();
              setFileName('');
              setFileStatus('idle');
              setPlanTab('normal');
            }}
            className="text-sm text-red-600 hover:text-red-800 font-medium"
          >
            Nový plán
          </button>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">

        {/* ── Upload obrazovka ── */}
        {!schedule && (
          <div className="max-w-xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-800">Nahrát vstupní soubor</h2>
              <p className="text-gray-500 mt-2 text-sm">
                Nahrajte Excel soubor (vstup.xlsx) se třemi listy: klienti, docházka, pečovatelky.
              </p>
            </div>

            {/* Týden + start den */}
            <div className="mb-6 flex flex-wrap items-center gap-4 justify-center">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">Týden:</label>
                <input
                  type="text"
                  value={weekId}
                  onChange={(e) => setWeekId(e.target.value)}
                  disabled={isRunning}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-mono w-28 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="2026-W15"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">Plánovat od:</label>
                <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
                  {WEEKDAYS.map((day) => (
                    <button
                      key={day}
                      type="button"
                      disabled={isRunning}
                      onClick={() => setStartDay(day)}
                      className={`px-3 py-1.5 transition-colors ${
                        startDay === day
                          ? 'bg-blue-600 text-white font-semibold'
                          : 'bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {WEEKDAY_LABELS[day].slice(0, 2)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Drop zona pro Excel */}
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors bg-white mb-4 ${
                isRunning
                  ? 'border-gray-200 opacity-50 cursor-not-allowed'
                  : fileStatus === 'ok'
                    ? 'border-green-500'
                    : fileStatus === 'error'
                      ? 'border-red-400'
                      : 'border-gray-300 hover:border-blue-400'
              }`}
              onClick={() => { if (!isRunning) inputRef.current?.click(); }}
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={(e) => {
                e.preventDefault();
                if (isRunning) return;
                const file = e.dataTransfer.files[0];
                if (file) handleFile(file);
              }}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                disabled={isRunning}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                  e.target.value = '';
                }}
              />
              <div className={`text-4xl mb-3 ${
                fileStatus === 'ok' ? 'text-green-500' : fileStatus === 'error' ? 'text-red-400' : 'text-gray-300'
              }`}>
                {fileStatus === 'ok' ? '✓' : fileStatus === 'error' ? '✗' : '📊'}
              </div>
              <p className="font-semibold text-gray-700">
                {fileName || 'Přetáhněte vstup.xlsx nebo klikněte pro výběr'}
              </p>
              {fileStatus === 'ok' && (
                <p className="text-sm text-green-600 mt-1">
                  Načteno: {patients.length} klientů, {nurses.length} pečovatelek
                </p>
              )}
            </div>

            {/* Chyby parsování */}
            {parseErrors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-sm">
                <p className="font-semibold text-red-800 mb-2">Chyby ve vstupním souboru:</p>
                <ul className="list-disc list-inside text-red-700 space-y-1">
                  {parseErrors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}

            {/* Error výsledek */}
            {progress.stage === 'error' && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700">
                {progress.message}
              </div>
            )}

            {isRunning ? (
              <div className="mt-4">
                <ProgressBar
                  message={progress.message}
                  current={progress.current}
                  total={progress.total}
                />
              </div>
            ) : (
              <button
                onClick={handleRun}
                disabled={!canSchedule}
                className={`w-full py-3 rounded-xl font-semibold text-white transition-colors ${
                  canSchedule ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-300 cursor-not-allowed'
                }`}
              >
                Sestavit plán
              </button>
            )}
          </div>
        )}

        {/* ── Výsledný plán ── */}
        {schedule && (
          <div>
            {/* Hlavička */}
            <div className="flex items-center justify-between mb-4 no-print">
              <h2 className="text-2xl font-bold text-gray-800">
                Plán — {schedule.weekId}
                {startDay !== 'Po' && (
                  <span className="ml-2 text-base font-normal text-amber-600">
                    od {WEEKDAY_LABELS[startDay]}
                  </span>
                )}
              </h2>
              <div className="flex items-center gap-3">
                <p className="text-sm text-gray-500">Klikněte na den pro detail a mapu</p>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
                  </svg>
                  Tisknout / PDF
                </button>
              </div>
            </div>

            {/* Záložky */}
            <div className="flex gap-1 mb-4 no-print">
              {([['normal', 'Plán s časovými okny'], ['ideal', 'Ideální plán (bez oken)']] as [PlanTab, string][]).map(([tab, label]) => (
                <button
                  key={tab}
                  onClick={() => setPlanTab(tab)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    planTab === tab
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {planTab === 'ideal' && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm text-amber-800 no-print">
                Ideální plán sestavený bez ohledu na časová okna klientů — ukazuje přirozenou optimální trasu.
                Slouží jako podklad pro domlouvání nových klientů a změn časů.
              </div>
            )}

            {activeSchedule && (
              <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-6 no-print">
                <WeeklyGrid schedule={activeSchedule} />
              </div>
            )}

            {/* Report neplánovaných návštěv */}
            {planTab === 'normal' && (
              <>
                <ConflictReport conflicts={schedule.unscheduled} />
                <BackupTimeReport schedule={schedule} />
              </>
            )}

            {planTab === 'ideal' && idealSchedule && (
              <ConflictReport conflicts={idealSchedule.unscheduled} />
            )}

            {/* Tiskový výstup */}
            <PrintView schedule={schedule} />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
