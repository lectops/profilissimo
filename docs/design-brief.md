# Profilissimo — Design Brief (all user-facing surfaces)

**For:** the designer rethinking Profilissimo's UI
**From:** Alec (product owner)
**Status:** v1.0.0 is live on the Chrome Web Store with real users. This is a redesign of the *interface*, not the product. Behavior and the wire protocol are fixed; the visual and interaction design are open.

---

## 1. What Profilissimo is

Chrome supports multiple **profiles** (separate logged-in identities — e.g. Work, Personal, a client account — each with its own tabs, history, extensions, and Google login). Switching a page from one profile to another normally means: copy the URL, open the other profile's window, paste, go. Profilissimo collapses that to one click.

**Core job:** take the page (or link) you're looking at and open it in a *different* Chrome profile — or open a fresh window in another profile — without manual copy-paste-switch.

**Who uses it:** people who run 2–6 Chrome profiles and constantly land on the wrong one (opened a work doc in their personal profile, a personal link in a client profile, etc.).

### The one piece of architecture the design must account for

A Chrome extension *cannot* launch another profile by itself. Profilissimo ships a tiny **helper app** (a "native messaging host" — a local binary) that the extension talks to; the helper is what actually opens Chrome in the target profile. Consequences the UI has to express:

- **The helper app can be in three states:** not installed / installed but outdated / installed and current. Several screens change shape based on this. "Outdated" is real: Chrome auto-updates the extension but the helper app must be updated manually, so a user can have a new extension talking to an old helper.
- **Per-profile install.** The extension installs into *one* Chrome profile at a time. To use Profilissimo from every profile, the user has to add it to each profile separately (Chrome's rule, not ours). The UI repeatedly nudges this.
- **One helper serves all profiles** on the machine; it's installed once.
- **macOS only** today (copy references Terminal, ⌘Q, "this Mac").

---

## 2. Current visual language (keep, evolve, or deliberately depart — your call)

Internal name for the current direction: **"Editorial Concierge."** Stated voice: *"a wink — mostly serious chrome, character in details."*

- **Palette:** cream paper (`#F4EFE6`), deep near-black ink (`#14130F`), warm **brass** accent (`#8C6A2A`), hairline rules. One **neon halo** (cyan `#00F0FF` + magenta `#FF2BD6`) used sparingly as a single "moment" per surface (it echoes the extension icon).
- **Type:** Fraunces (serif, used for headings/labels with an italic flourish on "*issimo*"), Inter Tight (sans, body/UI), JetBrains Mono (URLs, hostnames, commands).
- **Motifs:** a wax-seal "p" brandmark; roman-numeral section numbers (§ I, § II…); a `❦` floret footer ornament; "est. 2026"; copy that leans literary ("residences," "concierge").

This personality is a deliberate differentiator, but it has produced some **terminology drift and density** (see §7). You're free to keep the character while making it clearer, or propose a cleaner direction — just flag which.

---

## 3. The surfaces, at a glance

| # | Surface | When the user sees it | Size/medium |
|---|---------|----------------------|-------------|
| A | **Toolbar popup** | Clicks the Profilissimo icon | ~320px-wide popup |
| B | **Settings (Options page)** | Opens extension options | Full browser tab |
| C | **Onboarding** | First install; or "setup guide" link | Full browser tab |
| D | **Right-click context menus** | Right-clicks a page or link | Native Chrome menu |
| E | **System notifications** | A pinned-site auto-redirect fails | Native OS notification |
| F | *(redirect interstitial)* | Briefly, during some cross-profile opens | Internal; see note |

Each is detailed below: **purpose → sections → what the user can do → states → known problems.**

---

## A. Toolbar popup  *(the primary surface — and the one most in need of help)*

**Purpose:** the fast path. Open the icon, send the current page somewhere, close. Should feel instant.

### Sections (top to bottom)
1. **Header** — brandmark + a **Settings** gear button.
2. **Current-page card** — favicon + the current URL/hostname, so you know what you're about to act on. Hidden when there's no usable URL.
3. **Profile list** — one row per Chrome profile (colored chip/initial, profile name, account email). The current profile is shown but marked **"you are here."**
4. **Pin section** (only on normal http(s) pages) — "Always open this site in…", with the hostname and a profile picker. Lets you make a site *always* route to a chosen profile.
5. **Footer** — keyboard-shortcut hint (⌥⇧P "open anywhere") + a **Refresh profiles** button.

### What the user can do  *(this is the crux of the problem)*
There are currently **three different actions**, and two of them live on the same row:

- **Click a profile row** → *move the current tab* to that profile (transfers the URL; can auto-close the source tab).
- **Click the ⊞ button on a row** → *open a new empty window* in that profile (nothing is moved). Recently added.
- **Pin section** → *always open this site* in a chosen profile (creates a persistent rule; can also fire immediately).

So a single profile row now means "move my tab here" on the body and "open a fresh window here" on a small button — plus there's a whole separate block for "always open this site here." **A first-time user cannot tell these apart by looking.** Disambiguating these three intents is the #1 goal of the popup redesign.

### States the popup can be in
- **Helper not connected** → replaces the profile list with a setup prompt (a Terminal command to copy + "Full setup guide" link).
- **Loading** → spinner while profiles are fetched.
- **Helper outdated** → the ⊞ new-window action and the pin affordance are hidden/limited (they need the newer helper); plain tab-move still works.
- **Transferring** → a brief animation: source chip → arrow ("transferring") → target chip with a neon halo, then the popup closes.
- **Success / error toast** → a small status line.
- **Single profile only** → edge case; list has one row (itself).

### Known problems to solve
- Three overlapping actions with weak signifiers (above).
- The pin block adds a lot of vertical weight to what should be a quick menu.
- Current profile row is present but dimmed — is showing it even useful, or just noise?
- "Move tab" vs "open new window" vs "always open here" need an information architecture a stranger can parse in two seconds.

---

## B. Settings (Options page)  *(full tab)*

**Purpose:** everything that isn't the quick path — preferences, the persistent rules, helper-app health, backup, and multi-profile install.

### Sections (currently numbered § I–§ VI)
- **§ I — Default profile.** A dropdown for the profile the keyboard shortcut (⌥⇧P) and one-click transfers target. Option "None — use last used." Tagged *"shared across profiles."*
- **§ II — Behavior.** One toggle today: *"Close the source tab once the page is delivered."*
- **§ III — Bound residences.** The persistent site→profile rules. Contains: a master toggle *"Auto-redirect bound URLs"*; a privacy disclosure ("nothing leaves your machine"); a **table** of rules (hostname → profile, with delete); and an **add-rule form** (hostname input + profile select + "Bind"). Shows an empty state and an "update the helper app" callout when the helper is too old.
- **§ IV — The helper app.** A status card: indicator dot, status text + detected version, the install path, and a contextual action (e.g. copy update command / download). This is where helper-state lives in detail.
- **§ V — Backup & restore.** Export settings to a JSON file; import on another Mac. Copy explains bindings are matched by account email so they survive Chrome reassigning profile slots.
- **§ VI — Other residences.** Collapsible. The multi-profile install nudge: a list of the user's *other* Chrome profiles + a button that opens the Web Store in each. Dismissible ("Already installed — hide this").

### What the user can do
Pick a default profile; toggle close-source-tab; toggle auto-redirect; add/delete site bindings; check/update the helper; export/import settings; trigger multi-profile install.

### States
- Helper outdated → §III shows a warning and disables pinning controls; §IV shows the update affordance.
- No rules yet → §III empty state.
- All-other-profiles-installed / dismissed → §VI hidden.
- A transient "Saved." confirmation appears on change.

### Known problems
- **Six numbered sections is a lot.** Some are housekeeping (helper health, multi-profile install) that maybe shouldn't compete with actual preferences.
- Terminology: this page says *"Bound residences," "bindings," "Bind," "Residence,"* while the popup and context menu say *"Always open this site in…"* and notifications say *"Pinned URLs."* These are all the same feature. (See §7.)
- "shared across profiles" vs "this Mac only" pills encode an important but subtle distinction (what's per-machine vs per-account-synced) that may deserve clearer treatment.

---

## C. Onboarding  *(full tab; shown on first install)*

**Purpose:** get the helper app installed and verified, then push multi-profile install.

### Flow / sections
- **Hero** — brandmark, "est. 2026", tagline ("One click, and your tab opens in the right profile"), and a "Helper app connected" pill once verified.
- **Three setup steps:** I. Install the helper app (copy a Terminal command; "or download manually"). II. Restart Chrome (⌘Q). III. Verify connection (a "Check connection" button + status).
- **Then one of two success branches:**
  - **Branch A (0–1 profiles total):** pure "You're ready" celebration + a P.S. tip about right-click pinning.
  - **Branch B (has other profiles):** "Step IV — and last: install in your other Chrome profiles," with a per-profile list and a button to open the Web Store in each. Skippable.

### What the user can do
Copy the install command; download the helper manually; check connection; finish; install into other profiles; skip.

### States
Pre-verification vs verified; Branch A vs Branch B; per-profile install progress.

### Known problems
- It's asking a non-technical user to **paste a command into Terminal** — the scariest moment in the whole product. This step's clarity/reassurance is critical and worth special design attention.
- The roman-numeral / editorial styling is charming but must not get in the way of "do this, then this."

---

## D. Right-click context menus  *(native Chrome menus)*

**Purpose:** the same actions as the popup, without opening it.

### Entries (copy is fixed-ish but you can advise)
- On a page: **"Open this page in ▸"** → submenu of profiles (current profile shown but disabled, marked "(current)").
- On a link: **"Open link in ▸"** → submenu of profiles.
- When auto-redirect is on: **"Always open this site in ▸"** → submenu of profiles.
- With a single profile, these collapse to flat items (no submenu).

**Design relevance:** menu *copy and structure* should stay consistent with whatever vocabulary the redesign settles on (see §7). Native menus can't be visually styled, so this is about wording and grouping only.

---

## E. System notifications  *(native OS)*

**Purpose:** tell the user when a pinned-site auto-redirect silently failed (e.g. target profile was deleted).

- Current copy: title *"Profilissimo: pin didn't fire,"* body *"Couldn't redirect {site}: {reason}. Check Settings → Pinned URLs."*
- **Problem:** "pin," "Pinned URLs," "bound residences," "bindings" are the same thing under four names. Pick one. (See §7.)

---

## F. Redirect interstitial  *(internal — context only, not a design target)*

For certain cross-profile opens (Chrome internal pages like `chrome://settings`), the extension briefly loads a tiny internal page in the target profile that immediately navigates to the destination. Users may glimpse it for a fraction of a second. **Not something to design** unless you see the flash as a problem worth addressing.

---

## 7. Cross-cutting issues (the real brief)

1. **One feature, four names.** The persistent site→profile rule is called *pin* (popup, context menu, notification), *bind / bound / binding* (settings), and *residence* (settings, marketing voice). Users can't build a mental model around shifting vocabulary. **Settle on one term and one verb** and use it everywhere (popup, settings, context menu, notifications, onboarding P.S.).

2. **Three popup actions, one row.** Move-tab / new-window / always-open-here need an IA where intent is obvious at a glance. This is the highest-priority interaction problem.

3. **Helper-app states leak everywhere.** Not-installed / outdated / current changes the popup, settings §III, settings §IV, and onboarding. Consider a single, consistent way to represent helper health and the "you need to update" nudge, rather than per-screen variants.

4. **Per-profile install is a recurring nag** across onboarding (Branch B) and settings (§VI). It's a legitimately confusing Chrome constraint — worth a clear, reusable explanation pattern.

5. **Density vs. personality.** The editorial styling (serif, roman numerals, literary copy, neon halo) is a real brand asset. The redesign should keep a distinctive personality while reducing cognitive load — especially in the popup (speed) and onboarding step 1 (reassurance).

---

## 8. What we're asking for

- A coherent redesign of **A (popup)** and **B (settings)** as the priorities, with **C (onboarding)** close behind.
- A resolved, consistent **vocabulary** for the route-a-site feature and the helper-app states, applied across all surfaces including **D** and **E** (copy only).
- Clear treatment of the **three popup actions** so a first-time user understands them without explanation.
- Freedom to keep, evolve, or replace the visual language — but **call out** which, and why.

### Fixed constraints (not up for redesign)
- The product behavior and the underlying capabilities (move tab, new window, persistent routing, default profile, close-source-tab, backup/restore, multi-profile install, helper health).
- The popup is a small Chrome popup (~320px wide); the others are full tabs.
- macOS-only today.
- No change to the helper-app communication protocol.

### Reference
- Current code lives in `extension/src/{popup,options,onboarding}/` and `extension/src/shared/profilissimo.css` (the design tokens). The live listing: https://chromewebstore.google.com/detail/profilissimo/olhphbhieleagngagocedaildgefdmni
