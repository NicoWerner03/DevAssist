# 3 Anforderungsanalyse

Nachdem Kapitel 2 die fachlichen und technischen Grundlagen beschrieben hat, konkretisiert dieses Kapitel die Anforderungen an Dev-Assist. Im Mittelpunkt stehen die Anforderungen, die sich aus dem GitLab-basierten Ticketprozess, aus der Ticketqualitätsforschung und aus den Risiken generativer KI für den Prototyp ergeben. Die Anforderungsanalyse bildet damit die Brücke zwischen Grundlagen und Systemarchitektur.

Dev-Assist soll unstrukturierte oder unvollständige GitLab-Issues nicht automatisch in fertige Entwicklungsaufgaben verwandeln, sondern deren Aufbereitung unterstützen. Das System soll erkennen, wann es angesprochen wird, vorhandenen Ticketkontext auswerten, fehlende Informationen sichtbar machen, strukturierte Vorschläge erzeugen und die Übernahme nur nach einem expliziten Publish-Kommando ermöglichen. Die Anforderungen betreffen deshalb sowohl die Qualität der entstehenden Tickets als auch die robuste, nachvollziehbare und kontrollierte Integration in GitLab.

## 3.1 Vorgehen und Grundlagen der Anforderungsanalyse

Die Anforderungen werden aus vier Quellen abgeleitet. Erstens werden die Erkenntnisse aus Kapitel 2 zu Ticketqualität, Informationslücken und Risiken von Large Language Models herangezogen. Zweitens wird der bisherige manuelle GitLab-Prozess betrachtet. Drittens fließt die projektinterne Zielbeschreibung ein, nach der Dev-Assist über `@dev-assist` aktiviert wird, bei fehlendem Kontext Rückfragen stellt, bei ausreichendem Kontext einen Vorschlag erzeugt und diesen erst nach `@dev-assist publish` übernimmt. Viertens wird der aktuelle Prototyp berücksichtigt, um die Anforderungen mit den technischen Rahmenbedingungen abzugleichen.

Requirements Engineering umfasst nach der öffentlichen Katalogseite zu ISO/IEC/IEEE 29148 die systematische Behandlung von Anforderungen über den Lebenszyklus hinweg und beschreibt zugehörige Informationsprodukte und Prozesse (vgl. ISO/IEC/IEEE, 2018, o. S.). Für Dev-Assist bedeutet das, dass Anforderungen nicht nur Funktionen beschreiben, sondern auch benötigte Informationen, Verarbeitungsschritte und Systemgrenzen. Da GitLab-Issues in einem agilen Entwicklungskontext entstehen, ist außerdem die kollaborative Dimension relevant: Agile Requirements Engineering ist stark mit Kommunikation, gemeinsamer Klärung und kontinuierlicher Anpassung verbunden (vgl. Inayat et al., 2015, S. 915 ff.). Dev-Assist muss sich daher in bestehende Kommunikation einfügen, statt sie durch einen isolierten Analysevorgang zu ersetzen.

Die fachlichen Anforderungen orientieren sich an Arbeiten zu User Stories und Bug Reports. Lucassen et al. unterscheiden syntaktische, semantische und pragmatische Qualitätsaspekte von User Stories (vgl. Lucassen et al., 2016, S. 386 f.). Ein Ticketvorschlag darf deshalb nicht nur formal gegliedert sein, sondern muss inhaltlich verständlich, konsistent und für Entwicklerinnen und Entwickler nutzbar bleiben. Chaparro et al. zeigen für Bug Descriptions, dass besonders beobachtetes Verhalten, erwartetes Verhalten und Reproduktionsschritte häufig fehlen (vgl. Chaparro et al., 2017, S. 396 f.). Diese Befunde werden hier nicht als unmittelbarer Nachweis für alle Ticketarten verstanden. Für Dev-Assist wird daraus abgeleitet, dass GitLab-Tickets Ziel, Kontext, erwartetes Ergebnis, Akzeptanzkriterien, offene Fragen und relevante Randbedingungen möglichst explizit enthalten sollten.

Die technische Seite ergibt sich aus GitLab-Webhooks, GitLab-APIs und dem Prototyp-Stack. Webhooks ermöglichen externe Reaktionen auf GitLab-Ereignisse; Issues API, Notes API und Discussions API stellen Ticket- und Kommentarverlauf bereit (vgl. GitLab Docs, o. J.a, o. S.; GitLab Docs, o. J.c, o. S.; GitLab Docs, o. J.d, o. S.; GitLab Docs, o. J.e, o. S.). Dev-Assist muss daher Ereignisse entgegennehmen, relevante Ereignisse erkennen, Kontext abrufen und Ergebnisse nach GitLab zurückschreiben können. Gleichzeitig sind LLM-Ausgaben fehleranfällig. NIST beschreibt Halluzinationen beziehungsweise Confabulations als überzeugend oder sicher präsentierte, aber fehlerhafte oder falsche Inhalte (vgl. National Institute of Standards and Technology, 2024, S. 4 und S. 6). Validierung, Rückfragen und menschliche Freigabe sind deshalb notwendige Bestandteile des Systementwurfs.

