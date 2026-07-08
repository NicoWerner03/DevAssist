# 5 Implementierung

Nachdem Kapitel 4 die Architektur von Dev-Assist beschrieben hat, erläutert dieses Kapitel die konkrete Umsetzung des Prototyps. Im Mittelpunkt stehen TypeScript, Express, GitLab-Anbindung, OpenCode-Integration, Promptgestaltung, JSON-Verarbeitung, Kontextpersistenz und Publish-Logik. Die Darstellung orientiert sich am tatsächlichen Projektstand und verweist daher auf vorhandene Module, Tests und Konfigurationsdateien.

Dev-Assist ist als reiner API-Dienst umgesetzt. Das System stellt keine eigene grafische Oberfläche bereit, sondern wird über GitLab-Issues, Kommentare, Webhooks sowie manuelle HTTP- beziehungsweise CLI-Aufrufe bedient. Damit ergänzt es den bestehenden GitLab-Prozess dort, wo Ticketinformationen entstehen. GitLab beschreibt Webhooks als Mechanismus, mit dem externe Anwendungen bei Ereignissen wie Issue-Aktualisierungen oder neuen Kommentaren informiert werden können (vgl. GitLab Docs, o. J.a, Abschnitt "Webhook events"). Dev-Assist nutzt diesen Mechanismus, prüft eingehende Ereignisse auf Relevanz und stößt anschließend Analyse oder Veröffentlichung eines strukturierten Ticketvorschlags an.

Die Implementierung folgt drei Leitgedanken: Transportlogik, GitLab-Zugriffe, KI-Analyse, Formatierung, Kontextdateien und Publish-Schritt sind getrennt; generative KI erstellt nur Vorschläge und schreibt nicht selbst nach GitLab; externe Eingaben wie Webhook-Payloads, Kommentare und Modellantworten werden geparst, eingegrenzt und validiert. Damit greift die Umsetzung die Anforderungen an Wartbarkeit, Testbarkeit, Robustheit und kontrollierte Autonomie aus Kapitel 3 und 4 auf.

## 5.1 Aufbau des TypeScript-Projekts

Das Projekt ist als Node.js-/TypeScript-Anwendung organisiert. `package.json` definiert den Dienst als ECMAScript-Modulprojekt und enthält die zentralen Skripte: `npm run dev` startet den Entwicklungsserver mit `tsx watch src/server.ts`, `npm run build` kompiliert nach `dist/`, `npm test` führt `tsx --test tests/**/*.test.ts` aus, und `npm run publish-issue -- <projectId>/<issueIid>` ermöglicht einen manuellen Publish-Schritt. Damit ist der Prototyp lokal im Entwicklungsmodus und als kompiliertes Node.js-Programm betreibbar.

TypeScript wird eingesetzt, weil Dev-Assist viele strukturierte externe Daten verarbeitet: GitLab-Webhooks, GitLab-API-Antworten, Agentenantworten, Kontextmetadaten und Konfigurationswerte. Das TypeScript-Handbook beschreibt TypeScript als statischen Typechecker für JavaScript, der Fehler vor der Laufzeit auffinden soll (vgl. TypeScript Docs, o. J., o. S.). Für Dev-Assist schließt das Laufzeitfehler nicht aus, hilft aber, interne Datenformen klar zu beschreiben, etwa in `src/services/gitlab/client.ts` für Issues und Notes oder in `src/services/ai/schema.ts` für KI-Antworten.

`tsconfig.json` nutzt `NodeNext` für Modul- und Auflösungsstrategie, `ES2022` als Zielplattform, `strict: true` für strenge Typprüfung und `outDir: ./dist` für die Build-Ausgabe. Der Quellcode liegt unter `src/`, die Tests unter `tests/`, die OpenCode-Konfiguration im Projektwurzelverzeichnis und die Thesis-Dokumentation unter `doc/`.

Die Projektstruktur ist klein und modular gehalten:

| Bereich | Aufgabe |
| --- | --- |
| `src/server.ts`, `src/app.ts` | Serverstart, Middleware, Routen und Shutdown-Verhalten |
| `src/config.ts` | Einlesen und Normalisieren von Umgebungsvariablen |
| `src/routes/` | Health-Check, GitLab-Webhooks und manuelle Issue-Aktionen |
| `src/services/gitlab/` | Webhook-Parsing, Mention-Erkennung, Authentifizierung, GitLab-Client und Kommentarbereinigung |
| `src/services/ai/` | Promptaufbau, Mock- und OpenCode-Analyse, Antwortschema, Formatierung und Klärungslogik |
| `src/services/context/` | Schreiben und Lesen von `context.md` und `context.json` |
| `src/services/processing/` | Orchestrierung von Analyse und Publish |
| `src/services/repositorySummary.ts` | Sammlung und Zusammenfassung von Repository-Kontext |
| `tests/` | Automatisierte Tests für deterministische Systemteile |

Die Abhängigkeiten entsprechen dem Prototypumfang. `express` bildet den HTTP-Server, `dotenv` lädt die `.env`, `typescript`, `tsx` und Node-Typdefinitionen unterstützen Entwicklung und Tests. Die reale KI-Integration erfolgt derzeit über die OpenCode-CLI, obwohl `@opencode-ai/sdk` als Abhängigkeit vorhanden ist. Maßgeblich ist damit der CLI-Pfad: Die Anwendung startet `opencode run`, liest dessen Ausgabe und extrahiert daraus die strukturierte Analyse.

