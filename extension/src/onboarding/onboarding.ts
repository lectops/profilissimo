import { $ } from "../utils/dom.js";
import {
  fetchInstallableProfiles,
  renderInstallList,
  openInAllProfiles,
  summarizeCascade,
  type RowEntry,
} from "../utils/multi-profile-install.js";

const hero = $("hero");
const heroTitle = $("hero-title");
const connectedPill = $("connected-pill");
const setupSection = $("setup-section");
const successDone = $("success-done");
const successMulti = $("success-multi");
const checkBtn = $("check-btn") as HTMLButtonElement;
const statusEl = $("status");
const statusDot = $("status-dot");
const statusText = $("status-text");
const doneBtn = $("done-btn") as HTMLButtonElement;
const installList = $("profile-install-list") as HTMLUListElement;
const installAllBtn = $("install-all-btn") as HTMLButtonElement;
const installStatus = $("install-status");
const skipLink = $("skip-link") as HTMLAnchorElement;

let multiEntries: RowEntry[] = [];

// --- Copy buttons ---

document.querySelectorAll(".copy-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const targetId = btn.getAttribute("data-target");
    if (!targetId) return;
    const codeEl = document.getElementById(targetId)?.querySelector("code");
    if (!codeEl?.textContent) return;

    try {
      await navigator.clipboard.writeText(codeEl.textContent);
      const original = btn.textContent;
      btn.textContent = "Copied!";
      setTimeout(() => {
        btn.textContent = original;
      }, 1500);
    } catch {
      // Clipboard permission denied — fail silently
    }
  });
});

// --- Connection check ---

checkBtn.addEventListener("click", async () => {
  checkBtn.disabled = true;
  checkBtn.textContent = "Checking...";
  statusEl.classList.add("hidden");

  try {
    const response = await chrome.runtime.sendMessage({ type: "health_check" });
    statusEl.classList.remove("hidden");

    if (response?.connected) {
      statusDot.className = "dot connected";
      statusText.textContent = "Connected";
      setTimeout(() => {
        void revealSuccess();
      }, 800);
    } else {
      statusDot.className = "dot disconnected";
      statusText.textContent = "Not connected — check the install steps above";
    }
  } catch {
    statusEl.classList.remove("hidden");
    statusDot.className = "dot disconnected";
    statusText.textContent = "Not connected — check the install steps above";
  } finally {
    checkBtn.disabled = false;
    checkBtn.textContent = "Check Connection";
  }
});

async function revealSuccess(): Promise<void> {
  setupSection.classList.add("hidden");

  const result = await fetchInstallableProfiles();
  const installableCount = result?.installable.length ?? 0;

  if (installableCount === 0) {
    // Branch A: pure celebration. Hero stays large.
    successDone.classList.remove("hidden");
    return;
  }

  // Branch B: one last step. Compact the hero, swap the celebratory copy
  // for a "connected" pill, and lead with the multi-profile CTA.
  hero.classList.remove("hero-large");
  hero.classList.add("hero-compact");
  heroTitle.textContent = "Profilissimo";
  connectedPill.classList.remove("hidden");

  multiEntries = renderInstallList({
    container: installList,
    installable: result!.installable,
    current: result!.current,
  });

  installAllBtn.textContent =
    installableCount === 1
      ? "Open Web Store in 1 other profile"
      : `Open Web Store in ${installableCount} other profiles`;

  successMulti.classList.remove("hidden");
}

// --- Done / skip ---

doneBtn.addEventListener("click", () => {
  window.close();
});

skipLink.addEventListener("click", (e) => {
  e.preventDefault();
  window.close();
});

// --- Multi-profile install action ---

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
