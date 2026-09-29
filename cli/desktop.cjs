const path = require("node:path");
const { pathToFileURL } = require("node:url");
exports.run = async function (app, BrowserWindow, args) {
  let win;
  const json = args.includes("--json");
  const emit = (stream, text) =>
    new Promise((resolve, reject) =>
      stream.write(text, (error) => (error ? reject(error) : resolve())),
    );
  try {
    const { parseArgs, help } = await import(
      pathToFileURL(path.join(__dirname, "args.js"))
    );
    const { planBatch, executeBatch } = await import(
      pathToFileURL(path.join(__dirname, "batch.js"))
    );
    const options = parseArgs(args);
    if (options.help) {
      await emit(process.stdout, help);
      app.exit(0);
      return;
    }
    if (options.version) {
      await emit(process.stdout, require("../package.json").version + "\n");
      app.exit(0);
      return;
    }
    const plan = await planBatch(options);
    let render = () => {
      throw new Error("Renderer unavailable");
    };
    if (!options.dryRun) {
      await app.whenReady();
      win = new BrowserWindow({
        show: false,
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          backgroundThrottling: false,
        },
      });
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      win.webContents.on("will-navigate", (e) => e.preventDefault());
      await win.loadFile(path.join(__dirname, "../dist/cli.html"));
      render = async (job) => {
        if (win.isDestroyed())
          throw new Error("Image renderer is unavailable after a timeout.");
        let timer;
        try {
          return await Promise.race([
            win.webContents.executeJavaScript(
              `window.renderCLI(${JSON.stringify(job)})`,
            ),
            new Promise((_, reject) => {
              timer = setTimeout(() => {
                win.destroy();
                reject(
                  new Error("Image processing timed out after 120 seconds."),
                );
              }, 120000);
            }),
          ]);
        } finally {
          clearTimeout(timer);
        }
      };
    }
    const summary = await executeBatch(plan, options, render, (result) => {
      if (!json)
        process.stdout.write(
          `${result.status.toUpperCase()} ${result.input} -> ${result.output}${result.error ? " : " + result.error : ""}\n`,
        );
    });
    if (json) await emit(process.stdout, JSON.stringify(summary) + "\n");
    else
      await emit(
        process.stdout,
        `Finished: ${summary.written} written, ${summary.skipped} skipped, ${summary.failed} failed${options.dryRun ? " (dry run)" : ""}.\n`,
      );
    app.exit(summary.failed ? 1 : 0);
  } catch (error) {
    if (json)
      await emit(
        process.stdout,
        JSON.stringify({ error: error.message }) + "\n",
      );
    else
      await emit(
        process.stderr,
        `Error: ${error.message}\nUse --help for usage.\n`,
      );
    app.exit(2);
  }
};
