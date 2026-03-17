import { $ } from "../utils/dom.js";

const setupSection = $("setup-section");
const successSection = $("success-section");
const checkBtn = $("check-btn") as HTMLButtonElement;
const statusEl = $("status");
const statusDot = $("status-dot");
const statusText = $("status-text");
const doneBtn = $("done-btn") as HTMLButtonElement;
const quitShortcut = $("quit-shortcut");

// --- OS detection and tab switching ---

function detectOS(): "macos" | "linux" | "windows" {
  const ua = navigator.userAgent;
  if (ua.includes("Mac")) return "macos";
  if (ua.includes("Win")) return "windows";
  return "linux";
}

function showOS(os: string): void {
  // Toggle tabs
  document.querySelectorAll(".os-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.getAttribute("data-os") === os);
  });
  // Toggle command blocks
  document.querySelectorAll(".install-cmd").forEach((cmd) => {
    cmd.classList.toggle("hidden", cmd.id !== `cmd-${os}`);
  });
  // Update quit shortcut text
  if (os === "macos") {
    quitShortcut.textContent = "Cmd+Q";
  } else {
    quitShortcut.textContent = "Ctrl+Q";
  }
}

// Init OS tabs
const detectedOS = detectOS();
showOS(detectedOS);

document.querySelectorAll(".os-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const os = tab.getAttribute("data-os");
    if (os) showOS(os);
  });
});

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
      // Show success after a brief moment
      setTimeout(() => {
        setupSection.classList.add("hidden");
        successSection.classList.remove("hidden");
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

// --- Done button ---

doneBtn.addEventListener("click", () => {
  window.close();
});
