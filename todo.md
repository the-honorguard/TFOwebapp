# TFO Web App — TODO

Laatste controle: 20 juli 2026.
Bron: huidige werkmap en `npm test` (7 tests geslaagd).

Dit is de enige actieve takenlijst. Werk van boven naar beneden: eerst P0, daarna P1, P2 en P3. Vink een taak pas af wanneer de acceptatiecriteria zijn gehaald en de relevante tests slagen.

## P0 — Beveiliging vóór productie

- [ ] **TFO-SEC-001 — Initialisatie- en beheerendpoints afsluiten**
  - Omvang: `POST /init`, `/init/reset`, `/init/demo`, `/init/import` en `/init/create-admin`.
  - Maak alleen een aantoonbare eerste installatie zonder beheerder mogelijk. Vereis daarna authenticatie en `manage_backups`, of verwijder destructieve routes uit productie.
  - Verwijder de `admin/admin`-route, voorkom promotie van bestaande gebruikers en gebruik voor de eerste beheerder een eenmalig geheim of lokale CLI-flow.
  - Gereed wanneer anonieme en gewone gebruikers na de installatie niets kunnen wijzigen en integratietests eerste installatie, herhaling, promotiepoging en alle vijf routes afdekken.

- [ ] **TFO-SEC-002 — JWT en actuele accountrechten beveiligen** *(deels uitgevoerd)*
  - De hardcoded `tfo-secret` is lokaal al vervangen door `JWT_SECRET` in productie, maar development heeft nog een bekende fallback en tokens vertrouwen nog op verouderde claims.
  - Eis overal een lang willekeurig geheim, weiger ontbrekende/zwakke/bekende waarden en roteer het productiegeheim.
  - Laad bij ieder beschermd verzoek de actuele gebruiker en rol uit de database; weiger verwijderde of inactieve accounts onmiddellijk.
  - Gereed wanneer oude/default tokens worden geweigerd en tests secret-validatie, rolwijziging, deactivatie en verwijdering tijdens een sessie afdekken.

- [ ] **TFO-SEC-003 — Logging begrenzen en autoriseren**
  - Beveilig `/api/logs/start`, `/api/logs/stop` en `/api/logs/stream` met een beheercapability.
  - Beperk of schakel `/api/client-log` uit in productie; valideer levels en veldlengtes en voeg rate limiting, redactie, rotatie en bewaartermijnen toe.
  - Gereed wanneer onbevoegde gebruikers geen logs kunnen lezen/aansturen en tests autorisatie, throttling, validatie en redactie bewijzen.

- [ ] **TFO-SEC-004 — Uploads tegen stored XSS beveiligen**
  - Sta geen HTML/HTM toe; weiger SVG of sanitize met een onderhouden library; valideer MIME én magic bytes.
  - Voeg `X-Content-Type-Options: nosniff` en een passende CSP toe en serveer risicobestanden bij voorkeur via een cookieless origin of als download.
  - Gereed wanneer geldige afbeeldingen werken en HTML, script-SVG en vermomde bestanden door tests worden geweigerd.

## P1 — Data-integriteit en accounts

- [ ] **TFO-DATA-001 — Slotinschrijving atomair maken**
  - Vervang read-modify-write in `repositories/ops.js` door transactielocking of optimistic concurrency.
  - Gereed wanneer precies één van twee gelijktijdige claims op hetzelfde slot slaagt en wijzigingen aan verschillende slots elkaar niet overschrijven.

- [ ] **TFO-DATA-002 — Brede delete-and-reinsert writes vervangen**
  - Gebruik gerichte repository/SQL-mutaties; reserveer volledige vervanging voor restore en omring die met een transactie en foreign-key-validatie.
  - Gereed wanneer een enkele wijziging geen tabellen vervangt, fouten volledig terugrollen en onafhankelijke gelijktijdige wijzigingen behouden blijven.

- [ ] **TFO-AUTH-001 — Wachtwoordbeleid en rate limiting invoeren**
  - Verwijder `changeme` en andere defaults. Valideer server-side verplichte minimum- en maximumlengte voor signup en door admins aangemaakte gebruikers.
  - Rate-limit login, signup en setup.
  - Gereed wanneer ontbrekende, lege, korte en te lange wachtwoorden niets aanmaken en alle gevallen getest zijn.

- [ ] **TFO-DATA-003 — Veilige, botsingsvrije ID's gebruiken**
  - Vervang `Date.now()` en tijd-plus-random-combinaties voor entiteits-ID's door database-ID's of `crypto.randomUUID()` met een passend kolomtype.
  - Gereed wanneer alle aanmaakroutes en recurrence-generatie dezelfde gedocumenteerde strategie gebruiken en concurrencytests geen botsingen tonen.

