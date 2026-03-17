interface OpenUrlRequest {
  action: "open_url";
  url: string;
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

interface SetConfigRequest {
  action: "set_config";
  defaultProfile: string | null;
}

export type NMHRequest = OpenUrlRequest | ListProfilesRequest | HealthCheckRequest | GetConfigRequest | SetConfigRequest;

export interface ProfileInfo {
  directory: string;
  name: string;
  email?: string;
  avatar?: string;
}

export interface NMHResponse {
  success: boolean;
  error?: string;
  profiles?: ProfileInfo[];
  config?: { defaultProfile: string | null };
}