## 3.2 Beschreibung des bisherigen Prozesses

Der bisherige Prozess beginnt mit einem GitLab-Issue. Eine meldende Person beschreibt eine Anforderung, einen Fehler oder eine technische Aufgabe. Manche Tickets enthalten bereits Zielbeschreibung, Akzeptanzkriterien und Validierungshinweise; andere bestehen nur aus einer Idee, einem Screenshot, einer Fehlermeldung oder einem Gesprächsfragment. Damit ähnelt der Prozess den in der Forschung beschriebenen Bug-Tracking-Situationen, in denen meldende Personen häufig andere Informationen bereitstellen als Entwicklerinnen und Entwickler für die Bearbeitung benötigen (vgl. Bettenburg et al., 2008, S. 308 f.).

Fehlen Informationen, stellen Entwicklerinnen und Entwickler Rückfragen in den Kommentaren. Breu et al. zeigen, dass solche Rückfragen in Bug Reports unter anderem Reproduktionsschritte, Umgebung, Beispiele, Ausgaben und Screenshots betreffen können (vgl. Breu et al., 2010, S. 303). Übertragen auf GitLab-Issues bedeutet dies, dass die eigentliche Anforderung häufig nicht vollständig in der ursprünglichen Beschreibung steht, sondern schrittweise aus Titel, Beschreibung, Kommentaren, Antworten, Anhängen und Entscheidungen entsteht.

Dieser Ablauf erzeugt typische Probleme: Kontext ist verteilt, Wartezeiten entstehen durch manuelle Klärung, Rückfragen erfolgen unsystematisch, und nach der Klärung muss das Ticket oft erneut zusammengefasst und strukturiert werden. Ohne diesen Aufräumschritt bleibt das Ticket für Planung, Umsetzung und spätere Nachvollziehbarkeit schwer lesbar.

Dev-Assist soll den Prozess nicht ersetzen, sondern an dieser Stelle unterstützen. Das System wird nur aktiv, wenn ein Issue oder Kommentar mit `@dev-assist` beginnt. Danach analysiert es den vorhandenen Kontext, stellt bei fehlenden Informationen Rückfragen oder erzeugt bei ausreichendem Kontext einen strukturierten Vorschlag. Erst nach `@dev-assist publish` wird dieser Vorschlag übernommen. Fachliche Verantwortung und Freigabe bleiben damit beim Menschen.

Der gewünschte Zielprozess umfasst fünf Schritte:

1. Eine Person erstellt oder aktualisiert ein GitLab-Issue und spricht Dev-Assist mit `@dev-assist` an.
2. Dev-Assist prüft das Ereignis, liest den verfügbaren Issue- und Kommentar-Kontext und startet die Analyse.
3. Bei unzureichendem Kontext stellt Dev-Assist gezielte Rückfragen im Kommentarverlauf.
4. Bei ausreichendem Kontext erzeugt Dev-Assist einen strukturierten Ticketvorschlag mit Titel, Ziel, Umfang, Anforderungen, Akzeptanzkriterien, offenen Fragen, Risiken und Validierungsschritten.
5. Nach `@dev-assist publish` werden Dev-Assist-bezogene Kommentare bereinigt und Titel sowie Beschreibung des Issues durch den strukturierten Vorschlag ersetzt.

Dev-Assist wird damit als Prozesswerkzeug verstanden. Es verbessert die Qualität des Ticketartefakts, ohne GitLab als Arbeitsort zu verlassen oder eine zusätzliche Benutzeroberfläche einzuführen.

## 3.3 Zielgruppen des Systems

Dev-Assist richtet sich an alle Rollen, die am Entstehen und Nutzen von GitLab-Tickets beteiligt sind. Ihre Bedarfe unterscheiden sich und führen zu unterschiedlichen Anforderungen an Rückfragen, Strukturierung, Prüfbarkeit und Betrieb.