- [ ] **TFO-OPS-001 — Recurrence-generatie multi-instance veilig maken** *(deels uitgevoerd)*
  - Binnen één Node-proces voorkomt `recurrenceGeneration` nu overlap en een timer genereert periodiek operations.
  - Voeg database-locking of een unieke occurrence-sleutel toe zodat meerdere serverprocessen geen dubbele operations maken.
  - Gereed met een concurrency-integratietest over minimaal twee gelijktijdige generators.

## P2 — Tests en onderhoudbaarheid

- [ ] **TFO-TEST-001 — Zelfstandige teststraat uitbreiden** *(basis aanwezig)*
  - `npm test` start zelfstandig en de 7 recurrence/create-admin-tests slagen.
  - Voeg disposable databasefixtures en tests toe voor auth/capabilities, init, uploads, backup/restore, atomaire inschrijving en recurrence-concurrency.
  - Voeg browsersmokes toe voor publiek, signup/login/logout, member/missionmaker/admin, modals en 390 px.
  - Gereed wanneer `npm test` in een schone omgeving alle genoemde suites zonder handmatig gestarte server uitvoert.

- [ ] **TFO-ARCH-001 — Grote modules opsplitsen**
  - Splits `server.js` per domein in routes/services/repositories en splits `src/App.jsx` in pagina's en API-acties.
  - Centraliseer eerst regressietests en verander tijdens het opsplitsen geen gedrag.

- [ ] **TFO-ARCH-002 — API-verzoeken centraliseren**
  - Migreer de resterende directe `fetch('/api...')`-calls naar `src/api.js` en centraliseer authheaders en foutafhandeling.
  - Gereed wanneer componenten geen eigen API-basis, tokenafhandeling of 401-logica meer hebben.

- [ ] **TFO-REPO-001 — Logs en applicatiedata uit Git halen**
  - Momenteel gevolgd: `logs/app.log`, `logs/combined.log` en `public.raw`.
  - Stop tracking zonder benodigde lokale bestanden te verwijderen, blokkeer opnieuw committen en controleer historie op persoonsgegevens/geheimen.
  - Documenteer of history rewriting nodig is; behoud alleen minimale fictieve fixtures.

- [ ] **TFO-CLEANUP-001 — Ongebruikte bestanden en exports gecontroleerd opruimen**
  - Kandidaten: `README_v2_preview.md`, `HGprofilepic.jpg`, `repositories/index.js`, `public.raw`, ongebruikte imports/exports in `server.js`, `lib/logger.js` en de dubbele named/default export van `apiFetch`.
  - Verwijder alleen na repositorybrede gebruikscontrole en geslaagde tests/build; behoud één gedocumenteerde `apiFetch`-export.

- [ ] **TFO-CLEANUP-002 — Handmatige scripts inventariseren**
  - Controleer `scripts/check_public.js`, `clear-db.js`, `count-users.mjs`, `create-admin.cjs`, `create-admin-check.mjs`, `dump-users.cjs`, `init-db.mjs`, `init-schema.mjs`, `list-tables.mjs`, `set-admin-password.cjs`, `training-e2e-check.mjs`, `training-ui-fixture.mjs` en `wait-for-db.js`.
  - Noteer per behouden script doel, eigenaar, commando, omgeving en veiligheidsgrenzen; geef destructieve scripts een productieblokkade.

## P3 — Product en UX

### Operaties, ORBAT en beheer

- [ ] **TFO-FEAT-001 — LoA-periode opslaan**
  - Laat spelers een begin- en einddatum invullen, valideer de periode server-side en toon de actieve/toekomstige LoA waar relevant.

- [ ] **TFO-FEAT-002 — Modlist-upload toegankelijk maken**
  - Drag-and-drop voor player/server-modlists bestaat al; voeg aan beide vakken een zichtbare upload-/kies-bestand-knop toe met dezelfde uploadflow en feedback.

- [ ] **TFO-FEAT-003 — Roles-metrics betrouwbaar afleiden**
  - De roles-tabel, repository, CRUD-API en UI bestaan. De UI telt Slots/Allowed nu uit templates en Occupied uit templates in plaats van actuele operation-slots en spelersrollen.
  - Definieer de betekenis van Occupied/Slots/Allowed en bereken deze server-side uit de gezaghebbende bronnen.

- [ ] **TFO-FEAT-004 — Secties kunnen herordenen**
  - Slotvolgorde bestaat; voeg persistente herordening van secties/squads binnen templates toe.

