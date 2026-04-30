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

export interface OpenProfileRequest {
  action: "open_profile";
  targetProfile: string;
}

export interface ListProfilesRequest {
  action: "list_profiles";
}

export interface HealthCheckRequest {
  action: "health_check";
}

export interface GetConfigRequest {
  action: "get_config";
}

export interface SetConfigRequest {
  action: "set_config";
  defaultProfile?: string | null;
  closeSourceTab?: boolean;
}

export type NMHRequest =
  | OpenUrlRequest
  | OpenProfileRequest
  | ListProfilesRequest
  | HealthCheckRequest
  | GetConfigRequest
  | SetConfigRequest;

type NMHAction = NMHRequest["action"];

export const NMH_VERSION = "1.1.0";

export interface NMHResponse {
  success: boolean;
  error?: string;
  version?: string;
  profiles?: ProfileInfo[];
  config?: { defaultProfile: string | null; closeSourceTab: boolean };
}

const VALID_ACTIONS: NMHAction[] = [
  "open_url",
  "open_profile",
  "list_profiles",
  "health_check",
  "get_config",
  "set_config",
];

// Schemes that execute code in the *current page* context (as opposed to
// navigating to a new document). Chrome treats these specially in the address
// bar; passing one through `--` to a fresh Chrome process is undefined and
// potentially unsafe. Block them at the boundary.
const BLOCKED_URL_SCHEMES = ["javascript:"];

export const PROFILE_DIR_PATTERN = /^[a-zA-Z0-9 _-]+$/;

function isValidUrl(value: string): boolean {
  // Argv-injection defenses. The launcher uses `--` as an argv terminator, but
  // belt-and-suspenders: also reject anything starting with `-`, and any
  // control characters that could split an argv on the wire.
  if (value.startsWith("-")) return false;
  if (/[\0\r\n]/.test(value)) return false;

  try {
    const parsed = new URL(value);
    if (BLOCKED_URL_SCHEMES.includes(parsed.protocol)) return false;
    return true;
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
      return { valid: false, error: "URL is not a navigable Chrome URL" };
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

  if (action === "open_profile") {
    if (typeof obj.targetProfile !== "string" || obj.targetProfile.length === 0) {
      return { valid: false, error: "open_profile requires a non-empty 'targetProfile' field" };
    }
    if (!isValidProfileDirectory(obj.targetProfile)) {
      return { valid: false, error: "targetProfile contains invalid characters (must be alphanumeric, spaces, hyphens, or underscores only)" };
    }
    return {
      valid: true,
      request: { action: "open_profile", targetProfile: obj.targetProfile },
    };
  }

  if (action === "list_profiles") {
    return { valid: true, request: { action: "list_profiles" } };
  }

  if (action === "get_config") {
    return { valid: true, request: { action: "get_config" } };
  }

  if (action === "set_config") {
    if (obj.defaultProfile !== undefined && obj.defaultProfile !== null && typeof obj.defaultProfile !== "string") {
      return { valid: false, error: "set_config: 'defaultProfile' must be a string or null" };
    }
    if (typeof obj.defaultProfile === "string" && !isValidProfileDirectory(obj.defaultProfile)) {
      return { valid: false, error: "set_config: 'defaultProfile' contains invalid characters" };
    }
    if (obj.closeSourceTab !== undefined && typeof obj.closeSourceTab !== "boolean") {
      return { valid: false, error: "set_config: 'closeSourceTab' must be a boolean" };
    }
    const request: SetConfigRequest = { action: "set_config" };
    if (obj.defaultProfile !== undefined) {
      request.defaultProfile = typeof obj.defaultProfile === "string" ? obj.defaultProfile : null;
    }
    if (typeof obj.closeSourceTab === "boolean") {
      request.closeSourceTab = obj.closeSourceTab;
    }
    return { valid: true, request };
  }

  return { valid: true, request: { action: "health_check" } };
}
