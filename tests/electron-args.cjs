/** Extra Chromium flags for headless/Linux agents without a usable GPU. */
const softwareGl =
  process.platform === "linux"
    ? [
        "--use-gl=angle",
        "--use-angle=swiftshader-webgl",
        "--ignore-gpu-blocklist",
        "--enable-webgl",
        "--disable-gpu-sandbox",
      ]
    : [];

module.exports = { softwareGl };
