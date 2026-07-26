# 9 Fazit und Ausblick

Die vorliegende Arbeit untersuchte, wie unvollständige oder unstrukturierte GitLab-Tickets durch einen KI-gestützten Developer Assistant aufbereitet werden können und wie sich ein solches System kontrolliert in einen bestehenden Entwicklungsworkflow integrieren lässt. Ausgangspunkt war die Beobachtung, dass Tickets nicht nur Aufgabenlisten, sondern zugleich Kommunikations-, Dokumentations- und Übergabeartefakte sind. Ihre Qualität beeinflusst, ob Anforderungen verstanden, umgesetzt und überprüft werden können. Forschung zu Bug Reports und User Stories zeigt, dass benötigte Informationen häufig fehlen, unterschiedlich strukturiert sind oder erst durch Rückfragen im weiteren Verlauf entstehen (vgl. Bettenburg et al., 2008, S. 308 f.; Breu et al., 2010, S. 301 ff.; Lucassen et al., 2016, S. 383 f.).

Zur Bearbeitung dieser Problemstellung wurde Dev-Assist konzipiert, als TypeScript-/Express-Prototyp umgesetzt und technisch bewertet. Das System reagiert auf GitLab-Ereignisse, sammelt Ticket- und Kommentar-Kontext, ergänzt optional eine Repository-Zusammenfassung, ruft einen konfigurierten Analyseagenten auf und akzeptiert nur Antworten nach einem festen Schema. Abhängig von der Informationslage veröffentlicht es Rückfragen oder einen strukturierten Vorschlag. Die Übernahme in Titel und Beschreibung des Issues erfolgt erst nach einem gesonderten Publish-Kommando. Das Schlusskapitel verdichtet die Ergebnisse, beantwortet die Forschungsfragen und priorisiert die nächsten Entwicklungsschritte.

## 9.1 Zusammenfassung der Ergebnisse

Die theoretischen Grundlagen haben gezeigt, dass Ticketqualität mehrere Ebenen umfasst. Eine Beschreibung kann sprachlich korrekt sein und dennoch fachlich oder praktisch unzureichend bleiben. Für Bug Reports sind unter anderem beobachtetes Verhalten, erwartetes Verhalten und Reproduktionsschritte wichtig; für allgemeine Anforderungen kommen Ziel, Kontext, Abgrenzung, Randbedingungen und überprüfbare Akzeptanzkriterien hinzu (vgl. Chaparro et al., 2017, S. 396 f.; Lucassen et al., 2016, S. 386 f.). Kommentare und Anhänge sind dabei Teil des Arbeitskontexts, weil entscheidende Informationen häufig erst nach der ursprünglichen Ticketanlage entstehen.

Aus diesen Grundlagen wurde ein Anforderungsmodell für Dev-Assist abgeleitet. Der Assistent sollte explizit aktiviert werden, Issue- und Kommentar-Kontext gemeinsam auswerten, Informationslücken erkennen, Rückfragen oder strukturierte Vorschläge erzeugen, Modellantworten zur Laufzeit prüfen, Kontext persistieren und Änderungen nur kontrolliert veröffentlichen. Ergänzende nicht-funktionale Anforderungen betrafen Wartbarkeit, lokale Testbarkeit, Robustheit, Nachvollziehbarkeit, Sicherheit, Schleifenvermeidung und Konfigurierbarkeit.

Die Architektur übersetzt diese Anforderungen in getrennte Verantwortlichkeiten. Routen für HTTP-Anfragen sowie die Webhook-Verarbeitung bilden den Einstieg. GitLab-Module kapseln Parsing, Authentifizierung, Mention- und Kommandoerkennung sowie API-Zugriffe. Die KI-Schicht bündelt Promptaufbau, Mock- und OpenCode-Pfad, JSON-Auswertung, Schema und Formatierung. Repository-Zusammenfassung und Kontextdateien ergänzen die Analyse, während Processor und Publisher die beiden Prozessphasen orchestrieren. Dadurch schreibt das Modell nicht selbst nach GitLab, sondern liefert nur ein strukturiertes Analyseobjekt an deterministische Anwendungsteile.

