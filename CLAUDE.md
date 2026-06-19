# Nurse Planner — Aplikace pro plánování návštěv domácí zdravotní péče

## Přehled projektu

Webová SPA aplikace (React) pro týdenní plánování návštěv zdravotních sester (pečovatelek) u klientů v domácím léčení. Aplikace načte **jeden vstupní Excel soubor** (`vstup.xlsx` se třemi listy) a sestaví optimalizovaný harmonogram s ohledem na pracovní dobu a překážky sester, časová okna klientů a dobu jízdy autem mezi adresami.

**Plánované období:** pondělí–pátek (jeden pracovní týden).

**Stav:** Fáze 1 (MVP) hotová a nasazená. Aplikace je klient-side only (SPA, žádný backend), nasazená na AWS S3 + CloudFront.

---

## Role a odpovědnosti

| Role | Odpovědnost |
|---|---|
| **Analytik** | Validace vstupních dat, detekce konfliktů a neřešitelných omezení, reporting |
| **Architekt** | Návrh algoritmu plánování, integrace mapového API, datový model |
| **Programátor** | Implementace logiky plánování, parsování Excelu, API volání |
| **Frontend Designer** | SPA rozhraní, upload souboru, vizualizace plánu, responzivní design |

---

## Vstupní formát — `vstup.xlsx`

Aplikace načítá **jeden Excel soubor se třemi listy**: `klienti`, `docházka`, `pečovatelky`. Šablona je v `input/vstup_template.xlsx`. (Historicky existovaly textové formáty `sestry.txt` / `pacienti.txt` — viz `examples/` a `nursesParser.ts` / `patientsParser.ts`; produkční cesta je Excel.)

### List `klienti`

Řádky 0 a 1 jsou hlavičky, data začínají od řádku 2 (index 2). Sloupce:

| Sloupec (0-based) | Význam |
|---|---|
| 0 | **plán** — zatržítko (TRUE/1). Nezatržení klienti se ignorují. |
| 1 | **jméno** klienta (slouží i jako ID — stejné jméno na více řádcích = jeden klient) |
| 2 | **adresa** (ulice, číslo, město, PSČ — pro geocoding) |
| 4 + d×4 | **zatržítko dne** d (d = 0..4 → Po..Pa) |
| 5 + d×4 | **čas** = ideální okno příjezdu (viz formáty níže) |
| 6 + d×4 | **náhradní čas** = záložní okno příjezdu |
| 7 + d×4 | **délka** úkonu v minutách |

**Formáty časové buňky:**
- Číslo (zlomek dne ze SheetJS) → jeden čas „od" → `windowStart`, `windowEnd = ANY`.
- `"HH:MM-HH:MM"` (tečka i mezery povoleny) → rozsah příjezdu.
- `"HH:MM"` → jeden čas „od", `windowEnd = ANY`.
- Prázdné → `ANY`.

**Pravidla:**
- Ideální čas i náhradní čas omezují **čas příjezdu**, ne celé trvání návštěvy. Návštěva může skončit až po horní mezi okna.
- Stejné jméno klienta na více řádcích vytvoří jednoho klienta s více požadavky (např. 2× denně).
- Každý zatržený den generuje jeden požadavek na návštěvu.

### List `docházka`

Řádek 0 = sekce, řádek 1 = sub-hlavičky, data od řádku 2. Sloupce:

| Sloupec (0-based) | Význam |
|---|---|
| 0 | **jméno** sestry |
| 1 + d | **přítomnost** v den d (Po..Pa) — zatržítko |
| 6 + d×2 | **začátek přestávky** (překážky) v den d |
| 7 + d×2 | **konec přestávky** (překážky) v den d |

**Pravidla:**
- Přítomnost = sestra v daný den pracuje. Pracovní doba je pevná **07:00–15:30** (hardcoded v parseru, `SHIFT_START`/`SHIFT_END`).
- **Přestávky z Excelu = PŘEKÁŽKY v práci** (dovolená, návštěva lékaře apod.), ne periodické pauzy. Blokují daný časový slot — sestra v jejich průběhu není k dispozici. **Nenahrazují** povinnou 30min přestávku na odpočinek (tu vkládá scheduler navíc, viz Plánování).

