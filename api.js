// ============================================================================
// api.js — shared helper for calling the Apps Script backend from the
// GitHub Pages frontend. Replaces google.script.run everywhere.
//
// IMPORTANT: Update APPS_SCRIPT_URL below to your actual deployed /exec URL.
// ============================================================================

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw-N2zOw96JwLSmDMiJfg95x7AQGAPlC_TXjmb49OP0JrVjTEyTxpSZswvUTF9iErZm/exec';

/**
 * Calls an Apps Script function by name with the given arguments.
 * Mirrors the google.script.run.functionName(args) pattern, but works
 * from any origin (like GitHub Pages) via a plain fetch() call.
 *
 * Usage:
 *   const result = await callApi('authenticateAgent', [username, password]);
 *   if (result.success) { ... }
 *
 * Note: Content-Type is deliberately 'text/plain' rather than
 * 'application/json'. Apps Script cannot answer CORS preflight (OPTIONS)
 * requests reliably, so we keep this a CORS "simple request" by avoiding
 * content types that trigger preflight. Apps Script still parses the body
 * as JSON on its end regardless of the declared content type.
 */
async function callApi(action, args = []) {
  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({ action, args })
    });

    if (!response.ok) {
      throw new Error('Network error: ' + response.status);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || 'Request failed');
    }

    return result.data;

  } catch (err) {
    console.error('callApi error (' + action + '):', err);
    throw err;
  }
}

// ============================================================================
// Require sign-in again after the app is backgrounded and resumed.
//
// This only fires on a genuine hidden -> visible cycle on the SAME loaded
// page (i.e. the user minimized the app / switched away and came back).
// It deliberately does NOT act just because the page starts hidden or
// happens to load already visible, which keeps it from misfiring during:
//   - normal in-app navigation (clicking any nav button/link fully unloads
//     the current page and loads a new one — the new page never receives a
//     "became visible again" transition, since it's a fresh instance)
//   - the Google Calendar connect flow (redirects out to Google and back,
//     which is also a fresh page load, not a resumed instance)
// ============================================================================
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'hidden') {
    if (sessionStorage.getItem('dka_role')) sessionStorage.setItem('dka_backgrounded', '1');
  } else if (document.visibilityState === 'visible' && sessionStorage.getItem('dka_backgrounded')) {
    sessionStorage.removeItem('dka_role');
    sessionStorage.removeItem('dka_id');
    sessionStorage.removeItem('dka_backgrounded');
    window.location.href = 'index.html';
  }
});
