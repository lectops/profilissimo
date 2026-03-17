import type { ProfileInfo } from "../types/messages.js";
import { $ } from "../utils/dom.js";
import { profileLabel } from "../utils/format.js";

const profileList = $("profile-list") as HTMLUListElement;
const setupPrompt = $("setup-prompt") as HTMLDivElement;
const loading = $("loading") as HTMLDivElement;
const statusEl = $("status") as HTMLDivElement;
const settingsBtn = $("settings-btn") as HTMLButtonElement;
const refreshBtn = $("refresh-btn") as HTMLButtonElement;
const setupLink = $("setup-link") as HTMLAnchorElement;

const PROFILE_COLORS = [
  "#1a73e8", "#e8710a", "#d93025", "#188038",
  "#a142f4", "#e37400", "#129eaf", "#9334e6",
] as const;

function getProfileColor(index: number): string {
  return PROFILE_COLORS[index % PROFILE_COLORS.length];
}

let statusTimeout: ReturnType<typeof setTimeout> | null = null;
let transferring = false;

function showStatus(message: string, type: "success" | "error"): void {
  if (statusTimeout) clearTimeout(statusTimeout);
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  statusTimeout = setTimeout(() => statusEl.classList.add("hidden"), 2500);
}

function renderProfiles(profiles: ProfileInfo[]): void {
  profileList.replaceChildren();

  profiles.forEach((profile, index) => {
    const li = document.createElement("li");
    li.className = "profile-item";
    li.setAttribute("role", "button");
    li.tabIndex = 0;

    const colorDot = document.createElement("div");
    colorDot.className = "profile-color";
    colorDot.setAttribute("aria-hidden", "true");
    colorDot.style.backgroundColor = getProfileColor(index);
    colorDot.textContent = profile.name.charAt(0).toUpperCase();

    const name = document.createElement("span");
    name.className = "profile-name";
    name.textContent = profileLabel(profile);

    li.appendChild(colorDot);
    li.appendChild(name);
    li.addEventListener("click", () => void transferToProfile(profile));
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        void transferToProfile(profile);
      }
    });
    profileList.appendChild(li);
  });
}

async function transferToProfile(profile: ProfileInfo): Promise<void> {
  if (transferring) return;
  transferring = true;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) {
    transferring = false;
    showStatus("No URL to transfer", "error");
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: "transfer",
      url: tab.url,
      targetProfile: profile.directory,
      sourceTabId: tab.id,
    });

    if (response?.success) {
      showStatus(`Opened in ${profileLabel(profile)}`, "success");
    } else {
      showStatus(response?.error ?? "Transfer failed", "error");
    }
  } catch {
    showStatus("Transfer failed", "error");
  } finally {
    transferring = false;
  }
}

async function loadProfiles(forceRefresh = false): Promise<void> {
  loading.classList.remove("hidden");
  profileList.replaceChildren();
  setupPrompt.classList.add("hidden");

  try {
    const healthResponse = await chrome.runtime.sendMessage({ type: "health_check" });

    if (!healthResponse?.connected) {
      loading.classList.add("hidden");
      setupPrompt.classList.remove("hidden");
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: "get_profiles",
      forceRefresh,
    });

    loading.classList.add("hidden");

    if (response?.success && response.profiles) {
      renderProfiles(response.profiles);
    } else {
      showStatus(response?.error ?? "Failed to load profiles", "error");
    }
  } catch {
    loading.classList.add("hidden");
    showStatus("Failed to connect to extension", "error");
  }
}

settingsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

setupLink.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL("src/onboarding/onboarding.html") });
});

refreshBtn.addEventListener("click", () => void loadProfiles(true));

void loadProfiles();