| Zielgruppe | Bedarf im Prozess | Konsequenz für Dev-Assist |
| --- | --- | --- |
| Meldende Personen und fachliche Stakeholder | Niedrige Einstiegshürde beim Formulieren von Anforderungen oder Fehlern | Dev-Assist darf keine perfekte Erstbeschreibung voraussetzen und muss verständliche Rückfragen stellen. |
| Product Owner und Projektverantwortliche | Besser strukturierte Tickets, klare Abgrenzung und nachvollziehbare Akzeptanzkriterien | Der Vorschlag muss Ziel, Nutzen, Scope, Out-of-Scope und Definition of Done sichtbar machen. |
| Entwicklerinnen und Entwickler | Bearbeitbare Aufgaben mit ausreichend Kontext und prüfbaren Kriterien | Der erzeugte Tickettext muss Umsetzung, Validierung und offene Annahmen klar trennen. |
| Qualitätssicherung | Prüfbarkeit der Umsetzung und klare erwartete Ergebnisse | Akzeptanzkriterien und Validierungsschritte müssen explizit aufgeführt werden. |
| Administratorinnen und Betreiber | Sicherer und wartbarer Betrieb der Webhook-Anwendung | Konfiguration, Logging, Fehlerverhalten und Signaturprüfung müssen nachvollziehbar sein. |

Für meldende Personen ist wichtig, dass Dev-Assist nicht mit technischen Detailfragen beginnt. Die projektinterne Ausrichtung sieht vor, dass der Assistent nach Anforderungen, Nutzerbedarf, Akzeptanzkriterien, Scope und Erfolgskriterien fragt, nicht nach konkreten Dateien oder Implementierungsdetails. Diese Abgrenzung ist fachlich sinnvoll, weil meldende Personen bestimmte für Entwickler hilfreiche Informationen oft nicht ohne Weiteres ermitteln oder verwertbar bereitstellen können (vgl. Bettenburg et al., 2008, S. 308 f.).

Für Entwicklerinnen und Entwickler zählt die spätere Nutzbarkeit. Der Vorschlag muss beschreiben, was gebaut oder geändert werden soll, ohne unbelegte Implementierungsentscheidungen zu treffen. Technische Hinweise sind nur aufzunehmen, wenn sie aus dem Ticketkontext hervorgehen oder ausdrücklich als Randbedingung genannt wurden. Für Product Owner und Qualitätssicherung sind Ziel, erwartetes Verhalten und Akzeptanzkriterien zentral, da nur so Priorisierung, Umsetzung und Abnahme möglich sind. Diese Logik passt auch zu Chaparro et al., die erwartetes Verhalten und Reproduktionsschritte als wichtige Bestandteile von Bug Descriptions beschreiben (vgl. Chaparro et al., 2017, S. 396 f.).

Für Betreiberinnen und Betreiber muss Dev-Assist kontrollierbar bleiben. Das System verarbeitet externe Webhook-Anfragen und nutzt generative KI. Daher müssen Secrets konfigurierbar sein, Ereignisse protokolliert werden, Signaturprüfungen für produktive Umgebungen erzwingbar sein und Fehler ohne unkontrollierte Issue-Änderungen behandelt werden.

## 3.4 Fachliche Anforderungen an die Ticketqualität

Das zentrale fachliche Ziel ist ein entwicklungsfähiges Ticket. In dieser Arbeit gilt ein Ticket als entwicklungsfähig, wenn eine Entwicklerin oder ein Entwickler die Aufgabe verstehen, umsetzen und überprüfen kann, ohne wesentliche Informationen aus verstreuten Kommentaren rekonstruieren zu müssen.

Dafür muss der Titel den Gegenstand knapp beschreiben, das Ziel den Nutzen oder das zu lösende Problem benennen und der Umfang klar abgegrenzt sein. Scope und Out-of-Scope verhindern, dass Tickets zu groß werden oder verschiedene Themen vermischen. Funktionale Anforderungen und Akzeptanzkriterien müssen explizit formuliert werden. Lucassen et al. betonen, dass User-Story-Qualität nicht nur an der Form, sondern auch an Bedeutung und Nutzbarkeit gemessen werden muss (vgl. Lucassen et al., 2016, S. 386 f.). Eine bloße sprachliche Umformulierung reicht daher nicht aus; Dev-Assist soll vorhandene Inhalte in prüfbare Aussagen überführen.

Offene Fragen, Risiken und Annahmen müssen sichtbar bleiben. Wenn Informationen fehlen, darf das System sie nicht durch scheinbar sichere Aussagen ersetzen. Das ist besonders wichtig, weil LLMs überzeugend wirkende, aber fehlerhafte Inhalte erzeugen können (vgl. National Institute of Standards and Technology, 2024, S. 4 und S. 6). Unsichere Ableitungen müssen daher als Annahmen oder offene Punkte erkennbar sein.

Aus diesen Qualitätszielen ergibt sich folgende Mindeststruktur:

| Bestandteil | Zweck |
| --- | --- |
| Zusammenfassung | Kurze Einordnung des Ticketinhalts und der Quelle des Vorschlags |
| Titel | Knappes, suchbares und handlungsorientiertes Issue-Thema |
| Ziel | Beschreibung des angestrebten Ergebnisses oder Nutzens |
| Scope | Inhalte, die ausdrücklich Teil des Tickets sind |
| Out-of-Scope | Inhalte, die nicht Teil des Tickets sind |
| User Stories | Rollenbezogene Beschreibung des erwarteten Nutzens, sofern sinnvoll ableitbar |
| Funktionale Anforderungen | Konkrete Verhaltensanforderungen an das System |
| Technische Hinweise | Nur explizit genannte technische Randbedingungen, keine erfundenen Implementierungsdetails |
| Umsetzungsschritte | Grobe, entwicklungsorientierte Arbeitsschritte ohne unnötige Tiefendetails |
| Definition of Done | Bedingungen, unter denen das Ticket als abgeschlossen gelten kann |
| Akzeptanzkriterien | Prüfpunkte für Abnahme und Qualitätssicherung |
| Offene Fragen | Fehlende Informationen, die nicht sicher abgeleitet werden können |
| Risiken und Annahmen | Unsicherheiten, Abhängigkeiten und mögliche Fehlinterpretationen |
| Validierungsschritte | Vorschläge, wie Umsetzung oder Fehlerbehebung geprüft werden kann |

Die Struktur ist bewusst umfangreicher als eine minimale User Story. Sie soll Tickets nicht künstlich aufblähen, sondern sichtbar machen, welche Informationen bereits vorhanden sind und welche fehlen. Wenn ein Abschnitt nicht sinnvoll gefüllt werden kann, muss Dev-Assist die Lücke benennen, statt leere Qualität zu simulieren.

## 3.5 Funktionale Anforderungen

Die funktionalen Anforderungen beschreiben, was Dev-Assist leisten muss. Die Nummerierung FA-1 bis FA-11 dient der Nachverfolgbarkeit in Konzeption, Implementierung und Evaluation.

**FA-1: Explizite Aktivierung durch `@dev-assist`.**  
Dev-Assist darf nur reagieren, wenn der erste inhaltliche Text eines Issues oder Kommentars mit `@dev-assist` beginnt. Führende Leerzeichen und einfache Markdown-Formatierungen wie Überschriften, Listenmarker oder Fettschreibung sollen toleriert werden. Dadurch analysiert das System keine beliebige GitLab-Kommunikation und reagiert nicht auf zufällige Erwähnungen im Fließtext.

**FA-2: Verarbeitung relevanter GitLab-Ereignisse.**  
Das System muss Work-item-/Issue-Ereignisse und Kommentarereignisse aus GitLab-Webhooks entgegennehmen können. Relevant ist ein Ereignis, wenn Issue-Beschreibung oder Kommentar Dev-Assist am Anfang ansprechen. GitLab-Webhooks liefern Ereignisse als HTTP-Anfragen an externe Anwendungen; GitLab dokumentiert dafür unter anderem Work-item-/Issue-bezogene Ereignisse und Comment Events (vgl. GitLab Docs, o. J.a, o. S.; GitLab Docs, o. J.b, Abschnitte "Work item events" und "Comment events"). Dev-Assist muss diese Payloads in ein internes, einheitliches Format überführen.

**FA-3: Unterscheidung zwischen Analyse- und Publish-Kommando.**  
Nach der Mention muss Dev-Assist zwischen Analyseanforderung und Publish-Kommando unterscheiden. Beginnt der restliche Kommentar mit `publish`, wird keine neue Analyse gestartet, sondern der zuletzt erzeugte strukturierte Kontext übernommen. Alle anderen Aktivierungen lösen die Analyse aus.

**FA-4: Abruf des relevanten Ticketkontexts.**  
Die Webhook-Payload reicht für die Analyse nicht immer aus. Dev-Assist muss deshalb, soweit möglich, das aktuelle Issue und die zugehörigen Kommentare über GitLab abrufen. Die Issues API stellt Issue-Daten bereit, die Notes API den Kommentarverlauf (vgl. GitLab Docs, o. J.c, o. S.; GitLab Docs, o. J.d, o. S.). Der Kommentarverlauf ist wichtig, weil Informationen häufig nachträglich ergänzt werden.

**FA-5: Analyse von Beschreibung und Kommentaren.**  
Dev-Assist muss Titel, Beschreibung, Kommentare und gegebenenfalls zusätzlichen Rohtext gemeinsam auswerten. Das System soll vorhandene und fehlende Informationen erkennen und zwischen Anforderungen, Akzeptanzkriterien, technischen Randbedingungen, offenen Fragen und Annahmen unterscheiden. Diese Anforderung folgt aus dem Charakter von Tickets als verteilte Arbeitsartefakte.

