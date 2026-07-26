# 6 Qualitätssicherung und Evaluation

Dieses Kapitel untersucht, in welchem Umfang der implementierte Dev-Assist-Prototyp die in Kapitel 3 formulierten Anforderungen nachweisbar erfüllt und an welchen Stellen die Aussagekraft der bisherigen Prüfung begrenzt bleibt. Qualitätssicherung besitzt bei Dev-Assist zwei unterschiedliche Ebenen. Einerseits müssen die deterministischen Anwendungsteile zuverlässig funktionieren: Webhook-Payloads sind zu parsen, Signaturen und Antwortformate zu prüfen, Kommentare zu filtern, Kontextdateien zu verarbeiten und Publish-Daten korrekt aufzubereiten. Andererseits ist die inhaltliche Qualität einer generativen KI-Ausgabe zu bewerten. Hier geht es nicht nur um syntaktisch gültiges JSON, sondern darum, ob fehlende Informationen erkannt, präzise Rückfragen gestellt und nutzbare, inhaltlich abgesicherte Ticketvorschläge erzeugt werden.

Die beiden Ebenen dürfen nicht gleichgesetzt werden. Eine vollständig grüne Testsuite belegt, dass die geprüften Programmteile für die verwendeten Eingaben das erwartete Verhalten zeigen. Sie belegt jedoch weder die semantische Qualität beliebiger Modellantworten noch die Funktionsfähigkeit mit jeder GitLab- oder Opencode-Version. Easterbrook et al. betonen, dass die Wahl einer empirischen Methode von Forschungsfrage, verfügbaren Ressourcen, Kontrollmöglichkeiten und Kontext abhängt und jede Methode nur begrenzte, qualifizierte Evidenz liefert (vgl. Easterbrook et al., 2008, S. 285 f.). Die Evaluation wird deshalb als Kombination aus reproduzierbarer automatisierter Prüfung, szenariobasierter Komponentensimulation, Anforderungsabgleich und expliziter Diskussion der nicht geprüften Bereiche aufgebaut.

## 6.1 Zielsetzung und Untersuchungsrahmen

Ziel der Qualitätssicherung ist nicht der Nachweis einer fehlerfreien oder produktionsreifen Anwendung. Untersucht wird vielmehr, ob der Prototyp seinen Kernworkflow technisch kontrolliert abbildet und welche Aussagen aus den vorhandenen Tests über seine Robustheit und fachliche Eignung abgeleitet werden können. Der Untersuchungsgegenstand ist der Repository-Stand vom 21.07.2026. Als ausführbare Prüfbasis dienen der TypeScript-Build und die unter `tests/` vorhandenen automatisierten Tests. Ergänzend werden Implementierung, Tests und Anforderungen statisch miteinander verglichen.

Wohlin et al. beschreiben empirische Untersuchungen in der Softwaretechnik als einen Prozess aus Abgrenzung, Planung, Durchführung, Analyse und Ergebnisdarstellung (vgl. Wohlin et al., 2012, S. 73 ff.). Dieses Kapitel folgt diesem Grundgedanken in einer für den Prototyp angemessenen Form. Zunächst wird festgelegt, welche Qualitätsaussagen mit welcher Evidenz geprüft werden. Danach werden Testumgebung und Testfälle beschrieben, die Ergebnisse zusammengeführt und schließlich ihre Grenzen bewertet. Es handelt sich jedoch nicht um ein kontrolliertes Experiment: Es gibt weder Versuchsgruppen noch eine unabhängige Variable, deren kausale Wirkung gemessen wird. Ebenso liegt keine Feldstudie mit Entwicklungsteams vor. Die Untersuchung ist eine verifikationsorientierte Evaluation eines einzelnen Prototyps.

Die verwendeten Evidenzarten beantworten unterschiedliche Fragen:

| Evidenzart | Untersuchte Frage | Mögliche Aussage |
| --- | --- | --- |
| TypeScript-Build | Ist der untersuchte Quellstand statisch typisierbar und kompilierbar? | Der Quellstand lässt sich ohne TypeScript-Fehler übersetzen. |
| Automatisierte Unit-Tests | Verhalten sich isolierte Parser-, Validierungs-, Formatierungs- und Hilfsfunktionen für definierte Eingaben korrekt? | Das erwartete deterministische Verhalten ist für die abgedeckten Fälle reproduzierbar. |
| Komponenten- und Routentests | Funktionieren mehrere reale Anwendungsteile gemeinsam, wenn externe Systeme ersetzt werden? | Schnittstellen zwischen ausgewählten Komponenten sind für die simulierten Fälle konsistent. |
| Anforderungsabgleich | Decken Implementierung und Tests die Anforderungen FA-1 bis FA-11 sowie NFA-1 bis NFA-10 ab? | Erfüllung, Teilabdeckung und Abweichungen werden nachvollziehbar. |
| Inhaltsbezogenes Bewertungsraster | Nach welchen Kriterien wären reale KI-Ausgaben zu bewerten? | Semantische Qualität wird operationalisiert; ohne Korpus und Bewertungen entsteht aber noch kein empirischer Wirksamkeitsnachweis. |

Diese Trennung verhindert eine Überinterpretation der Testergebnisse. Der Build prüft beispielsweise keine Laufzeitdaten. Ein Schema-Test prüft keine fachliche Wahrheit. Ein simulierter Opencode-Prozess zeigt, dass der Export-Fallback verarbeitet wird, aber nicht, dass ein reales Modell verlässlich gute Tickets erzeugt. Die Evaluation bewertet daher sowohl positive Nachweise als auch Lücken.

## 6.2 Teststrategie

Die Teststrategie konzentriert sich auf die kontrollierbaren Grenzen um das Sprachmodell. Diese Schwerpunktsetzung folgt aus der Architektur: Das Modell erhält vorbereiteten Kontext und erzeugt eine strukturierte Antwort, während die Anwendung Aktivierung, Datenabruf, Parsing, Formatierung, Persistenz und Publish steuert. Gerade weil Modellantworten nicht vollständig deterministisch sind, müssen die deterministischen Schutzmechanismen zuverlässig geprüft werden.

