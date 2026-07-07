# 4 Konzeption der Systemarchitektur

Nachdem Kapitel 3 die fachlichen und nicht-funktionalen Anforderungen an Dev-Assist abgeleitet hat, beschreibt dieses Kapitel die daraus folgende Systemarchitektur. Im Mittelpunkt steht die konzeptionelle Struktur des Prototyps: notwendige Komponenten, Datenflüsse, Begrenzung und Validierung von KI-Ausgaben sowie die Absicherung gegen Änderungen an GitLab-Tickets ohne menschliche Freigabe.

Dev-Assist verbindet GitLab als ereignisbasierte Entwicklungsplattform mit Issues, Kommentaren, Webhooks und APIs mit einem Large-Language-Model-basierten Analyseprozess, der natürlichsprachliche Ticketinformationen in strukturierte Vorschläge überführt. Die zentrale Aufgabe besteht darin, diese Verbindung kontrolliert, nachvollziehbar und testbar zu gestalten. Das System ist daher nicht als autonomer Agent konzipiert, sondern als begrenzter Webhook-Dienst: Es prüft Ereignisse, sammelt Kontext, stößt eine Analyse an, persistiert Ergebnisse und übernimmt Änderungen erst nach einem expliziten Publish-Kommando.

## 4.1 Architekturziele und Entwurfsprinzipien

Die Architektur orientiert sich an den Anforderungen aus Kapitel 3. Dev-Assist soll ohne zusätzliche Benutzeroberfläche in einem bestehenden GitLab-Prozess nutzbar sein; die Interaktion findet vollständig über Issues und Kommentare statt. Technisch führt dies zu einer API-orientierten Architektur: Ein Express-Server nimmt HTTP-Anfragen entgegen, verarbeitet GitLab-Webhook-Payloads und ruft nachgelagerte Dienste für GitLab-Kommunikation, KI-Analyse, Kontextpersistenz und Publish-Verarbeitung auf.

Ein erstes Architekturziel ist die klare Trennung der Verantwortlichkeiten. Softwarearchitektur beschreibt nach Bass et al. zentrale Elemente, Beziehungen und daraus entstehende Systemeigenschaften (vgl. Bass et al., 2021, Kap. 1). Für Dev-Assist bedeutet dies, dass Webhook-Routing, Authentifizierung, Mention-Erkennung, GitLab-API-Zugriff, KI-Prompting, Antwortvalidierung, Markdown-Rendering, Kontextdateien und Publish-Logik getrennt umgesetzt werden. Diese Aufteilung unterstützt Wartbarkeit, Tests und Änderbarkeit.

Ein zweites Ziel ist die ereignisbasierte Integration. GitLab-Webhooks informieren externe Anwendungen bei relevanten Ereignissen, etwa Issue-Updates oder neuen Kommentaren (vgl. GitLab Docs, o. J.a, Abschnitt "Webhook events"). Dev-Assist muss daher nicht zyklisch nach neuen Tickets suchen, sondern reagiert auf konkrete Ereignisse. Dieses Muster entspricht lose gekoppelten Integrationsarchitekturen, in denen Nachrichten nachgelagerte Verarbeitungsschritte auslösen (vgl. Hohpe/Woolf, 2003, Abschnitte "Messaging" und "Message Channel").

Ein drittes Ziel ist kontrollierte Autonomie. Das Modell darf Ticketinformationen analysieren und Vorschläge erzeugen, aber keine produktiven Ticketänderungen selbst durchführen. Diese Grenze ist notwendig, weil generative KI fehlerhafte oder unbelegte Inhalte erzeugen kann. NIST beschreibt dieses Risiko als "Confabulation"; "hallucinations" und "fabrications" werden dort als umgangssprachliche Begriffe für überzeugend präsentierte, aber falsche oder irreführende Inhalte eingeordnet (vgl. National Institute of Standards and Technology, 2024, S. 4 und S. 6). OWASP warnt zudem vor "Excessive Agency", wenn LLM-basierte Systeme zu weitreichende Berechtigungen erhalten (vgl. OWASP, 2025b, Abschnitt "LLM06:2025 Excessive Agency"). Dev-Assist nutzt deshalb einen zweistufigen Prozess: Zunächst entsteht ein Vorschlag als Kommentar und Kontextdatei; erst `@dev-assist publish` übernimmt ihn in Titel und Beschreibung des Issues.

