# GROE — GraphQL Request Override Extension

<p align="center">
  <img src="gql-icon.webp" alt="GROE" width="96" />
</p>

<p align="center">
  A Chrome Extension (Manifest V3) that intercepts GraphQL requests and returns mock or overridden responses based on configurable rules — without touching backend code, proxy servers, or application source.
</p>

---

## Why GROE?

Frontend developers and QA engineers frequently need to:

- **Test edge cases** — empty states, error conditions, large datasets
- **Develop features** before backend APIs are ready
- **Reproduce bugs** that depend on specific data states
- **Demo features** with curated data in production-like environments
- **Simulate slow responses** to test loading states and timeouts

| Approach                       | Limitation                                 | GROE Advantage                                      |
| ------------------------------ | ------------------------------------------ | --------------------------------------------------- |
| Mock Server (Postman, etc.)    | Requires proxy config, CORS issues on prod | Zero infrastructure — runs entirely in browser      |
| Code Modifications (MSW, etc.) | Pollutes codebase, can't use in production | No code changes, works on any site                  |
| Browser DevTools Override      | Manual, no persistence, no conditions      | Automated rule-based matching with full persistence |

---

## Features

- **Mock mode** — block the request entirely and return a fake response
- **Override mode** — let the request hit the backend, then deep-merge your patches into the real response
- **Operation-level matching** — match by operation name (exact or regex), endpoint URL, query body regex, or variable conditions
- **Variable conditions** — 6 operators: equals, not_equals, contains, regex, exists, not_exists
- **Batched query support** — individually match operations within a single batched GraphQL request
- **Priority system** — when multiple rules match, the highest-priority rule wins
- **Response delay** — configurable delay per rule to simulate slow network
- **Rule groups** — organize rules into named groups, toggle groups on/off
- **Import / Export** — share rule sets across your team as JSON files
- **Override Query rewrite** — optionally supply a clean query for the backend when your app queries fields not yet in the schema
- **Dark themed UI** — easy on the eyes during long debug sessions

---

## Quick Start

### Prerequisites

| Tool    | Version                         |
| ------- | ------------------------------- |
| Node.js | 18+ (recommended: 20.x via nvm) |
| npm     | 9+                              |
| Chrome  | 116+ (Manifest V3 support)      |

### Install, Build, Load

```bash
# 1. Clone
git clone <repo-url>
cd superops-gql-interceptor

# 2. Install dependencies
npm install

# 3. Build
npm run build        # production (minified)
npm run dev          # or watch mode for development

# 4. Load into Chrome
#    → chrome://extensions → Enable "Developer mode"
#    → Click "Load unpacked" → Select the dist/ folder
```

After rebuilding, click the **reload ↻** button on the GROE card in `chrome://extensions`.

---

## Usage

### The Popup

Click the GROE icon in the toolbar:

| Element               | Description                               |
| --------------------- | ----------------------------------------- |
| **Toggle switch**     | Master ON/OFF for the entire extension    |
| **Active Rules**      | Number of currently enabled rules         |
| **Intercepted**       | Requests intercepted so far (per tab)     |
| **Manage Rules**      | Opens the full rule management page       |
| **Disable All Rules** | Turns off every rule (extension stays on) |

### Creating a Rule

Open **Manage Rules** (or right-click → Options) and click **+ New Rule**.

| Field               | Required | Description                                                                                              |
| ------------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| Rule Name           | Yes      | A label to identify the rule                                                                             |
| Group               | No       | Assign to a group for organization                                                                       |
| Endpoint Pattern    | No       | URL substring to match (default `/graphql`)                                                              |
| Operation Name      | No       | GraphQL operation name to match                                                                          |
| Match Type          | —        | `Exact` or `Regex`                                                                                       |
| Query Regex         | No       | Regex pattern against the full query body                                                                |
| Status Code         | Yes      | HTTP status code to return (e.g. `200`, `500`)                                                           |
| Priority            | No       | Higher number wins when multiple rules match                                                             |
| Delay (ms)          | No       | Simulated network delay                                                                                  |
| Variable Conditions | No       | Match only when specific variables are sent                                                              |
| Response Mode       | —        | **Mock** (block & return fake) or **Override** (merge into real)                                         |
| Response Body       | Yes      | The JSON to return (mock) or merge (override)                                                            |
| Override Query      | No       | _(Override mode only)_ Clean query to send to backend when your app queries fields not yet in the schema |

