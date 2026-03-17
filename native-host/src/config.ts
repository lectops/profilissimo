import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

export interface AppConfig {
  defaultProfile: string | null;
}

const CONFIG_DIR = join(homedir(), ".profilissimo");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

const DEFAULT_CONFIG: AppConfig = {
  defaultProfile: null,
};

export async function readConfig(): Promise<AppConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      defaultProfile:
        typeof parsed.defaultProfile === "string" ? parsed.defaultProfile : null,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function writeConfig(config: AppConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
}
