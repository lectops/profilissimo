export type HelperState = "not-installed" | "outdated" | "connected";

export interface HelperStatusOpts {
  state: HelperState;
  variant: "card" | "compact";
  version?: string;
  latest?: string;
  path?: string;
  onAction?: () => void;
}

const DEFAULT_PATH = "~/.profilissimo/bin/profilissimo-nmh";

interface StateConfig {
  dotColor: string;
  ringColor: string;
  title: string;
  sub: (version?: string, latest?: string) => string;
  actionLabel: string | null;
  actionClass: string | null;
}

const STATE_CONFIG: Record<HelperState, StateConfig> = {
  connected: {
    dotColor: "var(--success)",
    ringColor: "var(--success-tint)",
    title: "Helper connected",
    sub: (version) => `v${version ?? "?"} · current`,
    actionLabel: null,
    actionClass: null,
  },
  outdated: {
    dotColor: "var(--warn-strong)",
    ringColor: "var(--warn-tint)",
    title: "Helper update available",
    sub: (version, latest) =>
      `v${version ?? "?"} installed · v${latest ?? "?"} available`,
    actionLabel: "Update helper",
    actionClass: "helper-status__action--warn",
  },
  "not-installed": {
    dotColor: "var(--danger)",
    ringColor: "var(--danger-tint)",
    title: "Helper not installed",
    sub: () => "Required to open pages in other profiles",
    actionLabel: "Install helper",
    actionClass: "helper-status__action--ink",
  },
};

export function renderHelperStatus(opts: HelperStatusOpts): HTMLElement {
  const { state, variant, version, latest, onAction } = opts;
  const path = opts.path ?? DEFAULT_PATH;
  const config = STATE_CONFIG[state];
  const isCard = variant === "card";

  // Root element
  const root = document.createElement("div");
  root.className = `helper-status helper-status--${variant} helper-status--${state}`;

  // Left group: dot + text
  const left = document.createElement("div");
  left.className = "helper-status__left";

  // Status dot
  const dot = document.createElement("span");
  dot.className = "helper-status__dot";
  dot.style.background = config.dotColor;
  dot.style.setProperty("--hs-ring", config.ringColor);
  left.appendChild(dot);

  // Text group
  const text = document.createElement("div");
  text.className = "helper-status__text";

  const titleEl = document.createElement("span");
  titleEl.className = "helper-status__title";
  titleEl.textContent = config.title;

  const subEl = document.createElement("span");
  subEl.className = "helper-status__sub";
  subEl.textContent = config.sub(version, latest);

  text.appendChild(titleEl);
  text.appendChild(subEl);

  // Path line — card variant only
  if (isCard) {
    const pathEl = document.createElement("span");
    pathEl.className = "helper-status__path";
    pathEl.textContent = path;
    text.appendChild(pathEl);
  }

  left.appendChild(text);
  root.appendChild(left);

  // Action button — card variant, outdated/not-installed only
  if (isCard && config.actionLabel !== null) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `helper-status__action ${config.actionClass ?? ""}`.trim();
    btn.textContent = config.actionLabel;
    if (onAction) {
      btn.addEventListener("click", onAction);
    }
    root.appendChild(btn);
  }

  return root;
}
