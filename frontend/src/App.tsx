import { useState } from 'react';
import { FileUpload } from './components/FileUpload/FileUpload';
import { WeeklyGrid } from './components/WeeklyGrid/WeeklyGrid';
import { ConflictReport } from './components/ConflictReport/ConflictReport';
import { ProgressBar } from './components/ProgressBar';
import { PrintView } from './components/PrintView';
import { parseNurses } from './engine/parser/nursesParser';
import { parsePatients } from './engine/parser/patientsParser';
import { useScheduleStore } from './store/scheduleStore';
import { useScheduler } from './hooks/useScheduler';
import { WEEKDAYS, WEEKDAY_LABELS, type Weekday } from './engine/types';

function App() {
  const {
    nurses, patients, schedule, parseErrors,
    progress, setNurses, setPatients, setParseErrors, reset,
  } = useScheduleStore();
  const { run } = useScheduler();

  const [nursesStatus, setNursesStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [nursesMsg, setNursesMsg] = useState('');
  const [patientsStatus, setPatientsStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [patientsMsg, setPatientsMsg] = useState('');
  const [startDay, setStartDay] = useState<Weekday>('Po');
  const [weekId, setWeekId] = useState(() => {
    // BUG #12 fix: správný výpočet ISO 8601 čísla týdne (pivot = čtvrtek)
    const now = new Date();
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  });

  const handleNursesFile = (text: string) => {
    const result = parseNurses(text);
    setNurses(result.data);
    if (result.errors.length > 0) {
      setNursesStatus('error');
      setNursesMsg(`${result.errors.length} chyb: ${result.errors[0]}`);
      setParseErrors(result.errors);
    } else {
      setNursesStatus('ok');
      setNursesMsg(`Načteno ${result.data.length} sester`);
    }
  };

  const handlePatientsFile = (text: string) => {
    const result = parsePatients(text);
    setPatients(result.data);
    if (result.errors.length > 0) {
      setPatientsStatus('error');
      setPatientsMsg(`${result.errors.length} chyb: ${result.errors[0]}`);
      setParseErrors(result.errors);
    } else {
      setPatientsStatus('ok');
      setPatientsMsg(`Načteno ${result.data.length} pacientů`);
    }
  };

  // BUG #11 fix: 'error' stage musí také umožnit opakované spuštění
  const canSchedule = nurses.length > 0 && patients.length > 0 &&
    (progress.stage === 'upload' || progress.stage === 'error');
  const isRunning = ['geocoding', 'routing', 'scheduling'].includes(progress.stage);

  const handleRun = async () => {
    await run(weekId, startDay);
  };

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
              setNursesStatus('idle');
              setPatientsStatus('idle');
              setNursesMsg('');
              setPatientsMsg('');
            }}
            className="text-sm text-red-600 hover:text-red-800 font-medium"
          >
            Nový plán
          </button>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {!schedule && (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-800">Nahrát vstupní soubory</h2>
              <p className="text-gray-500 mt-2 text-sm">
                Nahrajte soubory sestry.txt a pacienti.txt podle formátu v dokumentaci.
              </p>
            </div>

            <div className="mb-6 flex flex-wrap items-center gap-4 justify-center">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">Týden:</label>
                <input
                  type="text"
                  value={weekId}
                  onChange={(e) => setWeekId(e.target.value)}
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <FileUpload
                label="Soubor sester"
                description="sestry.txt — pracovní doby a přestávky"
                onFileLoaded={handleNursesFile}
                status={nursesStatus}
                statusMessage={nursesMsg}
                disabled={isRunning}
              />
              <FileUpload
                label="Soubor pacientů"
                description="pacienti.txt — adresy, sloty, preference"
                onFileLoaded={handlePatientsFile}
                status={patientsStatus}
                statusMessage={patientsMsg}
                disabled={isRunning}
              />
            </div>

            {parseErrors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-sm">
                <p className="font-semibold text-red-800 mb-2">Chyby ve vstupních souborech:</p>
                <ul className="list-disc list-inside text-red-700 space-y-1">
                  {parseErrors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}

            {progress.stage === 'error' && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700">
                {progress.message}
              </div>
            )}

            {isRunning ? (
              <div className="mt-6">
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

        {schedule && (
          <div>
            <div className="flex items-center justify-between mb-6 no-print">
              <h2 className="text-2xl font-bold text-gray-800">
                Plán — {schedule.weekId}
                {startDay !== 'Po' && (
                  <span className="ml-2 text-base font-normal text-amber-600">
                    od {WEEKDAY_LABELS[startDay]}
                  </span>
                )}
              </h2>
              <div className="flex items-center gap-3">
                <p className="text-sm text-gray-500">Klikněte na den pro detailní itinerář</p>
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

            <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-6 no-print">
              <WeeklyGrid schedule={schedule} />
            </div>

            <ConflictReport conflicts={schedule.unscheduled} />

            {/* Tiskový výstup — skrytý v obrazovkovém zobrazení, viditelný jen při tisku */}
            <PrintView schedule={schedule} />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