### Mock vs Override Mode

- **Mock** — the request never reaches the backend. GROE returns your response JSON directly. Use this for full control or when the API doesn't exist yet.
- **Override** — the request goes to the backend normally. GROE deep-merges your JSON on top of the real response. Use this to tweak specific fields while keeping real data for everything else.

### Variable Conditions

Match rules based on specific variable values sent in the request:

| Operator   | Checks                          |
| ---------- | ------------------------------- |
| Equals     | Exact match                     |
| Not Equals | Does not match                  |
| Contains   | Includes the text               |
| Regex      | Matches a pattern               |
| Exists     | Variable is present (any value) |
| Not Exists | Variable is missing             |

Supports dot-notation for nested paths (e.g. `input.assetId`).

### Groups

- Create groups from the sidebar (**+ New Group**)
- Assign rules to groups when creating/editing
- Toggle an entire group on/off
- Filter the rule list by group

### Import / Export

- **Export** — downloads all rules and groups as a `.json` file
- **Import** — load a previously exported file (replaces current rules)

> **Tip:** Commit exported JSON files to your repo so the team shares the same mock scenarios.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  Web Page                                            │
│  ┌──────────────────────────────────────────────┐    │
│  │ injected/intercept.js                        │    │
│  │ (patches fetch & XMLHttpRequest)             │    │
│  └──────────────────┬───────────────────────────┘    │
│                     │ window.postMessage              │
│  ┌──────────────────▼───────────────────────────┐    │
│  │ content/index.ts                             │    │
│  │ (relays messages between page & extension)   │    │
│  └──────────────────┬───────────────────────────┘    │
└─────────────────────┼────────────────────────────────┘
                      │ chrome.runtime.sendMessage
