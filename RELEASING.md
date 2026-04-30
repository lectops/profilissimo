# Releasing Profilissimo

This document describes how to ship a new version of Profilissimo to users.

> **Read this first:** Profilissimo ships in two pieces, and they update on
> very different schedules.
>
> | Artifact | How users get updates | Latency |
> |---|---|---|
> | Extension (CWS) | Chrome auto-updates | hours |
> | NMH binary | User must manually reinstall | effectively never |
>
> The wire protocol between them (`extension/src/types/messages.ts` ↔
> `native-host/src/schema.ts`) is therefore a **versioned public API**. New
> action types and new optional fields are fine. Renaming or removing
> existing actions or fields will silently break every existing user.

## Pre-flight checklist

Before tagging a release, confirm:

- [ ] All four version numbers match the new version (run `scripts/preflight.sh <version>`)
  - `package.json`
  - `extension/package.json`
  - `extension/public/manifest.json`  ← the one Chrome reads
  - `native-host/package.json`
- [ ] `CHANGELOG.md` has an entry for the new version under a dated heading,
      and the `[Unreleased]` section is reset
- [ ] If the NMH changed: tested the **new extension** against the **old
      published NMH binary** (sim a real user upgrading the extension only)
- [ ] If the NMH changed: tested the **old extension** against the **new NMH
      binary** (in case rollout staggers across machines)
- [ ] If the wire protocol changed: confirmed all changes are additive
      (new optional fields, new action types — never renaming or removing
      existing ones)
- [ ] Loaded `extension/dist/` as an unpacked extension and smoke-tested
      popup, context menu, keyboard shortcut, and options page
- [ ] Privacy policy still accurate if any new data is touched

## Release steps

### 1. Bump versions

Edit all four files together. Keep them in lockstep so user-facing CWS
version, root version, and binary version always agree.

```bash
scripts/preflight.sh 1.0.1   # verifies all four files match before you tag
```

If preflight fails, fix the offending file and re-run.

### 2. Update CHANGELOG

Move the items from `[Unreleased]` into a new `[1.0.1]` section dated today.

### 3. Commit + merge

```bash
git checkout -b release/v1.0.1
git commit -am "Release v1.0.1"
git push -u origin release/v1.0.1
gh pr create --title "Release v1.0.1" --body "See CHANGELOG.md"
gh pr merge --squash
```

### 4. Tag the release

```bash
git checkout main
git pull
git tag v1.0.1
git push origin v1.0.1
```

CI (`.github/workflows/release.yml`) builds the artifacts and creates a
versioned GitHub release. Wait for it to complete.

### 5. Upload to Chrome Web Store

1. Download `profilissimo-extension.zip` from the GitHub release.
2. Open the [CWS Developer Dashboard](https://chrome.google.com/webstore/devconsole).
3. Open the Profilissimo listing, go to **Package**, upload the zip.
4. Paste the CHANGELOG entry into the version notes.
5. Submit for review. Review usually takes hours to a few days.

### 6. (NMH-only) Notify existing users

If this release includes a new NMH binary, **edit the GitHub release notes**
to clearly tell existing users they need to download and re-register the new
binary. Chrome auto-updates the extension but does not auto-update the NMH —
existing users will silently break otherwise.

A future-friendly alternative: ship a `health_check` response field that
includes the NMH version, so the extension can detect a stale NMH and prompt
the user to update.

## Rollback

If a bad version reaches CWS:

- **Extension-only regression:** bump to the next patch version with the fix
  and re-submit. CWS does not let you roll back to a prior version — you
  always roll forward.
- **NMH regression:** the published NMH binary cannot be remotely revoked.
  Push a fixed extension that detects the bad NMH (via `health_check`) and
  shows a "please reinstall" prompt with a link to the latest binary.

## Hotfix flow

For urgent fixes:

1. Branch from the most recent release tag, not `main` (in case `main` has
   in-progress work that isn't ready to ship).
2. Apply the minimal fix.
3. Run preflight, bump patch version, update CHANGELOG.
4. Merge to `main`, tag, and proceed as a normal release.

## Reference

- Extension ID (CWS): `olhphbhieleagngagocedaildgefdmni`
- NMH manifest name: `com.profilissimo.nmh`
- NMH manifest path on macOS: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.profilissimo.nmh.json`