Die Tests lassen sich in vier Ebenen einordnen:

1. **Unit-Tests für reine oder weitgehend isolierte Funktionen.** Dazu gehören Webhook-Parsing, Kommandoerkennung, Schema-Validierung, Markdown-Formatierung, Kommentarbereinigung, Konfigurationswerte und die Aufbereitung von Publish-Daten. Diese Tests sind schnell, reproduzierbar und benötigen keine Netzwerkverbindung.
2. **Komponententests mit kontrollierten Ersatzabhängigkeiten.** Der Repository-Summary-Service erhält einen simulierten GitLab-Client. Die Opencode-Tests legen temporäre ausführbare Dateien in den Suchpfad und prüfen damit den realen Prozessstart sowie die Verarbeitung von Standardausgabe und Export-Fallback, ohne einen Modellaufruf auszuführen.
3. **HTTP-Routentests.** `tests/webhookRoute.test.ts` startet eine reale Express-Anwendung auf einem zufälligen lokalen Port und sendet HTTP-Anfragen über `fetch`. Damit werden JSON-Middleware, Router, Parser und HTTP-Antwort gemeinsam geprüft. Die bisher abgedeckten Routentests betreffen allerdings nur ignorierte Webhooks, nicht den erfolgreichen asynchronen Process- oder Publish-Pfad.
4. **Szenariobasierte und inhaltliche Bewertung.** Der Mock-Provider und die Prompt-Tests prüfen, ob Tickettext, Repository-Zusammenfassung und beantwortete Rückfragen in die Analyse eingehen. Sie ersetzen jedoch keine Bewertung realer, stochastischer Modellantworten. Für diese Ebene wird deshalb in Abschnitt 6.7 ein Bewertungsraster definiert und der bisherige Nachweisumfang begrenzt ausgewiesen.

Die Abgrenzung zwischen Unit- und Integrationstest ist in diesem Projekt nicht vollständig trennscharf. Ein Test des Formatters ist ein klassischer Unit-Test. Ein Test, der einen echten Express-Server, Parser und Router kombiniert, ist ein Komponenten- oder Integrationstest. Eine vollständige Ende-zu-Ende-Prüfung würde dagegen ein reales GitLab-Projekt, einen echten Webhook, gültige Authentifizierung, den konfigurierten Opencode-Agenten, einen Modellaufruf, Kommentarerstellung, Kontextpersistenz und anschließenden Publish umfassen. Ein solcher Test ist im Repository nicht vorhanden.

## 6.3 Testumgebung, Durchführung und Gesamtergebnis

Die automatisierte Prüfung wurde am 21.07.2026 unter Windows 11 Pro, 64 Bit, mit Node.js 24.11.0 und npm 11.6.1 durchgeführt. Das Projekt verwendet den in Node.js enthaltenen Test-Runner, der über `tsx --test tests/**/*.test.ts` gestartet wird. Der Build erfolgt mit dem TypeScript-Compiler über `npm run build`.

Die Ausführung ergab folgendes Ergebnis:

| Prüfschritt | Ergebnis |
| --- | --- |
| `npm run build` | erfolgreich, keine TypeScript-Fehler |
| `npm test` | 60 von 60 Tests bestanden |
| Testsuiten | 15 bestanden |
| Fehlgeschlagene, übersprungene oder offene Tests | 0 |
| Laufzeit des dokumentierten Testlaufs | ca. 0,94 Sekunden |
| Reale GitLab- oder Modellaufrufe | keine; externe Abhängigkeiten wurden simuliert oder umgangen |

Die 60 Testfälle verteilen sich wie folgt auf die geprüften Bereiche:

| Bereich | Testdateien | Anzahl Tests |
| --- | --- | ---: |
| GitLab-Parsing, HTTP-Route, Authentifizierung, Cleanup und `glab`-Hilfen | `gitlab.test.ts`, `webhookRoute.test.ts`, `auth.test.ts`, `cleanup.test.ts`, `glab.test.ts` | 24 |
| KI-Prompt, Schema, Formatierung und Opencode-Laufzeit | `aiPrompt.test.ts`, `schema.test.ts`, `formatter.test.ts`, `aiOpencode.test.ts`, `opencodeRuntime.test.ts` | 23 |
| Repository-Kontext, Process- und Publish-Aufbereitung | `repositorySummary.test.ts`, `processor.test.ts`, `publisher.test.ts` | 8 |
| Konfiguration und Tunnel-Helfer | `config.test.ts`, `tunnel.test.ts` | 5 |
| **Gesamt** | 15 Testdateien | **60** |

Das Ergebnis belegt einen stabilen, reproduzierbaren Stand der vorhandenen Tests. Es ist jedoch keine Aussage über eine prozentuale Codeabdeckung, da im Projekt kein Coverage-Werkzeug konfiguriert ist. Insbesondere können 60 erfolgreiche Tests dieselben Pfade mehrfach prüfen, während andere Pfade unberührt bleiben. Deshalb wird im Folgenden nicht die Testanzahl allein, sondern die konkret abgedeckte Funktionalität bewertet.

## 6.4 Unit- und Komponententests

### 6.4.1 Webhook-Parsing, Aktivierung und Kommandos

`tests/gitlab.test.ts` prüft Issue- und Note-Payloads. Erfasst werden Projekt-ID, Issue-IID, Titel, Beschreibung oder Kommentar sowie das abgeleitete Kommando. Ein Kommentar mit `@dev-assist publish` wird als Publish-Kommando erkannt. Selbst verfasste Bot-Kommentare und Kommentare mit bekannten Dev-Assist-Markern werden ignoriert. Diese Tests sind für NFA-7 wichtig, weil sie eine zentrale Ursache für Bot-Endlosschleifen adressieren.

