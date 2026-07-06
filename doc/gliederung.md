# Grobe Gliederung

## Dev-Assist

**Konzeption und Implementierung eines KI-gestützten Gitlab-Assistenten zur Verbsesserung der Qualität von Software-Ticktes**

## 1. Einleitung
- Ausgangssituation in der Softwareentwicklung
- Problemstellung: unvollständige oder schlecht strukturierte GitLab-Issues
- Ziel der Arbeit
- Forschungs- bzw. Leitfrage
- Angrenzung der Arbeit
- Aufbau der Arbeit


## 2. Theoretische und technische Grundlagen
- Anforderungen an gute Software-Tickets
- GitLab Issues, Kommentare und Webhooks
- Grundlagen zu Large Language Models und KI-Agenten
- Opencode als Agentenschnittstelle
- Node.js, TypeScript und Express
- Sicherheitsaspekte bei Webhooks

## 3. Anforderungsanalyse
- Beschreibung des bisherigen Prozesses
- Zielgruppen des Systems
- Funktionale Anforderungen
    - Erkennen von `@dev-assist`
    - Analyse von Issue-inhalten und Kommentaren
    - Rückfragen bei fehlenden Informationen 
    - Erzeugen strukturierete Ticketvorschläge
    - Übernahme per Publish-Kommando
- Nicht-funktionale Anforderungen
    - Wartbarkeit 
    - Testbarkeit
    - Robustheit
    - Nachvollziehbarkeit durch Logging
    - Vermeidung von Bot-Endlosschleifen

## 4. Konzeption der Systemarchitektur
- Gesamtarchitektur des Webhook-Systems
- Ereignisbasierter Ablauf über GitLab-webhooks
- Zentrale Komponenten
    - Webhook-Handler
    - GitLab-API-Anbindung
    - Agenten-Analyse
    - Prompt- und Antwortverarbeitung
    - Publish-Funktion
    - Bild- und Screenshot-Verarbeitung
    - Validierung und Tests
- Datenfluss vom GitLab-Issue bis zum aktualisierten Ticket
- Fehlerbehandlung und Sicherheitskonzept

## 5. Implementierung
- Aufbau des TypeScript-Projekts
- Express-Server und Webhook-Endpunkt
- Integration mit GitLab
- Integration des Opencode-Agenten
- Prompt-Design für die Ticketanalyse
- Verarbeitung der Agentenantworten als JSON
- Laufzeitvalidierung der Antwortformate
- Behandlung von Bildern und Screenshots im Ticketkontext
- Publis-Kommando zur Übernahme des Vorschlags
- Logging, Simulation und lokale Ausführung

## 6. Qualitätssicherung
- Teststrategie
- Unit- und Integrationstest
- simulation ohne echte GitLab- oder Opencode-Abhäigkeit
- Testfälle für Webhook-Edge-Cases
- Bewertungskriterien
    - Erkennt der Assistent fehlende Informationen?
    - Sind Rückfragen präzise?
    - Sind Ticketvorschläge strukturiert und nutzbar?
    - Bleibt das System robust bei fehlerhafte Eingaben?
- Grenzen der Evulation

## 7. Ergebnisse
- Beschreibung des finalen Prototyps
- Beispielhafter Ablauf
    - Issue wird erstellt
    - Assistent analysiert den Kontext
    - Rückfrage oder Vorschlag wird erzeugt
    - Vorschlag wird per Publish übernommnen
- Erfüllung der Anforderungen

## 8. Diskussion
- Nutzen um Entwicklungsprozess
- Grenzen KI-generierter Tickervorschläge
- Risiken
    - Halluzinationen
    - Datenschutz
    - falsche Annahmen
- Wartbarkeit und Erweiterbarkeit
- Vergleich mit manueller Tickerpflege

## 9. Fazit und Ausblick
- Zusammenfassung der Ergebnisse
- Beantwortung der Leitfrage
- Mögliche Erweiterungen
    - bessere Metriken zur Ticketqualität
    - UI oder Dashboard
    - Unterstützung weiterer GitLab-Events
    - Rechte- und Rollenkonzepte
    - produktiver Betrieb mit Monitoring??