Ein viertes Ziel ist Nachvollziehbarkeit. Da der Prototyp keine gesonderte grafische Oberfläche und keine Datei-Logs vorsieht, werden relevante Verarbeitungsschritte über Konsolenausgaben sichtbar gemacht. Dazu gehören eingehende Requests, ignorierte oder verarbeitete Webhooks, Signaturentscheidungen, GitLab-Zugriffe, KI-Aufrufe, Kontextdateien, Kommentare und Issue-Updates.

## 4.2 Gesamtarchitektur des Webhook-Systems

Dev-Assist ist als reine Serveranwendung ohne Frontend konzipiert. Der Express-Server initialisiert Konfiguration und Log-Level, prüft bei Nutzung des Opencode-Pfads die CLI-Verfügbarkeit und startet die HTTP-Anwendung. Optional kann ein Cloudflare-Tunnel den lokalen Webhook-Endpunkt für GitLab erreichbar machen. Die Anwendung stellt drei zentrale Routen bereit: einen Health-Endpunkt, den GitLab-Webhook-Endpunkt sowie manuelle Issue-Endpunkte für Process und Publish.

Die Gesamtarchitektur lässt sich in sechs Schichten gliedern:

| Schicht | Hauptaufgabe | Zentrale Projektmodule |
| --- | --- | --- |
| HTTP- und Routing-Schicht | Requests, JSON-Parsing, Rohkörper-Erfassung, Logging, Antwort an GitLab | `src/app.ts`, `src/server.ts`, `src/routes/gitlabWebhooks.ts`, `src/routes/issues.ts`, `src/routes/health.ts` |
| Webhook-Prüfung | Signatur-/Tokenprüfung, Payload-Parsing, Mention- und Kommandoerkennung, Deduplication | `src/services/gitlab/auth.ts`, `src/services/gitlab/parser.ts`, `src/services/gitlab/mention.ts`, `src/services/gitlab/commands.ts` |
| GitLab-Anbindung | Lesen von Issues und Kommentaren, Schreiben und Löschen von Notizen, Aktualisieren von Issues | `src/services/gitlab/client.ts`, `src/services/gitlab/cleanup.ts` |
| Analyse- und Agentenschicht | Prompt-Aufbau, Opencode- oder Mock-Analyse, JSON-Parsing, Schema-Prüfung, Rückfragen | `src/services/ai/service.ts`, `src/services/ai/instructions.ts`, `src/services/ai/schema.ts`, `src/services/ai/clarifications.ts`, `opencode.json` |
| Ausgabe- und Persistenzschicht | GitLab-Markdown, Kontextdateien | `src/services/ai/formatter.ts`, `src/services/context/writer.ts`, `src/services/context/reader.ts` |
| Prozesssteuerung | Orchestrierung von Analyse und Publish | `src/services/processing/processor.ts`, `src/services/processing/publisher.ts` |

Die HTTP-Schicht kennt nur den Transport und delegiert fachliche Entscheidungen. Die GitLab-Anbindung kapselt Zugriffe über `glab` oder Personal Access Token, die Analyse-Schicht kapselt Mock- und Opencode-Pfad, und die Publish-Schicht liest den persistierten Kontext, ohne Modelllogik zu kennen. Die Abhängigkeiten verlaufen damit kontrolliert: Routen rufen die Prozessschicht auf, diese nutzt GitLab-, AI-, Repository-Summary- und Kontextdienste. Die KI-Schicht schreibt nicht selbst nach GitLab, sondern liefert nur eine strukturierte Antwort.

## 4.3 Ereignisbasierter Ablauf über GitLab-Webhooks

Der primäre Ablauf beginnt mit einem GitLab-Ereignis. Relevante Ereignisse sind Issue- beziehungsweise Work-Item-Ereignisse und Kommentarereignisse. GitLab dokumentiert Work-Item-Ereignisse für erstellte, bearbeitete, geschlossene oder wieder geöffnete Work Items; bei Issues wird `object_kind` als `issue` übermittelt (vgl. GitLab Docs, o. J.b, Abschnitt "Work item events"). Kommentare werden über Comment Events beziehungsweise Notes abgebildet.

