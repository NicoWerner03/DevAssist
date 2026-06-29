# Sprechskript: GitLab Dev-Assist

20-Minuten-Fassung zur Präsentation `gitlab-dev-assist-zweitgutachter-20min.pptx`

## Zeitplan

| Folie | Thema | Zeit |
| --- | --- | ---: |
| 1 | Titel und Ziel | 1:00 |
| 2 | Ausgangslage | 1:15 |
| 3 | Problem im Issue-Prozess | 1:15 |
| 4 | Fachlicher Bezug | 1:30 |
| 5 | Leitfrage und Ziel | 1:20 |
| 6 | Abgrenzung | 1:20 |
| 7 | Anforderungen | 1:30 |
| 8 | Ablauf im Betrieb | 1:15 |
| 9 | Architekturübersicht | 1:15 |
| 10 | Implementierungskomponenten | 1:20 |
| 11 | KI-Analyse und Ausgabeformat | 1:30 |
| 12 | Publish-Prozess | 1:10 |
| 13 | Automatisierte Tests | 1:20 |
| 14 | Manuelle Evaluation | 1:15 |
| 15 | Risiken und Gegenmaßnahmen | 1:30 |
| 16 | Beitrag und Abstimmung | 1:20 |

Gesamtdauer: ca. 20 Minuten.

## Kurzfassung in Stichpunkten

- GitLab-Issues sind zentrale Kommunikationsartefakte zwischen Anforderung, Entwicklung und Qualitätssicherung.
- Das Problem sind nicht nur kurze Tickets, sondern fehlende, verteilte oder nicht prüfbare Informationen.
- Dev-Assist soll Ticketkontext sammeln, Informationslücken erkennen und entweder Rückfragen oder strukturierte Vorschläge erzeugen.
- Die Arbeit verbindet Requirements Engineering, Ticketqualität, GitLab-Webhooks und KI-gestützte Kontextanalyse.
- Der Assistent arbeitet bewusst nicht autonom: keine Codeänderung, kein Merge, keine Ticketänderung ohne `@dev-assist publish`.
- Technisch besteht der Prototyp aus Webhook-Orchestrierung, GitLab-Anbindung, Opencode-Analyse, Publish-Flow, Bildreferenzbehandlung und Tests.
- Zentrale Sicherheitsidee: KI-Ausgaben werden als begrenztes JSON erwartet, validiert und erst nach menschlicher Freigabe übernommen.
- Die Evaluation kombiniert Unit-Tests, Webhook-Tests, Simulation und manuelle Demo-Szenarien.
- Wichtigster Abstimmungspunkt mit dem Zweitgutachter: Passt die Abgrenzung "Assistenz statt Autonomie" und reicht das Evaluationskonzept für die Bewertung?

## Ausformuliertes Sprechskript

### Folie 1: Titel und Ziel

Ich stelle heute mein Projekt GitLab Dev-Assist vor. Dabei geht es um einen KI-gestützten Assistenten, der GitLab-Issues analysiert und dabei hilft, unvollständige oder unstrukturierte Tickets in eine besser nutzbare Form zu bringen.

Der Fokus dieser Vorstellung liegt nicht nur auf der Funktion des Prototyps. Ich möchte vor allem zeigen, warum Ticketqualität im Entwicklungsprozess relevant ist, wie der Assistent technisch begrenzt in GitLab integriert wird und wie ich das Verhalten des Systems prüfbar validieren möchte.

Wichtig ist direkt zu Beginn die Abgrenzung: Dev-Assist ist kein autonomer Entwickler. Das System soll keine Tickets selbstständig umsetzen und keine Änderungen ohne Freigabe durchführen. Es ist als Assistenzsystem gedacht, das Kontext sammelt, Lücken sichtbar macht und strukturierte Vorschläge vorbereitet.

### Folie 2: Ausgangslage

Software-Tickets sind in vielen Entwicklungsprozessen der zentrale Ort, an dem Anforderungen, Fehler und fachliche Entscheidungen dokumentiert werden. In GitLab sind Issues damit nicht nur Aufgabenlisten, sondern Kommunikationsartefakte zwischen meldenden Personen, Produktverantwortlichen, Entwicklung und Qualitätssicherung.