Der finale Prototyp bildet diesen Kernworkflow technisch weitgehend ab. Ein Issue oder Kommentar mit `@dev-assist` kann einen Process-Lauf auslösen. Der Processor lädt verfügbaren Kontext und entscheidet nach der Analyse zwischen Klärungskommentar und vollständigem Vorschlag. Der Vorschlag enthält einen getrennten Titel sowie vier sichtbare Abschnitte für Beschreibung, Akzeptanzkriterien, technischen Kontext und Lösungsvorschlag; verbleibende offene Fragen werden sichtbar gehalten. `context.md` und `context.json` persistieren Beschreibung und Titel. Erst `@dev-assist publish` beziehungsweise ein manueller Publish-Aufruf aktualisiert das Issue.

Die Qualitätssicherung bestätigt die technische Stabilität wichtiger deterministischer Komponenten. Der TypeScript-Build ist erfolgreich, und 60 automatisierte Tests in 15 Suiten bestehen. Besonders abgesichert sind das aktuelle Kompaktschema, die Ausgabe im Markdown-Format, Parserentscheidungen, Kommentarfilter, beantwortete Rückfragen, Zusammenfassungen des Repositorys und OpenCode-Fallbacks. Gleichzeitig hat die Prüfung relevante Abweichungen sichtbar gemacht: Die Mention-Erkennung ist breiter als ursprünglich gefordert, das aktuelle Schema ist kompakter als die Zielstruktur aus Kapitel 3, die Signaturprüfung stimmt nicht mit dem geprüften aktuellen GitLab-Signing-Token-Vertrag überein, und vollständige positive Process-/Publish-Ende-zu-Ende-Tests fehlen.

Der wichtigste nicht erbrachte Nachweis betrifft die inhaltliche Modellqualität. Die Tests zeigen, dass die Anwendung schemawidrige Antworten abweist und formale Grenzen einhält. Sie zeigen nicht, ob reale Modelle fehlende Informationen zuverlässig erkennen, präzise Rückfragen stellen oder fachlich richtige Vorschläge erzeugen. Ebenso wurden weder Zeitersparnis noch Akzeptanzrate, Korrekturaufwand oder Verbesserung der Ticketqualität mit Entwicklungsteams gemessen. Dev-Assist ist deshalb als funktionsfähiger Proof of Concept und nicht als produktionsreifes oder allgemein validiertes System einzuordnen.

## 9.2 Beantwortung der Forschungsfragen

### 9.2.1 Erforderliche Informationen für umsetzbare und überprüfbare GitLab-Tickets

Die erste Forschungsfrage lautet, welche Informationen ein GitLab-Ticket enthalten muss, damit es von Entwicklerinnen und Entwicklern nachvollziehbar umgesetzt und überprüft werden kann. Die Ergebnisse zeigen, dass keine einzelne Textschablone für jede Ticketart ausreicht. Es lässt sich jedoch ein gemeinsamer Mindestbestand an Informationsarten bestimmen:

1. **Eindeutiger Gegenstand.** Ein prägnanter Titel muss benennen, welche Funktion, Änderung oder Störung behandelt wird.
2. **Problem beziehungsweise Ziel.** Die Beschreibung muss erklären, welcher Bedarf besteht, welcher Ist-Zustand problematisch ist oder welches Ergebnis erreicht werden soll.
3. **Fachlicher Kontext und Abgrenzung.** Betroffene Rollen, Systeme, Abläufe, Voraussetzungen und bewusste Nicht-Ziele müssen erkennbar sein, soweit sie für die Entscheidung relevant sind.
4. **Erwartetes und überprüfbares Verhalten.** Akzeptanzkriterien müssen beschreiben, woran eine korrekte Umsetzung erkannt werden kann. Bei Fehlern gehören insbesondere beobachtetes Verhalten, erwartetes Verhalten und nachvollziehbare Reproduktionsschritte dazu.
5. **Technische Evidenz und Randbedingungen.** Relevante Logs, Fehlermeldungen, Plattformangaben, Abhängigkeiten oder belegte Repository-Hinweise müssen verfügbar sein, ohne fachliche Ziele durch technische Annahmen zu ersetzen.
6. **Unsicherheit und offene Entscheidungen.** Fehlende Angaben, Annahmen, Widersprüche und offene Fragen müssen sichtbar bleiben, statt durch plausiblen Zusatztext verdeckt zu werden.