**FA-6: Rückfragen bei fehlenden Informationen.**  
Wenn wesentliche Informationen fehlen, muss Dev-Assist gezielte Rückfragen formulieren. Sie sollen fachliche Ziele, Nutzerbedarf, Scope, Akzeptanzkriterien, Randfälle und Erfolgskriterien betreffen, nicht interne Implementierungsdetails. Die Fragen müssen spezifisch genug sein, um den Ticketkontext tatsächlich zu verbessern. Diese Anforderung knüpft an die Forschung zu fehlenden Informationen in Bug Reports an (vgl. Breu et al., 2010, S. 303; Chaparro et al., 2017, S. 396 f.).

**FA-7: Erzeugung strukturierter Ticketvorschläge.**  
Wenn Hauptzweck, zentrale Anforderungen und Umfang ausreichend klar sind, muss Dev-Assist einen strukturierten Vorschlag nach Abschnitt 3.4 erzeugen. Der Vorschlag muss als neue Issue-Beschreibung nutzbar sein und darf ungesicherte Informationen nicht als Tatsachen darstellen. Offene Punkte werden als offene Fragen oder Annahmen markiert. Dieser Modus knüpft an Qualitätshilfen wie BEE an, das Bug Reports anhand zentraler Bestandteile wie beobachtetem Verhalten, erwartetem Verhalten und Reproduktionsschritten strukturiert; die breitere Dev-Assist-Struktur ist eine eigene Anforderung dieser Arbeit (vgl. Song/Chaparro, 2020, S. 1551 f.).

**FA-8: Maschinenlesbares Analyseformat.**  
Die KI-Ausgabe muss in einem definierten JSON-Format erfolgen. Das Format muss Felder für Zusammenfassung, Quellenbasis, Umsetzungsticket, Akzeptanzkriterien, technische Hinweise, offene Fragen, Risiken und Validierungsschritte enthalten. Das System muss die Antwort parsen und strukturell prüfen, bevor daraus ein Kommentar oder Kontextdokument entsteht.

**FA-9: Veröffentlichung als GitLab-Kommentar.**  
Das Analyseergebnis muss in GitLab sichtbar werden. Bei fehlendem Kontext postet Dev-Assist Rückfragen, bei ausreichendem Kontext einen vollständigen strukturierten Vorschlag. Der Kommentar muss deutlich machen, dass die Übernahme erst durch `@dev-assist publish` erfolgt.

**FA-10: Persistenz des strukturierten Kontexts.**  
Nach der Analyse muss Dev-Assist den strukturierten Kontext lokal in einem reproduzierbaren Pfad ablegen, etwa unter `.dev-assist/issues/<projectId>/<issueIid>/context.md`. Verfügbare Titel oder Metadaten sollen zusätzlich maschinenlesbar gespeichert werden. Diese Kontextdateien bilden die Grundlage für den Publish-Schritt und mögliche spätere Entwicklungsprozesse.

**FA-11: Kontrollierte Übernahme durch Publish.**  
Das Publish-Kommando muss den zuvor erzeugten Kontext lesen, Dev-Assist-bezogene Kommentare identifizieren, diese bereinigen und anschließend Titel sowie Beschreibung des GitLab-Issues aktualisieren. Publish darf nur nach erfolgreicher Analyse erfolgen. Die Anforderung begrenzt die Systemautonomie und passt zu OWASPs Risiko "Excessive Agency", bei dem LLM-basierte Systeme zu weitreichende Berechtigungen oder Handlungsspielräume erhalten (vgl. OWASP, 2025b, Abschnitt "LLM06:2025 Excessive Agency").

## 3.6 Nicht-funktionale Anforderungen

Die nicht-funktionalen Anforderungen beschreiben Qualitätsmerkmale für Betrieb, Wartung und Vertrauen. Da Dev-Assist Webhooks, GitLab-API-Zugriffe und generative KI verbindet, sind diese Anforderungen besonders relevant.

**NFA-1: Wartbarkeit durch klare Modulgrenzen.**  
Webhook-Verarbeitung, GitLab-Anbindung, Mention-Erkennung, KI-Analyse, Formatierung, Kontextpersistenz und Publish-Logik müssen getrennt nachvollziehbar sein. Klare Modulgrenzen erleichtern Änderungen, etwa den Austausch des KI-Providers oder die Erweiterung der GitLab-Operationen.