### List `pečovatelky`

Řádek 0 = hlavička, data od řádku 1. Sloupce: 0 = **jméno** sestry, 1 = **adresa domova**. Adresa domova se geocoduje a slouží jako **výchozí bod první cesty dne** (sestra vyráží ke klientovi ze svého bydliště).

> **Poznámka:** Preference sestry u klienta (`preferredNurse`) byla z modelu **odstraněna** — algoritmus přiřazuje sestry podle zátěže a geografie, ne podle jmenné preference.

---

## Funkční požadavky

### Plánování (core algoritmus, `engine/scheduler/scheduler.ts`)

Plánuje se **po jednotlivých dnech**. Aplikace generuje **dva plány**:
- **reálný plán** (`constrainedMode = true`) — respektuje časová okna,
- **ideální plán** (`constrainedMode = false`) — bez časových oken, těsné teoretické optimum (druhý tab v UI).

**Pořadí obsazování (reálný plán) v rámci dne:**

1. **Nejdelší úkony první.** Z návštěv dne se vezme **horních 20 %** podle délky úkonu (`Math.ceil(počet × 0,2)`) a rozdělí se **rovnoměrně mezi sestry podle součtu minut** (nejméně vytížená sestra bere další — `scheduleBalanced`).
2. **Klienti s pevným časem** (mají vyplněné okno příjezdu, nejsou mezi dlouhými úkony) — přiřazení **geograficky** (nejbližší soused, `scheduleNearestNeighbor`), bez vyvažování.
3. **Zbytek** (kratší úkony / bez pevného času) — geograficky.
4. **Fallback** na nenaplánované: náhradní okna → bez časových oken.

**Klíčové principy:**
- **Start z domova:** první cesta dne vede z adresy sestry (list `pečovatelky`). Matice je rozšířená: indexy `0..N-1` = klienti, `N..N+M-1` = domovy sester.
- **Minimalizace velkých pauz:** výběr další návštěvy minimalizuje **náklad = doba jízdy + doba čekání (idle)**. Sestra raději jede dál, než aby měla velkou pauzu; idle člen zároveň přirozeně řadí pevné časy.
- **Cestovní buffer:** +10 min ke každé jízdě.
- **Povinná 30min přestávka na odpočinek každý den** — vkládá se v re-timingu (po přiřazení), start **nejpozději ve 13:00**, jako stacionární blok (pokud to lze, neplánuje se do jízdy mezi klienty).
- **Komfortní pauzy 5–20 min** mezi návštěvami při nižším vytížení dne — volný čas se rozprostře rovnoměrně (krok 5 min), oříznuto na 5–20 min.
- **Zaokrouhlení příjezdů na celé desítky minut** (na nejbližší — 10:11 → 10:10, 12:36 → 12:40), bezpečně v rámci okna/směny/přestávek.
- **Respektování přestávek (překážek)** z Excelu přes `findAvailableSlot` / `isDuringBreak`.

### Re-timing (`applyRestAndPauses` / `reTimeNurseDay`)

Po přiřazení návštěv (jen reálný plán) se pro každou sestru a den přepočítají časy: vloží se 30min přestávka, rozprostřou komfortní pauzy a zaokrouhlí příjezdy na desítky — vše s respektem k oknům (`_windowStartMin` / `_latestArrivalMin` na `ScheduledVisit`) a přestávkám. **Pořadí ani přiřazení návštěv se nemění**, jen časy. Ideální plán re-timingem neprochází, jen se zaokrouhlí (`roundArrivalsTo10`).

### Detekce konfliktů

Neplánovaná návštěva (žádná sestra nemá použitelný slot ani po uvolnění oken) je označena a reportována s důvodem.

### Výstup / vizualizace

- **Týdenní pohled** — grid sestry × dny, návštěvy jako barevné bloky s časem a jménem klienta.
- **Denní detail** — itinerář každé sestry: čas příjezdu/odjezdu, adresa, doba jízdy, **přestávka na odpočinek (☕ 30 min)**; mapa tras (Leaflet, každá sestra jinou barvou).
- **Report náhradních časů** (`BackupTimeReport`) — klienti naplánovaní mimo ideální čas (`usedBackupTime`).
- **Report konfliktů** (`ConflictReport`) — neplánované návštěvy + varování.
- **Tisk / PDF** — layout pro A4 na šířku.