Der vom Prototyp verwendete Kompaktvertrag bildet diese Mindeststruktur teilweise ab. Die Felder `title` und `description` trennen Gegenstand und Zielbeschreibung. `acceptanceCriteria` enthält die Prüfkriterien, während `technicalContext` technische Hinweise erfasst. Das Feld `proposedSolution` hält einen vorläufigen Lösungsvorschlag fest. Verbleibende Unsicherheit steht in `openQuestions`. Der Lösungsvorschlag ist für die Übergabe hilfreich, gehört aber nicht in gleicher Weise zum fachlichen Mindestbestand wie Ziel und Akzeptanzkriterien. Er sollte als veränderbarer Vorschlag gekennzeichnet bleiben und darf keine ungeklärte Anforderung ersetzen.

Die Antwort auf die erste Forschungsfrage lautet daher: Ein umsetzbares und überprüfbares Ticket braucht nicht möglichst viel Text, sondern eine explizite Trennung von Ziel, Kontext, erwartbarem Verhalten, Prüfkriterien, belegten technischen Informationen und verbleibender Unsicherheit. Ticketartspezifische Profile müssen diese Grundstruktur ergänzen. Ein Bug Report benötigt andere Details als eine neue Funktion oder eine interne technische Aufgabe.

### 9.2.2 Kontrollierte Integration eines KI-gestützten Assistants in GitLab

Die zweite Forschungsfrage betrifft die technische Integration, sodass Analyse, Rückfragen, Vorschläge und Freigabe kontrolliert ablaufen. Der Prototyp zeigt hierfür eine Prozesskette aus sechs Schritten:

1. **Aktivierung und Ereignisfilter.** GitLab-Webhooks liefern Issue- oder Note-Ereignisse. Parser, Bot-Filter, Mention-Erkennung, die Auswertung von Kommandos und Deduplication bestimmen, ob eine Verarbeitung stattfinden darf.
2. **Kontextaufbereitung.** Issue, Kommentare und optionaler Kontext aus dem Repository werden gesammelt, gekürzt und als Daten für den Analyseprompt aufbereitet. Fehlende externe Daten führen nach Möglichkeit zu einem kontrollierten Fallback.
3. **Gekapselter Modellaufruf.** Ein definierter Provider beziehungsweise Agent erhält zentrale Regeln und den vorbereiteten Kontext. Das Modell bekommt keine unmittelbare Berechtigung zur Änderung des Issues.
4. **Deterministische Antwortgrenze.** Die Ausgabe muss JSON mit exakt festgelegten Feldern enthalten. Parsing und Laufzeitvalidierung trennen probabilistische Textgenerierung von der weiteren Anwendung.
5. **Vorschau, Rückfrage und Persistenz.** Je nach Informationslage veröffentlicht die Anwendung einen Klärungskommentar oder einen strukturierten Vorschlag und speichert den Kontext zusätzlich lokal.
6. **Explizite Freigabe.** Ein zweiter, bewusster Publish-Schritt liest den gespeicherten Vorschlag, bereitet Titel und Beschreibung auf und aktualisiert erst dann das GitLab-Issue.

Diese Architektur begrenzt insbesondere zwei Risiken. Erstens können Halluzinationen oder falsche Annahmen nicht vollständig verhindert werden, ihre unmittelbare Wirkung wird aber durch Schema, sichtbare offene Fragen und menschliche Freigabe reduziert. NIST beschreibt überzeugend formulierte falsche Inhalte als Confabulation beziehungsweise Hallucination (vgl. National Institute of Standards and Technology, 2024, S. 4 und S. 6). Zweitens wird übermäßige Handlungsfähigkeit vermieden, weil das Modell weder frei Werkzeuge auswählen noch selbst veröffentlichen darf; dies entspricht der Begrenzung des von OWASP beschriebenen Risikos "Excessive Agency" (vgl. OWASP, 2025b, Abschnitt "Excessive Agency").