Der Webhook-Endpunkt `/webhooks/gitlab/issues` ist so ausgelegt, dass GitLab schnell eine erfolgreiche Antwort erhält. Die Route prüft die Anfrage, parst das Payload, entscheidet über Relevanz und antwortet im Prototyp mit `202 Accepted`, während die eigentliche Verarbeitung asynchron weiterläuft. GitLab empfiehlt für Webhook-Receiver eine schnelle Antwort, typischerweise `200` oder `201`, sowie die Auslagerung längerer Verarbeitungsschritte; zugleich gelten in der Webhook-Historie Statuscodes von `200` bis `299` als erfolgreich (vgl. GitLab Docs, o. J.a, Abschnitte "Webhook receiver requirements" und "View webhook request history"). `202 Accepted` ist damit ein plausibler 2xx-Status, aber eine projektspezifische Implementierungsentscheidung.

Ein Analyseereignis durchläuft folgende Schritte:

1. GitLab sendet ein Issue- oder Note-Event an den Webhook-Endpunkt.
2. Express liest das JSON-Payload und speichert den Rohkörper für die Signaturprüfung.
3. Die Webhook-Authentifizierung prüft Signatur oder zulässigen Entwicklungsmodus.
4. Der Parser überführt die Payload in ein internes `ParsedWebhook`-Format mit Ereignistyp, Projekt-ID, Issue-IID, Titel, Beschreibung, Kommentartext und Kommando.
5. Mention-Gate und Command-Parser prüfen, ob Dev-Assist explizit angesprochen wurde und ob Analyse oder Publish ausgelöst werden soll.
6. Eine In-Memory-Deduplication verhindert mehrfache Verarbeitung identischer oder schnell wiederholter Ereignisse.
7. Je nach Kommando startet `processFromWebhook` oder `publishIssue`.
8. Die Route gibt unmittelbar einen erfolgreichen 2xx-Status zurück; im Prototyp ist dies `202 Accepted`.

Damit wird zwischen Transportbestätigung und fachlichem Ergebnis unterschieden. Die 2xx-Antwort bedeutet nur, dass Dev-Assist das Ereignis angenommen hat. Ob Analyse, Kommentar oder GitLab-Zugriff erfolgreich waren, wird anschließend über Logging und GitLab-Kommentare sichtbar. Für lokale Tests und manuelle Nachverarbeitung existieren zusätzlich `/api/issues/:projectId/:issueIid/process` und `/api/issues/:projectId/:issueIid/publish`; beide nutzen dieselbe Prozess- und Publish-Logik wie der Webhook-Pfad.

## 4.4 Zentrale Komponenten und Verantwortlichkeiten

Der Express-Server bildet den technischen Einstiegspunkt. Er initialisiert die Anwendung, liest Konfiguration und loggt eingehende Requests. Die JSON-Middleware erfasst zusätzlich den Rohkörper der Anfrage, weil die GitLab-Signing-Token-Prüfung den unveränderten Body als Teil der signierten Nachricht benötigt. Die Verifikation darf daher nicht nur auf geparstem JSON beruhen, sondern muss ursprüngliche Body-Zeichenkette und Webhook-Header berücksichtigen.

Der GitLab-Webhook-Router ist die erste fachliche Entscheidungsstelle. Er ruft die Signaturprüfung auf, parst die Payload, wendet Deduplication an, ignoriert irrelevante oder selbst erzeugte Ereignisse und startet den passenden Hintergrundprozess. KI-Logik und Prompt-Erstellung liegen bewusst außerhalb des Routers.

Parser, Mention-Gate und Command-Parser bilden die Aktivierungsschicht. Der Parser vereinheitlicht Issue- und Note-Events: Beim Issue-Event stehen Titel und Beschreibung in `object_attributes`, beim Note-Event der Kommentar in `object_attributes.note` und die zugehörige Issue-Information im `issue`-Objekt. Das Mention-Gate stellt sicher, dass Dev-Assist nur auf explizite Ansprache reagiert; der Command-Parser unterscheidet Analyse und `publish`.

Der GitLab-Client kapselt die Kommunikation mit GitLab. Primär wird `glab` genutzt, alternativ ein Token-basierter API-Zugriff. Die Issues API erlaubt Lesen und Aktualisieren von Issues, einschließlich Titel und Beschreibung (vgl. GitLab Docs, o. J.c, o. S.). Die Notes API erlaubt Abrufen und Erstellen von Issue-Kommentaren (vgl. GitLab Docs, o. J.d, o. S.). Die Discussions API bildet die Grundlage für Thread-Operationen, auch wenn der Prototyp überwiegend mit Notes arbeitet (vgl. GitLab Docs, o. J.e, o. S.).