---

## Integrace mapového API

Aplikace potřebuje **geocoding** (adresa → souřadnice) a **distance matrix** (doba jízdy mezi N body).

| Vrstva | Použito |
|---|---|
| Geocoding | **Nominatim** (OpenStreetMap), `countrycodes=cz`, rate limit ~1,1 s/dotaz |
| Distance Matrix | **OpenRouteService** v2 `/matrix/driving-car` |

> **Pozn.:** Pro geocoding se používá Nominatim místo ORS Pelias, protože Pelias vracel v ČR chybné výsledky u místních jmen (např. Olešná u Blansko → Olešná u Rakovníka).

Aplikace má **provider abstrakci** (`IRoutingProvider`) — výměna poskytovatele bez změny business logiky. API klíč v `.env`:
```
VITE_MAP_PROVIDER=openrouteservice
VITE_ORS_API_KEY=your_key_here
```

**Výchozí volba: OpenRouteService** — GDPR kompatibilní, bez platební karty, vhodný pro zdravotnictví.

---

## Technický stack

| Vrstva | Technologie |
|---|---|
| Frontend framework | React 18 + TypeScript |
| Build tool | Vite |
| Styling | Tailwind CSS |
| State management | Zustand |
| Parsování vstupu | SheetJS (`xlsx`) — Excel se 3 listy |
| Plánovač | Vlastní greedy/nearest-neighbor algoritmus + re-timing (přestávky, pauzy, zaokrouhlení) |
| Mapový klient | Abstraktní provider (ORS) + Nominatim geocoding |
| Mapa | **Leaflet (plain)** — `L.map()` v useRef+useEffect, **ne react-leaflet** (vyžaduje React 19) |
| Testování | Vitest + React Testing Library |

---

## Architektura aplikace

```
frontend/src/
├── components/
│   ├── FileUpload/FileUpload.tsx     # Upload vstup.xlsx
│   ├── WeeklyGrid/
│   │   ├── WeeklyGrid.tsx            # Týdenní přehled
│   │   └── DayDetail.tsx             # Denní itinerář + přestávky
│   ├── RouteMap/RouteMap.tsx         # Plain Leaflet mapa tras
│   ├── BackupTimeReport.tsx          # Klienti v náhradním čase
│   ├── ConflictReport/ConflictReport.tsx
│   ├── PrintView.tsx                 # Tiskový layout (A4 landscape)
│   └── ProgressBar.tsx
├── engine/
│   ├── parser/
│   │   ├── excelParser.ts            # Excel parser (3 listy) — produkční
│   │   ├── nursesParser.ts           # starší txt parser (zachován)
│   │   └── patientsParser.ts         # starší txt parser (zachován)
│   ├── routing/
│   │   ├── IRoutingProvider.ts       # Interface mapového API
│   │   ├── OrsProvider.ts            # Nominatim geocoding + ORS matice
│   │   └── routingFactory.ts
│   ├── scheduler/
│   │   └── scheduler.ts              # Kategorizovaný plánovač + re-timing
│   └── types.ts                      # Sdílené typy
├── hooks/
│   └── useScheduler.ts               # Orchestrace: geocoding → matice → 2 plány
├── store/
│   └── scheduleStore.ts              # Globální stav (schedule + idealSchedule)
└── utils/
    └── timeUtils.ts                  # toMinutes, fromMinutes, findAvailableSlot, isDuringBreak…
```

---

## Datový model (TypeScript typy — `engine/types.ts`)