- [ ] **TFO-FEAT-005 — Operation-volgorde opslaan**
  - Operations worden alleen tijdens renderen gesorteerd. Voeg een expliciete, persistente sorteersleutel en reorderflow toe als handmatige volgorde gewenst is.

- [ ] **TFO-FEAT-006 — Public-data schaalbaar maken**
  - Voeg paginering/filtering toe aan `/api/public-data`, zodat niet de volledige operationhistorie wordt geladen.

- [ ] **TFO-FEAT-007 — Backupretentie automatiseren**
  - Definieer en automatiseer MySQL-retentie, bijvoorbeeld dagelijkse snapshots en een pre-restore snapshot.

- [ ] **TFO-FEAT-008 — Lokalisatie voorbereiden**
  - Centraliseer verspreide gebruikersstrings zodat vertaling mogelijk wordt.

### Bugs

- [ ] **TFO-BUG-001 — Dubbele React-keys in ORBAT oplossen**
  - Herleid de waarschuwingen in `logs/app.log` naar dubbele slot-/entity-ID's en gebruik keys die binnen iedere collectie stabiel en uniek zijn.

- [ ] **TFO-BUG-002 — Horizontale overflow op 390 px oplossen**
  - De authenticated Overview meet 461 px documentbreedte bij een viewport van 390 px. Laat navigatie en ORBAT-controls wrappen of lokaal scrollen en voeg een regressietest toe.

### Visuele consistentie en feedback

- [ ] **TFO-UX-001 — Designsystem en pagina-audit uitvoeren**
  - Sluit palette en typografie aan op taskforceomega.eu.
  - Definieer spacing (4/8/12/16/24/32), typografische rollen en gedeelde stijlen voor buttons, inputs, cards en modals.
  - Verwijder daarna per pagina one-off margins, padding hacks en dubbele CSS.

- [ ] **TFO-UX-002 — Responsive en touch-pass uitvoeren**
  - Optimaliseer Scheduler en Builder voor mobiel, maak interactieve slots en knoppen touchvriendelijk en neem de 390 px-fix uit TFO-BUG-002 mee.

- [ ] **TFO-UX-003 — Niet-blokkerende feedback toevoegen**
  - Vervang browser-`alert()` door toegankelijke inline fouten of success/error-toasts.
  - Voeg consistente loading-, hover-, focus- en disabled-states toe.

- [ ] **TFO-UX-004 — Empty states completeren**
  - Gebruik een consistente icon + uitleg + primaire actie voor geen operations, templates, campaigns, ranks en users.

- [ ] **TFO-UX-005 — Grote ORBAT-editors sneller maken**
  - Meet render/update-tijd en render ingeklapte squads of alleen het actieve paneel, vooral op kleine schermen.

- [ ] **TFO-UX-006 — Persistente header afmaken**
  - Voeg aan de bestaande logo-/gebruikerssamenvatting de huidige paginanaam, rank en avatar toe.

## Geverifieerd gereed

Deze punten zijn tijdens de controle in de huidige code aangetroffen en hoeven niet opnieuw op de actieve lijst:

- [x] Rankbeheer met CRUD, volgorde en icon-upload; rank-icon wordt opgeslagen.
- [x] Acht ingebouwde SVG-squadmarkers en beheer van squadtypes; type en icoon zijn selecteerbaar in Builder/Scheduler.
- [x] Campaign → Operation wordt bij create/update/recurrence opgeslagen en in Overview gebruikt.
- [x] Roles-tabel, repository, CRUD-API en beheerpagina (metrics blijven TFO-FEAT-003).
- [x] ORBAT Overview, Scheduler, Template Builder, recurrence en next-date-preview.
- [x] Role-based capabilities; missionmakers kunnen via `edit_operations` operations maken.
- [x] Uploads voor markers, avatars en beheerbestanden; avatar/profielpersistentie.
- [x] Campaign-, rank- en permission-groupbeheer.
- [x] Destructieve acties vragen om bevestiging.
- [x] Signup bewaart en retourneert profieldata; veldfouten verdwijnen na correctie.
- [x] Verlopen sessies wissen authstate en laden publieke data opnieuw.
- [x] Dubbele operation-squad-route samengevoegd; rank-icon en fouttaal gecontroleerd.
- [x] Favicon, paginalogo, basisnavigatie en recurrence-unit-tests.
- [x] MySQL heeft file-based applicatieopslag vervangen.

## Deploy-checklist

Voer deze stappen alleen uit nadat de relevante taakcriteria en tests slagen:

```bash
npm test
npm run build
# Upload gewijzigde bestanden via FTP, inclusief dist/
# Herstart via cPanel > Node.js App > Restart
```