Die Antwort auf die zweite Forschungsfrage lautet damit: Eine kontrollierte Integration entsteht nicht allein durch einen guten Prompt, sondern durch eine deterministische Anwendungshülle um das Modell. Ereignisprüfung, Kontextauswahl, minimale Berechtigungen, ein fester Datenvertrag, sichtbare Vorschau, Persistenz und getrennte Freigabe müssen gemeinsam umgesetzt werden. Prompt Injection, sensible Daten und Änderungen externer GitLab-Verträge erfordern zusätzliche Schutzschichten; ein formal gültiges Modellobjekt ist noch keine fachlich richtige oder sichere Entscheidung.

### 9.2.3 Übergreifende Antwort

Beide Forschungsfragen führen zu derselben übergreifenden Schlussfolgerung: KI kann die Anforderungsaufbereitung unterstützen, wenn Strukturierung und Prozesskontrolle stärker gewichtet werden als autonome Textproduktion. Dev-Assist ist deshalb sinnvoll als Kooperationssystem. Das System konsolidiert Informationen, erzeugt einen ersten strukturierten Stand und macht offene Punkte sichtbar. Menschen liefern Domänenwissen, klären Zielkonflikte, bewerten Annahmen und verantworten die Freigabe.

Damit wird das in der Einleitung formulierte Ziel auf Prototypebene erreicht. Es wurde ein System umgesetzt, das wiederkehrende Aufbereitungsaufgaben übernehmen kann, ohne menschliche Abstimmung vollständig zu ersetzen. Nicht erreicht ist der Nachweis, dass diese Unterstützung in realen Teams messbar Zeit spart oder dauerhaft bessere Tickets erzeugt. Die technische Machbarkeit ist belegt; die Prozesswirkung bleibt eine offene empirische Frage.

## 9.3 Beitrag und Grenzen der Arbeit

Die Arbeit liefert vier zusammenhängende Beiträge. Erstens wurde aus Literatur zu Requirements Engineering, User Stories und Bug Reports ein Qualitätsverständnis für GitLab-Tickets abgeleitet. Zweitens wurde daraus eine Architektur für einen ereignisgesteuerten, KI-gestützten und menschlich kontrollierten Ticketworkflow entwickelt. Drittens liegt mit Dev-Assist eine ausführbare Referenzimplementierung vor. Viertens macht die Evaluation nicht nur bestandene Tests, sondern auch Vertragsabweichungen, Validierungslücken und Grenzen der Aussagekraft transparent.

Gerade die festgestellten Abweichungen sind ein relevantes Ergebnis. Sie zeigen, dass Modularität und automatisierte Tests allein externe Verträge nicht garantieren. Die interne HMAC-Testlogik konnte bestehen, obwohl sie nicht dem geprüften aktuellen GitLab-Verfahren entsprach. Ebenso kann ein striktes JSON-Schema formal zuverlässig sein und dennoch eine gegenüber dem Anforderungsmodell reduzierte Struktur absichern. Qualitätssicherung muss deshalb Implementierung, Anforderungen, externe Spezifikationen und semantische Wirkung gemeinsam betrachten.

Die Aussagekraft bleibt durch das Untersuchungsdesign begrenzt. Der Prototyp wurde in einem einzelnen Projekt und einer lokalen Umgebung untersucht. Modellantworten waren nicht Teil einer wiederholten empirischen Evaluation. Es fehlen reale GitLab-Ende-zu-Ende-Läufe, mehrere Modelle, verschiedene Ticketarten, ein repräsentatives Korpus und Bewertungen durch Entwicklungsteams. Nach Easterbrook et al. sollten solche Einschränkungen in Software-Engineering-Untersuchungen explizit behandelt und durch ergänzende Methoden sowie Replikationen reduziert werden (vgl. Easterbrook et al., 2008, S. 302 f. und S. 305).

## 9.4 Priorisierter Ausblick

Die Weiterentwicklung sollte nicht mit zusätzlichen Funktionen beginnen, sondern mit der Absicherung des bereits vorhandenen Kernprozesses. Daraus ergeben sich drei aufeinander aufbauende Prioritätsstufen.

### 9.4.1 Priorität 1: Vertragskorrektheit und belastbare Evaluation

