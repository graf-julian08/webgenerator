# KI Web Generator Engine

## Übersicht
Die **Web Generator Engine** ist ein Multi-Modell System zur automatischen Erstellung von Webanwendungen und E-Commerce Plattformen auf Basis moderner Sprachmodelle.

## Projektstruktur & Architektur
- `build_app.js` & `generate.js`: Kernmodule zur Code- und Anwendungsgenerierung.
- `multi_model_strategy.js`: Logik zur Kombination verschiedener KI-Modellarchitekturen.
- `agentic-commerce-os/`: Subsystem für autonome Commerce-Agenten (Python Backend & Next.js Frontend).
- `anti_slop.js` & `heal_component.js`: Qualitätsprüfung und automatische Korrektur von generiertem Code.

## Hauptfunktionalitäten
- **Automatisierte App-Erstellung**: Generierung vollständiger Webprojekte aus Prompts.
- **Multi-Modell-Strategie**: Einsatz spezialisierter Modelle für verschiedene Entwicklungsschritte.
- **Selbstheilung & Validierung**: Automatische Identifikation und Korrektur von Code-Fehlern.

## Ausführung & Nutzung
Der Generierungsprozess wird mit Node.js über `node build_app.js` ausgeführt.

## Lizenz
Dieses Projekt steht unter der MIT-Lizenz.
