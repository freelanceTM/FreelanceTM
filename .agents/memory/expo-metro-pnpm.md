---
name: Expo Metro pnpm monorepo config
description: How to configure metro.config.js for Expo in a pnpm workspace, and the startup port-detection issue
---

## Rule
For Expo apps in a pnpm monorepo, metro.config.js MUST:
1. Set `config.watchFolders = [workspaceRoot]` — Metro needs the workspace root to follow pnpm symlinks
2. Set `config.resolver.nodeModulesPaths` to include both the app's and workspace root's node_modules
3. Use `config.resolver.blockList` to exclude unrelated artifacts to speed up startup

## Why
Without `watchFolders = [workspaceRoot]`, Metro resolves `expo-router/entry` from the workspace root and fails because pnpm virtual store symlinks can't be followed. Error: "Unable to resolve module from /home/runner/workspace/."

Without blockList, Metro's initial find scan covers the entire workspace taking 60-120s before the port opens.

## The ensurePreviewReachable gotcha
Expo artifact.toml must NOT have `ensurePreviewReachable = "/status"`. Expo web doesn't serve /status. Remove it — Replit will use plain TCP port detection instead.

## How to apply
Any Expo artifact in this monorepo needs this metro.config.js pattern + no ensurePreviewReachable in artifact.toml.
