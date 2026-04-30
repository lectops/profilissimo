// Tiny semver-ish comparator. Profilissimo's NMH version is always strictly
// `MAJOR.MINOR.PATCH` (no prerelease tags, no build metadata), so this avoids
// pulling a full semver library.
//
// Returns a negative number if a < b, zero if equal, positive if a > b.
// Missing segments are treated as 0 ("1.1" === "1.1.0").
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((s) => Number.parseInt(s, 10) || 0);
  const pb = b.split(".").map((s) => Number.parseInt(s, 10) || 0);
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i++) {
    const av = pa[i] ?? 0;
    const bv = pb[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

export function isAtLeast(actual: string | undefined, required: string): boolean {
  if (!actual) return false;
  return compareVersions(actual, required) >= 0;
}