Die Tests machen zugleich eine Abweichung sichtbar. FA-1 fordert, dass der erste inhaltliche Text mit `@dev-assist` beginnt. Die aktuelle Implementierung und die zugehörigen Tests akzeptieren die Mention dagegen auch im Issue-Titel oder an beliebiger Stelle in Beschreibung und Kommentar. Ein Test bestätigt ausdrücklich den Text `Bitte Ticket strukturieren. Danke @dev-assist`; ein weiterer akzeptiert `looks good, @dev-assist publish please`. Damit ist das getestete Verhalten intern konsistent, erfüllt aber die strengere Aktivierungsanforderung nicht. Dieser Befund ist besonders wichtig, weil erfolgreiche Tests andernfalls fälschlich als Nachweis für FA-1 gelesen werden könnten.

Die Routentests prüfen drei negative beziehungsweise ignorierte Fälle über eine reale lokale HTTP-Verbindung: ein Issue ohne Mention, einen Kommentar des Bot-Kontos und einen generierten Dev-Assist-Kommentar. In allen Fällen antwortet die Route schnell mit HTTP 202 und einem maschinenlesbaren Grund. Nicht getestet werden eine erfolgreiche Analyseanforderung, ein erfolgreicher Publish-Aufruf, die asynchrone Fehlerbehandlung oder die Deduplication. Die schnelle Antwortarchitektur aus NFA-8 ist damit für ignorierte Ereignisse belegt, für den positiven Hintergrundprozess aber nur durch Codeinspektion nachvollziehbar.

### 6.4.2 Webhook-Authentifizierung und Kommentarbereinigung

`tests/auth.test.ts` deckt fünf Fälle ab: Betrieb ohne konfiguriertes Secret, fehlende Signatur bei vorhandenem Secret, gültige zeitgestempelte HMAC, einen direkten HMAC-Fallback und eine ungültige Signatur. Die Verwendung eines konstantzeitlichen Vergleichs wird durch die Implementierung unterstützt. Für den lokal implementierten Signaturvertrag zeigen die Tests ein konsistentes Verhalten.

Die Kompatibilität mit dem aktuellen GitLab-Signing-Token-Verfahren wird dadurch jedoch nicht nachgewiesen. Die aktuelle GitLab-Dokumentation beschreibt die Header `webhook-id`, `webhook-timestamp` und `webhook-signature`, ein Token im Format `whsec_<base64>`, die Nachricht `{message_id}.{timestamp}.{body}` sowie eine Base64-Signatur mit Präfix `v1,`. Außerdem soll die Aktualität des Zeitstempels gegen Replay-Angriffe geprüft werden (vgl. GitLab Docs, o. J.a, Abschnitt "Signing tokens"). Die Implementierung und ihre Tests verwenden dagegen `x-gitlab-signature`, `x-gitlab-timestamp`, eine hexadezimale Signatur und die Nachricht `{timestamp}:{body}` beziehungsweise einen direkten Body-HMAC. Die Tests spiegeln somit den eigenen Code, nicht den aktuellen externen Vertrag. NFA-6 ist deshalb für produktive GitLab-Signing-Tokens nicht nachgewiesen. Vor einem produktiven Einsatz sind ein dokumentationskonformer Verifier und Tests mit Payloads aus realen GitLab-Lieferungen erforderlich.

Die sechs Cleanup-Tests prüfen, dass Systemnotes und normale Nutzerkommentare erhalten bleiben, während Kommentare mit `@dev-assist` oder generierten Dev-Assist-Markern löschbar sind. Das reduziert das Risiko, beim Publish fachliche Diskussionen unbeabsichtigt zu entfernen. Nicht getestet ist die vollständige Reihenfolge aus Notes laden, mehrere Kommentare löschen, Einzelfehler tolerieren und anschließend das Issue aktualisieren. Der Testnachweis betrifft den Filter, nicht die reale GitLab-Mutation.

### 6.4.3 Schema-Validierung und Ausgabeformatierung

Die Schema-Tests gehören zu den stärksten deterministischen Schutzmechanismen. Das aktuelle kompakte Format verlangt exakt die Felder `title`, `description`, `acceptanceCriteria`, `technicalContext`, `proposedSolution` und `openQuestions`. Fehlende Felder, unbekannte Eigenschaften, falsche Feldtypen und nicht textuelle Array-Elemente werden abgelehnt. Außerdem wird JSON innerhalb eines Markdown-Codeblocks korrekt extrahiert. Damit ist belegt, dass beliebiger Freitext oder ein älteres Antwortformat nicht unbemerkt als gültige Analyse weiterverarbeitet wird.

Gleichzeitig besteht eine Abweichung zur Anforderung FA-8 und zur in Kapitel 3 beschriebenen Zielstruktur. Dort werden unter anderem `summary`, `sourceBasis`, ein verschachteltes `implementationTicket`, Risiken und Validierungsschritte gefordert. Der aktuelle Code lehnt dieses ältere, umfangreichere Format ausdrücklich als ungültig ab. Das implementierte Kompaktschema ist strenger validiert als in Kapitel 5 beschrieben, bildet aber weniger fachliche Kategorien ab. Für die Qualitätssicherung bedeutet dies: Die strukturelle Validierung des aktuellen Schemas ist gut nachgewiesen; die Erfüllung der ursprünglichen fachlichen Zielstruktur ist nur teilweise gegeben.

Sieben Formatter-Tests prüfen die vier sichtbaren Abschnitte Description, Acceptance Criteria, Technical Context & Logs und Proposed Solution. Leere Abschnitte erhalten einen eindeutigen Platzhalter. Nummerierungspräfixe werden normalisiert, offene Fragen in den technischen Kontext übernommen und führende Markdown-Syntax wird neutralisiert. Besonders die Tests zu Überschriften, Codezäunen, Blockzitaten und horizontalen Trennlinien verhindern, dass Modelltext die vorgegebene Ticketstruktur unbeabsichtigt aufbricht. Diese Tests belegen die syntaktische Stabilität des gerenderten Markdown. Ob die Inhalte fachlich richtig, vollständig und für Entwicklerinnen und Entwickler hilfreich sind, bleibt davon unberührt.

