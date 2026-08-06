/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { Config } from "@remotion/cli/config";

Config.setRspack(true);
Config.setChromiumOpenGlRenderer("angle");
Config.setVideoImageFormat("jpeg");

// Sandbox blocks downloading Remotion's bundled chrome-headless-shell binary,
// so point it at the Playwright Chromium already present in this environment.
// That's a full Chrome build, not the headless-shell variant, so it needs the
// "new" headless mode (chrome-for-testing mode) rather than the default.
Config.setBrowserExecutable("/opt/pw-browsers/chromium");
Config.setChromeMode("chrome-for-testing");
