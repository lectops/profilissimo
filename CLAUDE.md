# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status: published, with real users

Profilissimo v1.0.0 is **live on the Chrome Web Store** with real installed users.

- CWS listing: https://chromewebstore.google.com/detail/profilissimo/olhphbhieleagngagocedaildgefdmni
- CWS extension ID: `olhphbhieleagngagocedaildgefdmni`
- NMH manifest name: `com.profilissimo.nmh`

This changes how you should approach changes:

1. **Never autonomously bump versions, tag releases, or upload to CWS.** Always confirm with Alec first. He drives release cadence.
2. **The wire protocol is now a versioned public API.** `extension/src/types/messages.ts` and `native-host/src/schema.ts` together define what every installed user expects. Changes must be **additive only**: new optional fields, new action types. Never rename or remove existing actions/fields, never make a previously-optional field required.
3. **The NMH binary does not auto-update.** Chrome auto-updates the extension; users must manually re-download and re-register the NMH. Design changes so that:
   - A **new extension** still works against the **published 1.0.0 NMH** (so existing users aren't broken when the extension auto-updates), AND
   - A **new NMH** still works against the **published 1.0.0 extension** (in case rollout staggers).
   - If you genuinely need a breaking NMH change, that's a coordinated release — flag it explicitly.
4. **Don't do experimental work on `main`.** Pushes to `main` trigger CI to update the rolling `latest` GitHub prerelease, which advertises an installable NMH binary. Use feature branches.

## Releases

Releases are **tag-driven**, not push-driven. CWS uploads are manual and only happen on `v*` tags.

The full procedure lives in `RELEASING.md`. Highlights:

- All four version files must agree before tagging: `package.json`, `extension/package.json`, `extension/public/manifest.json`, `native-host/package.json`. Run `scripts/preflight.sh <version>` to verify — it fails loudly on any mismatch.
- `CHANGELOG.md` follows Keep-a-Changelog. Update the `[Unreleased]` section in the **same PR as the code change**, not at release time. Move it into a dated `[x.y.z]` section as part of the release PR.
- Tagging `v*` triggers `.github/workflows/release.yml` to build artifacts and create a versioned GitHub release. The CWS upload (download zip → upload to dashboard → submit for review) is still manual.
- If a release includes a new NMH binary, the GitHub release notes must explicitly tell existing users to re-download — otherwise they'll silently break when the new extension auto-updates.
- Rollback: CWS does not let you revert; always roll forward with a new patch version.

## Build Commands

```bash
npm install                              # Install all workspace dependencies
npm run build                            # Build everything (extension + NMH)
npm run build:extension                  # Build Chrome extension only → extension/dist/
npm run build:nmh                        # Build NMH TypeScript only → native-host/dist/
npm run build:binary -w native-host      # Compile standalone NMH binary (current platform) → native-host/bin/profilissimo-nmh
npm run build:binary:all -w native-host  # Compile NMH binaries for all platforms (delegates to native-host/scripts/build-binaries.sh, requires Bun)
npm run build:release                    # Extension + all-platform NMH binaries (matches CI release output)
npm run dev                              # Vite dev server with hot reload for extension
```

No test framework or linter is configured. The NMH binary build requires [Bun](https://bun.sh/); the TypeScript build only needs Node.

## Local development loop

- **Extension changes**: `npm run dev` rebuilds `extension/dist/` on save. Reload the unpacked extension at `chrome://extensions` to pick up changes (or click the refresh icon on the extension card).
- **NMH changes**: Rebuild with `npm run build:binary -w native-host`. Chrome spawns a fresh NMH process per request, so no Chrome restart is needed — but if the NMH **manifest** (path or allowed_origins) changes, Chrome must be fully quit and reopened to re-read it.
- **NMH registration**: For local testing the NMH binary must be registered via a JSON manifest at `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.profilissimo.nmh.json` pointing to the binary's absolute path and the unpacked extension's ID. `installer/install.sh` (macOS) and `installer/install.ps1` (Windows) automate this for end users.

## Architecture

Profilissimo is a two-part system: a **Chrome extension** (Manifest V3) and a **Native Messaging Host (NMH)** binary. They communicate over Chrome's native messaging protocol (4-byte length-prefixed JSON over stdin/stdout).

The extension cannot launch other Chrome profiles directly. Instead, it sends a typed JSON request to the NMH, which validates it and spawns a new Chrome process with the target `--profile-directory` flag.

### Workspaces

This is an npm workspaces monorepo with two packages: `extension/` and `native-host/`. They share a base TypeScript config (`tsconfig.base.json`) with strict mode enabled.

### Extension (`extension/`)

Built with Vite + `@crxjs/vite-plugin`. Entry points:

- **Service worker** (`src/background/service-worker.ts`): Central hub. Creates context menus, handles keyboard shortcuts, routes messages between popup/options UI and NMH. Manifest V3 terminates idle service workers after ~30s, so context menus must be rebuilt on every wake — never assume in-memory state survives across events.
- **Popup** (`src/popup/`): Toolbar popup listing all Chrome profiles for one-click transfer.
- **Options** (`src/options/`): Settings page (default profile, auto-close, notifications).
- **Onboarding** (`src/onboarding/`): First-run setup guide shown on install.

Key utils: `native-messaging.ts` (NMH communication with 15s timeout), `storage.ts` (Chrome storage wrapper), `url.ts` (URL validation).

### Native Messaging Host (`native-host/`)

Compiled to a standalone binary with Bun. Entry point: `src/main.ts` (stdin/stdout message loop).

- `schema.ts`: Validates request/response types. Request actions: `open_url`, `list_profiles`, `health_check`, `get_config`, `set_config`.
- `profiles.ts`: Discovers Chrome profiles from the `Local State` JSON file.
- `launcher.ts`: Spawns Chrome with profile directory flag. Supports macOS, Linux, Windows paths.
- `config.ts`: Reads/writes user config at `~/.profilissimo/config.json`.

### Message Types

Defined in `extension/src/types/messages.ts`. The NMH request is a discriminated union on the `action` field. Both sides validate all messages at the boundary.

## Security Constraints

All inputs are validated in both the extension and the NMH:
- Only `http:` and `https:` URLs are accepted
- Profile directory names must match `/^[a-zA-Z0-9 _-]+$/`
- URLs starting with `-` are rejected (prevents CLI flag injection)

## Platform Support

macOS only for now. The launcher code has paths for Linux and Windows but only macOS (Apple Silicon) binaries are built by CI. The CI workflow (`.github/workflows/release.yml`) creates a versioned GitHub release on `v*` tag push and updates a rolling `latest` prerelease on every push to `main`.
