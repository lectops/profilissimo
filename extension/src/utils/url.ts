// Schemes that execute code in the *current page* context (as opposed to
// navigating to a new document). The NMH blocks these too — keep the lists in
// sync as the extension's first line of defense.
const BLOCKED_URL_SCHEMES = ["javascript:"];

export function isTransferableUrl(url: string): boolean {
  if (url.startsWith("-")) return false;
  if (/[\0\r\n]/.test(url)) return false;
  try {
    const parsed = new URL(url);
    return !BLOCKED_URL_SCHEMES.includes(parsed.protocol);
  } catch {
    return false;
  }
}
