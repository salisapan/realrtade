/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { Config } from "@remotion/cli/config";

Config.setRspack(true);
// No GPU / X display in this sandbox — swangle (ANGLE-over-SwiftShader) gives
// WebGL2 via pure software rendering, which "angle" alone can't do headless here.
Config.setChromiumOpenGlRenderer("swangle");
Config.setVideoImageFormat("jpeg");

// Sandbox blocks downloading Remotion's bundled chrome-headless-shell binary,
// so point it at the Playwright Chromium already present in this environment.
// That's a full Chrome build, not the headless-shell variant, so it needs the
// "new" headless mode (chrome-for-testing mode) rather than the default.
Config.setBrowserExecutable("/opt/pw-browsers/chromium");
Config.setChromeMode("chrome-for-testing");

// The sandbox's outbound-HTTPS proxy re-signs certs with its own CA, which
// Chrome doesn't trust by default — needed for @remotion/google-fonts to
// fetch Rubik from fonts.gstatic.com during render.
Config.setChromiumIgnoreCertificateErrors(true);