## 5.2 Konfiguration, Startverhalten und Logging

Die Laufzeitkonfiguration wird zentral in `src/config.ts` aufgebaut. Das Modul lädt die `.env` aus dem aktuellen Arbeitsverzeichnis und stellt eine typisierte `Config`-Struktur bereit. Wichtige Einstellungen sind Port, Log-Level, Mention-String, Bot-Benutzername, GitLab-Basis-URL, GitLab-Authentifizierungsmodus, Webhook-Signing-Secret, KI-Provider, Modell, Timeout, Kontextverzeichnis und Deduplication-Zeitfenster.

Für die lokale Entwicklung ist `AI_PROVIDER=mock` vorgesehen. Dieser Modus benötigt keine externen Modellzugänge und erzeugt eine deterministische Beispielanalyse. Für reale Analysen unterstützt der Prototyp `AI_PROVIDER=opencode`; dann wird ein konfiguriertes Modell über die OpenCode-CLI verwendet. Die GitLab-Anbindung kann über `glab` oder tokenbasierte REST-Aufrufe erfolgen. Standardmäßig ist `GITLAB_USE_GLAB=true`, weil der Dienst auf einem bereits authentifizierten lokalen GitLab-CLI-Kontext aufbauen soll. GitLab beschreibt `glab` als offenes CLI-Werkzeug, mit dem GitLab-Funktionen direkt aus dem Terminal genutzt werden können (vgl. GitLab Docs, o. J.e, o. S.).

`src/server.ts` liest die Konfiguration, setzt das Log-Level und prüft bei aktivem OpenCode-Provider, ob die OpenCode-CLI im Pfad erreichbar ist. Anschließend startet der Server die von `createApp()` erzeugte Express-Anwendung auf dem konfigurierten Port. Optional kann `START_TUNNEL=true` gesetzt werden; dann startet `src/services/tunnel.ts` einen Cloudflare-Tunnel und gibt die öffentliche Webhook-URL für `/webhooks/gitlab/issues` aus.

Das Logging bleibt bewusst einfach. `src/utils/logger.ts` erzeugt Konsolenzeilen mit Zeitstempel, Log-Level, Nachricht und optionalem Kontextobjekt. Warnungen und Fehler gehen nach `stderr`, Informations- und Debug-Ausgaben nach `stdout`. Diese Strategie passt zum Prototyp, weil lokale Simulationen nachvollziehbar bleiben und keine zusätzliche Logging-Infrastruktur nötig ist. Für produktiven Betrieb wären strukturierte Logweiterleitung, Maskierung sensibler Daten, Request-Korrelation und Monitoring naheliegende Erweiterungen.

## 5.3 Express-Server und HTTP-Routen

Die Express-Anwendung wird in `src/app.ts` aufgebaut. Express eignet sich für den Prototyp, weil es Routing und Middleware für HTTP-Anwendungen bereitstellt. Die Express-Dokumentation beschreibt Routing als Zuordnung von Endpunkten und HTTP-Methoden zu Handlern; Middleware-Funktionen haben Zugriff auf Request, Response und die nächste Funktion im Request-Response-Zyklus (vgl. Express Docs, o. J.a, o. S.; Express Docs, o. J.b, o. S.). Dev-Assist nutzt diese Eigenschaften, um JSON-Payloads einzulesen, den Rohkörper für Webhook-Prüfungen zu erfassen und Requests an fachliche Routen zu delegieren.

Die wichtigste Middleware ist `express.json()` mit einem Limit von `1mb` und einer `verify`-Funktion. Sie speichert den ursprünglichen Request-Body als `rawBody`, damit HMAC-Prüfungen auf dem tatsächlich empfangenen Byteinhalt beruhen und nicht auf einem nachträglich serialisierten JSON-Objekt. Danach protokolliert eine Request-Logging-Middleware Methode, Pfad, GitLab-Event-Header, Statuscode und Dauer.

Die Anwendung registriert drei Routenbereiche:

| Route | Zweck |
| --- | --- |
| `/health` | einfacher Health-Endpunkt mit Status, Servicename und Zeitstempel |
| `/webhooks/gitlab/issues` | primärer Webhook-Endpunkt für Issue- und Kommentarereignisse |
| `/api/issues/:projectId/:issueIid/process`, `/api/issues/:projectId/:issueIid/publish` | manuelle Analyse- und Publish-Endpunkte |

Die manuellen Issue-Routen in `src/routes/issues.ts` verwenden dieselbe Prozess- und Publish-Logik wie der Webhook-Pfad. Ein Process-Aufruf startet `processIssue`, ein Publish-Aufruf startet `publishIssue` und kann zusätzliche GitLab-Felder wie `state_event` oder Labels aus dem Request-Body übernehmen.

