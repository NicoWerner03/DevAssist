# 7 Ergebnisse

Dieses Kapitel fasst die Ergebnisse der Konzeption, Implementierung und Qualitätssicherung des Dev-Assist-Prototyps zusammen. Im Mittelpunkt steht nicht mehr die Herleitung einzelner Architektur- oder Implementierungsentscheidungen, sondern der am Ende der Entwicklung tatsächlich vorliegende Funktionsumfang. Dazu werden der finale Prototyp beschrieben, ein beispielhafter Ticketablauf nachvollzogen und der Umsetzungsstand mit den funktionalen sowie nicht-funktionalen Anforderungen aus Kapitel 3 abgeglichen.

Als Ergebnis ist dabei zweierlei zu unterscheiden. Erstens liegt ein ausführbarer TypeScript-Dienst vor, der GitLab-Ereignisse entgegennimmt, Ticketkontext für eine KI-Analyse aufbereitet, Antworten strukturell validiert, Rückfragen oder Vorschläge veröffentlicht und freigegebene Inhalte in ein Issue übernimmt. Zweitens liegt ein begrenzter Nachweis über dieses System vor. Die automatisierten Tests und der erfolgreiche Build zeigen, dass zentrale deterministische Komponenten für die geprüften Fälle funktionieren. Sie zeigen jedoch nicht, dass reale Modellantworten in beliebigen Projekten immer fachlich richtig oder unmittelbar nutzbar sind. Kapitel 7 beschreibt daher sowohl das erzielte Systemergebnis als auch den jeweils erreichten Nachweisstand.

## 7.1 Ergebnisrahmen

Der finale Repository-Stand vom 21.07.2026 bildet einen durchgängigen prototypischen Workflow ab. GitLab kann den Dienst über Webhooks über Issue- und Kommentarereignisse informieren; solche Webhooks sind als HTTP-basierte Benachrichtigungen externer Systeme vorgesehen (vgl. GitLab Docs, o. J.a, Abschnitt "Webhook events"). Dev-Assist prüft anschließend, ob eine Aktivierung vorliegt, lädt zusätzlichen Kontext, ruft abhängig von der Konfiguration den Mock- oder Opencode-Pfad auf und erzeugt ein maschinenlesbares Analyseobjekt. Aus diesem Objekt entsteht entweder ein Rückfragekommentar oder ein strukturierter Ticketvorschlag. Nach einer ausdrücklichen Publish-Anweisung liest das System den gespeicherten Vorschlag und aktualisiert das GitLab-Issue.

Das Ergebnis lässt sich in vier Ebenen gliedern:

1. **Ausführbarer Dienst.** Eine Express-Anwendung stellt einen Health-Endpunkt, einen GitLab-Webhook-Endpunkt und manuelle Process- und Publish-Endpunkte bereit.
2. **Kontrollierter Analyseablauf.** GitLab-Daten, Kommentare und optionaler Repository-Kontext werden für den Analyseprovider zusammengeführt; dessen Ausgabe muss einem festen Schema entsprechen.
3. **Nachvollziehbare Ergebnisartefakte.** Vorschläge erscheinen als GitLab-Kommentar und werden zusätzlich als `context.md` sowie mit Titelmetadaten in `context.json` gespeichert.
4. **Explizite Freigabegrenze.** Die KI-Komponente verändert das Issue nicht unmittelbar. Erst `@dev-assist publish` beziehungsweise ein manueller Publish-Aufruf löst die produktive Aktualisierung aus.

Diese Ebenen entsprechen dem Kernziel der Arbeit: Dev-Assist ist als Assistenzsystem zur Aufbereitung von Ticketinformationen umgesetzt, nicht als autonomer Entwicklungsagent. Das System erzeugt Anforderungen, Rückfragen und Vorschläge, führt aber keine Implementierung im Zielrepository aus und veröffentlicht Änderungen erst nach einem gesonderten Kommando.

## 7.2 Beschreibung des finalen Prototyps

Der Prototyp ist als reine Serveranwendung ohne eigene grafische Oberfläche realisiert. GitLab bleibt die Benutzeroberfläche und der zentrale Arbeitsort. Dadurch werden keine zusätzlichen Formulare oder Dashboards benötigt; Aktivierung, Rückfragen, Antworten, Vorschau und Freigabe finden im vorhandenen Issue und dessen Kommentarverlauf statt.

Die wesentlichen Ergebnisbausteine sind:

| Baustein | Realisiertes Ergebnis | Zentrale Artefakte |
| --- | --- | --- |
| HTTP- und Routing-Schicht | Express-Dienst mit Health-, Webhook-, Process- und Publish-Routen | `src/server.ts`, `src/app.ts`, `src/routes/` |
| Aktivierungs- und Ereignisschicht | Parsing von Issue- und Note-Payloads, Mention- und Kommandoerkennung, Bot-Filter und In-Memory-Deduplication | `src/services/gitlab/parser.ts`, `mention.ts`, `commands.ts`, `cleanup.ts` |
| GitLab-Anbindung | Lesen von Issues und Notes, Erstellen und Löschen von Kommentaren, Aktualisieren von Issues; primär über `glab`, alternativ über REST | `src/services/gitlab/client.ts`, `glab.ts` |
| Analyse- und Agentenschicht | Mock-Modus oder Opencode-Aufruf, Promptaufbau, Laufzeitparsing und strikte Prüfung eines kompakten JSON-Schemas | `src/services/ai/` und `opencode.json` |
| Repository-Kontext | Abruf von Projektmetadaten, Sprachen, Dateibaum und ausgewählten Schlüsseldateien; Zusammenfassung und Cache pro Projekt | `src/services/repositorySummary.ts` |
| Ergebnis- und Persistenzschicht | Rückfrage- oder Vorschlagskommentar, vierteilige Markdown-Struktur, `context.md` und `context.json` | `src/services/ai/formatter.ts`, `src/services/context/` |
| Prozess- und Publish-Schicht | Orchestrierung der Analyse, Kommentarbereinigung und kontrollierte Aktualisierung von Titel und Beschreibung | `src/services/processing/processor.ts`, `publisher.ts` |

### 7.2.1 Schnittstellen und Aktivierung

Der reguläre Einstieg erfolgt über `POST /webhooks/gitlab/issues`. Die Route erfasst den unveränderten Request-Body für die Signaturprüfung, überführt die Payload in ein internes Format und antwortet bei akzeptierten Ereignissen mit HTTP 202. Die eigentliche Analyse oder Veröffentlichung läuft anschließend asynchron weiter. Für lokale Entwicklung und gezielte Wiederholungen stehen zusätzlich `POST /api/issues/:projectId/:issueIid/process` und `POST /api/issues/:projectId/:issueIid/publish` bereit.

Das interne Webhook-Objekt enthält Ereignisart, Projekt-ID, Issue-IID, Titel, Beschreibung beziehungsweise Kommentartext, Aktion, Kommando und Verarbeitungsentscheidung. Issue- und Note-Ereignisse werden auf unterschiedliche Felder der GitLab-Payload abgebildet. Kommentare des konfigurierten Bot-Kontos und Inhalte mit bekannten Dev-Assist-Markern werden ignoriert. Eine zeitlich begrenzte In-Memory-Deduplication soll außerdem verhindern, dass identische Ereignisse innerhalb eines kurzen Fensters mehrfach verarbeitet werden.

Die aktuelle Aktivierungslogik erkennt `@dev-assist` im Titel, in der Beschreibung oder im auslösenden Kommentar. Das ist funktional breiter als die in Kapitel 3 formulierte Regel, nach der die Mention am Anfang der ersten Inhaltszeile stehen soll. Für den finalen Prototyp bedeutet dies: Eine explizite Mention bleibt erforderlich, ihre Position ist jedoch weniger streng begrenzt als im ursprünglichen Zielbild.

### 7.2.2 Kontextaufbereitung und Analyse

Nach einem Process-Kommando versucht der Processor, das aktuelle Issue und den Kommentarverlauf über den GitLab-Client abzurufen. Die GitLab Issues API stellt Issue-Daten bereit, während die Notes API den Zugriff auf Issue-Kommentare ermöglicht (vgl. GitLab Docs, o. J.c, o. S.; GitLab Docs, o. J.d, o. S.). Schlägt dieser Abruf fehl, wird mit den Daten aus der Webhook-Payload weitergearbeitet. Der Fehler führt damit nicht automatisch zum Abbruch, verringert aber den verfügbaren Kontext.

Im Opencode-Modus wird zusätzlich eine Repository-Zusammenfassung erzeugt. Dafür sammelt der Prototyp Projektname, Beschreibung, Standardbranch, Programmiersprachen, bis zu 300 Einträge des Dateibaums und höchstens acht ausgewählte Schlüsseldateien mit jeweils maximal 8000 Zeichen. Ein eigener `repo-summary`-Agent verdichtet diese Daten. Die Zusammenfassung wird pro Projekt im Speicher gehalten und als `.dev-assist/repo-summary-<projectId>.md` persistiert. Sie ergänzt technische Hinweise, ersetzt aber nicht die fachliche Anforderung aus dem Ticket.