**NFA-2: Testbarkeit ohne echte GitLab- oder KI-Abhängigkeit.**  
Dev-Assist muss lokal testbar sein, ohne reale GitLab-Projekte oder kostenpflichtige KI-Aufrufe zu benötigen. Dafür braucht das System einen Mock-Modus für KI-Analysen und isolierbare Funktionen für Parser, Mention-Erkennung, Formatierung, Cleanup und Webhook-Authentifizierung. Wegen der Nichtdeterministik von LLM-Ausgaben müssen die deterministischen Systemteile besonders gut abgesichert werden.

**NFA-3: Robustheit gegenüber unvollständigem Kontext und externen Fehlern.**  
Das System muss mit fehlgeschlagenen GitLab-API-Aufrufen, unvollständigen Payloads, fehlenden Kommentaren oder ungültigen KI-Antworten umgehen können. Fehler sollen protokolliert und, soweit sinnvoll, mit Fallback-Daten behandelt werden. Wenn eine Analyse vollständig fehlschlägt, darf kein fehlerhafter Publish-Kontext entstehen.

**NFA-4: Nachvollziehbarkeit durch Logging.**  
Relevante Verarbeitungsschritte müssen über Konsolenausgaben nachvollziehbar sein: eingehende Requests, erkannte und ignorierte Ereignisse, Analysebeginn und -ende, Fehler, gepostete Kommentare, Kontextdateien, gelöschte Kommentare und aktualisierte Issues. Da keine separaten Logdateien vorgesehen sind, ist die Konsole die zentrale Beobachtungsquelle. Logging muss konkret sein, darf aber keine Secrets ausgeben.

**NFA-5: Begrenzung von KI-Risiken.**  
LLM-Ausgaben dürfen nicht ungeprüft zu produktiven Änderungen werden. Halluzinationen und Confabulations sind für generative KI ein bekanntes Risiko (vgl. National Institute of Standards and Technology, 2024, S. 4 und S. 6). Daher müssen KI-Antworten strukturell validiert, offene Fragen erhalten und Vorschläge erst nach expliziter Freigabe übernommen werden. Der Prompt muss zudem klarstellen, dass Ticketinhalte Daten und keine Systemanweisungen sind, da OWASP Prompt Injection als Risiko beschreibt, bei dem Eingaben das Verhalten eines LLM unbeabsichtigt verändern können (vgl. OWASP, 2025a, Abschnitt "LLM01:2025 Prompt Injection").

**NFA-6: Sicherheit der Webhook-Schnittstelle.**  
Dev-Assist muss eine Signatur- oder Tokenprüfung für Webhook-Anfragen unterstützen und produktiv erzwingbar machen. Lokale Entwicklung soll auch ohne eingerichtetes GitLab-Secret möglich bleiben. Für Tests kann ein toleranter Modus sinnvoll sein; produktiv muss die Integrität der Anfrage abgesichert werden.

**NFA-7: Vermeidung von Bot-Endlosschleifen.**  
Dev-Assist muss verhindern, dass eigene Kommentare neue Analysen auslösen. Dazu verarbeitet das System nur führende `@dev-assist`-Mentions, generierte Vorschläge beginnen nicht mit dieser Mention, und doppelte Ereignisse müssen innerhalb eines kurzen Zeitfensters ignoriert werden können.

**NFA-8: Schnelle Webhook-Antwort und asynchrone Verarbeitung.**  
GitLab-Webhooks sollten zeitnah mit einem erfolgreichen HTTP-Status beantwortet werden, während KI-Analysen länger dauern können (vgl. GitLab Docs, o. J.a, o. S.). Dev-Assist muss Webhook-Anfragen daher schnell mit einem erfolgreichen 2xx-Status, etwa 200 oder 201, beantworten und die Verarbeitung asynchron oder nachgelagert ausführen. So werden Timeouts und erneut gesendete Ereignisse vermieden.

**NFA-9: Konfigurierbarkeit des Betriebs.**  
Port, Log-Level, Mention-String, GitLab-Basis-URL, GitLab-Authentifizierung, KI-Provider, Modell, Timeout, Kontextverzeichnis und Signaturpflicht müssen über Umgebungsvariablen steuerbar sein. Secrets gehören in die `.env` und nicht in den Code. Diese Anforderung unterstützt Mock-Betrieb, `glab`, PAT-Fallback und spätere Modellerweiterungen.

**NFA-10: Prozessintegrierte Bedienbarkeit.**  
Dev-Assist soll keine zusätzliche grafische Oberfläche benötigen. Die Bedienung erfolgt über GitLab-Issues und Kommentare, sodass der Arbeitsfluss vertraut bleibt. Dashboards, Metriken oder separate Administrationsoberflächen sind mögliche Erweiterungen, aber nicht Teil des Kernumfangs.

## 3.7 Abgrenzung der Anforderungen

Dev-Assist soll nicht zu einem allgemeinen Entwicklungsagenten ausgeweitet werden. Die Arbeit konzentriert sich auf die Verbesserung von Software-Tickets.

