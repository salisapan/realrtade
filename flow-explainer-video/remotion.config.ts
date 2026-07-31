/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { existsSync } from "node:fs";
import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);

// Reuse a pre-installed headless Chrome if one is available on this machine
// (e.g. sandboxed CI containers that block downloading Remotion's browser).
// Falls back to Remotion's normal managed-browser download otherwise.
const sandboxHeadlessShell =
  "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";
if (existsSync(sandboxHeadlessShell)) {
  Config.setBrowserExecutable(sandboxHeadlessShell);
}