Der Webhook-Endpunkt akzeptiert Ereignisse möglichst schnell mit `202 Accepted`, während Analyse oder Veröffentlichung asynchron ausgeführt werden. Diese Trennung ist wichtig, weil eine OpenCode-Analyse länger dauern kann als GitLab auf eine Webhook-Antwort warten sollte. GitLab empfiehlt für Webhook-Receiver schnelle Antworten mit `200` oder `201`, keine Verarbeitung im selben Request und Beachtung möglicher Duplikate (vgl. GitLab Docs, o. J.a, Abschnitt "Webhook receiver requirements"). Dev-Assist folgt der Zielrichtung durch schnelle 2xx-Antwort und ausgelagerte Verarbeitung; die Wahl von `202 Accepted` kennzeichnet die Annahme zur späteren Bearbeitung, weicht aber von den ausdrücklich genannten Beispielstatuscodes ab.

## 5.4 Webhook-Verarbeitung, Deduplication und Aktivierung

Die Webhook-Verarbeitung liegt in `src/routes/gitlabWebhooks.ts`. Bei einem POST auf `/webhooks/gitlab/issues` durchläuft der Request Signaturprüfung, Payload-Parsing, Deduplication, Bot- und Generierungsfilter, Mention- und Kommandoentscheidung sowie den Start von Analyse oder Publish.

Zunächst ruft die Route `verifyWebhookRequest` aus `src/services/gitlab/auth.ts` auf. Ist kein Signing Secret konfiguriert, akzeptiert der Prototyp die Anfrage im Entwicklungsmodus und protokolliert eine Warnung. Für produktive GitLab-Webhook-Authentifizierung ist das Signing-Token-Verfahren relevant: GitLab sendet `webhook-id`, `webhook-timestamp` und bei konfiguriertem Signing Token `webhook-signature`; die Signatur wird über `{message_id}.{timestamp}.{body}` aus Message-ID, Zeitstempel und rohem JSON-Body berechnet. Der Zeitstempel sollte auf Aktualität geprüft werden, um Replay-Angriffe zu erschweren. Falls `GITLAB_REQUIRE_SIGNATURE=true` gesetzt ist, führt eine fehlgeschlagene Prüfung zu `401 Unauthorized`; andernfalls wird im Entwicklungsmodus weiterverarbeitet. GitLab empfiehlt Signing Tokens, da sie Authentizität und Integrität per HMAC-SHA256 besser absichern als ein reiner Secret-Token-Header. Für ältere Installationen bleibt `X-Gitlab-Token` relevant, da GitLab Signing Tokens als in GitLab 19.0 eingeführt und in GitLab 19.1 allgemein verfügbar dokumentiert (vgl. GitLab Docs, o. J.a, Abschnitte "Create a webhook", "Signing tokens" und "Delivery headers").

Danach überführt `parseGitLabWebhook` die Payload in ein internes `ParsedWebhook`-Objekt. Bei Issue-Events liest der Parser Projekt-ID, Issue-IID, Titel, Beschreibung und Aktion aus `object_attributes`. Bei Note-Events liest er den Kommentar aus `object_attributes.note` und die zugehörigen Issue-Daten aus dem `issue`-Objekt. GitLab beschreibt Comment Events als Ereignisse für neue oder bearbeitete Kommentare und legt Note-Daten in `object_attributes` sowie Zielinformationen unter anderem im `issue`-Objekt ab (vgl. GitLab Docs, o. J.b, Abschnitt "Comment events").

Die Aktivierung erfolgt über `src/services/gitlab/mention.ts`. Standardmäßig wird `@dev-assist` erkannt; `hasMention` prüft die Mention, `stripMention` entfernt sie für die Kommandoanalyse. Einfache Markdown- und Formatierungszeichen am Anfang werden toleriert. Die aktuelle Erkennung ist großzügiger als die strengere Zielregel aus Kapitel 3, nach der die Mention auf der ersten Inhaltszeile stehen sollte: Für Issue-Events werden Titel und Beschreibung geprüft, für Note-Events der Kommentartext. Diese Toleranz erhöht die Bedienbarkeit, sollte produktiv aber bewusst gegen die strengere Aktivierungsregel abgewogen werden.

`src/services/gitlab/commands.ts` bestimmt anschließend das Kommando. Beginnt der Text nach Entfernen der Mention mit `publish`, wird das Ereignis als Publish-Kommando interpretiert; andernfalls startet eine Analyseanforderung. Zusätzlich verhindert eine im Arbeitsspeicher gehaltene Deduplication Mehrfachverarbeitung. Sie speichert für ein konfigurierbares Zeitfenster einen Schlüssel aus Projekt-ID, Issue-IID, Ereignisart und Ereignis-ID beziehungsweise Objekt-ID. Wiederholte Ereignisse werden mit `202 Accepted` beantwortet, aber nicht erneut verarbeitet. Für mehrere Instanzen oder Neustarts wäre eine persistente oder verteilte Deduplication erforderlich.

Schließlich ignoriert der Router selbst erzeugte oder selbst verfasste Kommentare. Dafür vergleicht der Parser den GitLab-Autor mit dem konfigurierten Bot-Benutzernamen und erkennt generierte Kommentare über Marker wie `## Dev-Assist:`, `generated by Dev-Assist` oder `# Dev-Assist Context`. So interpretiert Dev-Assist eigene Vorschläge oder Rückfragen nicht erneut als Nutzeranweisung.

## 5.5 GitLab-Integration über glab und REST-Fallback