Damit ein Ticket wirklich nutzbar ist, muss es mehrere Eigenschaften erfüllen. Es muss verständlich sein, damit alle Beteiligten denselben Sachverhalt meinen. Es muss eindeutig genug sein, damit Entwickler nicht zwischen mehreren Interpretationen wählen müssen. Und es muss prüfbar sein, damit am Ende klar ist, wann eine Umsetzung korrekt abgeschlossen ist.

In der Praxis entsteht der relevante Kontext aber häufig verteilt: ein Teil steht in der Beschreibung, ein Teil in Kommentaren, ein Teil in Screenshots oder Anhängen. Genau daraus entsteht der Engpass. Wenn zentrale Informationen fehlen, verschiebt sich der Aufwand in Rückfragen, Interpretation und manuelle Kontextsuche.

### Folie 3: Problem im GitLab-Issue-Prozess

Das konkrete Problem ist also nicht einfach, dass Tickets kurz sind. Ein kurzes Ticket kann gut sein, wenn es Ziel, Kontext und Prüfkriterien klar beschreibt. Problematisch wird es, wenn entscheidende Informationen fehlen oder über mehrere Stellen verteilt sind.

Typische Beispiele sind fehlende Reproduktionsschritte bei Fehlern, fehlendes erwartetes Verhalten, fehlende Logs oder nicht explizite Akzeptanzkriterien. Häufig gibt es später Kommentare, die wichtige Zusatzinformationen enthalten, oder Screenshots, die für das Verständnis zentral sind. Diese Informationen bleiben aber oft im Diskussionsverlauf und werden nicht sauber in die eigentliche Ticketbeschreibung überführt.

Für Entwickler bedeutet das: Sie starten nicht mit einer klaren Aufgabe, sondern müssen zuerst rekonstruieren, was eigentlich umgesetzt oder geprüft werden soll. Für meine Arbeit ist deshalb nicht nur Textgenerierung relevant, sondern kontrollierte Anforderungsaufbereitung im bestehenden GitLab-Workflow.

### Folie 4: Fachlicher Bezug

Fachlich lässt sich das über Requirements Engineering und Ticketqualität einordnen. Anforderungen sind nicht nur Texte, sondern prüfbare Kommunikationsartefakte. Sie sollen so dokumentiert sein, dass sie verstanden, umgesetzt und später validiert werden können.

Bei User Stories und Bug Reports zeigt sich ein ähnliches Muster: Die Form ist oft bewusst kompakt, aber genau dadurch entstehen Qualitätsdefekte. Für Fehlerberichte sind zum Beispiel beobachtetes Verhalten, erwartetes Verhalten und Schritte zur Reproduktion besonders wichtig. Wenn solche Informationen fehlen, entstehen Rückfragen und zusätzlicher Triaging-Aufwand.

Dev-Assist setzt an dieser Stelle an. Der Assistent soll nicht einfach mehr Text erzeugen, sondern relevante Informationen strukturieren. Wenn Informationen fehlen, soll er Rückfragen stellen. Wenn genug Kontext vorhanden ist, soll er eine strukturierte Ticketfassung vorschlagen. Damit unterstützt er Ticketpflege als wiederkehrenden Prozessschritt.

### Folie 5: Leitfrage und Ziel

Aus dieser Problemstellung ergeben sich zwei zentrale Perspektiven. Erstens: Welche Informationen braucht ein GitLab-Ticket, damit es für Entwickler umsetzbar und für Qualitätssicherung prüfbar ist? Zweitens: Wie kann ein KI-Assistent so in GitLab integriert werden, dass Analyse, Vorschlag und Übernahme kontrolliert ablaufen?

Das Ziel der Arbeit ist ein prototypischer Dev-Assist, der GitLab-Kontext sammelt, fehlende Informationen erkennt, gezielte Rückfragen stellt oder einen strukturierten Vorschlag für Titel und Beschreibung erzeugt.