Der Analyseprompt kombiniert die zentral gepflegten Regeln mit Titel und Beschreibung des Issues, optionaler Repository-Zusammenfassung, erkannten Antworten auf frühere Dev-Assist-Rückfragen und bis zu sechs jüngsten Kommentaren. Für reale Analysen startet der Dienst die Opencode-CLI mit dem Agenten `dev-assist-analyzer`; der Agent und das Modell werden über `opencode.json` beziehungsweise Umgebungsvariablen konfiguriert. Opencode stellt Agents und CLI-Aufrufe als konfigurierbare Schnittstelle für spezialisierte Arbeitsabläufe bereit (vgl. OpenCode Docs, o. J.a, Abschnitt "Agents"; OpenCode Docs, o. J.d, o. S.). Für lokale Tests erzeugt der Mock-Provider dagegen eine deterministische Beispielantwort ohne externen Modellaufruf.

Unabhängig vom Provider akzeptiert die Anwendung nur ein Analyseobjekt mit exakt sechs Feldern:

- `title` als Text,
- `description` als Textliste,
- `acceptanceCriteria` als Textliste,
- `technicalContext` als Textliste,
- `proposedSolution` als Textliste und
- `openQuestions` als Textliste.

Fehlende oder zusätzliche Felder, falsche Feldtypen und nicht textuelle Listenelemente führen zu einer Ablehnung. Die Opencode-Ausgabe kann direkt, aus JSONL-Ereignissen oder über einen Session-Export gelesen werden. In allen Fällen muss am Ende dasselbe Schema erfüllt sein. Damit besitzt der finale Prototyp eine klare technische Grenze zwischen probabilistischer Textgenerierung und deterministischer Weiterverarbeitung.

### 7.2.3 Rückfragen, Vorschläge und Kontextdateien

Nach der Analyse zählt der Processor die noch vorhandenen substanziellen offenen Fragen. Ab zwei Fragen wird ein Klärungskommentar erzeugt. Dieser erklärt, dass noch keine belastbare Ticketfassung vorliegt, und bittet um Antworten zu Anforderungen, Nutzen, Umfang, Akzeptanzkriterien oder Erfolgskriterien. Bei höchstens einer offenen Frage veröffentlicht Dev-Assist unmittelbar einen vollständigen strukturierten Vorschlag. Die verbleibende Frage wird im technischen Kontext als offener Punkt sichtbar gehalten.

Der sichtbare Vorschlag besitzt vier feste Abschnitte:

1. **Description** beschreibt Ziel und vorhandenen Kontext.
2. **Acceptance Criteria** führt beobachtbare Prüfpunkte auf.
3. **Technical Context & Logs** enthält belegte technische Randbedingungen und verbleibende offene Fragen.
4. **Proposed Solution** beschreibt einen groben, handlungsorientierten Lösungsweg.

Leere Abschnitte werden nicht stillschweigend entfernt, sondern mit `Not enough information available yet.` gekennzeichnet. Nummerierungspräfixe werden normalisiert und führende Markdown-Konstrukte neutralisiert, damit Modelltext die vorgegebene Abschnittsstruktur nicht unbeabsichtigt verändert. Der vorgeschlagene Titel wird nicht in den Beschreibungstext eingebettet, sondern separat als Metadatum behandelt.

Unabhängig davon, ob der GitLab-Kommentar erfolgreich angelegt werden kann, schreibt der Processor die gerenderte Fassung nach `.dev-assist/issues/<projectId>/<issueIid>/context.md`. Der Titel wird zusätzlich in `context.json` gespeichert. Diese Dateien bilden eine Brücke zu nachgelagerten Entwicklungswerkzeugen: Ein späterer Agent oder ein manueller Entwicklungsschritt kann den strukturierten Kontext verwenden, ohne den vollständigen GitLab-Kommentarverlauf erneut rekonstruieren zu müssen.

### 7.2.4 Kontrollierter Publish-Schritt

Das Publish-Kommando ist als eigene Prozessphase umgesetzt. Der Publisher liest zunächst `context.md` und, sofern vorhanden, `context.json`. Danach lädt er den aktuellen Kommentarverlauf, bestimmt anhand des Cleanup-Filters die Dev-Assist-bezogenen Kommentare und versucht, sie einzeln zu löschen. Systemnotes und normale Nutzerkommentare ohne Dev-Assist-Bezug bleiben erhalten. Einzelne Löschfehler werden protokolliert, blockieren die anschließende Issue-Aktualisierung aber nicht.

