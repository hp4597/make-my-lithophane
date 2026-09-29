const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const cliIndex = process.argv.indexOf("--cli");
if (cliIndex >= 0) {
  require("../cli/desktop.cjs").run(
    app,
    BrowserWindow,
    process.argv.slice(cliIndex + 1),
  );
} else {
  let window;
  app.whenReady().then(() => {
    window = new BrowserWindow({
      width: 1500,
      height: 960,
      minWidth: 1080,
      minHeight: 740,
      backgroundColor: "#101619",
      title: "Make My Lithophane",
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event) => event.preventDefault());
    window.loadFile(path.join(__dirname, "../dist/index.html"));
  });
  app.on("window-all-closed", () => app.quit());
  ipcMain.handle("save-file", async (event, { name, bytes }) => {
    if (
      event.sender !== window.webContents ||
      typeof name !== "string" ||
      !(bytes instanceof Uint8Array) ||
      bytes.length > 1024 * 1024 * 1024
    )
      throw new Error("Invalid file");
    const result = await dialog.showSaveDialog(window, {
      defaultPath: path.basename(name),
    });
    if (result.canceled) return false;
    await fs.writeFile(result.filePath, bytes);
    return true;
  });
}