Der Processor orchestriert den Analysepfad. Er lädt nach Möglichkeit das aktuelle Issue, Kommentare und eine Repository-Zusammenfassung aus GitLab. Fehlen diese Daten, nutzt er das Webhook-Payload als Fallback. Die Repository-Zusammenfassung kann zusätzlichen technischen Kontext liefern, bleibt aber unterstützend: Fachliche Anforderungen müssen weiterhin aus dem Ticketkontext stammen.

Die AI-Service-Komponente erstellt den Prompt und ruft je nach Konfiguration Mock-Modus oder Opencode auf. Opencode wird über den Agenten `dev-assist-analyzer` eingebunden; die Opencode-Dokumentation beschreibt Agents als spezialisierte KI-Assistenten für Aufgaben und Workflows (vgl. OpenCode Docs, o. J.a, Abschnitt "Agents"). Die detaillierten Regeln, das erwartete JSON-Format und Füllregeln liegen in `src/services/ai/instructions.ts`, sodass Promptregeln und Laufzeitverarbeitung synchron bleiben.

Die Schema-Komponente definiert die erwartete Antwortstruktur mit Feldern wie `summary`, `sourceBasis`, `implementationTicket`, `acceptanceCriteria`, `technicalNotes`, `openQuestions`, `risks` und `validationSteps`. Erst diese maschinenlesbare Struktur ermöglicht deterministische Weiterverarbeitung. Der Formatter rendert gültige Analysen als GitLab-Markdown, entweder als Rückfragekommentar oder als vollständigen strukturierten Vorschlag. Context Writer und Reader speichern den Vorschlag unter `.dev-assist/issues/<projectId>/<issueIid>/context.md` und optionale Metadaten in `context.json`. Der Publisher liest diese Dateien, bereinigt Dev-Assist-bezogene Kommentare und aktualisiert anschließend Titel und Beschreibung des Issues.

## 4.5 Datenfluss vom GitLab-Issue bis zum aktualisierten Ticket

Der Datenfluss gliedert sich in Analyse und Publish. Diese Trennung ist der wichtigste Schutzmechanismus gegen ungeprüfte Änderungen.

In der Analysephase entsteht ein internes Kontextobjekt aus Projektinformationen, Issue-Daten, Kommentaren, auslösendem Rohtext und optionaler Repository-Zusammenfassung. Da das Webhook-Payload nicht immer alle aktuellen Daten enthält, versucht Dev-Assist, Issue und Kommentare über die GitLab-API nachzuladen. Die Notes API unterstützt das Abrufen von Issue-Kommentaren einschließlich Sortierung (vgl. GitLab Docs, o. J.d, o. S.). Der Prompt kombiniert feste Analyseanweisungen, Titel und Beschreibung, relevante Kommentare einschließlich beantworteter Rückfragen sowie gegebenenfalls Repository-Kontext. `clarifications.ts` verhindert, dass bereits beantwortete Dev-Assist-Fragen erneut gestellt werden.

Nach der Modellantwort folgt die strukturelle Prüfung. Der Opencode-Output wird extrahiert, als JSON geparst und gegen Pflichtfelder geprüft. Nur schema-konforme Antworten werden als `RequirementAnalysis` weiterverarbeitet. Bei ungültigem Output wird kein verwertbarer Publish-Kontext erzeugt; stattdessen versucht das System, einen Fehlerkommentar in GitLab zu posten.

Ist die Analyse gültig, entscheidet der Processor anhand offener Fragen, ob ein Rückfragekommentar oder ein vollständiger Vorschlag gepostet wird. In beiden Fällen wird der strukturierte Kontext lokal persistiert, sodass der spätere Publish-Schritt denselben Stand verwendet, der im Kommentar sichtbar war.

Die Publish-Phase beginnt mit einem neuen GitLab-Kommentar oder einem manuellen API-Aufruf. Der Command-Parser erkennt `publish`, der Publisher liest `context.md` und `context.json`, bereitet die finale Issue-Beschreibung auf, extrahiert den vorgeschlagenen Titel und bereinigt Dev-Assist-bezogene Notizen. Anschließend aktualisiert er das Issue über die GitLab Issues API, die Titel, Beschreibung und weitere Felder ändern kann (vgl. GitLab Docs, o. J.c, Abschnitt "Update an issue"). Damit schreibt nicht das Modell produktiv nach GitLab, sondern die Anwendung nach expliziter menschlicher Freigabe.

