# Nurse Planner — Uživatelská příručka

## Obsah

1. [Co aplikace dělá](#1-co-aplikace-dělá)
2. [Jak začít](#2-jak-začít)
3. [Soubor sester — `sestry.txt`](#3-soubor-sester--sestrytxt)
4. [Soubor pacientů — `pacienti.txt`](#4-soubor-pacientů--pacientitxt)
5. [Plánování od zvoleného dne](#5-plánování-od-zvoleného-dne)
6. [Výsledný plán](#6-výsledný-plán)
7. [Neplánované návštěvy a varování](#7-neplánované-návštěvy-a-varování)
8. [Tisk a export do PDF](#8-tisk-a-export-do-pdf)
9. [Časté chyby a jejich řešení](#9-časté-chyby-a-jejich-řešení)

---

## 1. Co aplikace dělá

Nurse Planner sestavuje týdenní harmonogram návštěv zdravotních sester u pacientů v domácím léčení. Na základě dvou textových souborů (dostupnost sester + požadavky pacientů) vygeneruje plán, který:

- respektuje pracovní dobu a přestávky každé sestry,
- respektuje časové okno, ve kterém sestra může k pacientovi dorazit,
- zohledňuje dobu jízdy autem mezi jednotlivými adresami,
- rovnoměrně rozkládá zátěž mezi sestry,
- hlásí všechny návštěvy, které se nepodařilo naplánovat, i s důvodem.

---

## 2. Jak začít

1. Otevřete aplikaci v prohlížeči.
2. Nahrujte **soubor sester** (drag & drop nebo kliknutím na levý panel).
3. Nahrujte **soubor pacientů** (pravý panel).
4. Zkontrolujte, že oba soubory byly načteny bez chyb (zelené potvrzení).
5. Volitelně upravte **číslo týdne** a **den, od kterého plánovat**.
6. Klikněte na **Sestavit plán**.

Geocodování adres a výpočet cestovní matice může trvat desítky sekund — průběh je zobrazován v progress baru.

---

## 3. Soubor sester — `sestry.txt`

### Formát řádku

```
JMENO | DEN | ZACATEK | KONEC | PRESTAVKY
```

| Sloupec | Popis |
|---|---|
| `JMENO` | Celé jméno sestry (musí být konzistentní s preferencemi v souboru pacientů) |
| `DEN` | Den v týdnu: `Po`, `Ut`, `St`, `Ct`, `Pa` — nebo `ALL` pro všechny pracovní dny najednou |
| `ZACATEK` | Začátek směny ve formátu `HH:MM` (24h) — nebo `VOLNO` |
| `KONEC` | Konec směny ve formátu `HH:MM` |
| `PRESTAVKY` | Přestávky ve formátu `HH:MM-HH:MM`, více přestávek odděleno čárkou; může být prázdné |

Řádky začínající `#` jsou komentáře a ignorují se. Prázdné řádky jsou také ignorovány.

### Klíčová slova

| Klíčové slovo | Kde se použije | Význam |
|---|---|---|
| `ALL` | Sloupec DEN | Nastaví stejný rozvrh pro všechny pracovní dny (Po–Pa) |
| `VOLNO` | Sloupec ZACATEK | Sestra v daný den nepracuje |

> **Priorita:** Pokud sestra má řádek `ALL` i řádek pro konkrétní den, **konkrétní den vždy přepíše ALL** — nezávisle na pořadí řádků v souboru.

### Příklady

**Různé směny každý den:**
```
Jana Nováková | Po | 07:00 | 15:30 | 12:00-12:30
Jana Nováková | Ut | 07:00 | 15:30 | 12:00-12:30
Jana Nováková | St | 07:00 | 15:30 | 12:00-12:30
Jana Nováková | Ct | 07:00 | 15:30 | 12:00-12:30
Jana Nováková | Pa | 07:00 | 13:00 |
```

**Stejná směna celý týden (`ALL`), s více přestávkami:**
```
Marie Svobodová | ALL | 08:00 | 16:30 | 10:00-10:15,13:00-13:30
```

**`ALL` jako základ, jeden den přepsán (`VOLNO`) nebo zkrácen:**
```
Petra Horáková | ALL  | 06:00 | 14:30 | 09:30-09:45,12:00-12:30
Petra Horáková | St   | VOLNO
Petra Horáková | Pa   | 06:00 | 12:00 |
```
> Ve středu Petra nepracuje. V pátek má zkrácenou směnu bez přestávky. Ostatní dny platí `ALL`.

### Pravidla

- Sestra musí ve směně stihnout cestu k pacientovi i samotnou návštěvu. Pokud čas nestačí, návštěva se neplánuje a objeví se v reportu.
- Přestávky jsou blokovány — sestra v jejich průběhu není dispozici. Pokud by návštěva zasahovala do přestávky, algoritmus ji posune na čas po přestávce (pokud to stihne do konce okna pacienta).

---

## 4. Soubor pacientů — `pacienti.txt`

### Formát řádku

```
ID | JMENO | ADRESA | DNY | CAS_OD | CAS_DO | TRVANI_MIN | PREFERENCE_SESTRA
```

| Sloupec | Popis |
|---|---|
| `ID` | Unikátní identifikátor pacienta (alfanumerický, bez mezer, např. `P001`) |
| `JMENO` | Celé jméno pacienta |
| `ADRESA` | Adresa pro geocodování — ulice, číslo, město, PSC (co přesnější, tím lepší) |
| `DNY` | Dny, ve kterých se návštěva opakuje: `Po,Ut,St` nebo `ALL` pro každý pracovní den |
| `CAS_OD` | Nejdřívější čas **příjezdu** sestry (`HH:MM`) — nebo `ANY` |
| `CAS_DO` | Nejpozdější čas **příjezdu** sestry (`HH:MM`) — nebo `ANY` |
| `TRVANI_MIN` | Délka návštěvy v minutách (kladné celé číslo) |
| `PREFERENCE_SESTRA` | Preferované jméno sestry — nebo `ANY` |

> **Důležité:** `CAS_OD` a `CAS_DO` omezují **čas příjezdu**, ne celou dobu návštěvy. Pokud sestra dorazí v `CAS_DO`, může u pacienta zůstat ještě `TRVANI_MIN` minut — i po `CAS_DO`.

### Klíčová slova

| Klíčové slovo | Kde se použije | Význam |
|---|---|---|
| `ALL` | Sloupec DNY | Návštěva každý pracovní den (Po–Pa) |
| `ANY` | CAS_OD nebo CAS_DO | Bez omezení — sestra může přijet kdykoli v rámci své směny |
| `ANY` | PREFERENCE_SESTRA | Může přijet libovolná dostupná sestra |

### Příklady

**Pacient s pevným oknem a preferovanou sestrou (3× týdně):**
```
P001 | Karel Dvořák | Zborovecká 1533/65, Blansko, 678 01 | Po,St,Pa | 08:00 | 10:00 | 45 | Jana Nováková
```
Jana musí k Karlovi dorazit mezi 8:00 a 10:00. Návštěva trvá 45 minut, takže může skončit nejpozději v 10:45.

**Pacient bez časového omezení, každý den:**
```
P002 | Eva Marková | Sladkovského 1292/2, Blansko, 678 01 | ALL | ANY | ANY | 30 | ANY
```
Může přijít libovolná sestra kdykoli ve své směně.

**Pacient s preferencí sestry a odpoledním oknem:**
```
P003 | Jiří Blažek | Obůrka 71, Blansko, 678 01 | Ut,Ct | 13:00 | 16:00 | 60 | Marie Svobodová
```
Marie by měla dorazit v úterý a čtvrtek mezi 13:00 a 16:00, návštěva trvá hodinu.

**Pacient s ranním oknem, bez preference sestry:**
```
P004 | Alžběta Červená | Veselice 2, Vavřinec, 679 13 | Po,Pa | 07:00 | 09:00 | 30 | ANY
```

### Adresa pro geocodování

Adresa se automaticky převede na GPS souřadnice (geocodování přes OpenStreetMap/Nominatim). Čím přesnější adresa, tím lepší výsledek:

- **Dobře:** `Zborovecká 1533/65, Blansko, 678 01`
- **Méně přesně:** `Blansko` (najde centrum města, ne konkrétní ulici)

Pokud se adresu nepodaří geocodovat, návštěva se naplánuje bez zohlednění cestovního času a v reportu se zobrazí varování.

Adresa může obsahovat svislítko (`|`) — formát souboru to zvládá správně.

### Pravidlo pro ID pacienta

Stejné `ID` na více řádcích znamená jednoho pacienta navštěvovaného ve více dnech. Všechny řádky se sloučí do jednoho záznamu pacienta s více požadavky na návštěvy.

---

## 5. Plánování od zvoleného dne

Pokud sestra onemocní nebo nastane jiná situace, která znemožní dodržení původního plánu od pondělí, lze plán sestavit pouze pro zbytek týdne.

Na hlavní obrazovce klikněte v sekci **Plánovat od:** na požadovaný den:

```
Plánovat od:  [ Po ][ Út ][ St ][ Čt ][ Pá ]
```

- Výchozí hodnota je **Pondělí**.
- Při výběru např. **Středa** se plán sestaví pouze pro St, Čt, Pá.
- Pacienti, kteří mají naplánovanou návštěvu pouze v Po nebo Út, se pro tento týden neuváží — neobjeví se ani v reportu neplánovaných návštěv.

---

## 6. Výsledný plán

Po dokončení plánování se zobrazí **týdenní přehled** — mřížka (sestry × dny) s barevnými bloky návštěv.

Kliknutím na konkrétní den se otevře **denní detail** s:
- seřazeným itinerářem každé sestry,
- dobou jízdy od předchozí zastávky,
- mapou tras (každá sestra jinou barvou).

---

## 7. Neplánované návštěvy a varování

Pod týdenním přehledem se zobrazuje **report problémů** ve dvou kategoriích:

### Neplánované návštěvy

Návštěva nebyla zařazena do plánu. Typické důvody:

| Důvod | Co s tím |
|---|---|
| Žádná sestra nemá dostupný slot odpovídající časovému oknu pacienta | Rozšiřte okno CAS_OD–CAS_DO, nebo zkontrolujte pracovní dobu sester |
| Preferovaná sestra nemá volný čas a žádná jiná také ne | Přidejte sestru, nebo změňte preferenci na `ANY` |
| Návštěva se nevejde do žádné směny (příliš krátká směna) | Zkontrolujte `TRVANI_MIN` a pracovní dobu sester |

### Varování u naplánovaných návštěv

Varování se zobrazuje přímo u návštěvy v reportu (symbol ⚠). Návštěva je v plánu, ale je třeba ji zkontrolovat:

| Varování | Vysvětlení |
|---|---|
| Přiřazena náhradní sestra (požadována: Jana Nováková) | Preferovaná sestra neměla volný slot; přiřazena jiná |
| Adresa nebyla geocodována — cestovní čas nezohledněn | Adresu se nepodařilo převést na souřadnice; plán nerespektuje dobu jízdy k tomuto pacientovi |

---

## 8. Tisk a export do PDF

Tlačítko **Tisknout / PDF** (vpravo nahoře nad plánem) otevře systémový dialog tisku. Pro uložení jako PDF zvolte v dialogu tiskárnu **Uložit jako PDF** (nebo ekvivalent v daném prohlížeči).

Tiskový výstup je optimalizován pro formát **A4 na šířku**:
- jedna tabulka sester × dny s barevnými bloky návštěv,
- legenda barev sester,
- seznam neplánovaných návštěv (pokud existují).

---

## 9. Časté chyby a jejich řešení

### Chyby při načítání souboru

| Chybová hláška | Příčina | Řešení |
|---|---|---|
| `Řádek N: neplatný formát — očekáváno 8 sloupců` | Chybí oddělovač `\|` | Zkontrolujte, že řádek má 8 sloupců oddělených `\|` |
| `Řádek N: neplatný formát CAS_OD "..."` | Čas není ve formátu `HH:MM` | Opravte formát, nebo použijte `ANY` |
| `Řádek N: CAS_OD je pozdější než CAS_DO` | Okno je obrácené | Prohoďte hodnoty nebo použijte `ANY` |
| `Řádek N: neplatná délka návštěvy "..."` | TRVANI_MIN není číslo, nebo je nula/záporné | Zadejte kladné celé číslo |
| `Řádek N: neznámý den "..."` | Překlep v názvu dne | Povolené hodnoty: `Po`, `Ut` (nebo `Út`), `St`, `Ct` (nebo `Čt`), `Pa` (nebo `Pá`), `ALL` |
| `Řádek N: neplatný formát přestávky "..."` | Přestávka nemá tvar `HH:MM-HH:MM` | Opravte formát, oddělujte pomlčkou bez mezer |

### Problémy s geocodováním

- **Adresa nenalezena:** Zkuste přesnější formát — přidejte PSČ nebo název obce.
- **Špatná poloha na mapě:** Nominatim (OpenStreetMap) může mít v některých lokalitách méně přesná data. V takovém případě se plán sestaví, ale cestovní časy budou nepřesné.
- **Geocodování trvá dlouho:** Nominatim povoluje maximálně 1 dotaz za sekundu; pro 10 pacientů to znamená cca 11 sekund. Jde o záměrné omezení.

### Plán je sestaven, ale nevypadá správně

- **Nerovnoměrné rozdělení zátěže:** Algoritmus upřednostňuje požadované sestry — pacienti s preferencí `ANY` se dostanou ke konkrétní sestře jen pokud preferovaná není obsazena. Změňte preference na `ANY` pro rovnoměrnější rozložení.
- **Sestra nemá žádnou návštěvu:** Buď nemá dostupnost v daný den, nebo všichni její potenciální pacienti mají pevné preference na jinou sestru.
- **Pacient chybí v plánu i v reportu:** Zkontrolujte, zda den návštěvy pacienta leží v aktuálně nastavené části týdne (viz [Plánování od zvoleného dne](#5-plánování-od-zvoleného-dne)).
