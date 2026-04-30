interface OpenUrlRequest {
  action: "open_url";
  url: string;
  targetProfile: string;
}

interface OpenProfileRequest {
  action: "open_profile";
  targetProfile: string;
}

interface ListProfilesRequest {
  action: "list_profiles";
}

interface HealthCheckRequest {
  action: "health_check";
}

interface GetConfigRequest {
  action: "get_config";
}

export interface PinnedRule {
  id: string;
  pattern: string;
  targetProfileDirectory: string;
  createdAt: number;
}

interface SetConfigRequest {
  action: "set_config";
  defaultProfile?: string | null;
  closeSourceTab?: boolean;
  urlPinningEnabled?: boolean;
  pinnedRules?: PinnedRule[];
}

export type NMHRequest =
  | OpenUrlRequest
  | OpenProfileRequest
  | ListProfilesRequest
  | HealthCheckRequest
  | GetConfigRequest
  | SetConfigRequest;

export interface ProfileInfo {
  directory: string;
  name: string;
  email?: string;
  avatar?: string;
}

export interface AppConfig {
  defaultProfile: string | null;
  closeSourceTab: boolean;
  urlPinningEnabled: boolean;
  pinnedRules: PinnedRule[];
}

export interface NMHResponse {
  success: boolean;
  error?: string;
  version?: string;
  profiles?: ProfileInfo[];
  config?: AppConfig;
}