### 6.4.4 Prompt, Rückfragen und Opencode-Ausgabe

`tests/aiPrompt.test.ts` prüft sieben Eigenschaften des Analysepfads. Der Prompt fordert ausschließlich das kompakte JSON-Format, die statische Opencode-Anweisung verwendet dieselbe Terminologie, eine Repository-Zusammenfassung wird vor dem Issue-Kontext eingefügt und frühere Dev-Assist-Rückfragen mit späteren Nutzerantworten werden hervorgehoben. Bereits beantwortete oder stark ähnlich umformulierte Fragen werden aus `openQuestions` entfernt. Ein Mock-Szenario prüft außerdem, dass der ursprüngliche Titel erhalten bleibt und keine nicht belegten Implementierungsdetails wie Handler oder Services ergänzt werden.

Diese Tests adressieren ein praktisches Dialogproblem: Rückfragen sollen nicht in Schleifen wiederholt werden. Sie prüfen dafür eine deterministische Ähnlichkeitsheuristik. Nicht abgedeckt sind längere Gesprächsverläufe, widersprüchliche Antworten, mehrsprachige Fragen, Antworten ohne erneute Mention oder Grenzfälle der Ähnlichkeitsschwelle. Ebenso wird nicht geprüft, ob ein reales Modell trotz Promptanweisung bereits beantwortete Fragen in anderer Form erneut erzeugt.

Der Opencode-Test ersetzt die reale CLI durch ein temporäres Testprogramm. Zunächst liefert der simulierte `opencode run`-Aufruf nur eine Session-ID. Danach stellt `opencode export` eine gültige Analyse bereit. Der Test belegt, dass der Export-Fallback funktioniert und der Prozess ohne unsichere Shell-Verkettung gestartet wird. Weitere Tests prüfen ANSI-Bereinigung, Extraktion verschachtelter Texte, Modellnamen und die Erfassung von Standardausgabe, Fehlerausgabe und Exit-Code. Nicht geprüft werden Timeout und Prozessabbruch, ungültige JSONL-Ereignisse, sehr große Antworten, reale CLI-Versionsunterschiede oder Modellfehler.

### 6.4.5 Repository-Kontext, Process und Publish

Vier Repository-Summary-Tests verwenden einen simulierten GitLab-Client. Sie prüfen Projektmetadaten, Sprachen, Dateibaum, Schlüsseldateien, Caching sowie die Extraktion von Markdown aus direkter oder JSON-formatierter Opencode-Ausgabe. Zusätzlich wird kontrolliert, dass der Prompt vor der angehängten Kontextdatei an die CLI übergeben wird. Damit ist die Zusammensetzung der Repository-Daten ohne externen Zugriff reproduzierbar.

Die Process- und Publisher-Tests sind enger begrenzt. Ein Process-Test stellt sicher, dass der generierte GitLab-Titel getrennt vom vierteiligen Markdown-Text gespeichert wird. Drei Publisher-Tests prüfen das aktuelle Format sowie die Abwärtskompatibilität zu älteren Kontextdokumenten, bei denen ein eingebetteter Titel entfernt oder aus dem Markdown rekonstruiert wird. Nicht getestet werden das tatsächliche Schreiben und Lesen von `context.md` und `context.json`, fehlende oder beschädigte Kontextdateien im vollständigen Publish-Pfad, GitLab-Fehler beim Löschen oder Aktualisieren und die Garantie, dass ohne vorherigen Process-Schritt keine produktive Änderung erfolgt. Letzteres ergibt sich zwar aus dem Lesezugriff auf die erforderliche Datei, ist aber nicht als Systemtest dokumentiert.

## 6.5 Simulation ohne reale GitLab- oder Opencode-Abhängigkeit

NFA-2 fordert ausdrücklich, dass Dev-Assist ohne reales GitLab-Projekt und ohne kostenpflichtigen KI-Aufruf testbar ist. Diese Anforderung ist im aktuellen Stand gut umgesetzt. Der Mock-Provider erzeugt eine deterministische Analyse. GitLab-Daten für die Repository-Zusammenfassung werden durch ein lokales Testobjekt bereitgestellt. Opencode wird durch temporäre ausführbare Testprogramme ersetzt. Die HTTP-Route läuft auf einem lokalen, zufällig vergebenen Port. Dadurch benötigt die Testsuite weder Zugangsdaten noch Netzwerkzugriff und kann schnell wiederholt werden.

Die Simulation erfüllt drei Zwecke. Erstens isoliert sie Fehler: Schlägt ein Schema-Test fehl, ist kein schwankendes Modellverhalten die Ursache. Zweitens verhindert sie Kosten und Seiteneffekte, etwa das Erstellen oder Löschen realer GitLab-Kommentare. Drittens verbessert sie die Wiederholbarkeit, weil dieselben Eingaben dieselben Ergebnisse erzeugen.

Eine Simulation kann den externen Vertrag jedoch nur dann zuverlässig vertreten, wenn die Testdoubles dessen Verhalten korrekt abbilden. Genau hier zeigt die Webhook-Signaturprüfung eine Grenze: Ein selbst erzeugter Test-HMAC kann eine intern konsistente, aber gegenüber GitLab falsche Implementierung bestätigen. Auch der simulierte Opencode-Prozess bildet nur die erwarteten Ausgabefälle ab. Änderungen an CLI-Argumenten, JSONL-Ereignissen oder Exportformaten werden erst sichtbar, wenn ein Test gegen eine reale unterstützte Version ausgeführt wird. Die vorhandenen Tests sind deshalb als Komponentenprüfungen zu bewerten, nicht als vollständige Ende-zu-Ende-Nachweise.

## 6.6 Webhook-Randfälle und Robustheitsbefunde

Die vorhandenen Testfälle decken mehrere für Webhook-Systeme typische Randfälle ab:

| Randfall | Erwartetes und getestetes Verhalten | Bewertung |
| --- | --- | --- |
| Ereignis ohne Mention | HTTP 202, keine Analyse, Grund `no-mention` | nachgewiesen |
| Kommentar des Bot-Kontos | wird als `self-authored` ignoriert | nachgewiesen |
| Generierter Dev-Assist-Kommentar | wird anhand von Markern ignoriert | nachgewiesen |
| Publish-Mention in einem Kommentar | Publish-Kommando wird erkannt | nachgewiesen, aber Aktivierungsregel zu tolerant |
| Fehlende oder ungültige lokale HMAC | je nach Konfiguration Ablehnung oder Entwicklungsfallback | für den implementierten Vertrag nachgewiesen |
| Ungültige oder zusätzliche KI-Felder | Schema-Validierung lehnt Antwort ab | nachgewiesen |
| Leere Ticketabschnitte | sichtbarer Platzhalter statt leerer Struktur | nachgewiesen |
| Markdown-Steuerzeichen in Modellinhalten | Struktur bleibt auf vier Hauptabschnitte begrenzt | nachgewiesen |
| Bereits beantwortete Rückfrage | ähnliche offene Frage wird entfernt | für die geprüften Formulierungen nachgewiesen |
| Opencode-Stream ohne finale Textantwort | Session wird exportiert und Analyse daraus gelesen | nachgewiesen |
| Systemnote beim Cleanup | wird nicht gelöscht | nachgewiesen |

Mehrere relevante Randfälle bleiben offen. Die In-Memory-Deduplication ist nicht automatisiert getestet. Es gibt keine Tests für zwei gleichzeitige Webhooks, identische Ereignisse ohne Ereignis-ID oder das Verhalten nach Ablauf der TTL. Unvollständige Payloads mit unbekannter Projekt- oder Issue-ID werden zwar defensiv in Strings überführt, aber nicht bis zum Processor verfolgt. Für den positiven Route-Pfad fehlt ein Test, der die schnelle HTTP-Antwort und den nachgelagerten Process-Aufruf gemeinsam beobachtet. Ebenso fehlen Last-, Langzeit- und Ressourcenprüfungen. NFA-3, NFA-7 und NFA-8 sind daher nur teilweise abgesichert.

## 6.7 Bewertungskriterien für die inhaltliche Ticketqualität

Die automatisierten Tests prüfen vor allem Struktur und Kontrollfluss. Die eigentliche Forschungsfrage betrifft jedoch auch die Nutzbarkeit der erzeugten Tickets. Dafür werden Kriterien benötigt, die über "JSON ist gültig" hinausgehen. Die Forschung aus Kapitel 2 bietet hierfür eine Grundlage.

Bettenburg et al. zeigen, dass Entwicklungsteams unter anderem Reproduktionsschritte, Stack Traces und Testfälle als hilfreich bewerten, während diese Informationen von meldenden Personen häufig nicht bereitgestellt werden (vgl. Bettenburg et al., 2008, S. 308 f.). Breu et al. identifizieren konkrete Informationsbedarfe wie Reproduktionsschritte, Versionen, Betriebssysteme, Beispiele, Ausgaben und Screenshots (vgl. Breu et al., 2010, S. 303). Chaparro et al. heben beobachtetes Verhalten, erwartetes Verhalten und Schritte zur Reproduktion hervor und zeigen, dass gerade diese Bestandteile oft fehlen (vgl. Chaparro et al., 2017, S. 396 f.). Lucassen et al. unterscheiden bei kurzen Anforderungen syntaktische, semantische und pragmatische Qualität (vgl. Lucassen et al., 2016, S. 383 f. und S. 386 f.). Aus diesen Arbeiten wird folgendes Bewertungsraster abgeleitet:

| Kriterium | Operationalisierung für Dev-Assist | Bewertungsskala |
| --- | --- | --- |
| Erkennung fehlender Informationen | Der Vorschlag oder die Rückfrage benennt fehlende Angaben zu Ziel, erwartetem Verhalten, Reproduktion, Randbedingungen oder Akzeptanz. | 0 = Lücke übersehen; 1 = allgemein benannt; 2 = konkret und kontextbezogen benannt |
| Präzision der Rückfragen | Fragen sind einzeln beantwortbar, beziehen sich auf vorhandenen Kontext und verlangen keine unnötigen internen Implementierungsentscheidungen. | 0 = unklar/irrelevant; 1 = teilweise präzise; 2 = präzise und handlungsorientiert |
| Strukturelle Nutzbarkeit | Titel, Beschreibung, Akzeptanzkriterien, technischer Kontext und Lösungsvorschlag sind getrennt, lesbar und ohne widersprüchliche Duplikate. | 0 = unbrauchbar; 1 = nachbearbeitungsbedürftig; 2 = direkt nutzbare Struktur |
| Prüfbarkeit | Akzeptanzkriterien beschreiben beobachtbare Ergebnisse und relevante Randfälle. | 0 = nicht prüfbar; 1 = teilweise prüfbar; 2 = eindeutig prüfbar |
| Grounding und Unsicherheitskennzeichnung | Der Vorschlag erfindet keine nicht belegten Fakten; Annahmen und offene Fragen bleiben sichtbar. | 0 = unbelegte Tatsachen; 1 = gemischt; 2 = konsequent abgesichert |
| Konsistenz mit dem Kontext | Ticketbeschreibung, Kommentare und gegebenenfalls Repository-Hinweise werden widerspruchsfrei zusammengeführt. | 0 = widersprüchlich; 1 = kleinere Inkonsistenzen; 2 = konsistent |