Die GitLab-Anbindung ist in `src/services/gitlab/client.ts` gekapselt. Das Modul stellt ein einheitliches Interface bereit, unabhängig davon, ob die Ausführung über `glab` oder direkte REST-Aufrufe mit Personal Access Token erfolgt. Dadurch bleibt die Prozesslogik frei von Details wie URL-Kodierung, CLI-Argumenten, JSON-Ausgabe, Pagination oder HTTP-Headern.

Der primäre Pfad nutzt `glab api`. Das Kommando wird mit `execFile` gestartet, die Ausgabe als JSON gelesen und geparst. Projektpfade werden auf `/projects/<id>/...` normalisiert. Bei selbstverwalteten GitLab-Instanzen kann `GITLAB_GLAB_HOSTNAME` gesetzt werden; das Modul bereinigt den Wert auf einen Hostnamen. Ist `GITLAB_TOKEN` vorhanden, kann derselbe Client REST-Aufrufe mit `PRIVATE-TOKEN` ausführen. Ohne `glab` und ohne Token sind Schreiboperationen nicht zuverlässig möglich, was der Client beim Start protokolliert.

Für den Ticketkontext nutzt der Client `getIssue` und `listNotes`. Die GitLab Issues API dient zum Lesen und Aktualisieren von Issues; die Notes API stellt Endpunkte für Issue-Kommentare bereit, darunter Abrufen, Erstellen und Löschen von Notes (vgl. GitLab Docs, o. J.c, o. S.; GitLab Docs, o. J.d, o. S.). Für Repository-Kontext existieren `getProject`, `getRepositoryLanguages`, `getRepositoryTree` und `getRepositoryFile`. Für die Rückgabe an GitLab gibt es `createNote`, `deleteNote` und `updateIssue`.

`updateIssue` nimmt ein Objekt mit GitLab-Feldern entgegen, normalisiert Arrays für Labels oder Assignees und setzt Werte entweder per REST-JSON oder per `glab --field`. So kann der Publish-Schritt neben Titel und Beschreibung auch optionale Zusatzaktionen ausführen, etwa `state_event=close` oder `add_labels=ready`. GitLab dokumentiert beim Issue-Update unter anderem `description`, `title`, `state_event`, `add_labels` und `remove_labels` als mögliche Parameter (vgl. GitLab Docs, o. J.c, Abschnitt "Update an issue").

Fehler werden abhängig vom Schritt behandelt. In `processor.ts` wird ein fehlgeschlagener Kontextabruf protokolliert und mit vorhandenen Webhook-Daten weitergearbeitet. Bei Publish ist das Verhalten strenger: Fehlt die Kontextdatei oder schlägt die Issue-Aktualisierung fehl, bricht der Publish-Schritt ab. Das ist sinnvoll, weil eine eingeschränkte Analyse als Vorschlag kontrollierbar bleibt, ein fehlerhafter Publish aber produktive Ticketinhalte verändern würde.

## 5.6 Prozesssteuerung der Analyse

Die zentrale Orchestrierung liegt in `src/services/processing/processor.ts`. `processIssue` nimmt Projekt-ID, Issue-IID und optionalen Zusatztext aus dem Webhook entgegen, erstellt einen Logger mit Projekt-, Issue- und Phasenkontext und versucht, das aktuelle Issue sowie die Kommentare über den GitLab-Client zu laden. Falls dies fehlschlägt, wird mit einem Fallback aus dem Webhook-Text weitergearbeitet.

Anschließend wird der Repository-Summary-Provider aufgerufen. Ist eine Zusammenfassung verfügbar, wird sie in den Prompt integriert, damit der Agent technische Hinweise realistischer formulieren kann, ohne fachliche Anforderungen zu ersetzen. Danach entsteht ein Kontextobjekt mit Projekt, Issue, Kommentaren, Rohtext und optionaler Repository-Zusammenfassung.

Der Aufruf `ai.analyzeTicket(ctx)` bildet die Schnittstelle zur KI-Schicht. Schlägt die Analyse vollständig fehl, versucht der Processor, einen Fehlerkommentar in GitLab zu posten, und wirft den Fehler weiter. So entsteht keine Kontextdatei aus einer fehlgeschlagenen oder unparsebaren KI-Antwort.

Nach erfolgreicher Analyse entscheidet der Processor, welcher Kommentar gepostet wird. Bei mindestens zwei substantiellen offenen Fragen wird `renderClarificationComment` verwendet; andernfalls erzeugt `renderRequirementAnalysis` einen vollständigen strukturierten Vorschlag. Diese Heuristik verhindert, dass einzelne offene Punkte den gesamten Vorschlag blockieren, während mehrere relevante Fragen als Hinweis auf eine noch instabile Ticketgrundlage behandelt werden.

Unabhängig vom Erfolg des GitLab-Kommentars versucht die Anwendung, den strukturierten Kontext lokal zu persistieren. `writeContextFile` schreibt `.dev-assist/issues/<projectId>/<issueIid>/context.md` und speichert, sofern vorhanden, den vorgeschlagenen Titel in `context.json`. `processFromWebhook` verbindet Parser und Prozesslogik, liest Projekt-ID, Issue-IID und auslösenden Text aus dem `ParsedWebhook`, prüft die Mention defensiv erneut und ruft `processIssue` auf.

## 5.7 OpenCode-Agenten-Integration und Prompt-Design