Zuerst muss die Webhook-Authentifizierung an den aktuellen GitLab-Signing-Token-Vertrag angepasst und mit dokumentationsnahen Payloads geprüft werden (vgl. GitLab Docs, o. J.a, Abschnitt "Signing tokens"). Parallel sind die Aktivierungsregel und das Zielschema verbindlich festzulegen. Die Mention sollte entweder bewusst tolerant bleiben oder entsprechend FA-1 auf den Anfang der ersten Inhaltszeile begrenzt werden. Für das Analyseformat sollte eine einzige formale Schemaquelle entstehen, aus der TypeScript-Typen, Laufzeitvalidierung, Formattertests und Dokumentation abgeleitet werden.

Anschließend werden vollständige Integrationstests benötigt. Ein positiver Process-Pfad sollte Webhook, Kontextabruf, Analyse, Kommentar und Dateipersistenz gemeinsam prüfen. Ein positiver Publish-Pfad sollte gespeicherten Kontext, Kommentarfilter und Issue-Aktualisierung abdecken. Fehlerfälle müssen GitLab-Ausfälle, Dateisystemfehler, ungültige Modellantworten, abgebrochene Prozesse und wiederholte Ereignisse umfassen.

Die wichtigste Erweiterung ist eine inhaltliche Evaluation. Dafür sollte ein anonymisiertes und nach Ticketarten ausgewogenes Korpus aufgebaut werden. Mehrere reale Modellläufe müssten mit festgehaltenem Modell, Version, Prompt, Parametern und Zeitstempel ausgeführt werden. Mindestens zwei fachkundige Bewertende sollten die Ergebnisse unabhängig prüfen. So lassen sich Stabilität, Modellunterschiede und Übereinstimmung der Bewertungen erfassen.

### 9.4.2 Bessere Metriken zur Ticketqualität

Eine spätere Bewertung sollte nicht allein Vollständigkeit oder Textlänge messen. Sinnvoll ist ein mehrdimensionales Raster:

- **Strukturelle Vollständigkeit:** Sind Ziel, Kontext, Akzeptanzkriterien, technische Evidenz und offene Fragen vorhanden?
- **Faktentreue:** Lässt sich jede konkrete Aussage auf Issue, Kommentar, Log oder Repository-Kontext zurückführen?
- **Qualität der Rückfragen:** Sind Fragen relevant, nicht redundant, beantwortbar und auf entscheidende Lücken gerichtet?
- **Prüfbarkeit:** Sind Akzeptanzkriterien beobachtbar, eindeutig und mit vertretbarem Aufwand testbar?
- **Nutzbarkeit:** Können Entwicklerinnen und Entwickler das Ticket verstehen und eine Umsetzung planen, ohne wesentliche Informationen erneut zu suchen?
- **Prozessaufwand:** Wie viel Zeit, Korrekturarbeit und zusätzliche Kommunikation entstehen im Vergleich zur manuellen Aufbereitung?

Aus diesen Dimensionen können konkrete Kennzahlen entstehen: Anteil unbelegter Aussagen, Präzision und Abdeckung erkannter Lücken, Zahl wiederholter Rückfragen, Akzeptanzrate von Vorschlägen, Umfang manueller Änderungen, Zeit bis zu einem freigabefähigen Ticket und Übereinstimmung mehrerer Bewertender. Eine solche Metrik darf fachliche Beurteilung nicht durch einen einzelnen automatischen Score ersetzen. Sie soll nachvollziehbar machen, an welcher Stelle der Assistant unterstützt oder Fehler erzeugt.

### 9.4.3 Priorität 2: Produktiver Betrieb, Monitoring und Governance

Nach Korrektur und Evaluation des Kernprozesses kann die Betriebsfähigkeit ausgebaut werden. Eine persistente Job-Queue sollte die asynchrone Verarbeitung, Wiederholungen und kontrollierte Fehlerzustände übernehmen. Persistente Schlüssel für Idempotenz und Deduplizierung müssen Neustarts und mehrere Instanzen abdecken. IDs zur Korrelation sollten Webhook, Analyse, Kommentar, Kontextdatei und Publish zu einem nachvollziehbaren Vorgang verbinden.

Monitoring sollte technische und fachliche Signale kombinieren. Dazu gehören Verfügbarkeit, Laufzeit, Providerfehler, Schemaablehnungen, Rückfragehäufigkeit, Publish-Fehler, Queue-Alter und Wiederholungsversuche. Ein Dashboard kann diese Zustände sichtbar machen, sollte aber erst auf stabilen Metriken aufbauen. Alerts sind insbesondere für dauerhaft fehlerhafte Provider, anwachsende Warteschlangen, Authentifizierungsfehler und ungewöhnliche Publish-Muster sinnvoll.