Dabei ist wichtig, dass der Prototyp nicht nur als technische Spielerei betrachtet wird. Die technische Integration muss zur fachlichen Zielsetzung passen. Wenn die Arbeit Ticketqualität verbessern soll, muss das System zeigen, wie es Informationslücken behandelt, wie es Kontext verarbeitet und wie es seine eigenen Grenzen einhält.

### Folie 6: Abgrenzung

Die Abgrenzung ist ein zentraler Punkt der Arbeit. Dev-Assist soll keine Codeänderungen durchführen, keine Merge Requests erstellen und keine Tickets selbstständig umsetzen. Das System trifft auch keine Produktentscheidungen und ersetzt keine finale Abstimmung über Priorität, Scope oder Akzeptanzkriterien.

Außerdem darf es keine Annahmen als gesicherte Informationen ausgeben. Wenn der Kontext nicht reicht, ist die richtige Reaktion nicht Spekulation, sondern eine Rückfrage.

Das Kontrollprinzip lautet daher: Das Modell analysiert und formuliert. Die Anwendung validiert und begrenzt die Weiterverarbeitung. Eine tatsächliche Ticketänderung erfolgt erst nach einem expliziten Publish-Kommando durch einen Menschen. Diese Grenze ist wichtig, weil generative KI plausible, aber falsche Aussagen erzeugen kann. Der Prototyp soll deshalb Assistenz leisten, aber keine fachliche Verantwortung übernehmen.

### Folie 7: Anforderungen an Dev-Assist

Aus Problemstellung und Abgrenzung ergeben sich mehrere Anforderungen. Zunächst muss das System `@dev-assist` in Issues und Kommentaren zuverlässig erkennen. Außerdem muss es unterscheiden, ob jemand eine Analyse anstößt oder mit `@dev-assist publish` einen bereits erzeugten Vorschlag übernehmen möchte.

Für die Analyse muss der Assistent den vorhandenen Kontext sammeln: Titel, Beschreibung, Kommentare und Bildreferenzen. Dabei ist wichtig, dass er nicht nur den ursprünglichen Issue-Text betrachtet, weil relevante Informationen oft erst später in der Diskussion entstehen.

Auf der Ausgabeseite gibt es zwei Fälle. Wenn Kontext fehlt, soll Dev-Assist konkrete Rückfragen als Kommentar posten. Wenn ausreichend Kontext vorhanden ist, soll er einen strukturierten Vorschlag für Titel und Beschreibung erzeugen. Zusätzlich muss die Anwendung Bot-Schleifen vermeiden, Agent-Antworten zur Laufzeit validieren, Fehler loggen und GitLab schnell eine Webhook-Antwort zurückgeben.

### Folie 8: Ablauf im Betrieb

Der Ablauf beginnt in GitLab. Ein Issue oder Kommentar enthält `@dev-assist`. GitLab sendet daraufhin ein Webhook-Ereignis an den Express-Endpunkt der Anwendung.

Im Eingangsschritt prüft der Webhook grundlegende Eigenschaften wie Signatur, Payload und Bot-Loop-Schutz. Danach entscheidet das Routing, ob es sich um eine normale Analyse oder um einen Publish-Prozess handelt.

Im Analysepfad sammelt die Anwendung den Kontext aus Issue, Kommentaren und Bildreferenzen. Dieser Kontext wird an Opencode übergeben. Der Agent erzeugt entweder Rückfragen oder einen strukturierten Vorschlag. Im Publish-Pfad wird ein bestehender Vorschlag übernommen und das Issue aktualisiert.

Wichtig ist hier die technische Entkopplung: Die HTTP-Antwort an GitLab erfolgt schnell. Längere Schritte wie KI-Analyse oder Vision-Anreicherung laufen asynchron weiter, damit GitLab nicht auf die gesamte Verarbeitung warten muss.

### Folie 9: Architekturübersicht

Die Architektur ist bewusst modular aufgebaut. Der Eingang ist ein Express-Server mit dem Webhook-Endpunkt `/webhook/gitlab`. Dort kommen GitLab-Ereignisse an.

Die Orchestrierung liegt in `webhook.ts`. Diese Komponente prüft Signatur, Payload, Event-Typ und entscheidet über das Routing. Dadurch bleibt der Webhook der kontrollierte Eintrittspunkt in die Anwendung.

