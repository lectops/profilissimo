export interface ProfileInfo {
  directory: string;
  name: string;
  email?: string;
  avatar?: string;
}

export interface OpenUrlRequest {
  action: "open_url";
  url: string;
  targetProfile: string;
}

export interface ListProfilesRequest {
  action: "list_profiles";
}

export interface HealthCheckRequest {
  action: "health_check";
}

export type NMHRequest = OpenUrlRequest | ListProfilesRequest | HealthCheckRequest;

type NMHAction = NMHRequest["action"];

export interface NMHResponse {
  success: boolean;
  error?: string;
  profiles?: ProfileInfo[];
}

const VALID_ACTIONS: NMHAction[] = ["open_url", "list_profiles", "health_check"];
const ALLOWED_URL_SCHEMES = ["http:", "https:"];

export const PROFILE_DIR_PATTERN = /^[a-zA-Z0-9 _-]+$/;

function isValidUrl(value: string): boolean {
  if (value.startsWith("-")) return false;
  try {
    const parsed = new URL(value);
    return ALLOWED_URL_SCHEMES.includes(parsed.protocol);
  } catch {
    return false;
  }
}

function isValidProfileDirectory(value: string): boolean {
  return PROFILE_DIR_PATTERN.test(value);
}

export function validateRequest(data: unknown): { valid: true; request: NMHRequest } | { valid: false; error: string } {
  if (typeof data !== "object" || data === null) {
    return { valid: false, error: "Message must be a JSON object" };
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj.action !== "string" || !VALID_ACTIONS.includes(obj.action as NMHAction)) {
    return { valid: false, error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(", ")}` };
  }

  const action = obj.action as NMHAction;

  if (action === "open_url") {
    if (typeof obj.url !== "string" || obj.url.length === 0) {
      return { valid: false, error: "open_url requires a non-empty 'url' field" };
    }
    if (!isValidUrl(obj.url)) {
      return { valid: false, error: "URL must use http: or https: scheme" };
    }
    if (typeof obj.targetProfile !== "string" || obj.targetProfile.length === 0) {
      return { valid: false, error: "open_url requires a non-empty 'targetProfile' field" };
    }
    if (!isValidProfileDirectory(obj.targetProfile)) {
      return { valid: false, error: "targetProfile contains invalid characters (must be alphanumeric, spaces, hyphens, or underscores only)" };
    }
    return {
      valid: true,
      request: { action: "open_url", url: obj.url, targetProfile: obj.targetProfile },
    };
  }

  if (action === "list_profiles") {
    return { valid: true, request: { action: "list_profiles" } };
  }

  return { valid: true, request: { action: "health_check" } };
}