Die KI-Schicht liegt in `src/services/ai/service.ts`. `createAiService` stellt ein einheitliches Interface bereit. Im Mock-Modus wird eine deterministische Beispielanalyse erzeugt; im OpenCode-Modus wird ein Agentenlauf gestartet. OpenCode beschreibt Agents als spezialisierte KI-Assistenten, die für konkrete Aufgaben und Workflows mit eigenen Prompts, Modellen und Werkzeugzugriffen konfiguriert werden können (vgl. OpenCode Docs, o. J.a, Abschnitt "Agents"). Dev-Assist nutzt dieses Konzept kontrolliert: Der Agent erhält vorbereiteten Kontext und soll ausschließlich ein JSON-Objekt zurückgeben.

Die OpenCode-Konfiguration steht in `opencode.json`. Dort sind `dev-assist-analyzer` für die Ticketanalyse und `repo-summary` für Repository-Zusammenfassungen definiert. Basisprompts liegen in `.opencode/prompts/requirement-analysis.md` und `.opencode/prompts/repo-summary.md`; der umfangreiche Analyseprompt wird jedoch zentral in `src/services/ai/instructions.ts` gepflegt. Dieses Modul enthält Persona, Kernregeln, JSON-Schema-Beispiel, Befüllungsregeln und Klärungshinweise.

`buildUserPrompt` kombiniert die Analyseanweisungen mit GitLab-Issue, optionaler Repository-Zusammenfassung, bereits beantworteten Dev-Assist-Rückfragen und den letzten Kommentaren. Am Ende steht die Aufforderung, ausschließlich ein JSON-Objekt auszugeben. Damit erhält das Modell denselben Regeltext unabhängig vom Ticket, während Ticketkontext und Systemregeln getrennt bleiben und frühere Antworten auf Rückfragen hervorgehoben werden.

Prompt Injection bleibt ein Risiko. OWASP beschreibt Prompt Injection als Schwachstelle, bei der Eingaben das Verhalten eines LLM unbeabsichtigt beeinflussen können (vgl. OWASP, 2025a, Abschnitt "LLM01:2025 Prompt Injection"). Dev-Assist begrenzt dieses Risiko nicht nur durch Prompting, sondern auch technisch: Die Anwendung entscheidet, welche Daten in den Prompt gelangen, ruft nur einen vordefinierten Agenten auf, akzeptiert nur schema-konforme JSON-Antworten und gibt dem Agenten keine direkte GitLab-Schreibberechtigung.

Im OpenCode-Pfad kopiert `analyzeWithOpencode` erforderliche Dateien nach `.opencode/runtime`, startet `opencode run` mit `--format json`, `--agent dev-assist-analyzer`, dem konfigurierten Modell und dem vollständigen Prompt, sammelt `stdout` und `stderr`, setzt einen Timeout und beendet zu lange laufende Prozesse. Die OpenCode-CLI-Dokumentation beschreibt `opencode run`, Agent-Auswahl, Formatoptionen und Exportfunktionen als CLI-Funktionen (vgl. OpenCode Docs, o. J.b, o. S.).

Die Ausgabe wird robust verarbeitet. `parseOpencodeAnalysisOutput` entfernt ANSI-Steuerzeichen, extrahiert JSON-Objekte, berücksichtigt `<task_result>`-Blöcke und durchsucht JSONL-Events. Wenn der JSON-Stream keine finale Textantwort enthält, versucht die Implementierung anhand einer Session-ID einen Export über `opencode export`. Dieser Export-Fallback ist durch `tests/aiOpencode.test.ts` abgesichert.

## 5.8 JSON-Antwortverarbeitung und Laufzeitvalidierung

Die Struktur der KI-Antwort ist in `src/services/ai/schema.ts` definiert. `RequirementAnalysis` enthält `summary`, `sourceBasis`, `implementationTicket`, `acceptanceCriteria`, `technicalNotes`, `openQuestions`, `risks` und `validationSteps`. Das verschachtelte `implementationTicket` enthält Titel, Ziel, Scope, Out-of-Scope, User Stories, funktionale Anforderungen, technischen Ansatz, Umsetzungsschritte und Definition of Done.

Diese Struktur zwingt den Agenten, zwischen Zusammenfassung, Umsetzungsticket, Akzeptanzkriterien, offenen Fragen und Risiken zu unterscheiden. Dadurch wird die Antwort maschinenlesbar und nachgelagert renderbar. Freier LLM-Fließtext wäre für diesen Workflow ungeeignet, weil die Anwendung dann nicht zuverlässig Titel, Beschreibung, Rückfrage oder Validierungsschritt unterscheiden könnte.

Die Laufzeitvalidierung erfolgt über `parseAnalysisJson` und `validateRequirementAnalysis`. Zunächst werden mögliche Markdown-Codezäune entfernt, dann wird JSON geparst. Anschließend prüft `validateRequirementAnalysis`, ob alle Pflichtfelder und die Pflichtfelder des verschachtelten `implementationTicket` vorhanden sind. Diese Validierung ist bewusst einfach und ohne zusätzliche Bibliothek umgesetzt. Sie prüft die Grundstruktur, aber nicht jedes Array-Element und jeden Feldtyp so streng wie eine vollständige JSON-Schema- oder Zod-Validierung.

