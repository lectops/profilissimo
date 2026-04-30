import type { PinnedRule } from "../types/messages.js";

// Hostname validation, mirrors native-host/src/schema.ts. Lowercase letters,
// digits, hyphens, dots; no leading/trailing dots, no consecutive dots, no
// empty labels, no leading hyphens per label.
const HOSTNAME_PATTERN = /^(?!-)(?!.*--)[a-z0-9-]+(?:\.(?!-)[a-z0-9-]+)*$/;

export const MAX_PATTERN_LENGTH = 253;

export function isValidPattern(pattern: string): boolean {
  if (pattern.length === 0 || pattern.length > MAX_PATTERN_LENGTH) return false;
  if (pattern !== pattern.toLowerCase()) return false;
  return HOSTNAME_PATTERN.test(pattern);
}

export function hostnameFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function findMatchingRule(url: string, rules: PinnedRule[]): PinnedRule | null {
  const hostname = hostnameFromUrl(url);
  if (!hostname) return null;
  for (const rule of rules) {
    if (rule.pattern === hostname) return rule;
  }
  return null;
}
