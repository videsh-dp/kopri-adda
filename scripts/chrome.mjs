// Shared browser setup for the UI tests: finds a Chrome/Chromium on this
// machine (or CHROME_PATH) and gives each run a fresh, empty profile.
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/opt/pw-browsers/chromium",
].filter(Boolean);

export function findChrome() {
  const found = CANDIDATES.find((p) => existsSync(p));
  if (!found) {
    console.error("Chrome not found. Set CHROME_PATH to your Chrome or Chromium executable.");
    process.exit(1);
  }
  return found;
}

export function freshProfileDir(name) {
  return mkdtempSync(join(tmpdir(), `${name}-`));
}