Erstens führt Dev-Assist keine autonome Implementierung durch. Das System erzeugt strukturierte Tickets, Rückfragen und Vorschläge, schreibt aber keinen Produktivcode, erstellt keine Merge Requests und entscheidet nicht eigenständig über technische Umsetzung. Zweitens ersetzt Dev-Assist keine fachliche Priorisierung. Ob ein Ticket wichtig ist, wann es umgesetzt wird und welche Produktentscheidung dahintersteht, bleibt Aufgabe der verantwortlichen Personen. Drittens ersetzt der Assistent keine menschliche Prüfung: Der Publish-Schritt ist bewusst explizit.

Viertens bewertet Dev-Assist nicht die gesamte Qualität eines Projekts. Es geht nicht um Codequalität, Architekturqualität oder Produktmetriken, sondern um Struktur und Nutzbarkeit einzelner Tickets. Fünftens garantiert das System keine vollständige semantische Wahrheit. LLM-Ausgaben bleiben Vorschläge; Unsicherheiten müssen sichtbar bleiben, und die Verantwortung verbleibt beim Team.

Sechstens ist eine umfassende Bild- oder Screenshot-Interpretation nicht Kern der Anforderungsanalyse. Screenshots können Hinweise liefern und spätere Erweiterungen ermöglichen, für den Kernprozess steht jedoch die Strukturierung vorhandener textueller Informationen aus Beschreibung und Kommentaren im Vordergrund.

## 3.8 Priorisierung der Anforderungen

Für den Prototyp werden die Anforderungen nach ihrer Bedeutung für den Kernworkflow priorisiert. Muss-Anforderungen sind notwendig, Soll-Anforderungen verbessern Qualität, Betrieb oder Erweiterbarkeit, und Kann-Anforderungen sind sinnvoll, aber nicht Voraussetzung für den Kernnachweis.

| Priorität | Anforderungen | Begründung |
| --- | --- | --- |
| Muss | FA-1 bis FA-11, NFA-1 bis NFA-10 | Ohne expliziten Trigger, Analyse, Rückfragen, Vorschlag, Persistenz, Publish, Validierung, Logging, Konfiguration, Sicherheitsgrenzen und Schleifenvermeidung ist der Zielprozess nicht belastbar erfüllt. |
| Soll | Erweiterte Behandlung von Bild- und Screenshot-Kontext, zusätzliche GitLab-Metadaten, ausführlichere Fehlerdiagnosen | Diese Punkte verbessern den praktischen Nutzen, sind aber nicht erforderlich, um den Kernworkflow nachzuweisen. |
| Kann | Dashboard, quantitative Qualitätsmetriken, Rollen- und Rechtekonzept über GitLab hinaus | Diese Erweiterungen sind fachlich interessant, aber für den prototypischen Nachweis nicht erforderlich. |

Die Priorisierung spiegelt die Zielsetzung wider: Dev-Assist soll zeigen, dass ein KI-gestützter GitLab-Assistent Ticketinformationen in einem kontrollierten Workflow verbessern kann. Entscheidend sind daher Trigger-Erkennung, Kontextanalyse, strukturierte Ausgabe und menschlich kontrollierte Übernahme, nicht zusätzliche Oberflächen oder umfassende Produktivbetriebsfunktionen.

## 3.9 Zwischenfazit

Die Anforderungsanalyse zeigt, dass Dev-Assist zwei Ebenen verbinden muss. Fachlich soll das System unvollständige oder unstrukturierte GitLab-Issues in besser nutzbare Entwicklungsartefakte überführen. Dafür muss es fehlende Informationen erkennen, Rückfragen stellen, strukturierte Vorschläge erzeugen und Annahmen sichtbar machen. Technisch muss Dev-Assist GitLab-Ereignisse verarbeiten, Ticketkontext abrufen, KI-Ausgaben validieren, Ergebnisse zurückschreiben und den Publish-Schritt kontrolliert ausführen.

Besonders wichtig ist die Begrenzung der Systemautonomie. Die Forschung zu Ticketqualität begründet den Nutzen strukturierter Anforderungen, Akzeptanzkriterien und Rückfragen. Die Risiken generativer KI begründen, warum Dev-Assist keine Änderungen ohne Freigabe vornehmen darf. Daraus ergibt sich der zentrale Entwurfsansatz: Dev-Assist ist ein Assistenzsystem zur Ticketaufbereitung, kein autonomer Entscheider.

Die Anforderungen dieses Kapitels bilden die Grundlage für die Systemarchitektur im nächsten Kapitel. Dort wird beschrieben, wie Webhook-Handler, GitLab-API-Anbindung, Agenten-Analyse, Validierung, Kontextdateien, Kommentarverarbeitung und Publish-Funktion zusammenspielen.

