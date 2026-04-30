// Profilissimo: cross-profile redirect bridge.
//
// Chrome silently drops chrome:// URLs (and some others) when forwarded to an
// already-running Chrome instance via CLI args. Workaround: pass a
// chrome-extension:// URL through the CLI (those Chrome accepts), then have
// this page navigate the *current tab* to the real target via chrome.tabs.
// Extension pages with the `tabs` permission can navigate to chrome:// URLs
// that CLI launches can't.
(function () {
  "use strict";

  var params = new URLSearchParams(location.search);
  var target = params.get("to");
  var msg = document.getElementById("msg");

  if (!target) {
    if (msg) msg.textContent = "Missing target URL.";
    return;
  }

  function fail(err) {
    if (msg) msg.textContent = "Couldn't open: " + (err && err.message ? err.message : "unknown error");
  }

  try {
    chrome.tabs.getCurrent(function (tab) {
      if (chrome.runtime.lastError) {
        fail(chrome.runtime.lastError);
        return;
      }
      if (!tab || tab.id === undefined) {
        // Fallback: the extension page somehow isn't a regular tab. Try plain
        // location nav (will fail for most chrome:// URLs but at least tries).
        try { location.href = target; } catch (e) { fail(e); }
        return;
      }
      chrome.tabs.update(tab.id, { url: target }, function () {
        if (chrome.runtime.lastError) fail(chrome.runtime.lastError);
      });
    });
  } catch (e) {
    fail(e);
  }
})();