Aus den Kontextdateien werden der neue Issue-Titel und die neue Beschreibung vorbereitet. Der Titel stammt bevorzugt aus `context.json`; ältere Kontextformate können einen eingebetteten Titel aus Markdown übernehmen. Die Beschreibung enthält nur die vier strukturierten Abschnitte. Anschließend aktualisiert der GitLab-Client das Issue. Manuelle Publish-Aufrufe können zusätzlich Felder wie Status, Labels oder Zuständigkeiten übergeben.

Das resultierende Kontrollmodell besteht somit aus zwei getrennten Schreibvorgängen. Die Analyse darf einen Kommentar und lokale Kontextdateien erzeugen. Die eigentliche Änderung von Titel und Beschreibung erfolgt erst nach einer zweiten, expliziten Aktion. Dadurch bleibt der Vorschlag vor der Übernahme sichtbar und überprüfbar.

## 7.3 Beispielhafter Ablauf

Der folgende Ablauf zeigt das Verhalten anhand eines fiktiven Issues. Er dient als nachvollziehbares Anwendungsszenario des implementierten Kontrollflusses und nicht als Messung der Qualität eines bestimmten Sprachmodells.

### 7.3.1 Erstellung und Aktivierung des Issues

Eine Nutzerin erstellt in Projekt 123 das Issue 42 mit dem Titel `Passkey-Login ergänzen` und der Beschreibung:

> `@dev-assist Nutzende sollen sich künftig mit Passkeys anmelden können. Derzeit stehen Passwort und 2FA zur Verfügung.`

GitLab sendet ein Issue-Ereignis an den Webhook-Endpunkt. Der Parser liest Projekt-ID, Issue-IID, Titel und Beschreibung. Die Mention wird erkannt, das Kommando mangels `publish` als `process` eingeordnet und die Verarbeitung asynchron gestartet. Die HTTP-Antwort bestätigt mit Status 202 lediglich die Annahme des Ereignisses; sie enthält noch kein Analyseergebnis.

### 7.3.2 Kontextabruf und erste Analyse

Der Processor versucht, das vollständige Issue und die bisherigen Kommentare zu laden. Im Opencode-Modus wird außerdem die Repository-Zusammenfassung des Projekts ermittelt oder aus dem Cache übernommen. Der Agent erhält damit die ursprüngliche Anforderung, vorhandene Diskussionen, bereits beantwortete Rückfragen und gegebenenfalls technische Projekthinweise.

Für das Beispiel seien nach der ersten Analyse zwei fachlich relevante Punkte offen:

- Soll die Passkey-Anmeldung die vorhandenen Verfahren ergänzen oder ersetzen?
- Für welche Nutzergruppen und Oberflächen gilt die Anforderung?

Da mindestens zwei substanzielle Fragen verbleiben, erzeugt der Processor noch keinen freizugebenden Ticketvorschlag. Stattdessen erscheint ein Dev-Assist-Kommentar mit den Fragen und dem Hinweis, bei der Antwort erneut `@dev-assist` zu verwenden.

### 7.3.3 Antwort und erneute Analyse

Die Nutzerin antwortet:

> `@dev-assist Passkeys ergänzen Passwort und 2FA. Die Funktion gilt in der Webanwendung für alle registrierten Nutzenden. Wenn kein Passkey verfügbar ist, bleiben die vorhandenen Anmelde- und Wiederherstellungsverfahren nutzbar.`

Das Note-Ereignis startet einen neuen Process-Lauf. Bei der Promptaufbereitung wird die frühere Dev-Assist-Frage zusammen mit der späteren Nutzerantwort als geklärter Kontext hervorgehoben. Der Nachbearbeitungsschritt entfernt offene Fragen, die bereits beantwortet wurden oder einer beantworteten Frage stark ähneln. Dadurch soll vermieden werden, dass dieselbe Klärungsschleife erneut beginnt.

### 7.3.4 Strukturierter Vorschlag

Auf Basis der beschriebenen Angaben könnte das resultierende Artefakt inhaltlich wie folgt aussehen. Die Form entspricht dem implementierten Formatter; die Beispielinhalte illustrieren lediglich das Szenario:

**Vorgeschlagener Titel:** Passkey-Anmeldung als zusätzliche Login-Methode anbieten

**Description**

Registrierte Nutzende sollen sich in der Webanwendung mit einem vorhandenen Passkey anmelden können. Passkeys ergänzen die bestehenden Verfahren mit Passwort und 2FA; diese bleiben weiterhin verfügbar. Wenn kein verwendbarer Passkey vorhanden ist, können die bestehenden Anmelde- und Wiederherstellungswege genutzt werden.

**Acceptance Criteria**

