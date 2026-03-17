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

export type NMHRequest = OpenUrlRequest | ListProfilesRequest | HealthCheckRequest;

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
}
