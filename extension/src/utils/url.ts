const ALLOWED_URL_SCHEMES = ["http:", "https:"];

export function isTransferableUrl(url: string): boolean {
  if (url.startsWith("-")) return false;
  try {
    const parsed = new URL(url);
    return ALLOWED_URL_SCHEMES.includes(parsed.protocol);
  } catch {
    return false;
  }
}
