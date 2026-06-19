# Nurse Planner — Uživatelská příručka

## Obsah

1. [Co aplikace dělá](#1-co-aplikace-dělá)
2. [Jak začít](#2-jak-začít)
3. [Vstupní soubor `vstup.xlsx`](#3-vstupní-soubor-vstupxlsx)
   - [List `klienti`](#list-klienti)
   - [List `docházka`](#list-docházka)
   - [List `pečovatelky`](#list-pečovatelky)
4. [Jak se sestavuje plán](#4-jak-se-sestavuje-plán)
5. [Přestávky a pauzy](#5-přestávky-a-pauzy)
6. [Plánování od zvoleného dne](#6-plánování-od-zvoleného-dne)
7. [Výsledný plán](#7-výsledný-plán)
8. [Neplánované návštěvy a varování](#8-neplánované-návštěvy-a-varování)
9. [Tisk a export do PDF](#9-tisk-a-export-do-pdf)
10. [Časté chyby a jejich řešení](#10-časté-chyby-a-jejich-řešení)

---

## 1. Co aplikace dělá

Nurse Planner sestavuje týdenní harmonogram návštěv zdravotních sester (pečovatelek) u klientů v domácím léčení. Na základě **jednoho vstupního Excel souboru** vygeneruje plán, který:

- respektuje pracovní dobu a překážky (dovolená, lékař…) každé sestry,
- respektuje časové okno, ve kterém má sestra ke klientovi dorazit,
- zohledňuje dobu jízdy autem mezi adresami (každá sestra vyráží ze svého bydliště),
- nejdříve obsadí nejdelší úkony a rozdělí je rovnoměrně mezi sestry,
- každé sestře naplánuje 30minutovou přestávku na odpočinek,
- hlásí všechny návštěvy, které se nepodařilo naplánovat, i s důvodem.

Aplikace vytvoří **dva plány**: **reálný** (respektuje časová okna) a **ideální** (bez oken — ukazuje teoretické optimum tras).

---

## 2. Jak začít

1. Otevřete aplikaci v prohlížeči.
2. Nahrajte **vstupní Excel soubor** `vstup.xlsx` (drag & drop nebo kliknutím).
3. Zkontrolujte, že soubor byl načten bez chyb (počet načtených klientů a sester, případná varování).
4. Volitelně upravte **číslo týdne** a **den, od kterého plánovat**.
5. Klikněte na **Sestavit plán**.

Geocodování adres a výpočet cestovní matice může trvat desítky sekund — průběh je zobrazován v progress baru.

> Prázdnou šablonu najdete v `input/vstup_template.xlsx`.

---

## 3. Vstupní soubor `vstup.xlsx`

Soubor musí obsahovat **tři listy**: `klienti`, `docházka` a `pečovatelky`. Pracovní doba sester je pevně **07:00–15:30**.

### List `klienti`

První dva řádky jsou hlavičky, data začínají od třetího řádku. Pro každého klienta:

| Sloupec | Význam |
|---|---|
| **plán** | Zatržítko — zatrhněte klienty, kteří se mají plánovat. Nezatržení se přeskočí. |
| **jméno** | Celé jméno klienta. *Stejné jméno na více řádcích = jeden klient* (např. návštěva 2× denně). |
| **adresa** | Ulice, číslo, město, PSČ — pro geocodování (čím přesnější, tím lépe). |

Dále pro **každý pracovní den** (Po–Pá) skupina sloupců:

| Sloupec dne | Význam |
|---|---|
| **(den)** | Zatržítko — má se v tento den klient navštívit? |
| **čas** | Ideální okno příjezdu sestry. |
| **náhradní čas** | Záložní okno, použije se, když ideální nelze splnit. |
| **délka** | Délka úkonu v minutách. |

**Formáty časové buňky:**
- `7:30` nebo `07:30` → „přijďte od tohoto času" (horní mez není omezena).
- `7:30-9:00` (povolena i tečka `8.00` a mezery `14:00 - 14:30`) → okno příjezdu od–do.
- prázdné → kdykoli ve směně.

> **Důležité:** Čas (ideální i náhradní) omezuje **čas příjezdu**, ne celou dobu návštěvy. Pokud sestra dorazí na horní mezi okna, může u klienta zůstat ještě celou délku úkonu — i po této mezi.

### List `docházka`

Eviduje přítomnost sester a **překážky v práci**.

| Sloupec | Význam |
|---|---|
| **jméno** | Jméno sestry. |
| **(den)** | Zatržítko přítomnosti pro každý den Po–Pá. |
| **začátek/konec přestávky** | Časový úsek, kdy sestra v daný den **nemůže pracovat** (dovolená, návštěva lékaře apod.). |

> **Přestávka v listu docházka = překážka**, ne polední pauza. Blokuje daný čas — sestra v něm nedostane žádnou návštěvu. **Povinnou 30minutovou přestávku na odpočinek aplikace přidává automaticky navíc** (viz [kapitola 5](#5-přestávky-a-pauzy)). Pokud sestra žádnou překážku nemá, nechte buňky prázdné.

### List `pečovatelky`

| Sloupec | Význam |
|---|---|
| **jméno** | Jméno sestry (musí odpovídat jménu v listu docházka). |
| **adresa** | Adresa bydliště sestry. |

Adresa bydliště se geocoduje a slouží jako **výchozí bod první cesty dne** — sestra vyjíždí k prvnímu klientovi ze svého domova.

> **Poznámka:** Preference konkrétní sestry u klienta se **nezadává** — aplikace přiřazuje sestry automaticky podle vytížení a vzdálenosti.

---

## 4. Jak se sestavuje plán

Plánuje se po jednotlivých dnech. V rámci každého dne aplikace obsazuje klienty v tomto pořadí:

1. **Nejdelší úkony první.** Vezme se horních **20 % návštěv dne** podle délky úkonu a rozdělí se **rovnoměrně mezi sestry** (podle součtu minut, aby měly vyváženou zátěž).
2. **Klienti objednaní na pevný čas** — přiřadí se podle **adresy** (nejbližší dostupná sestra), bez ohledu na vyvažování.
3. **Ostatní klienti** (kratší úkony nebo bez pevného času) — opět podle vzdálenosti.

Pokud se klient nevejde do ideálního okna, aplikace zkusí jeho **náhradní čas** a teprve potom plánování bez časového omezení. Když ani to nejde, klient se objeví v reportu neplánovaných.

**Optimalizace tras a pauz:** aplikace volí pořadí návštěv tak, aby sestra **raději popojela k dalšímu klientovi, než aby dlouho čekala**. K době jízdy se připočítává organizační rezerva (+10 min). Čas příjezdu se **zaokrouhluje na celé desítky minut** (např. 10:11 → 10:10, 12:36 → 12:40).

---

## 5. Přestávky a pauzy

Aplikace pracuje se dvěma druhy „přestávek":

| Druh | Odkud | Význam |
|---|---|---|
| **Překážka v práci** | List `docházka` (začátek/konec přestávky) | Dovolená, lékař apod. Blokuje konkrétní čas — sestra v něm nepracuje. |
| **Přestávka na odpočinek** | Přidává aplikace automaticky | **30 minut každý pracovní den**, začátek **nejpozději ve 13:00**. V itineráři ji poznáte podle ☕. |

Přestávka na odpočinek se vkládá jako klidový blok (sestra v něm nikam nejede). Pokud má sestra v daný den **méně klientů** než kapacitu směny, aplikace navíc rozprostře volný čas jako **krátké pauzy 5–20 minut mezi návštěvami** — sestra tak nemá jednu velkou proluku, ale plynulejší den.

---

## 6. Plánování od zvoleného dne

Pokud sestra onemocní nebo nastane jiná situace, lze plán sestavit pouze pro zbytek týdne.

Na hlavní obrazovce v sekci **Plánovat od:** klikněte na požadovaný den:

```
Plánovat od:  [ Po ][ Út ][ St ][ Čt ][ Pá ]
```

- Výchozí hodnota je **Pondělí**.
- Při výběru např. **Středa** se plán sestaví pouze pro St, Čt, Pá.
- Klienti s návštěvou pouze v Po nebo Út se pro tento týden neuváží — neobjeví se ani v reportu neplánovaných.

---

## 7. Výsledný plán

Po dokončení se zobrazí **týdenní přehled** — mřížka (sestry × dny) s barevnými bloky návštěv. Lze přepínat mezi **reálným** a **ideálním** plánem.

Kliknutím na konkrétní den se otevře **denní detail** s:
- seřazeným itinerářem každé sestry (čas příjezdu/odjezdu, adresa),
- dobou jízdy od předchozí zastávky,
- vyznačenou **přestávkou na odpočinek** (☕ 30 min),
- mapou tras (každá sestra jinou barvou).

Pod přehledem najdete **report náhradních časů** — seznam klientů, kterým byl přidělen jiný než ideální čas (je vhodné je informovat).

---

## 8. Neplánované návštěvy a varování

### Neplánované návštěvy

Návštěva nebyla zařazena do plánu. Typické důvody:

| Důvod | Co s tím |
|---|---|
| Žádná sestra nemá dostupný slot odpovídající časovému oknu klienta | Rozšiřte ideální/náhradní okno, nebo zkontrolujte přítomnost sester |
| Nedostatek kapacity (i po uvolnění všech časových omezení) | Přidejte sestru, zkraťte délku úkonů, nebo rozložte návštěvy do více dnů |
| Návštěva se nevejde do směny (příliš dlouhý úkon) | Zkontrolujte délku úkonu vs. pracovní dobu 07:00–15:30 |

### Varování u naplánovaných návštěv (symbol ⚠)

| Varování | Vysvětlení |
|---|---|
| Naplánováno v náhradním čase — informujte klienta | Ideální čas nebyl dostupný, použito náhradní okno |
| Naplánováno bez časového omezení — původní čas nebyl dostupný | Nešlo splnit ideální ani náhradní okno |
| Adresa nebyla geocodována — cestovní čas nezohledněn | Adresu se nepodařilo převést na souřadnice; plán u tohoto klienta nerespektuje dobu jízdy |

---

## 9. Tisk a export do PDF

Tlačítko **Tisknout / PDF** (nad plánem) otevře systémový dialog tisku. Pro uložení jako PDF zvolte tiskárnu **Uložit jako PDF** (nebo ekvivalent v prohlížeči).

Tiskový výstup je optimalizován pro **A4 na šířku**: tabulka sester × dny s barevnými bloky, legenda barev a seznam neplánovaných návštěv (pokud existují).

---

## 10. Časté chyby a jejich řešení

### Chyby při načítání souboru

| Problém | Řešení |
|---|---|
| `Soubor neobsahuje listy: …` | Soubor musí mít listy `klienti`, `docházka`, `pečovatelky` (přesné názvy) |
| `Žádný klient se zatrhnutým plánováním nebyl nalezen` | Zatrhněte sloupec **plán** u klientů, kteří se mají plánovat |
| `… chybí nebo neplatná délka úkonu` | U zatrženého dne doplňte kladné číslo do sloupce **délka** |
| `Žádná pečovatelka nemá vyplněnou přítomnost` | V listu `docházka` zatrhněte přítomnost alespoň u jedné sestry |

### Problémy s geocodováním

- **Adresa nenalezena:** Zkuste přesnější formát — přidejte PSČ nebo název obce.
- **Špatná poloha na mapě:** Nominatim (OpenStreetMap) může mít v některých lokalitách méně přesná data; plán se sestaví, ale cestovní časy budou nepřesné.
- **Geocodování trvá dlouho:** Nominatim povoluje cca 1 dotaz za sekundu — jde o záměrné omezení.

### Plán je sestaven, ale nevypadá správně

- **Sestra nemá žádnou návštěvu:** Buď nemá v daný den zatrženou přítomnost, nebo je daleko od všech klientů (geograficky je bere bližší sestra).
- **Velká proluka v itineráři:** U vytížených dnů je to nutné kvůli pevným časům klientů; u méně vytížených aplikace rozprostírá krátké pauzy 5–20 min.
- **Klient chybí v plánu i v reportu:** Zkontrolujte, zda den návštěvy leží v aktuálně nastavené části týdne (viz [Plánování od zvoleného dne](#6-plánování-od-zvoleného-dne)).
```