## Quellen zu Kapitel 3

Bettenburg, Nicolas; Just, Sascha; Schröter, Adrian; Weiss, Cathrin; Premraj, Rahul; Zimmermann, Thomas 2008. „What Makes a Good Bug Report?“, in Proceedings of the 16th ACM SIGSOFT International Symposium on Foundations of Software Engineering, S. 308-318. New York: ACM. https://doi.org/10.1145/1453101.1453146.

Breu, Silvia; Premraj, Rahul; Sillito, Jonathan; Zimmermann, Thomas 2010. „Information Needs in Bug Reports. Improving Cooperation Between Developers and Users“, in Proceedings of the 2010 ACM Conference on Computer Supported Cooperative Work, S. 301-310. New York: ACM. https://doi.org/10.1145/1718918.1718973.

Chaparro, Oscar; Lu, Jing; Zampetti, Fiorella; Moreno, Laura; Di Penta, Massimiliano; Marcus, Andrian; Bavota, Gabriele; Ng, Vincent 2017. „Detecting Missing Information in Bug Descriptions“, in Proceedings of the 2017 11th Joint Meeting on Foundations of Software Engineering, S. 396-407. New York: ACM. https://doi.org/10.1145/3106237.3106285.

GitLab Docs o. J.a. Webhooks. https://docs.gitlab.com/user/project/integrations/webhooks/ (Zugriff vom 25.06.2026).

GitLab Docs o. J.b. Webhook events. https://docs.gitlab.com/user/project/integrations/webhook_events/ (Zugriff vom 25.06.2026).

GitLab Docs o. J.c. Issues API. https://docs.gitlab.com/api/issues/ (Zugriff vom 25.06.2026).

GitLab Docs o. J.d. Notes API. https://docs.gitlab.com/api/notes/ (Zugriff vom 25.06.2026).

GitLab Docs o. J.e. Discussions API. https://docs.gitlab.com/api/discussions/ (Zugriff vom 25.06.2026).

Inayat, Irum; Salim, Siti Salwah; Marczak, Sabrina; Daneva, Maya; Shamshirband, Shahaboddin 2015. „A systematic literature review on agile requirements engineering practices and challenges“, in Computers in Human Behavior 51, S. 915-929. https://doi.org/10.1016/j.chb.2014.10.046.

ISO/IEC/IEEE 2018. ISO/IEC/IEEE 29148:2018. Systems and software engineering - Life cycle processes - Requirements engineering. Öffentliche Katalogseite. https://www.iso.org/standard/72089.html.

Lucassen, Garm; Dalpiaz, Fabiano; van der Werf, Jan Martijn E. M.; Brinkkemper, Sjaak 2016. „Improving agile requirements. The Quality User Story framework and tool“, in Requirements Engineering 21, 3, S. 383-403. https://doi.org/10.1007/s00766-016-0250-x.

National Institute of Standards and Technology 2024. Artificial Intelligence Risk Management Framework. Generative Artificial Intelligence Profile. NIST AI 600-1. https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf.

OWASP 2025a. LLM01:2025 Prompt Injection. OWASP Top 10 for LLM Applications 2025. https://genai.owasp.org/llmrisk/llm01-prompt-injection/ (Zugriff vom 25.06.2026).

OWASP 2025b. LLM06:2025 Excessive Agency. OWASP Top 10 for LLM Applications 2025. https://genai.owasp.org/llmrisk/llm062025-excessive-agency/ (Zugriff vom 25.06.2026).

Song, Yang; Chaparro, Oscar 2020. „BEE. A Tool for Structuring and Analyzing Bug Reports“, in Proceedings of the 28th ACM Joint Meeting on European Software Engineering Conference and Symposium on the Foundations of Software Engineering, S. 1551-1555. New York: ACM. https://doi.org/10.1145/3368089.3417928.

Projektinterne Arbeitsgrundlagen: `descriptions/project_description.txt`, `README.md`, `src/services/gitlab/parser.ts`, `src/services/gitlab/mention.ts`, `src/services/gitlab/commands.ts`, `src/services/gitlab/auth.ts`, `src/services/gitlab/cleanup.ts`, `src/services/ai/instructions.ts`, `src/services/ai/schema.ts`, `src/services/ai/formatter.ts`, `src/services/processing/processor.ts`, `src/services/processing/publisher.ts`, `src/services/context/writer.ts`, `src/routes/gitlabWebhooks.ts`, `src/routes/issues.ts`, `tests/gitlab.test.ts`, `tests/auth.test.ts`, `tests/cleanup.test.ts` und `tests/formatter.test.ts`.