- Registrierte Nutzende mit einem verwendbaren Passkey können sich damit erfolgreich anmelden.
- Passwort- und 2FA-Anmeldung bleiben unverändert nutzbar.
- Ohne verfügbaren Passkey bleiben die bestehenden Wiederherstellungsverfahren erreichbar.

**Technical Context & Logs**

- Die Änderung betrifft die Webanwendung.
- Die konkrete Browser- und Geräteunterstützung ist noch zu bestätigen.

**Proposed Solution**

1. Den bestehenden Anmeldeablauf um eine Passkey-Option ergänzen.
2. Die bisherigen Anmelde- und Wiederherstellungswege als Alternativen erhalten.
3. Den Ablauf gegen die bestätigten Akzeptanzkriterien und relevante Randfälle prüfen.

Der Vorschlag wird vollständig als GitLab-Kommentar angezeigt und parallel in `context.md` gespeichert. `context.json` enthält den vorgeschlagenen Titel. Die noch offene Browser- und Geräteunterstützung bleibt erkennbar, verhindert bei nur einem offenen Punkt aber nach der implementierten Heuristik nicht die Ausgabe eines Vorschlags.

### 7.3.5 Freigabe und Übernahme

Nach Prüfung des Kommentars antwortet eine berechtigte Person mit `@dev-assist publish`. Der Parser erkennt das Publish-Kommando. Der Publisher liest den zuvor gespeicherten Kontext, entfernt die Dev-Assist-bezogenen Kommentare soweit möglich und aktualisiert anschließend Titel und Beschreibung des Issues. Das Ergebnis ist kein zusätzlicher Freitext unterhalb der ursprünglichen Beschreibung, sondern ein neu strukturierter Ticketstand mit getrenntem Titel, Beschreibung, Akzeptanzkriterien, technischem Kontext und Lösungsvorschlag.

Der Ablauf erzeugt damit folgende Zustandsfolge:

| Phase | Auslöser | Sichtbares Ergebnis | Persistiertes Ergebnis |
| --- | --- | --- | --- |
| Ausgangszustand | Issue oder Kommentar mit `@dev-assist` | ursprünglicher Tickettext | noch kein Kontextartefakt |
| Klärung | mindestens zwei offene Fragen | Rückfragekommentar | vorläufige strukturierte Analyse |
| Vorschlag | ausreichender Kontext oder höchstens eine offene Frage | vollständiger Vorschlagskommentar | `context.md` und `context.json` |
| Publish | `@dev-assist publish` | aktualisierter Titel und strukturierte Beschreibung | derselbe freigegebene Kontext bleibt lokal verfügbar |

## 7.4 Ergebnisartefakte und Übergabepunkte

Der Prototyp erzeugt nicht nur einen einzelnen Kommentar, sondern mehrere aufeinander abgestimmte Artefakte. Der GitLab-Kommentar ist die Vorschau- und Kommunikationsform. Er ermöglicht eine menschliche Prüfung im bestehenden Arbeitskontext. `context.md` ist die menschenlesbare und zugleich werkzeugfreundliche Übergabeform für nachgelagerte Arbeit. `context.json` trennt Metadaten, insbesondere den Titel, von der Beschreibung. Die Repository-Zusammenfassung liefert optional einen wiederverwendbaren technischen Kontext auf Projektebene. Konsolenlogs dokumentieren schließlich die Verarbeitungsschritte und Fehlerzustände.

Diese Trennung verhindert, dass ein einziges Format alle Aufgaben gleichzeitig erfüllen muss. Ein Kommentar ist für Diskussion und Freigabe geeignet, aber nicht ideal als dauerhafte maschinelle Schnittstelle. Ein JSON-Analyseobjekt ist gut validierbar, aber für die unmittelbare GitLab-Kommunikation weniger lesbar. Markdown kann von Menschen geprüft und von Entwicklungswerkzeugen weiterverarbeitet werden. Die getrennte Titelmetadatei erlaubt es, GitLabs eigenes Titelfeld korrekt zu aktualisieren, ohne den Titel in der Beschreibung zu duplizieren.

Der wichtigste Übergabepunkt liegt zwischen Analyse und Publish. Vor diesem Punkt sind alle Inhalte Vorschläge. Nach dem Publish bilden Titel und Beschreibung den freigegebenen Ticketstand. Der zweite Übergabepunkt liegt zwischen Ticketaufbereitung und späterer Implementierung: Dev-Assist schreibt zwar einen technischen Kontext, verändert aber keinen Produktcode. Damit bleibt die Aufbereitung der Anforderung von ihrer Umsetzung getrennt.

## 7.5 Erfüllung der funktionalen Anforderungen

