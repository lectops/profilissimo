import { $ } from "../utils/dom.js";
import { INSTALL_COMMAND, NMH_RELEASE_PAGE_URL } from "../utils/constants.js";
import {
  fetchInstallableProfiles,
  renderInstallList,
  openInAllProfiles,
  summarizeCascade,
  type RowEntry,
} from "../utils/multi-profile-install.js";

// --- Element refs ---

const setupSection      = $("setup-section");
const connectedPill     = $("connected-pill");
const checkBtn          = $("check-btn") as HTMLButtonElement;
const statusEl          = $("status");
const statusDot         = $("status-dot");
const statusText        = $("status-text");
const successDone       = $("success-done");
const successMulti      = $("success-multi");
const doneBtn           = $("done-btn") as HTMLButtonElement;
const installList       = $("profile-install-list") as HTMLUListElement;
const installAllBtn     = $("install-all-btn") as HTMLButtonElement;
const installStatus     = $("install-status");
const skipLink          = $("skip-link") as HTMLAnchorElement;
const manualDownloadLink = $("manual-download-link") as HTMLAnchorElement;
const copyBtn           = $("copy-btn") as HTMLButtonElement;
const cmdText           = $("cmd-text");

// --- Initialise static values ---

manualDownloadLink.href = NMH_RELEASE_PAGE_URL;
cmdText.textContent = INSTALL_COMMAND;

// --- Copy button ---

copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(INSTALL_COMMAND);
    const orig = copyBtn.textContent ?? "Copy";
    copyBtn.textContent = "Copied";
    setTimeout(() => {
      copyBtn.textContent = orig;
    }, 1600);
  } catch {
    // Clipboard permission denied — fail silently
  }
});

// --- Connection check ---

checkBtn.addEventListener("click", async () => {
  checkBtn.disabled = true;
  checkBtn.textContent = "Checking…";
  statusEl.classList.add("hidden");

  try {
    const response = await chrome.runtime.sendMessage({ type: "health_check" });
    statusEl.classList.remove("hidden");

    if (response?.connected) {
      statusDot.className = "verify__dot connected";
      statusText.textContent = "Helper app connected.";
      setTimeout(() => {
        void revealSuccess();
      }, 800);
    } else {
      statusDot.className = "verify__dot disconnected";
      statusText.textContent = "Not connected yet. Re-check the steps above.";
    }
  } catch {
    statusEl.classList.remove("hidden");
    statusDot.className = "verify__dot disconnected";
    statusText.textContent = "Not connected yet. Re-check the steps above.";
  } finally {
    checkBtn.disabled = false;
    checkBtn.textContent = "Check connection";
  }
});

// --- Reveal success (Branch A or B) ---

let multiEntries: RowEntry[] = [];

async function revealSuccess(): Promise<void> {
  setupSection.classList.add("hidden");

  const result = await fetchInstallableProfiles();
  const installableCount = result?.installable.length ?? 0;

  if (installableCount === 0) {
    // Branch A: no other profiles — pure celebration.
    successDone.classList.remove("hidden");
    return;
  }

  // Branch B: other profiles exist — show connected pill then step IV.
  connectedPill.classList.remove("hidden");

  multiEntries = renderInstallList({
    container: installList,
    installable: result!.installable,
    current: result!.current,
  });

  installAllBtn.textContent =
    installableCount === 1
      ? "Open the Web Store in 1 other profile →"
      : `Open the Web Store in ${installableCount} other profiles →`;

  successMulti.classList.remove("hidden");
}

// --- Done (Branch A) ---

doneBtn.addEventListener("click", () => {
  window.close();
});

// --- Skip (Branch B) ---

skipLink.addEventListener("click", (e) => {
  e.preventDefault();
  window.close();
});

// --- Install all (Branch B) ---

installAllBtn.addEventListener("click", async () => {
  if (multiEntries.length === 0) return;

  installAllBtn.disabled = true;
  installAllBtn.textContent = "Opening…";
  installStatus.classList.add("hidden");
  installStatus.className = "install-status";

  const result = await openInAllProfiles(multiEntries);
  const summary = summarizeCascade(result);

  installStatus.classList.remove("hidden");
  installStatus.classList.add(summary.tone);
  installStatus.textContent = summary.text;
  installAllBtn.textContent = summary.buttonLabel;
  installAllBtn.disabled = false;
});