Für den Prototyp ist das nachvollziehbar, weil der Schwerpunkt auf der Pipeline aus Prompt, Parsing, Pflichtfeldern, Rendering, Kontextdatei und Publish liegt. Gleichzeitig bleibt es eine Grenze: TypeScript-Typen gelten zur Entwicklungszeit, nicht für externe Laufzeitdaten. Eine produktive Weiterentwicklung sollte daher eine strengere Schema-Validierung ergänzen.

Die Formatierung übernimmt `src/services/ai/formatter.ts`. `renderClarificationComment` erstellt Rückfragekommentare, wenn wichtige Informationen fehlen. `renderRequirementAnalysis` erzeugt das vollständige Kontextdokument mit Abschnitten wie Summary, Goal, Scope, User Stories, Functional Requirements, Technical Approach, Acceptance Criteria, Open Questions, Risks and Assumptions und Validation Steps. Schwache Listenwerte wie "not specified", "to be confirmed" oder "unknown" werden durch "Not enough information available yet." ersetzt, damit unsichere Informationen nicht scheinbar konkret erscheinen. Dies passt zum Umgang mit Halluzinationsrisiken: NIST beschreibt Confabulation beziehungsweise Hallucination als überzeugend präsentierte, aber falsche oder irreführende Inhalte (vgl. National Institute of Standards and Technology, 2024, S. 4 und S. 6).

## 5.9 Umgang mit Rückfragen und Kommentarverlauf

Ein wichtiges Implementierungsdetail ist die Behandlung bereits beantworteter Rückfragen. Ohne diese Logik könnte das Modell bei erneuter Analyse dieselben Fragen wiederholen, obwohl sie im Kommentarverlauf bereits beantwortet wurden. `src/services/ai/clarifications.ts` adressiert dieses Problem.

Das Modul erkennt Dev-Assist-Rückfragekommentare über Marker wie `Dev-Assist: More information needed` und extrahiert Fragen aus Bullet- oder Nummerierungszeilen. Danach sucht es spätere Nutzerkommentare mit Dev-Assist-Mention. Diese Antworten werden priorisiert in den Prompt aufgenommen. Auch Antworten wie "no info" gelten als Antwort; das Modell soll die Frage dann nicht erneut stellen, sondern fehlende Informationen als "not specified" oder "to be confirmed" weiterführen.

Nach der Analyse entfernt `removeAnsweredOpenQuestions` offene Fragen, die bereits beantworteten Fragen stark ähneln. Dafür nutzt das Modul Tokenisierung mit Stoppwortliste und einen Ähnlichkeitswert. Die Tests in `tests/aiPrompt.test.ts` sichern sowohl die Aufnahme der Antworten in den Prompt als auch das Entfernen ähnlich formulierter offener Fragen ab. Die Lösung ist kein perfekter Dialogspeicher, aber deterministisch testbar und für den Prototyp ausreichend.

## 5.10 Repository-Kontext und Grenzen der Bildverarbeitung

Dev-Assist kann optional eine Repository-Zusammenfassung in den Prompt aufnehmen. `src/services/repositorySummary.ts` sammelt über den GitLab-Client Projektmetadaten, Programmiersprachen, den Repository-Baum und ausgewählte Schlüsseldateien wie `package.json`, `tsconfig.json`, `README.md`, `AGENTS.md` oder Build-Dateien. Der Kontext ist begrenzt: maximal 300 Baumeinträge, 8 Schlüsseldateien und 8000 Zeichen pro Datei. So wird verhindert, dass große Repositories den Prompt überladen.

Die Daten werden dem `repo-summary`-Agenten übergeben. Der Prompt fordert eine knappe Markdown-Zusammenfassung zu Technology Stack, Project Structure, Key Commands, Architecture, Important Files und Conventions. Die resultierende Zusammenfassung wird im Speicher gecacht und unter `.dev-assist/repo-summary-<projectId>.md` persistiert.

Diese Zusammenfassung soll keine fachlichen Anforderungen erfinden, sondern technische Hinweise plausibler machen. Wenn ein Ticket eine Änderung an einem API-Dienst beschreibt und die Repository-Zusammenfassung Express, TypeScript und bestimmte Befehle zeigt, kann der Agent technische Umsetzungshinweise vorsichtiger einordnen. Fehlt die Zusammenfassung, läuft die Analyse ohne Zusatzkontext weiter.

Die Behandlung von Bildern und Screenshots ist dagegen nicht als eigenständige Bildanalyse umgesetzt. Markdown-Links oder Kommentartext können zwar im Prompt landen, es gibt aber keine Komponente für Bilddownload, Dateitypprüfung, OCR oder Vision-Analyse. Bildverarbeitung ist damit eine Erweiterungsstelle. Das ist relevant, weil Screenshots zusätzliche Sicherheits- und Validierungsfragen aufwerfen, etwa Zugriff auf Anhänge, Größenlimits, sensible Inhalte, OCR-Fehler und Prompt Injection über Bildtext.

## 5.11 Kontextpersistenz und Publish-Kommando

Die Trennung zwischen Analyse und Publish begrenzt die Systemautonomie. OWASP beschreibt "Excessive Agency" als Risiko, wenn LLM-basierte Systeme zu weitreichende Berechtigungen oder Handlungsspielräume besitzen (vgl. OWASP, 2025b, Abschnitt "LLM06:2025 Excessive Agency"). Dev-Assist begegnet diesem Risiko, indem die KI-Schicht keinen GitLab-Publish ausführt. Sie erzeugt nur eine strukturierte Analyse, die erst nach einem expliziten Publish-Kommando übernommen wird.