## 4.6 Prompt-, Agenten- und Antwortverarbeitung

Dev-Assist verwendet kein freies Chatformat, sondern ein streng vorgegebenes JSON-Schema. Dieses Schema bildet die spätere Ticketstruktur ab und zwingt die Analyse in Felder, die geprüft und gerendert werden können.

Die Anweisungen fokussieren Ziel, Nutzerwert, Anforderungen, Scope, Akzeptanzkriterien und Definition of Done. Der Assistent soll keine Fragen zu aktuellen Dateien, Komponenten, Bibliotheken oder Implementierungsdetails stellen, weil meldende Personen solche Informationen oft nicht zuverlässig liefern können. Vorhandener Repository-Kontext darf für technische Hinweise genutzt werden; fehlt er, darf das Modell keine Architekturdetails erfinden.

Der Prompt ist damit eine Kontrollfläche, reicht allein aber nicht aus. Prompt Injection kann unkontrollierte Eingaben so gestalten, dass sie das Verhalten eines LLM beeinflussen (vgl. OWASP, 2025a, Abschnitt "LLM01:2025 Prompt Injection"). Dev-Assist behandelt Ticketbeschreibungen und Kommentare deshalb als Daten, nicht als Systemanweisungen. Die festen Analyseanweisungen kommen aus der Anwendung, und die Modellantwort wird erst nach JSON-Parsing und Schema-Prüfung akzeptiert.

Opencode dient als austauschbare Agentenschnittstelle. Die Anwendung startet den Agenten über die CLI, übergibt den Prompt und liest die Antwort aus dem JSON-Stream oder über einen Export-Fallback. Das lokale `opencode.json` definiert `dev-assist-analyzer` für Issue-Analysen und `repo-summary` für Repository-Zusammenfassungen. Beide Agenten erhalten keine direkten GitLab-Berechtigungen; GitLab-Zugriffe bleiben bei der Anwendung.

Der Mock-Modus ermöglicht lokale Entwicklung und Tests ohne echte Modellaufrufe. Dadurch können Parser, Renderer, Kontextdateien, Publish-Logik und Tests unabhängig von nicht-deterministischem oder externem Modellverhalten geprüft werden.

## 4.7 Kontextpersistenz, Publish-Funktion und Kommentarbereinigung

Die Kontextpersistenz bildet den Übergabepunkt zwischen Analyse und Publish, erzeugt ein nachvollziehbares Artefakt außerhalb von GitLab und verhindert, dass Publish erneut eine KI-Analyse ausführen muss. Übernommen wird der zuvor erzeugte und gespeicherte Vorschlag.

`context.md` enthält den strukturierten Vorschlag als Markdown, unter anderem Zusammenfassung, Implementation Ticket, Scope, User Stories, funktionale Anforderungen, technische Hinweise, Definition of Done, Akzeptanzkriterien, offene Fragen, Risiken und Validierungsschritte. `context.json` enthält optionale Metadaten wie den vorgeschlagenen Titel. Markdown bleibt für Menschen lesbar, JSON für gezielte maschinelle Verarbeitung geeignet.

Der Publish-Schritt liest diese Dateien, entfernt Abschnitte, die nicht in die finale Issue-Beschreibung gehören, übernimmt bevorzugt den Titel aus den Metadaten und aktualisiert anschließend das GitLab-Issue. Vorher bereinigt die Cleanup-Komponente Dev-Assist-bezogene Kommentare. Sie löscht keine Systemnotes und keine fachlich unabhängigen Nutzerkommentare. Löschbar sind Dev-Assist-generierte Kommentare sowie Kommentare, die eindeutig Teil der Dev-Assist-Interaktion sind, etwa Assistenzkommandos mit Mention oder Markierungen wie `## Dev-Assist:` oder `# Dev-Assist Context`.

Nach Publish soll die relevante Anforderung nicht mehr über Rückfragen, Vorschläge und Bestätigungskommentare verteilt sein. Stattdessen stehen Titel und Beschreibung strukturiert im Issue; der Kommentarverlauf wird nicht mehr als primäre Anforderungsquelle benötigt.

## 4.8 Fehlerbehandlung und Robustheit

