import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { PinnedRule } from "./schema.js";

export interface AppConfig {
  defaultProfile: string | null;
  closeSourceTab: boolean;
  urlPinningEnabled: boolean;
  pinnedRules: PinnedRule[];
}

const CONFIG_DIR = join(homedir(), ".profilissimo");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

const DEFAULT_CONFIG: AppConfig = {
  defaultProfile: null,
  closeSourceTab: false,
  urlPinningEnabled: false,
  pinnedRules: [],
};

function readPinnedRules(value: unknown): PinnedRule[] {
  if (!Array.isArray(value)) return [];
  return value.filter((r): r is PinnedRule => {
    if (typeof r !== "object" || r === null) return false;
    const obj = r as Record<string, unknown>;
    return (
      typeof obj.id === "string" &&
      typeof obj.pattern === "string" &&
      typeof obj.targetProfileDirectory === "string" &&
      typeof obj.createdAt === "number"
    );
  });
}

export async function readConfig(): Promise<AppConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      defaultProfile:
        typeof parsed.defaultProfile === "string" ? parsed.defaultProfile : null,
      closeSourceTab:
        typeof parsed.closeSourceTab === "boolean" ? parsed.closeSourceTab : false,
      urlPinningEnabled:
        typeof parsed.urlPinningEnabled === "boolean" ? parsed.urlPinningEnabled : false,
      pinnedRules: readPinnedRules(parsed.pinnedRules),
    };
  } catch {
    return { ...DEFAULT_CONFIG, pinnedRules: [] };
  }
}

export async function writeConfig(config: Partial<AppConfig>): Promise<void> {
  const current = await readConfig();
  const merged = { ...current, ...config };
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(merged, null, 2) + "\n", "utf-8");
}