┌─────────────────────▼────────────────────────────────┐
│ background/index.ts (service worker)                 │
│ — reads rules & settings from chrome.storage.local   │
│ — manages badge, routes messages                     │
└──────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ popup/   → Quick toggle, stats, link to options     │
│ options/ → Full CRUD UI for rules & groups (React)  │
└─────────────────────────────────────────────────────┘
```

**Why 3 layers?** Chrome extensions can't directly access page JavaScript. The injected script runs in the page context where it _can_ override `fetch()` and `XMLHttpRequest`. The content script bridges page ↔ extension messaging.

### Data Flow

1. Page makes a `fetch()` or `XHR` call to a GraphQL endpoint.
2. The injected script parses the body → extracts `operationName`, `query`, `variables`.
3. Matching engine runs against all enabled rules (endpoint → operation → query → variables → priority).
4. **Mock mode:** blocks the request, returns the fake response.
5. **Override mode:** forwards the request to the backend, deep-merges the rule's response into the real response.
6. No match → request passes through untouched.

---

## Project Structure

```
src/
├── shared/            # Types, matching engine, storage layer
├── background/        # Service worker (message routing, badge)
├── content/           # Content script (bridge between page and extension)
├── popup/             # Browser action popup (toggle, stats)
├── options/           # Full rule management UI (React)
│   └── components/    # RuleCard, RuleEditor, Sidebar, Toast
└── __tests__/         # Unit tests (Jest)
public/
├── manifest.json      # Chrome Extension manifest (MV3)
├── icons/             # Extension icons (16, 32, 48, 128)
└── injected/          # Page-context interceptor script (vanilla JS)
```

### Key Files

| File                            | Purpose                                               |
| ------------------------------- | ----------------------------------------------------- |
| `src/shared/types.ts`           | All TypeScript interfaces and factory functions       |
| `src/shared/matching-engine.ts` | Core logic — matches a request against rules          |
| `src/shared/storage.ts`         | CRUD wrapper around `chrome.storage.local`            |
| `src/background/index.ts`       | Service worker — message router, badge management     |
| `src/content/index.ts`          | Content script — injects interceptor, relays messages |
| `public/injected/intercept.js`  | Vanilla JS — patches `fetch` and `XMLHttpRequest`     |

---

## Available Scripts

| Command         | Description                        |
| --------------- | ---------------------------------- |
| `npm run dev`   | Webpack watch mode (development)   |
| `npm run build` | Webpack production build → `dist/` |
| `npm test`      | Run Jest unit tests                |
| `npm run clean` | Delete the `dist/` folder          |

---

## Tech Stack

- **TypeScript 5.3** · **React 18** · **Webpack 5** · **Jest 29**
- Chrome Extension Manifest V3
- Zero external runtime dependencies beyond React

---

## Troubleshooting

| Problem                                        | Solution                                                                                                                                                 |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Extension not loading                          | Make sure you're pointing at `dist/`, not the project root                                                                                               |
| Changes not reflected                          | Rebuild (`npm run build`) and reload the extension in `chrome://extensions`                                                                              |
| "Service worker inactive"                      | Normal — MV3 service workers suspend after 5 min of inactivity                                                                                           |
| Content script not injecting                   | Refresh the target page after loading/reloading the extension                                                                                            |
| Override adds fields but app doesn't show them | If using Apollo Client, it drops response fields not in the query's selection set. Use the **Override Query** field to send a clean query to the backend |

---

## Contributing

We welcome contributions! Please follow these rules to keep the project stable:

### Workflow

1. **Fork** the repository and create a feature branch from `main`.
2. Make your changes.
3. **Write or update tests** for any new or changed functionality.
4. **Run the full test suite** and ensure all tests pass:
   ```bash
   npm test
   ```
5. **Manually test the flow** end-to-end:
   - Build the extension (`npm run build`)
   - Load `dist/` in Chrome
   - Verify your changes work in the popup, options page, and actual request interception
6. **Update `CHANGELOG.md`** with a summary of your changes under an `[Unreleased]` section (follow [Keep a Changelog](https://keepachangelog.com/) format).
7. Open a Pull Request with a clear description of what changed and why.

### Standards

- **All tests must pass.** PRs with failing tests will not be merged.
- **No untested features.** New logic (matching, interception, UI behaviour) must have corresponding test coverage.
- **Changelog is mandatory.** Every user-facing or developer-facing change must be documented in `CHANGELOG.md`.
- **Keep `intercept.js` vanilla JS.** The injected script cannot use imports, TypeScript, or build-time transforms — it's copied as-is into `dist/`.
- **Follow existing code style.** TypeScript strict mode, functional React components, CSS variables for theming.

### Commit Messages

Use clear, imperative commit messages:

```
feat: add variable condition "json_path" operator
fix: override mode preserves original response headers
docs: update README with override query usage
test: add batch request override tests
```

---

## FAQ

**Does GROE work on all websites?**
Yes — any site that makes GraphQL requests via `fetch()` or `XMLHttpRequest`.

**Do I need to refresh the page after changing rules?**
No. Rule changes take effect on the next request.

**Will GROE slow down my browsing?**
No. It only inspects POST requests to URLs matching your endpoint patterns (~2ms overhead). Unmatched requests pass through untouched.

**Can I use GROE on multiple tabs?**
Yes. Rules apply globally. The popup shows stats for the active tab.

**Can mock data accidentally ship to production?**
No. GROE is a browser extension — it only exists on machines where it's installed.

---

## License

MIT