```typescript
type Weekday = 'Po' | 'Ut' | 'St' | 'Ct' | 'Pa';

interface TimeInterval { start: string; end: string; } // "HH:MM"

interface DayAvailability {
  day: Weekday;
  start: string;            // "07:00"
  end: string;              // "15:30"
  breaks: TimeInterval[];   // překážky z Excelu (dovolená, lékař…)
}

interface Nurse {
  name: string;
  availability: DayAvailability[];
  homeCoordinates?: LatLng; // adresa z listu pečovatelky (start trasy)
}

interface VisitRequirement {
  patientId: string;
  day: Weekday;
  windowStart: string | 'ANY';   // ideální okno příjezdu – od
  windowEnd: string | 'ANY';     // ideální okno příjezdu – do
  backupWindowStart?: string;    // náhradní okno – od
  backupWindowEnd?: string;      // náhradní okno – do
  durationMin: number;
}

interface Patient {
  id: string;                    // = normalizované jméno
  name: string;
  address: string;
  coordinates?: LatLng;          // doplněno po geocodingu
  visits: VisitRequirement[];
}

interface ScheduledVisit {
  patient: Patient;
  nurse: Nurse;
  day: Weekday;
  arrivalTime: string;           // zaokrouhleno na 10 min
  departureTime: string;
  travelFromPrevMin: number;     // minuty jízdy od předchozí zastávky (vč. bufferu)
  usedBackupTime: boolean;       // naplánováno v náhradním/žádném čase
  warnings: string[];
  restBefore?: TimeInterval;     // 30min přestávka PŘED touto návštěvou
  restAfter?: TimeInterval;      // 30min přestávka PO této (poslední) návštěvě
  _windowStartMin?: number;      // interní meze příjezdu pro re-timing
  _latestArrivalMin?: number;
}

interface WeekSchedule {
  weekId: string;                // "2026-W15"
  days: Record<Weekday, DaySchedule>;
  unscheduled: ConflictEntry[];
}
```

---

## UI/UX požadavky

- **Jednoduchý onboarding:** úvodní obrazovka s návodem a uploadem `vstup.xlsx`.
- **Okamžitá validace:** po nahrání zobrazit počet načtených klientů/sester a chyby formátu před spuštěním plánování.
- **Progress indikátor:** geocoding a distance matrix mohou trvat — zobrazit průběh.
- **Responzivní design:** primárně desktop, použitelný na tabletu.
- **Barevné kódování sester:** konzistentní napříč celým týdenním pohledem.
- **Tisk/export:** čistý PDF layout pro tisk na A4 na šířku.

---

## Implementační fáze

### Fáze 1 — MVP ✅ (hotovo)
- [x] Scaffold React/Vite/TS, Tailwind, Zustand
- [x] Excel parser (3 listy) + validace
- [x] Kategorizovaný scheduler (dlouhé úkony → pevný čas → zbytek)
- [x] ORS distance matrix + Nominatim geocoding, start z domova sestry
- [x] Re-timing: 30min přestávka, komfortní pauzy 5–20 min, zaokrouhlení na 10 min
- [x] Týdenní grid + denní itinerář + mapa tras (Leaflet)
- [x] Report konfliktů a náhradních časů, tisk/PDF
- [x] Testy (Vitest) + nasazení na S3/CloudFront

### Fáze 2 — Optimalizace & UX
- [ ] 2-opt TSP optimalizace pořadí návštěv v rámci dne
- [ ] Drag & drop přeuspořádání bloků (manuální úpravy)
- [ ] CSV export

### Fáze 3 — Export & Polish
- [ ] Podpora více mapových providerů (HERE, Google)
- [ ] Dark mode, a11y audit

---

## Vzorová a reálná data

- `input/vstup.xlsx` — reálná data (oblast Blansko, ~8 sester, ~25 aktivních klientů).
- `input/vstup_template.xlsx` — prázdná šablona.
- `examples/sestry_demo.txt`, `examples/pacienti_demo.txt` — starší txt ukázky.

---

## Poznámky a omezení

- Aplikace je **klient-side only** (SPA) — žádný backend. Mapová API se volají přímo z prohlížeče, klíče jsou ve frontend env proměnných (akceptovatelné pro interní nástroj). Pro produkci zvážit proxy pro skrytí klíčů.
- Algoritmus řeší VRPTW (Vehicle Routing Problem with Time Windows) greedy heuristikou; pro malé instance (do ~20 sester/klientů) postačuje.
- Re-timing 30min přestávky je **best-effort** u extrémně nabitého dne (slack < 0) — návštěvy se neodstraňují, plán může mírně přetáhnout; reálná data mají dostatek rezervy.
- **GDPR:** adresy klientů jsou osobní údaje — aplikace neukládá nic na server, vše zůstává v paměti prohlížeče.
```