Die Architektur muss mit Fehlern externer Systeme umgehen: GitLab-API-Aufrufe können fehlschlagen, `glab` kann nicht authentifiziert sein, Tokens können fehlen, Opencode kann nicht installiert sein, Modellaufrufe können timeouten und Modellantworten können ungültig sein. Dev-Assist behandelt diese Fälle differenziert.

Beim Abruf des vollständigen GitLab-Kontexts nutzt der Processor einen Fallback. Wenn `getIssue` oder `listNotes` fehlschlägt, wird eine Warnung geloggt und mit den Daten aus dem Webhook-Payload weitergearbeitet. Die Analyse kann dadurch eingeschränkt sein, bleibt aber oft möglich.

Bei KI-Fehlern ist die Architektur strenger. Erzeugt der AI-Service keine gültige Analyse, wird kein normaler Kontext geschrieben. Das System versucht stattdessen, einen Fehlerkommentar zu posten und wirft den Fehler weiter. So wird verhindert, dass ungültiger Modelloutput später durch Publish übernommen wird.

GitLab-Schreiboperationen werden teilweise best effort behandelt. Ein fehlgeschlagener Analysekommentar kann neben einer lokal geschriebenen Kontextdatei stehen; beim Publish blockiert das Fehlschlagen einzelner Kommentar-Löschungen nicht zwangsläufig die Aktualisierung der Issue-Beschreibung. Solche Fälle werden geloggt.

Deduplication schützt gegen Mehrfachverarbeitung. Da Webhooks wiederholt eintreffen oder erneut aus der Ereignishistorie gesendet werden können (vgl. GitLab Docs, o. J.a, Abschnitt "Manage webhooks"), speichert Dev-Assist für eine konfigurierbare Zeit Schlüssel aus Projekt, Issue, Ereignistyp und Ereignis-ID. Wiederholte Ereignisse erhalten einen erfolgreichen 2xx-Status, werden aber nicht erneut verarbeitet. Weitere Robustheit entsteht durch Konfiguration über Umgebungsvariablen, etwa für Port, Mention, GitLab-URL, `glab`, Token, Signaturpflicht, KI-Provider, Timeout, Kontextverzeichnis und Deduplication-TTL.

## 4.9 Sicherheitskonzept

Das Sicherheitskonzept betrifft Webhook-Authentizität, Schutz vor ungewollter Verarbeitung, Begrenzung der KI-Autonomie und Umgang mit Secrets.

Webhook-Endpunkte sind öffentliche HTTP-Schnittstellen und müssen vor gefälschten Ereignissen geschützt werden. GitLab empfiehlt für neue Webhooks Signing Tokens. Dabei sendet GitLab die Header `webhook-id`, `webhook-timestamp` und, sofern ein Signing Token konfiguriert ist, `webhook-signature`. Die HMAC-SHA256-Signatur wird über `{message_id}.{timestamp}.{body}` berechnet; `message_id` und `timestamp` stammen aus den Headern, `body` ist der unveränderte JSON-Rohkörper. Der ältere Secret-Token-Mechanismus über `X-Gitlab-Token` bietet schwächere Garantien und wird für neue Webhooks nicht empfohlen (vgl. GitLab Docs, o. J.a, Abschnitt "Signing tokens"). Dev-Assist erfasst deshalb den Rohkörper, wertet `webhook-id`, `webhook-timestamp` und `webhook-signature` aus, prüft die Signatur vor der Verarbeitung und validiert den Zeitstempel gegen Replay-Angriffe. Die Verifikation ist in einem separaten Auth-Modul gekapselt.

Für lokale Entwicklung unterstützt der Prototyp einen Modus, in dem fehlende Signing Secrets zugelassen und als Warnung geloggt werden. Produktiv lässt sich die Signaturpflicht erzwingen. Zusätzlich verhindert das Mention-Gate, dass Dev-Assist auf beliebige Projektkommentare reagiert; selbst verfasste oder eindeutig generierte Dev-Assist-Kommentare werden ignoriert, um Bot-Schleifen zu vermeiden.

