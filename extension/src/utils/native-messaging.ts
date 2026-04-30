import type { NMHRequest, NMHResponse } from "../types/messages.js";

const NMH_NAME = "com.profilissimo.nmh";
const NMH_TIMEOUT_MS = 15_000;

function isProfileInfo(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.directory === "string" && typeof obj.name === "string";
}

function isNMHResponse(value: unknown): value is NMHResponse {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.success !== "boolean") return false;
  if (obj.error !== undefined && typeof obj.error !== "string") return false;
  if (obj.profiles !== undefined) {
    if (!Array.isArray(obj.profiles)) return false;
    if (!obj.profiles.every(isProfileInfo)) return false;
  }
  if (obj.config !== undefined) {
    if (typeof obj.config !== "object" || obj.config === null) return false;
  }
  return true;
}

function sendNativeMessage(request: NMHRequest): Promise<NMHResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error("Native messaging timed out"));
      }
    }, NMH_TIMEOUT_MS);

    chrome.runtime.sendNativeMessage(NMH_NAME, request, (response?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);

      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!isNMHResponse(response)) {
        reject(new Error("Native host returned an invalid response"));
      } else {
        resolve(response);
      }
    });
  });
}

export async function healthCheck(): Promise<{ connected: boolean; version?: string }> {
  try {
    const response = await sendNativeMessage({ action: "health_check" });
    return { connected: response.success, version: response.version };
  } catch {
    return { connected: false };
  }
}

export async function listProfiles(): Promise<NMHResponse> {
  return sendNativeMessage({ action: "list_profiles" });
}

export async function openUrlInProfile(url: string, targetProfile: string): Promise<NMHResponse> {
  return sendNativeMessage({ action: "open_url", url, targetProfile });
}

export async function openProfile(targetProfile: string): Promise<NMHResponse> {
  return sendNativeMessage({ action: "open_profile", targetProfile });
}

export async function getConfig(): Promise<{ defaultProfile: string | null; closeSourceTab: boolean }> {
  const response = await sendNativeMessage({ action: "get_config" });
  return response.config ?? { defaultProfile: null, closeSourceTab: false };
}

export async function setConfig(updates: { defaultProfile?: string | null; closeSourceTab?: boolean }): Promise<void> {
  await sendNativeMessage({ action: "set_config", ...updates });
}