Die Persistenz liegt in `src/services/context/writer.ts` und `src/services/context/reader.ts`. `writeContextFile` erzeugt `.dev-assist/issues/<projectId>/<issueIid>/`, schreibt dort `context.md` und optional `context.json`. `context.md` enthält den gerenderten Vorschlag, `context.json` derzeit vor allem den vorgeschlagenen Titel. Beim Publish liest `readContextFile` den Markdown-Inhalt und `readContextMetadata` die Metadaten. Fehlt die Metadatendatei, wird mit der Beschreibung allein weitergearbeitet.

Der Publish-Schritt befindet sich in `src/services/processing/publisher.ts`. Zunächst wird der gespeicherte Kontext gelesen. Danach entfernt `renderPublishedDescription` Abschnitte, die nicht in die finale Issue-Beschreibung gehören, etwa den separaten Titelabschnitt. Der Titel wird bevorzugt aus `context.json` übernommen, andernfalls aus dem Markdown extrahiert. So landet er im GitLab-Issue-Titel und nicht redundant im Beschreibungstext.

Vor der Aktualisierung bereinigt der Publisher den Kommentarverlauf. Er lädt die Notes und ruft `filterDeletableNotes` aus `src/services/gitlab/cleanup.ts` auf. Nicht gelöscht werden Systemnotes und normale Nutzerkommentare ohne Dev-Assist-Bezug. Löschbar sind Kommentare mit Mention sowie generierte Dev-Assist-Kommentare mit bekannten Markern. Einzelne Löschfehler blockieren den Publish nicht, sondern werden protokolliert.

Anschließend aktualisiert `updateIssue` Titel und Beschreibung des GitLab-Issues. Optional können Zusatzfelder wie Labels oder Statuswechsel übergeben werden. Diese Möglichkeit nutzen der manuelle HTTP-Endpunkt und `src/cli/publish-issue.ts`. Der CLI-Helfer interpretiert ein Argument wie `123/42 close,ready` als Projekt-ID, Issue-IID und optionale Zusatzaktionen. Ohne vorherigen Process-Schritt fehlt die Kontextdatei; ohne explizites Publish-Kommando wird kein Vorschlag übernommen. Damit bleibt die endgültige Änderung an eine bewusste Benutzerhandlung gebunden.

## 5.12 Simulation, lokale Ausführung und Tests

Der Prototyp kann lokal ohne echte GitLab- oder Modellabhängigkeit geprüft werden. Der Mock-Modus erzeugt eine Beispielanalyse und ermöglicht Tests der Routen, Formatierung, Kontextdateien und Publish-Logik ohne externe KI. Manuelle Endpunkte und der CLI-Helfer erlauben gezielte Einzelschritte: Process erzeugt Vorschlag und Kontextdatei, Publish liest diese Datei und aktualisiert das Issue.

GitLab-Webhooks können lokal per `curl` oder PowerShell an `/webhooks/gitlab/issues` gesendet werden. `README.md` enthält dafür ein Beispiel mit `object_kind: "issue"`, Projekt-ID, Issue-IID, Titel und Beschreibung mit `@dev-assist`. Soll GitLab den lokalen Dienst erreichen, kann `src/services/tunnel.ts` mit Cloudflare Tunnel eine öffentliche `trycloudflare.com`-URL erzeugen und den Webhook-Pfad anhängen.

Die automatisierten Tests konzentrieren sich auf deterministische Systemteile:

| Testdatei | Abgesicherter Bereich |
| --- | --- |
| `tests/gitlab.test.ts` | Parsing von Issue- und Note-Events, Publish-Kommando, eigene und generierte Kommentare |
| `tests/auth.test.ts` | Verhalten ohne Secret, fehlende, gültige und ungültige HMAC-Signaturen |
| `tests/cleanup.test.ts` | Auswahl löschbarer und nicht löschbarer Kommentare |
| `tests/formatter.test.ts` | Rückfragekommentare, Kontextdokumente und Platzhalter für schwache Abschnitte |
| `tests/aiPrompt.test.ts` | Repository-Summary, beantwortete Rückfragen und Filterung offener Fragen |
| `tests/aiOpencode.test.ts` | Parsing über OpenCode-Export-Fallback |
| `tests/repositorySummary.test.ts` | Sammlung, Caching und Extraktion von Repository-Zusammenfassungen |
| `tests/config.test.ts`, `tests/tunnel.test.ts` | Konfigurationsdetails und Cloudflare-Tunnel-Helfer |

Diese Teststrategie passt zum Systemcharakter. Das Modell selbst ist nicht deterministisch und wird deshalb nicht wie eine reine Funktion getestet. Stattdessen werden die festen Grenzen um das Modell geprüft: Promptinhalt, erwartete Struktur, Kommentare, Kontextdateien, löschbare GitLab-Kommentare und Extraktion der OpenCode-Ausgabe. Dadurch entsteht Vertrauen in die Anwendungsteile, die das Modell kontrollieren und begrenzen.

## 5.13 Zwischenfazit