Die KI-Autonomie bleibt begrenzt. Das Modell erhält keine direkte GitLab-Schreibberechtigung, sondern liefert nur strukturierte Antworten. Die Anwendung prüft, rendert und entscheidet über weitere Systemhandlungen; produktive Änderungen erfolgen erst nach `@dev-assist publish`. Damit adressiert die Architektur sowohl Halluzinationsrisiken als auch OWASPs Risiko übermäßiger Handlungsfähigkeit (vgl. National Institute of Standards and Technology, 2024, S. 4 und S. 6; OWASP, 2025b, Abschnitt "LLM06:2025 Excessive Agency"). Secrets wie GitLab-Token, Webhook-Secrets und Modellkonfigurationen liegen nicht im Code, sondern in `.env`; Logging darf keine Secrets ausgeben.

## 4.10 Bild-, Screenshot- und Repository-Kontext

Bild- und Screenshot-Verarbeitung ist in der Gliederung als möglicher Bestandteil genannt, aber im aktuellen Prototyp nicht als eigenständige Bildanalyse-Komponente umgesetzt. Kapitel 3 grenzt bereits ab, dass umfassende Bild- oder Screenshot-Interpretation nicht zum Kern der Anforderungsanalyse gehört. Die Architektur behandelt diesen Punkt daher als Erweiterungsstelle.

Für einen produktiven Ausbau wären zusätzliche Schritte notwendig: Erkennung von Anhängen oder Markdown-Bildreferenzen, gesicherter Abruf über GitLab, Größen- und Dateitypprüfung, optionale OCR- oder Vision-Verarbeitung, Kennzeichnung unsicherer Bildinterpretationen und Integration der Ergebnisse in den Prompt. Bildinhalte müssten wie Textkommentare als Daten, nicht als Systemanweisungen behandelt werden.

Der aktuell umgesetzte Kontextausbau liegt bei der Repository-Zusammenfassung. Wenn der Opencode-Pfad aktiv ist, ruft Dev-Assist Projektmetadaten, Programmiersprachen, Dateibaum und ausgewählte Schlüsseldateien aus GitLab ab. Der `repo-summary`-Agent erzeugt daraus eine kompakte Markdown-Zusammenfassung mit Technologie-Stack, Projektstruktur, Befehlen, Architektur, wichtigen Dateien und Konventionen. Sie wird gecacht und unter `.dev-assist/repo-summary-<projectId>.md` gespeichert. Diese Zusammenfassung ersetzt nicht den Ticketkontext, sondern ergänzt ihn, damit technische Hinweise realistischer werden, ohne fachliche Ziele zu erfinden.

## 4.11 Validierung und Testkonzept der Architektur

Die Architektur wurde so gewählt, dass zentrale Entscheidungen isoliert testbar sind. Da die KI-Komponente selbst nicht vollständig deterministisch ist, konzentrieren sich Tests auf deterministische Systemteile: Parsing, Authentifizierung, Cleanup, Prompt-Aufbau, Rendering, Repository-Summary und Opencode-Ausgabeparsing.

Die GitLab-Payload-Tests prüfen, ob Issue- und Note-Events korrekt erkannt, Publish-Kommandos abgeleitet und selbst erzeugte Dev-Assist-Kommentare ignoriert werden. Authentifizierungstests prüfen Verhalten ohne Secret, bei fehlender Signatur, bei gültiger HMAC-Signatur und bei ungültiger Signatur. Cleanup-Tests stellen sicher, dass Systemnotes und normale Nutzerkommentare erhalten bleiben, während Dev-Assist-bezogene Kommentare gelöscht werden können. Formatter-Tests prüfen Rückfragen, Kontextdokumente und die Darstellung schwacher oder fehlender Abschnitte.

Prompt- und Clarification-Tests sichern, dass Repository-Zusammenfassungen in den Prompt gelangen und beantwortete Dev-Assist-Fragen nicht erneut gestellt werden. Opencode-Tests prüfen die Extraktion von Analyseergebnissen aus JSON-Stream und Export-Fallback. Repository-Summary-Tests sichern die Sammlung von Projektmetadaten, Sprachen, Dateibaum und Schlüsseldateien ab.

Damit wird nicht das Modell als deterministisch vorausgesetzt, sondern die Anwendung um das Modell herum robust gemacht. Dev-Assist nutzt generative KI als Assistenzkomponente, während Systemgrenzen, Datenflüsse und Freigabeschritte durch deterministische Anwendungsteile kontrolliert bleiben.

## 4.12 Zwischenfazit