Ein Rechte- und Rollenkonzept muss festlegen, wer Analysen auslösen, Vorschläge prüfen und Issues veröffentlichen darf. GitLab-Projektrollen können eine Grundlage bilden, sollten aber im Publish-Pfad explizit geprüft werden. Für vertrauliche Projekte sind Datenklassifikation, Maskierung sensibler Inhalte, Aufbewahrungsfristen und Löschung lokaler Kontextdateien erforderlich. Prompt- und Schemaänderungen brauchen Eigentümerschaft, Review und Versionierung. OWASPs Hinweise zu Prompt Injection und begrenzter Agency unterstreichen, dass zusätzliche Funktionen und Berechtigungen nur minimal und kontrolliert vergeben werden sollten (vgl. OWASP, 2025a, Abschnitt "LLM01:2025 Prompt Injection"; OWASP, 2025b, Abschnitt "Excessive Agency").

### 9.4.4 Priorität 3: Funktionale Erweiterungen

Erst auf einem abgesicherten Kern bieten sich funktionale Erweiterungen an. Ticketartspezifische Profile könnten Bug Reports, neue Funktionen und technische Aufgaben unterschiedlich strukturieren. Eine Bild- und Screenshot-Verarbeitung könnte Anhänge kontrolliert abrufen, Dateitypen und Größen prüfen, OCR oder Vision einsetzen und Unsicherheiten sichtbar machen. Bildtext müsste dabei wie anderer externer Kontext als potenziell nicht vertrauenswürdig behandelt werden.

Weitere GitLab-Ereignisse könnten den Einsatzbereich erweitern, etwa Änderungen an Labels, Status oder Merge Requests. Solche Ereignisse sollten nur aufgenommen werden, wenn Trigger, Berechtigungen und Schleifenvermeidung eindeutig definiert sind. Eine optionale Benutzeroberfläche oder ein Dashboard könnte Vergleichsansichten, offene Freigaben, Modellstatus und Qualitätsmetriken anzeigen. Für den Kernprozess bleibt GitLab jedoch der primäre Arbeitsort; eine zusätzliche Oberfläche sollte konkrete Informations- oder Governance-Bedürfnisse lösen und keinen parallelen Schattenprozess erzeugen.

Schließlich könnten mehrere Modelle oder Provider vergleichend eingesetzt werden. Ein Providerwechsel darf nicht nur technisch funktionieren, sondern muss anhand desselben Ticketkorpus bewertet werden. Auch die Übergabe an nachgelagerte Entwicklungsagenten ist denkbar. Sie sollte weiterhin vom freigegebenen Kontext ausgehen und eine zusätzliche Berechtigungs- und Kontrollgrenze besitzen. Aus einem Ticketassistenten darf nicht unbeabsichtigt ein autonomer Änderungsagent mit zu weitreichenden Rechten werden.

## 9.5 Schlussfolgerung

Dev-Assist zeigt, dass generative KI in einen GitLab-basierten Ticketworkflow eingebettet werden kann, ohne die gesamte Prozesskontrolle an das Modell abzugeben. Der Prototyp erkennt aktivierte Ereignisse, bereitet Kontext auf, erzeugt Rückfragen oder strukturierte Vorschläge, validiert die Ausgabe, persistiert das Ergebnis und trennt Analyse von Veröffentlichung. Damit liegt ein nachvollziehbarer technischer Lösungsweg für die in der Einleitung formulierte Problemstellung vor.

Der entscheidende Erfolgsfaktor ist nicht möglichst autonome KI, sondern die Kombination aus relevanter Informationsstruktur, begrenztem Kontext, deterministischer Validierung und menschlicher Verantwortung. Diese Kombination macht den Ansatz praktisch anschlussfähig, verhindert aber nicht automatisch falsche Inhalte. Der nächste wissenschaftliche und technische Schritt besteht deshalb in der empirischen Bewertung realer Modellergebnisse und in der Absicherung des vollständigen GitLab-Prozesses.