Die Fachlogik ist getrennt: Analyse, Publish, Mention-Erkennung und Antwortverarbeitung liegen in eigenen Modulen. Integrationen wie GitLab API, Opencode-Agent, Bildreferenzen und optionale Vision-Verarbeitung sind ebenfalls abgegrenzt.

Der Nutzen dieser Struktur ist Wartbarkeit und Testbarkeit. Wenn sich zum Beispiel die Publish-Logik ändert, muss nicht der gesamte Webhook umgebaut werden. Wenn sich das Agent-Antwortformat ändert, kann die Validierung isoliert betrachtet werden.

### Folie 10: Zentrale Implementierungskomponenten

Die wichtigsten Implementierungskomponenten lassen sich klar zuordnen. `webhook.ts` ist der kontrollierte Eintrittspunkt. Dort wird entschieden, ob ein Event ignoriert, analysiert oder als Publish-Kommando verarbeitet wird.

`agent-analysis.ts` sammelt den Kontext, baut den Prompt, ruft Opencode auf und verarbeitet die Antwort. Besonders wichtig ist hier das Parsen und Validieren des Agent-JSON.

`publish-command.ts` übernimmt den Freigabeprozess. Es sucht den letzten Vorschlagskommentar des Bots, extrahiert Titel und Beschreibung über Marker, aktualisiert das Issue und bereinigt Hilfskommentare.

Zusätzlich behandelt `image-references.ts` Screenshots und Upload-Verweise, damit Bilder nicht verloren gehen, wenn die Diskussion später bereinigt wird. Die Tests sichern diese Bausteine gegen typische Edge Cases ab.

### Folie 11: KI-Analyse und Ausgabeformat

Diese Folie ist für die Bewertung besonders wichtig. Der Agent darf nicht einfach beliebigen Fließtext erzeugen, der dann ungeprüft weiterverarbeitet wird. Stattdessen erwartet die Anwendung ein begrenztes JSON-Format.

Das zentrale Feld ist `hasQuestions`. Wenn `hasQuestions` true ist, erwartet die Anwendung ein Feld `questions`. Dann postet Dev-Assist Rückfragen. Wenn `hasQuestions` false ist, erwartet die Anwendung `proposedTitle` und `proposedDescription`. Nur dann kann ein Vorschlag erzeugt werden.

Die Anwendung extrahiert JSON auch aus Markdown-Codeblöcken, parst es und prüft die erwarteten Felder. Ungültige Antworten blockieren die Weiterverarbeitung und werden geloggt. Das löst nicht alle Risiken generativer KI, aber es macht die Schnittstelle zwischen Modell und Anwendung kontrollierter und testbarer.

### Folie 12: Publish-Prozess mit Freigabe

Der Publish-Prozess setzt das Prinzip menschlicher Kontrolle technisch um. Zunächst erzeugt der Bot nur einen Vorschlagskommentar. Dieser Kommentar enthält Marker für vorgeschlagenen Titel und vorgeschlagene Beschreibung.

Ein Mensch prüft diesen Vorschlag im GitLab-Issue. Erst wenn der Mensch `@dev-assist publish` schreibt, startet die Anwendung den Übernahmeprozess. Dann sucht sie den aktiven Vorschlag, extrahiert Titel und Beschreibung und aktualisiert das GitLab-Issue.

Anschließend werden Hilfskommentare bereinigt, damit die Diskussion nicht dauerhaft durch Arbeitskommentare des Assistenten belastet bleibt. Wichtig ist: Ohne aktiven Vorschlag wird nichts verändert. Das verhindert, dass ein Publish-Kommando ohne Grundlage produktive Ticketinhalte überschreibt.

### Folie 13: Automatisierte Teststrategie

Die automatisierte Teststrategie soll zeigen, dass zentrale technische Eigenschaften reproduzierbar funktionieren. Dazu gehören Unit-Tests für Mention- und Publish-Erkennung, damit das System nur auf relevante Eingaben reagiert.

Ein weiterer Schwerpunkt ist das Agent-Parsing. Getestet wird, ob valides JSON erkannt wird, ob JSON in Codeblöcken verarbeitet werden kann und ob ungültige Antworten abgelehnt werden.