Das Raster wäre auf ein vorab festgelegtes Korpus anzuwenden, das mindestens unvollständige Bug Reports, vage Feature-Wünsche, bereits gute Tickets, widersprüchliche Kommentarverläufe und sicherheitskritische Eingaben enthält. Um die Modellvariabilität zu berücksichtigen, müsste jedes Szenario mehrfach und gegebenenfalls mit mehreren Modellkonfigurationen ausgeführt werden. Mindestens zwei fachkundige Bewertende sollten die Ergebnisse unabhängig beurteilen; Unterschiede wären anschließend zu diskutieren. Erst ein solcher Aufbau könnte belastbar beantworten, wie häufig Dev-Assist fehlende Informationen erkennt oder direkt nutzbare Vorschläge erzeugt.

Der aktuelle Teststand liefert dafür nur Teilindikatoren. Der Formatter erzwingt eine stabile Struktur. Das Kompaktschema verhindert freie Zusatzfelder. Das Mock-Szenario vermeidet bestimmte erfundene Implementierungsdetails. Beantwortete Fragen werden nicht erneut ausgegeben. Diese Befunde unterstützen syntaktische Qualität und einzelne Grounding-Regeln. Die semantische und pragmatische Qualität realer Opencode-Modellantworten wurde jedoch weder an einem Ticketkorpus noch durch Entwicklerinnen und Entwickler bewertet. Die Fragen "Erkennt der Assistent fehlende Informationen?", "Sind Rückfragen präzise?" und "Sind Vorschläge unmittelbar nutzbar?" können daher noch nicht allgemein bejaht werden.

NIST weist darauf hin, dass generative KI überzeugend formulierte, aber falsche oder irreführende Inhalte erzeugen kann (vgl. National Institute of Standards and Technology, 2024, S. 4 und S. 6). Schema-Validierung reduziert dieses Risiko nicht inhaltlich: Eine Halluzination kann syntaktisch korrekt in einem String stehen. Der kontrollierte Publish-Schritt bleibt deshalb auch bei guter Testabdeckung notwendig. Er ist kein Ersatz für inhaltliche Evaluation, aber eine wirksame Begrenzung möglicher Folgen.

## 6.8 Nachverfolgbarkeit der funktionalen Anforderungen

Der Abgleich mit den funktionalen Anforderungen aus Kapitel 3 ergibt ein differenziertes Bild:

| Anforderung | Vorhandene Evidenz | Ergebnis |
| --- | --- | --- |
| FA-1 Explizite Aktivierung am Textanfang | Parser- und Routentests | **Abweichung:** Mention wird auch im Titel und mitten im Text akzeptiert. |
| FA-2 Verarbeitung relevanter GitLab-Ereignisse | Issue-/Note-Parser und lokale Routentests | **Teilweise nachgewiesen:** Payload-Grundformen sind abgedeckt, aber keine reale GitLab-Lieferung und kein positiver Ende-zu-Ende-Pfad. |
| FA-3 Analyse-/Publish-Kommando | Parser-Tests für normale Aktivierung und Publish | **Nachgewiesen** für die getesteten Textformen; Position der Mention bleibt zu tolerant. |
| FA-4 Abruf des Ticketkontexts | Implementierung und simulierte Repository-Daten | **Teilweise nachgewiesen:** GitLab-Abruf im Processor ist nicht als Integrationstest abgedeckt. |
| FA-5 Gemeinsame Analyse von Beschreibung und Kommentaren | Prompt-Tests mit Issue, Kommentaren, Antworten und Repository-Summary | **Strukturell nachgewiesen**, semantische Zusammenführung durch ein reales Modell nicht bewertet. |
| FA-6 Gezielte Rückfragen | Formatter- und Clarification-Tests | **Teilweise nachgewiesen:** Darstellung und Wiederholungsfilter funktionieren; Präzision realer Modellfragen ist offen. |
| FA-7 Strukturierte Ticketvorschläge | Formatter-, Mock- und Publisher-Hilfstests | **Teilweise nachgewiesen:** vierteilige Kompaktstruktur ist stabil, aber umfangreichere Zielstruktur und fachliche Nutzbarkeit sind nicht vollständig belegt. |
| FA-8 Maschinenlesbares Analyseformat | sechs Schema-Tests | **Nachgewiesen für das aktuelle Kompaktschema**, zugleich Abweichung von der in Kapitel 3 geforderten umfangreicheren Struktur. |
| FA-9 Veröffentlichung als Kommentar | Formatter und Implementierung von `createNote` | **Teilweise nachgewiesen:** Kommentartext ist getestet, reale GitLab-Veröffentlichung nicht. |
| FA-10 Persistenz des Kontexts | Implementierung, Trennung von Titel und Markdown | **Teilweise nachgewiesen:** Dateischreib- und Lesepfad besitzt keinen eigenen automatisierten Integrationstest. |
| FA-11 Kontrollierter Publish | Cleanup- und Publisher-Hilfstests | **Teilweise nachgewiesen:** Aufbereitung und Filter sind geprüft, vollständige Mutation eines realen oder simulierten GitLab-Clients nicht. |

Der wichtigste positive Befund ist die klare Validierungs- und Freigabegrenze: Ein aktuelles Analyseobjekt muss exakt dem Kompaktschema entsprechen, und der Titel wird getrennt von der Beschreibung für den Publish vorbereitet. Der wichtigste funktionale Widerspruch betrifft FA-1. Hinzu kommt der Schema-Drift zwischen Zielanforderung und aktuellem Code. Beide Punkte sollten entweder implementierungsseitig korrigiert oder in den vorherigen Kapiteln als bewusst geänderte Anforderungen begründet werden.

## 6.9 Nachverfolgbarkeit der nicht-funktionalen Anforderungen

Auch die nicht-funktionalen Anforderungen sind unterschiedlich stark abgesichert:

| Anforderung | Bewertung |
| --- | --- |
| NFA-1 Wartbarkeit | Die Modulgrenzen sind im Quellcode klar und der Build ist erfolgreich. Eine eigenständige Wartbarkeitsmessung wurde nicht durchgeführt. |
| NFA-2 Testbarkeit ohne externe Abhängigkeiten | **Gut nachgewiesen:** alle 60 Tests laufen ohne reales GitLab und ohne realen Modellaufruf. |
| NFA-3 Robustheit | **Teilweise nachgewiesen:** ungültiges JSON, schwache Inhalte und einige Prozessvarianten sind abgedeckt; externe Fehlerketten, beschädigte Dateien und Parallelität fehlen. |
| NFA-4 Logging | Umfangreiche Konsolenlogs sind implementiert, ihre Vollständigkeit und Secret-Freiheit werden nicht automatisiert geprüft. |
| NFA-5 Begrenzung von KI-Risiken | Schema, Promptregeln, Grounding im Mock und expliziter Publish begrenzen Folgen. Prompt-Injection- und Halluzinationsresistenz realer Modelle sind nicht getestet. |
| NFA-6 Webhook-Sicherheit | **Nicht für das aktuelle Signing-Token-Verfahren nachgewiesen:** lokaler HMAC-Vertrag weicht von der aktuellen GitLab-Dokumentation ab; Zeitstempelfrische wird nicht geprüft. |
| NFA-7 Bot-Schleifen und Duplikate | Bot- und Markerfilter sind nachgewiesen; Deduplication und Parallelfälle sind ungetestet. |
| NFA-8 Schnelle Webhook-Antwort | HTTP 202 ist für ignorierte Ereignisse nachgewiesen; positiver asynchroner Pfad und Lastverhalten sind nicht gemessen. |
| NFA-9 Konfigurierbarkeit | Einzelne Variablen für Tunnel und Bot-Namen sind getestet; die Gesamtheit der Konfiguration und ungültige Werte sind nicht abgedeckt. |
| NFA-10 Prozessintegrierte Bedienbarkeit | Die Bedienung ist ohne eigene GUI über GitLab vorgesehen. Eine Usability- oder Feldbewertung mit Nutzenden fehlt. |

Insgesamt ist NFA-2 am stärksten belegt. Das Projekt lässt sich schnell und ohne Zugangsdaten testen. Bei Sicherheit, Robustheit unter externen Fehlern und Bedienbarkeit ist der Nachweis deutlich schwächer. Diese Bereiche sollten vor einem produktiven Einsatz priorisiert werden.

## 6.10 Grenzen und Bedrohungen der Aussagekraft

Easterbrook et al. unterscheiden unter anderem Konstruktvalidität, interne Validität, externe Validität und Reliabilität und empfehlen, Schwächen eines Untersuchungsdesigns explizit offenzulegen (vgl. Easterbrook et al., 2008, S. 302 f.). Auf die vorliegende Evaluation übertragen ergeben sich folgende Grenzen.

**Konstruktvalidität.** Die Zahl bestandener Tests ist kein direktes Maß für Ticketqualität. Die Tests operationalisieren vor allem technische Korrektheit, etwa Schemaform, Textformat oder Parserentscheidungen. Begriffe wie "präzise Rückfrage" oder "entwicklergerechtes Ticket" werden erst durch das Raster in Abschnitt 6.7 konkretisiert, aber noch nicht empirisch erhoben. Auch der erfolgreiche Build misst nur statische Konsistenz, nicht Laufzeitrobustheit.

**Interne Validität.** Tests und Implementierung stammen aus demselben Projektkontext. Dadurch können Testdoubles dieselben falschen Annahmen wie der Produktivcode enthalten. Die Signaturprüfung ist ein konkretes Beispiel: Die Tests erzeugen genau das Format, das die Implementierung erwartet, und erkennen deshalb die Abweichung zum aktuellen GitLab-Vertrag nicht. Außerdem können globale Umgebungsvariablen und Modulinitialisierung Testergebnisse beeinflussen, auch wenn die vorhandenen Tests ihre Änderungen überwiegend zurücksetzen.

**Externe Validität.** Der Testlauf betrifft ein einzelnes TypeScript-Projekt auf einer lokalen Windows-Umgebung. Es wurden weder unterschiedliche GitLab-Versionen noch selbstverwaltete Instanzen, reale Netzwerkfehler, verschiedene Opencode-Versionen oder unterschiedliche Modelle geprüft. Es gibt kein repräsentatives Ticketkorpus und keine Untersuchung mit Entwicklungsteams. Aussagen über andere Projekte, Organisationen, Sprachen oder Domänen sind daher nicht generalisierbar.

**Reliabilität.** Der deterministische Teil ist durch feste Testdaten, Mock-Objekte und dokumentierte Befehle gut wiederholbar. Der nichtdeterministische Kern wurde aus der Testsuite ausgeklammert. Das erhöht die Reproduzierbarkeit der technischen Tests, verhindert aber Aussagen über Streuung und Stabilität realer Modellantworten. Für eine spätere Replikation müssten Modell, Version, Prompt, Parameter, Zeitstempel, Ticketkorpus und Bewertungsprozess festgehalten werden.

Weitere technische Grenzen sind das Fehlen einer Coverage-Messung, fehlende Last- und Parallelitätstests, keine automatisierte Sicherheitsanalyse, keine Tests des Dateisystems unter Fehlerbedingungen und keine vollständige GitLab-Ende-zu-Ende-Prüfung. Easterbrook et al. weisen allgemein darauf hin, dass empirische Ergebnisse keine sichere Gewissheit erzeugen und durch ergänzende Methoden und Replikationen belastbarer werden (vgl. Easterbrook et al., 2008, S. 305). Für Dev-Assist wären insbesondere ein dokumentationskonformer GitLab-Vertragstest, ein kleines kuratiertes Ticketkorpus, wiederholte reale Modellläufe und eine Bewertung durch mehrere Entwicklerinnen und Entwickler sinnvolle Ergänzungen.

## 6.11 Zwischenfazit