Die Implementierung setzt die Architektur aus Kapitel 4 als modularen TypeScript-/Express-Dienst um. `server.ts` und `app.ts` bilden den HTTP-Einstieg, `config.ts` kapselt Umgebungsvariablen, der GitLab-Webhook-Router verarbeitet Ereignisse asynchron, und die Prozessschicht trennt Analyse und Publish. Die GitLab-Integration abstrahiert `glab` und REST-Fallback, die KI-Schicht bindet OpenCode über spezialisierte Agents ein, und Kontextdateien bilden den Übergabepunkt zwischen Vorschlag und kontrollierter Übernahme.

Prägend ist die Begrenzung der KI-Komponente. Der Agent erhält vorbereiteten Kontext und feste Analyseanweisungen, muss ein JSON nach definiertem Schema liefern und kann nicht selbst produktive GitLab-Änderungen durchführen. Die Anwendung validiert, rendert, persistiert und veröffentlicht erst nach explizitem Publish-Kommando. Damit zeigt der Prototyp, wie ein KI-gestützter GitLab-Assistent Ticketinformationen strukturieren kann, ohne menschliche Freigabe und technische Nachvollziehbarkeit aus dem Prozess zu entfernen.

Gleichzeitig bleiben Grenzen sichtbar. Die Mention-Erkennung ist toleranter als die strengere Zielregel aus der Anforderungsanalyse. Die JSON-Validierung prüft Pflichtfelder, aber nicht jedes Detail des Schemas. Bild- und Screenshot-Kontext ist noch keine eigene Implementierung, sondern eine Erweiterungsstelle. Kapitel 6 kann daran anschließen, indem es Tests, verbleibende Risiken und die Aussagekraft der Evaluation systematisch bewertet.

## Quellen zu Kapitel 5

Express Docs o. J.a. Basic routing. https://expressjs.com/en/starter/basic-routing/ (Zugriff vom 08.07.2026).

Express Docs o. J.b. Writing middleware for use in Express apps. https://expressjs.com/en/guide/writing-middleware/ (Zugriff vom 08.07.2026).

GitLab Docs o. J.a. Webhooks. https://docs.gitlab.com/user/project/integrations/webhooks/ (Zugriff vom 08.07.2026).

GitLab Docs o. J.b. Webhook events. https://docs.gitlab.com/user/project/integrations/webhook_events/ (Zugriff vom 08.07.2026).

GitLab Docs o. J.c. Issues API. https://docs.gitlab.com/api/issues/ (Zugriff vom 08.07.2026).

GitLab Docs o. J.d. Notes API. https://docs.gitlab.com/api/notes/ (Zugriff vom 08.07.2026).

GitLab Docs o. J.e. GitLab CLI (glab). https://docs.gitlab.com/cli/ (Zugriff vom 08.07.2026).

National Institute of Standards and Technology 2024. Artificial Intelligence Risk Management Framework. Generative Artificial Intelligence Profile. NIST AI 600-1. https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf.

OpenCode Docs o. J.a. Agents. https://opencode.ai/docs/agents/ (Zugriff vom 08.07.2026).

OpenCode Docs o. J.b. CLI. https://opencode.ai/docs/cli/ (Zugriff vom 08.07.2026).

OWASP 2025a. LLM01:2025 Prompt Injection. OWASP Top 10 for LLM Applications 2025. https://genai.owasp.org/llmrisk/llm01-prompt-injection/ (Zugriff vom 08.07.2026).

OWASP 2025b. LLM06:2025 Excessive Agency. OWASP Top 10 for LLM Applications 2025. https://genai.owasp.org/llmrisk/llm062025-excessive-agency/ (Zugriff vom 08.07.2026).

TypeScript Docs o. J. The TypeScript Handbook. https://www.typescriptlang.org/docs/handbook/intro.html (Zugriff vom 08.07.2026).

Projektinterne Arbeitsgrundlagen: `README.md`, `descriptions/project_description.txt`, `AGENTS.md`, `package.json`, `tsconfig.json`, `opencode.json`, `.opencode/prompts/requirement-analysis.md`, `.opencode/prompts/repo-summary.md`, `.opencode/skills/gitlab-issues.md`, `src/server.ts`, `src/app.ts`, `src/config.ts`, `src/routes/gitlabWebhooks.ts`, `src/routes/issues.ts`, `src/routes/health.ts`, `src/services/gitlab/parser.ts`, `src/services/gitlab/mention.ts`, `src/services/gitlab/commands.ts`, `src/services/gitlab/auth.ts`, `src/services/gitlab/client.ts`, `src/services/gitlab/cleanup.ts`, `src/services/processing/processor.ts`, `src/services/processing/publisher.ts`, `src/services/ai/service.ts`, `src/services/ai/instructions.ts`, `src/services/ai/schema.ts`, `src/services/ai/formatter.ts`, `src/services/ai/clarifications.ts`, `src/services/context/writer.ts`, `src/services/context/reader.ts`, `src/services/repositorySummary.ts`, `src/services/tunnel.ts`, `src/utils/logger.ts`, `src/cli/publish-issue.ts`, `tests/gitlab.test.ts`, `tests/auth.test.ts`, `tests/cleanup.test.ts`, `tests/formatter.test.ts`, `tests/aiPrompt.test.ts`, `tests/aiOpencode.test.ts`, `tests/repositorySummary.test.ts`, `tests/config.test.ts` und `tests/tunnel.test.ts`.