Kapitel 6 hat den Test- und Nachweisstand detailliert bewertet. Für die Ergebnisdarstellung wird ergänzend zwischen **Umsetzung im Prototyp** und **Nachweis der Umsetzung** unterschieden. Eine Funktion kann im Code vorhanden sein, ohne bereits durch einen vollständigen Integrationstest oder einen realen GitLab-Lauf belegt zu sein.

| Anforderung | Ergebnis im finalen Prototyp | Umsetzungs- und Nachweisstand |
| --- | --- | --- |
| FA-1 Explizite Aktivierung am Textanfang | Eine Mention ist erforderlich, wird aber auch im Titel oder mitten im Text akzeptiert. | **Abweichend umgesetzt.** Parser- und Routentests bestätigen das breitere Verhalten. |
| FA-2 Relevante GitLab-Ereignisse | Issue- und Note-Payloads werden vereinheitlicht und an Process oder Publish weitergeleitet. | **Umgesetzt, teilweise nachgewiesen.** Grundformen und ignorierte Routenszenarien sind getestet; ein realer positiver GitLab-Ende-zu-Ende-Lauf fehlt. |
| FA-3 Analyse- und Publish-Kommando | Ohne `publish` wird analysiert, mit `@dev-assist publish` wird der gespeicherte Kontext übernommen. | **Umgesetzt und auf Parser-Ebene nachgewiesen.** Die vollständige Publish-Kette ist nicht integriert getestet. |
| FA-4 Abruf des Ticketkontexts | Issue und Notes werden über den GitLab-Client geladen; Webhook-Daten dienen als Fallback. | **Umgesetzt, teilweise nachgewiesen.** Externe Abrufe sind nicht als vollständiger Integrationstest abgedeckt. |
| FA-5 Gemeinsame Kontextanalyse | Promptaufbau verbindet Issue, Kommentare, frühere Antworten und optionale Repository-Zusammenfassung. | **Strukturell umgesetzt und getestet.** Die semantische Zusammenführung realer Modellantworten ist nicht bewertet. |
| FA-6 Gezielte Rückfragen | Ab zwei offenen Fragen wird ein Klärungskommentar erzeugt; beantwortete ähnliche Fragen werden entfernt. | **Umgesetzt, teilweise nachgewiesen.** Darstellung und Filter sind getestet, fachliche Präzision realer Fragen nicht. |
| FA-7 Strukturierte Ticketvorschläge | Der Formatter erzeugt vier feste Markdown-Abschnitte und einen getrennten Titel. | **Als Kompaktstruktur umgesetzt und getestet.** Die umfangreichere Zielstruktur aus Kapitel 3 wird nicht vollständig abgebildet. |
| FA-8 Maschinenlesbares Analyseformat | Ein exaktes sechsteiliges JSON-Schema wird zur Laufzeit validiert. | **Für den aktuellen Vertrag umgesetzt und gut nachgewiesen.** Gegenüber dem ursprünglichen umfangreicheren Schema besteht eine Abweichung. |
| FA-9 Veröffentlichung als GitLab-Kommentar | Rückfragen, Vorschläge und Analysefehler können über `createNote` veröffentlicht werden. | **Umgesetzt, teilweise nachgewiesen.** Formatter-Ausgaben sind getestet, eine reale Kommentarerstellung nicht. |
| FA-10 Persistenz des Kontexts | `context.md` und optionale Titelmetadaten in `context.json` werden geschrieben und für Publish gelesen. | **Umgesetzt, teilweise nachgewiesen.** Ein vollständiger Dateisystem-Integrationstest fehlt. |
| FA-11 Kontrollierte Übernahme | Der Publisher bereitet Titel und Beschreibung auf, filtert Dev-Assist-Kommentare und aktualisiert erst danach das Issue. | **Umgesetzt, teilweise nachgewiesen.** Hilfsfunktionen und Filter sind getestet, die vollständige GitLab-Mutation nicht. |

Das funktionale Ergebnis ist damit ein nahezu durchgängiger Kernworkflow von der Aktivierung bis zur kontrollierten Übernahme. Zwei fachliche Inkonsistenzen bleiben sichtbar: Die Aktivierungsregel ist toleranter als FA-1, und das aktuelle Kompaktschema ist schmaler als die in Kapitel 3 formulierte Zielstruktur. Darüber hinaus betrifft die Mehrzahl der verbleibenden Einschränkungen nicht das Fehlen einer Codekomponente, sondern die noch unvollständige integrations- oder inhaltsbezogene Validierung.

## 7.6 Erfüllung der nicht-funktionalen Anforderungen

Bei den nicht-funktionalen Anforderungen ergibt sich ein stärker abgestuftes Ergebnis:

| Anforderung | Ergebnis im finalen Prototyp |
| --- | --- |
| NFA-1 Wartbarkeit | Die Verantwortlichkeiten sind auf Routing, GitLab, AI, Kontext, Repository-Zusammenfassung und Prozesssteuerung verteilt. Der TypeScript-Build ist erfolgreich. Eine quantitative Wartbarkeitsbewertung liegt nicht vor. |
| NFA-2 Testbarkeit ohne externe Abhängigkeiten | Mock-Provider, simulierte GitLab-Clients, temporäre Opencode-Programme und lokale HTTP-Tests ermöglichen 60 automatisierte Tests ohne reales GitLab und ohne Modellzugang. Diese Anforderung ist am stärksten erfüllt. |
| NFA-3 Robustheit | Fallbacks für fehlenden GitLab-Kontext, Schemafehler, leere Abschnitte und Opencode-Export sind vorhanden. Externe Fehlerketten, Dateisystemfehler, Last und Parallelität bleiben unvollständig geprüft. |
| NFA-4 Nachvollziehbarkeit | Alle wesentlichen Schritte werden über strukturierte Konsolenausgaben protokolliert. Eine automatisierte Prüfung auf Vollständigkeit, Korrelation und Secret-Freiheit fehlt. |
| NFA-5 Begrenzung von KI-Risiken | Festes Schema, kontrollierte Formatierung, sichtbare offene Fragen und ein separater Publish-Schritt begrenzen die Wirkung fehlerhafter Ausgaben. Die fachliche Richtigkeit realer Modellantworten ist nicht nachgewiesen. |
| NFA-6 Webhook-Sicherheit | Eine HMAC-Prüfung ist implementiert, entspricht aber nicht dem in Kapitel 6 geprüften aktuellen GitLab-Signing-Token-Vertrag. Für einen produktiven Einsatz ist diese Anforderung nicht ausreichend erfüllt. |
| NFA-7 Bot-Schleifen und Duplikate | Bot-Namen und Dev-Assist-Marker verhindern mehrere Selbstreaktionen; eine In-Memory-Deduplication reduziert Wiederholungen. Mehrinstanzbetrieb und Parallelfälle sind nicht abgesichert. |
| NFA-8 Schnelle Webhook-Antwort | Die Route bestätigt akzeptierte oder ignorierte Ereignisse mit HTTP 202 und führt den Kernprozess im Hintergrund aus. Der positive asynchrone Pfad wurde nicht unter Last gemessen. |
| NFA-9 Konfigurierbarkeit | Port, Provider, Modell, Timeout, GitLab-Zugriff, Signaturpflicht, Tunnel, Kontextpfad und Deduplication-Fenster sind über Umgebungsvariablen steuerbar. Ungültige Kombinationen sind nur teilweise getestet. |
| NFA-10 Prozessintegrierte Bedienbarkeit | Die Nutzung erfolgt vollständig über GitLab-Issues und Kommentare; eine zusätzliche GUI ist nicht erforderlich. Eine Usability-Untersuchung mit realen Nutzerinnen und Nutzern fehlt. |

Das stärkste nicht-funktionale Ergebnis ist die lokale Testbarkeit. Ebenfalls klar realisiert sind modulare Zuständigkeiten, Konsolenlogging und die menschliche Freigabegrenze. Die größten produktionsbezogenen Lücken liegen bei der Webhook-Authentifizierung, bei verteilten beziehungsweise parallelen Verarbeitungssituationen, bei Monitoring und bei der inhaltlichen Evaluation realer Modellantworten.

## 7.7 Verdichtung der Ergebnisse

Die Arbeit erzielt als technisches Ergebnis einen funktionsfähigen Proof of Concept für einen KI-gestützten GitLab-Assistenten. Der Prototyp zeigt, dass ein Ticketworkflow aus Ereigniserkennung, Kontextabruf, agentenbasierter Analyse, strikter Antwortvalidierung, Rückfrage- oder Vorschlagskommunikation, lokaler Persistenz und expliziter Veröffentlichung in einer kleinen TypeScript-/Express-Anwendung zusammengeführt werden kann.

Für die erste in der Einleitung formulierte Fragestellung liefert der Prototyp eine konkrete, wenn auch gegenüber Kapitel 3 reduzierte Antwortstruktur. Ein aufbereitetes Ticket enthält einen eigenständigen Titel, eine Beschreibung, Akzeptanzkriterien, technischen Kontext, einen Lösungsvorschlag und sichtbare offene Fragen. Damit werden die für Verständnis, Umsetzung und Prüfung wesentlichen Informationsarten explizit getrennt. Ob diese Struktur in realen Projekten stets ausreicht und ob die Inhalte zuverlässig korrekt erzeugt werden, ist durch den aktuellen Nachweis noch nicht beantwortet.

