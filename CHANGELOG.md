# Changelog

All notable changes to GROE are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/).

---

## [1.0.0] — 2025-02-19

### Added

- **Core interception engine** — intercepts `fetch()` and `XMLHttpRequest` GraphQL requests at the page level.
- **Rule management** — full CRUD for mock rules via the options page.
- **Matching engine** — matches requests by endpoint pattern, operation name (exact or regex), query body regex, and variable conditions.
- **Variable conditions** — 7 operators: equals, not_equals, contains, regex, exists, not_exists, json_path.
- **Batched request support** — matches individual operations within a single batched GraphQL request.
- **Priority system** — when multiple rules match, the highest-priority rule wins.
- **Response delay** — configurable delay per rule to simulate slow responses.
- **Rule groups** — organize rules into named groups, toggle groups on/off.
- **Import / Export** — share rule configurations as JSON files.
- **Popup** — quick toggle, active rule count, interception counter, link to options.
- **Dark themed UI** — popup and options page with a dark color scheme.
- **Sample rules** — included in `examples/sample-rules.json` for quick onboarding.
- **40 unit tests** — covering the entire matching engine.

### Technical

- Chrome Extension Manifest V3.
- TypeScript 5.3, React 18, Webpack 5, Jest 29.
- Service worker architecture (background) with content script bridge.
- Injected interceptor runs in page context (vanilla JS, no module imports).