In seinem aktuellen Stand ist Dev-Assist ein belastbarer Ausgangspunkt für weitere Forschung und Entwicklung, aber kein fertiges Produkt. Sein Wert liegt darin, sowohl die Möglichkeiten als auch die notwendigen Grenzen eines KI-gestützten Ticketassistenten konkret sichtbar zu machen. Wird der Kernvertrag korrigiert, die semantische Qualität systematisch gemessen und der Betrieb durch Rollen, Monitoring und Datenregeln ergänzt, kann aus dem Proof of Concept ein verantwortbar einsetzbares Assistenzsystem entstehen.

## Quellen zu Kapitel 9

Bettenburg, Nicolas; Just, Sascha; Schröter, Adrian; Weiss, Cathrin; Premraj, Rahul; Zimmermann, Thomas 2008. „What Makes a Good Bug Report?“, in Proceedings of the 16th ACM SIGSOFT International Symposium on Foundations of Software Engineering, S. 308-318. New York: ACM. https://doi.org/10.1145/1453101.1453146.

Breu, Silvia; Premraj, Rahul; Sillito, Jonathan; Zimmermann, Thomas 2010. „Information Needs in Bug Reports. Improving Cooperation Between Developers and Users“, in Proceedings of the 2010 ACM Conference on Computer Supported Cooperative Work, S. 301-310. New York: ACM. https://doi.org/10.1145/1718918.1718973.

Chaparro, Oscar; Lu, Jing; Zampetti, Fiorella; Moreno, Laura; Di Penta, Massimiliano; Marcus, Andrian; Bavota, Gabriele; Ng, Vincent 2017. „Detecting Missing Information in Bug Descriptions“, in Proceedings of the 2017 11th Joint Meeting on Foundations of Software Engineering, S. 396-407. New York: ACM. https://doi.org/10.1145/3106237.3106285.

Easterbrook, Steve; Singer, Janice; Storey, Margaret-Anne; Damian, Daniela 2008. „Selecting Empirical Methods for Software Engineering Research“, in Shull, Forrest; Singer, Janice; Sjøberg, Dag I. K. (Hrsg.): *Guide to Advanced Empirical Software Engineering*, S. 285-311. London: Springer. https://doi.org/10.1007/978-1-84800-044-5_11.

GitLab Docs o. J.a. Webhooks. https://docs.gitlab.com/user/project/integrations/webhooks/ (Zugriff vom 21.07.2026).

Lucassen, Garm; Dalpiaz, Fabiano; van der Werf, Jan Martijn E. M.; Brinkkemper, Sjaak 2016. „Improving agile requirements. The Quality User Story framework and tool“, in *Requirements Engineering* 21, 3, S. 383-403. https://doi.org/10.1007/s00766-016-0250-x.

National Institute of Standards and Technology 2024. *Artificial Intelligence Risk Management Framework. Generative Artificial Intelligence Profile*. NIST AI 600-1. https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf.

OWASP 2025a. LLM01:2025 Prompt Injection. OWASP Top 10 for LLM Applications 2025. https://genai.owasp.org/llmrisk/llm01-prompt-injection/ (Zugriff vom 25.06.2026).

OWASP 2025b. LLM06:2025 Excessive Agency. OWASP Top 10 for LLM Applications 2025. https://genai.owasp.org/llmrisk/llm062025-excessive-agency/ (Zugriff vom 25.06.2026).

Projektinterne Arbeitsgrundlagen: `AGENTS.md`, `README.md`, `package.json`, `opencode.json`, `src/config.ts`, `src/routes/gitlabWebhooks.ts`, `src/routes/issues.ts`, `src/services/gitlab/auth.ts`, `src/services/gitlab/parser.ts`, `src/services/gitlab/mention.ts`, `src/services/gitlab/commands.ts`, `src/services/gitlab/cleanup.ts`, `src/services/gitlab/client.ts`, `src/services/ai/instructions.ts`, `src/services/ai/service.ts`, `src/services/ai/schema.ts`, `src/services/ai/formatter.ts`, `src/services/ai/clarifications.ts`, `src/services/repositorySummary.ts`, `src/services/processing/processor.ts`, `src/services/processing/publisher.ts`, `src/services/context/writer.ts`, `src/services/context/reader.ts`, `src/utils/logger.ts` sowie die in Kapitel 6 aufgeführten Tests.
