import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

export interface AppConfig {
  defaultProfile: string | null;
  closeSourceTab: boolean;
}

const CONFIG_DIR = join(homedir(), ".profilissimo");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

const DEFAULT_CONFIG: AppConfig = {
  defaultProfile: null,
  closeSourceTab: false,
};

export async function readConfig(): Promise<AppConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      defaultProfile:
        typeof parsed.defaultProfile === "string" ? parsed.defaultProfile : null,
      closeSourceTab:
        typeof parsed.closeSourceTab === "boolean" ? parsed.closeSourceTab : false,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function writeConfig(config: Partial<AppConfig>): Promise<void> {
  const current = await readConfig();
  const merged = { ...current, ...config };
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(merged, null, 2) + "\n", "utf-8");
}
