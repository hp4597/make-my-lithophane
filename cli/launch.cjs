#!/usr/bin/env node
const { spawn } = require("node:child_process");
const path = require("node:path");
const packaged = Boolean(process.versions.electron);
const executable = packaged ? process.execPath : require("electron");
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(
  executable,
  [
    ...(packaged ? [] : [path.join(__dirname, "..")]),
    "--cli",
    ...process.argv.slice(2),
  ],
  { stdio: "inherit", env, windowsHide: true },
);
let interrupted = false;
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 2;
});
child.on("exit", (code, signal) => {
  process.exitCode = interrupted ? 130 : (code ?? (signal ? 130 : 2));
});
process.on("SIGINT", () => {
  interrupted = true;
  child.kill();
  process.exitCode = 130;
});
process.on("SIGTERM", () => {
  interrupted = true;
  child.kill();
  process.exitCode = 130;
});