Die Systemarchitektur von Dev-Assist verbindet GitLab-Webhooks, GitLab-APIs, Opencode-basierte Analyse, lokale Kontextpersistenz und einen kontrollierten Publish-Prozess. Die wichtigste Entwurfsentscheidung ist die Trennung zwischen Analyse und Übernahme: Das System kann Tickets analysieren, Rückfragen stellen und strukturierte Vorschläge erzeugen, aber produktive Änderungen erfolgen erst nach expliziter menschlicher Freigabe.

Die Architektur erfüllt damit die Anforderungen aus Kapitel 3. Sie verarbeitet relevante GitLab-Ereignisse, kapselt die Aktivierungslogik, ruft Ticket- und Kommentar-Kontext ab, validiert KI-Ausgaben, persistiert strukturierte Vorschläge und aktualisiert Issues erst im Publish-Schritt. Signaturprüfung, Deduplication, Bot-Schleifenschutz, Schema-Validierung, Logging und Mock-Modus begrenzen die Risiken eines KI-gestützten Webhook-Systems. Für Kapitel 5 bildet dieses Kapitel den konzeptionellen Rahmen für die konkrete Umsetzung in TypeScript, Express, GitLab-Client, Opencode-Integration, Prompt-Modulen, Kontextdateien und Tests.

## Quellen zu Kapitel 4

Bass, Len; Clements, Paul; Kazman, Rick 2021. *Software Architecture in Practice*. 4th ed. Addison-Wesley. https://www.sei.cmu.edu/library/software-architecture-in-practice-fourth-edition/.

GitLab Docs o. J.a. Webhooks. https://docs.gitlab.com/user/project/integrations/webhooks/ (Zugriff vom 25.06.2026).

GitLab Docs o. J.b. Webhook events. https://docs.gitlab.com/user/project/integrations/webhook_events/ (Zugriff vom 25.06.2026).

GitLab Docs o. J.c. Issues API. https://docs.gitlab.com/api/issues/ (Zugriff vom 25.06.2026).

GitLab Docs o. J.d. Notes API. https://docs.gitlab.com/api/notes/ (Zugriff vom 25.06.2026).

GitLab Docs o. J.e. Discussions API. https://docs.gitlab.com/api/discussions/ (Zugriff vom 25.06.2026).

Hohpe, Gregor; Woolf, Bobby 2003. *Enterprise Integration Patterns*. Addison-Wesley. https://www.enterpriseintegrationpatterns.com/.

National Institute of Standards and Technology 2024. Artificial Intelligence Risk Management Framework. Generative Artificial Intelligence Profile. NIST AI 600-1. https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf.

OpenCode Docs o. J.a. Agents. https://opencode.ai/docs/agents/ (Zugriff vom 25.06.2026).

OWASP 2025a. LLM01:2025 Prompt Injection. OWASP Top 10 for LLM Applications 2025. https://genai.owasp.org/llmrisk/llm01-prompt-injection/ (Zugriff vom 25.06.2026).

OWASP 2025b. LLM06:2025 Excessive Agency. OWASP Top 10 for LLM Applications 2025. https://genai.owasp.org/llmrisk/llm062025-excessive-agency/ (Zugriff vom 25.06.2026).

Projektinterne Arbeitsgrundlagen: `README.md`, `descriptions/project_description.txt`, `.env.example`, `opencode.json`, `.opencode/prompts/requirement-analysis.md`, `.opencode/prompts/repo-summary.md`, `src/server.ts`, `src/app.ts`, `src/config.ts`, `src/routes/gitlabWebhooks.ts`, `src/routes/issues.ts`, `src/services/gitlab/parser.ts`, `src/services/gitlab/mention.ts`, `src/services/gitlab/commands.ts`, `src/services/gitlab/auth.ts`, `src/services/gitlab/client.ts`, `src/services/gitlab/cleanup.ts`, `src/services/processing/processor.ts`, `src/services/processing/publisher.ts`, `src/services/ai/service.ts`, `src/services/ai/instructions.ts`, `src/services/ai/schema.ts`, `src/services/ai/formatter.ts`, `src/services/ai/clarifications.ts`, `src/services/context/writer.ts`, `src/services/context/reader.ts`, `src/services/repositorySummary.ts`, `src/services/tunnel.ts`, `tests/gitlab.test.ts`, `tests/auth.test.ts`, `tests/cleanup.test.ts`, `tests/formatter.test.ts`, `tests/aiPrompt.test.ts`, `tests/aiOpencode.test.ts`, `tests/repositorySummary.test.ts` und `tests/tunnel.test.ts`.