Für die zweite Fragestellung liegt ein technischer Integrationsnachweis auf Prototypebene vor. GitLab-Ereignisse können einen Analyseprozess auslösen; der verfügbare Kontext wird in einen Prompt überführt; die Modellantwort wird nicht frei weitergereicht, sondern gegen einen festen Vertrag geprüft; das Ergebnis wird zunächst als Vorschau und Kontextdatei bereitgestellt und erst nach einer zweiten Aktion übernommen. Diese Kette zeigt, wie generative KI in einen kontrollierten Ticketworkflow eingebettet werden kann. Der Nachweis bleibt jedoch lokal und komponentenorientiert, solange ein realer GitLab-Ende-zu-Ende-Test und eine empirische Bewertung der Modellergebnisse fehlen.

## 7.8 Zwischenfazit

Der finale Dev-Assist-Prototyp bildet den vorgesehenen Kernprozess technisch weitgehend ab. Von einem Issue oder Kommentar mit Mention führt ein nachvollziehbarer Pfad über Kontextaufbereitung und KI-Analyse zu Rückfragen oder einem strukturierten Vorschlag. Der Vorschlag wird als GitLab-Kommentar sichtbar, als Markdown und Metadaten persistiert und erst nach einem expliziten Publish-Kommando in Titel und Beschreibung übernommen. Die Anwendung ist modular aufgebaut, lokal ohne externe Modell- oder GitLab-Abhängigkeiten testbar und besitzt feste Validierungs- und Freigabegrenzen.

Gleichzeitig ist das Ergebnis nicht mit Produktionsreife oder einem allgemeinen Wirksamkeitsnachweis gleichzusetzen. Die Aktivierungsregel und das Zielschema weichen von Teilen der ursprünglichen Anforderungen ab. Die aktuelle Signaturprüfung ist nicht mit dem aktuellen GitLab-Signing-Token-Verfahren kompatibel. Vollständige positive Integrationspfade und eine Bewertung realer Modellantworten fehlen. Kapitel 8 ordnet diese Ergebnisse deshalb hinsichtlich Nutzen, Risiken, Wartbarkeit und Vergleich mit manueller Ticketpflege ein.

## Quellen zu Kapitel 7

GitLab Docs o. J.a. Webhooks. https://docs.gitlab.com/user/project/integrations/webhooks/ (Zugriff vom 21.07.2026).

GitLab Docs o. J.c. Issues API. https://docs.gitlab.com/api/issues/ (Zugriff vom 25.06.2026).

GitLab Docs o. J.d. Notes API. https://docs.gitlab.com/api/notes/ (Zugriff vom 25.06.2026).

OpenCode Docs o. J.a. Agents. https://opencode.ai/docs/agents/ (Zugriff vom 25.06.2026).

OpenCode Docs o. J.d. CLI. https://opencode.ai/docs/cli/ (Zugriff vom 08.07.2026).

Projektinterne Arbeitsgrundlagen: `AGENTS.md`, `README.md`, `package.json`, `opencode.json`, `src/server.ts`, `src/app.ts`, `src/config.ts`, `src/routes/gitlabWebhooks.ts`, `src/routes/issues.ts`, `src/services/gitlab/parser.ts`, `src/services/gitlab/mention.ts`, `src/services/gitlab/commands.ts`, `src/services/gitlab/auth.ts`, `src/services/gitlab/client.ts`, `src/services/gitlab/cleanup.ts`, `src/services/gitlab/glab.ts`, `src/services/ai/instructions.ts`, `src/services/ai/service.ts`, `src/services/ai/schema.ts`, `src/services/ai/formatter.ts`, `src/services/ai/clarifications.ts`, `src/services/ai/opencodeRuntime.ts`, `src/services/repositorySummary.ts`, `src/services/processing/processor.ts`, `src/services/processing/publisher.ts`, `src/services/context/writer.ts`, `src/services/context/reader.ts`, `src/services/tunnel.ts`, `src/utils/logger.ts`, `tests/aiOpencode.test.ts`, `tests/aiPrompt.test.ts`, `tests/auth.test.ts`, `tests/cleanup.test.ts`, `tests/config.test.ts`, `tests/formatter.test.ts`, `tests/gitlab.test.ts`, `tests/glab.test.ts`, `tests/opencodeRuntime.test.ts`, `tests/processor.test.ts`, `tests/publisher.test.ts`, `tests/repositorySummary.test.ts`, `tests/schema.test.ts`, `tests/tunnel.test.ts` und `tests/webhookRoute.test.ts`.