Außerdem werden Bildreferenzen getestet, weil Screenshots im Ticketkontext erhalten bleiben sollen. Webhook-Tests prüfen Bad Requests, Bot-Self-Ignore, unbekannte Events und die direkte Webhook-Antwort vor der asynchronen Analyse.

Als Pflichtnachweis sind `npm test` und `npm run build` vorgesehen. Damit wird nicht nur die Fachlogik, sondern auch die TypeScript-Kompilierung abgesichert.

### Folie 14: Manuelle Evaluation und Demo

Neben automatisierten Tests braucht die Arbeit eine fachliche Evaluation. Dafür sind mehrere Demo-Szenarien vorgesehen.

Das erste Szenario ist ein unvollständiges Issue. Hier sollte Dev-Assist keine fertige Ticketfassung erfinden, sondern gezielte Rückfragen stellen. Das zweite Szenario ist ein vollständigeres Issue. Dort sollte der Assistent einen strukturierten Vorschlag erzeugen, der für Entwickler unmittelbar nutzbar ist.

Ein weiteres Szenario prüft Screenshot-Kontext. Bildreferenzen sollen im Vorschlag und nach Publish erhalten bleiben. Außerdem gibt es Negativfälle: irrelevante Events oder eigene Bot-Kommentare dürfen keine Analyse auslösen.

Bewertet wird also nicht nur, ob das System technisch antwortet, sondern ob Rückfragen präzise sind, Vorschläge nutzbar sind und Annahmen von gesicherten Informationen getrennt bleiben.

### Folie 15: Risiken und Gegenmaßnahmen

Der Einsatz generativer KI bringt mehrere Risiken mit. Das offensichtlichste Risiko sind Halluzinationen: Das Modell kann plausible, aber falsche Ergänzungen formulieren. Für Tickets wäre das problematisch, weil falsche Akzeptanzkriterien oder technische Annahmen direkt in Entwicklungsarbeit einfließen könnten.

Ein weiteres Risiko ist Prompt Injection. Tickettexte, Kommentare oder sogar Bildinhalte können Anweisungen enthalten, die das Modell beeinflussen sollen. Deshalb behandelt die Anwendung Ticketinhalte als Daten, nicht als Steuerbefehle.

Dazu kommen technische Risiken: Schnittstellenänderungen bei GitLab, glab oder Opencode sowie Fehler in asynchronen Analyse- oder Publish-Schritten.

Die Gegenmaßnahmen sind bewusst pragmatisch: Vorschlagsmodus statt Autonomie, explizites Publish, JSON-Validierung, Logging, Tests und Simulation. Der Kernpunkt ist: KI-Ausgaben müssen begrenzt, prüfbar und freigabepflichtig bleiben.

### Folie 16: Erwarteter Beitrag und Abstimmung

Zum Abschluss fasse ich den erwarteten Beitrag der Arbeit zusammen. Erstens entsteht ein prototypischer GitLab-Assistent für konkrete Ticket-Aufbereitung. Zweitens verbindet die Arbeit Ticketqualitätskriterien aus Requirements Engineering und Bug-Report-Forschung mit einem KI-gestützten GitLab-Workflow.

Drittens zeigt die Arbeit Architekturentscheidungen für eine kontrollierte Agenten-Integration: begrenzte Schnittstellen, Validierung und menschliche Freigabe. Viertens gehört ein Test- und Evaluationskonzept dazu, damit das Verhalten nicht nur demonstriert, sondern nachvollziehbar geprüft werden kann.

Der wichtigste Zweck des Gesprächs mit dem Zweitgutachter ist die frühe Abstimmung. Ich möchte klären, ob die Abgrenzung Assistenz statt Autonomie passend ist, ob Tests, Simulation und Demo-Szenarien als Evaluation ausreichen und welche Risiken in Diskussion und Fazit besonders betont werden sollten.

Damit ist die Präsentation nicht nur eine Projektvorstellung, sondern auch ein Abstimmungsinstrument für Scope und Bewertungskriterien der Bachelorarbeit.
