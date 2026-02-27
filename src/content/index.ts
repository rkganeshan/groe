/**
 * Content Script
 *
 * Runs in every page. Responsibilities:
 * - Inject the fetch/XHR interceptor into the page
 * - Relay messages between the page and the background service worker
 * - Listen for settings/rules changes from the background
 */

// Inject the interceptor script into the page context
function injectInterceptor(): void {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("injected/intercept.js");
  script.type = "text/javascript";
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
}

// Load initial state and pass to injected script
async function loadInitialState(): Promise<void> {
  try {
    const [settings, rules, groups] = await Promise.all([
      sendToBackground({ type: "GET_SETTINGS" }),
      sendToBackground({ type: "GET_RULES" }),
      sendToBackground({ type: "GET_GROUPS" }),
    ]);

    window.postMessage(
      {
        source: "groe-content",
        type: "INIT_STATE",
        payload: { settings, rules, groups },
      },
      "*",
    );
  } catch (err) {
    console.error("[GROE] Failed to load initial state:", err);
  }
}

// Send a message to background service worker
function sendToBackground(message: {
  type: string;
  payload?: unknown;
}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

// Listen for messages from the injected page script
window.addEventListener("message", async (event) => {
  if (event.source !== window) return;
  if (!event.data || event.data.source !== "groe-page") return;

  const { type, payload } = event.data;

  if (type === "REQUEST_INTERCEPTED") {
    // Forward intercept notification to background
    try {
      await sendToBackground({
        type: "REQUEST_INTERCEPTED",
        payload: {
          domain: window.location.hostname,
          operationName: payload.operationName,
          ruleId: payload.ruleId,
        },
      });
    } catch {
      // Ignore
    }
  }
});

// Listen for messages from the background service worker
chrome.runtime.onMessage.addListener(
  (message: { type: string; payload?: unknown }) => {
    if (
      message.type === "SETTINGS_CHANGED" ||
      message.type === "RULES_CHANGED"
    ) {
      // Forward to injected script
      window.postMessage(
        {
          source: "groe-content",
          type: message.type,
          payload: message.payload,
        },
        "*",
      );
    }
  },
);

// Initialize
injectInterceptor();

// Small delay to ensure injected script is ready
setTimeout(() => {
  loadInitialState();
}, 100);