Die Qualitätssicherung zeigt einen technisch stabilen, aber noch nicht vollständig validierten Prototyp. Der TypeScript-Build ist erfolgreich, und alle 60 automatisierten Tests in 15 Suiten bestehen. Besonders gut abgesichert sind das aktuelle kompakte JSON-Schema, die vierteilige Markdown-Ausgabe, die Erkennung eigener beziehungsweise generierter Kommentare, die Kommentarfilterung, die Verarbeitung beantworteter Rückfragen, Repository-Zusammenfassungen mit simulierten Abhängigkeiten und der Opencode-Export-Fallback. NFA-2, die lokale Testbarkeit ohne reale GitLab- oder KI-Abhängigkeit, wird damit überzeugend erfüllt.

Die Evaluation macht zugleich wesentliche Abweichungen sichtbar. Die Mention-Erkennung ist breiter als FA-1 und akzeptiert Vorkommen im Titel oder mitten im Text. Das aktuelle Kompaktschema weicht von der umfangreicheren Zielstruktur aus Kapitel 3 ab. Die Webhook-Signaturtests bestätigen einen lokalen HMAC-Vertrag, nicht das aktuelle GitLab-Signing-Token-Verfahren. Positive Ende-zu-Ende-Pfade für Process, Persistenz, Kommentarerstellung und Publish fehlen. Vor allem wurde die semantische Qualität realer Modellantworten noch nicht an einem Korpus oder mit Entwicklerinnen und Entwicklern bewertet.

Damit kann für den untersuchten Stand festgehalten werden: Die deterministischen Grenzen um die KI-Komponente sind in wichtigen Teilen testbar und stabil. Ein allgemeiner Nachweis, dass Dev-Assist fehlende Informationen zuverlässig erkennt, stets präzise Rückfragen stellt und unmittelbar nutzbare Ticketvorschläge erzeugt, liegt noch nicht vor. Für einen produktionsnahen nächsten Schritt sind die Korrektur und Prüfung des GitLab-Signaturverfahrens, die Entscheidung über die strikte Mention-Regel, ein konsistentes Zielschema, vollständige Process-/Publish-Integrationstests sowie eine wiederholte inhaltliche Evaluation mit realen Modellläufen erforderlich.

## Quellen zu Kapitel 6

Bettenburg, Nicolas; Just, Sascha; Schröter, Adrian; Weiss, Cathrin; Premraj, Rahul; Zimmermann, Thomas 2008. „What Makes a Good Bug Report?“, in Proceedings of the 16th ACM SIGSOFT International Symposium on Foundations of Software Engineering, S. 308-318. New York: ACM. https://doi.org/10.1145/1453101.1453146.

Breu, Silvia; Premraj, Rahul; Sillito, Jonathan; Zimmermann, Thomas 2010. „Information Needs in Bug Reports. Improving Cooperation Between Developers and Users“, in Proceedings of the 2010 ACM Conference on Computer Supported Cooperative Work, S. 301-310. New York: ACM. https://doi.org/10.1145/1718918.1718973.

Chaparro, Oscar; Lu, Jing; Zampetti, Fiorella; Moreno, Laura; Di Penta, Massimiliano; Marcus, Andrian; Bavota, Gabriele; Ng, Vincent 2017. „Detecting Missing Information in Bug Descriptions“, in Proceedings of the 2017 11th Joint Meeting on Foundations of Software Engineering, S. 396-407. New York: ACM. https://doi.org/10.1145/3106237.3106285.

Easterbrook, Steve; Singer, Janice; Storey, Margaret-Anne; Damian, Daniela 2008. „Selecting Empirical Methods for Software Engineering Research“, in Shull, Forrest; Singer, Janice; Sjøberg, Dag I. K. (Hrsg.): Guide to Advanced Empirical Software Engineering, S. 285-311. London: Springer. https://doi.org/10.1007/978-1-84800-044-5_11.

GitLab Docs o. J.a. Webhooks. https://docs.gitlab.com/user/project/integrations/webhooks/ (Zugriff vom 21.07.2026).

Lucassen, Garm; Dalpiaz, Fabiano; van der Werf, Jan Martijn E. M.; Brinkkemper, Sjaak 2016. „Improving agile requirements. The Quality User Story framework and tool“, in Requirements Engineering 21, 3, S. 383-403. https://doi.org/10.1007/s00766-016-0250-x.

National Institute of Standards and Technology 2024. Artificial Intelligence Risk Management Framework. Generative Artificial Intelligence Profile. NIST AI 600-1. https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf.

Wohlin, Claes; Runeson, Per; Höst, Martin; Ohlsson, Magnus C.; Regnell, Björn; Wesslén, Anders 2012. *Experimentation in Software Engineering*. Berlin, Heidelberg: Springer. https://doi.org/10.1007/978-3-642-29044-2.

Projektinterne Arbeitsgrundlagen: `AGENTS.md`, `README.md`, `package.json`, `src/config.ts`, `src/routes/gitlabWebhooks.ts`, `src/services/gitlab/parser.ts`, `src/services/gitlab/mention.ts`, `src/services/gitlab/auth.ts`, `src/services/gitlab/cleanup.ts`, `src/services/gitlab/glab.ts`, `src/services/ai/instructions.ts`, `src/services/ai/service.ts`, `src/services/ai/schema.ts`, `src/services/ai/formatter.ts`, `src/services/ai/clarifications.ts`, `src/services/ai/opencodeRuntime.ts`, `src/services/repositorySummary.ts`, `src/services/processing/processor.ts`, `src/services/processing/publisher.ts`, `src/services/context/writer.ts`, `src/services/context/reader.ts`, `src/services/tunnel.ts`, `tests/aiOpencode.test.ts`, `tests/aiPrompt.test.ts`, `tests/auth.test.ts`, `tests/cleanup.test.ts`, `tests/config.test.ts`, `tests/formatter.test.ts`, `tests/gitlab.test.ts`, `tests/glab.test.ts`, `tests/opencodeRuntime.test.ts`, `tests/processor.test.ts`, `tests/publisher.test.ts`, `tests/repositorySummary.test.ts`, `tests/schema.test.ts`, `tests/tunnel.test.ts` und `tests/webhookRoute.test.ts`.
