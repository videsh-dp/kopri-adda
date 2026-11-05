// PWA helpers: service worker registration + the "Install app" prompt.
import { useEffect, useState } from "react";

const BASE = import.meta.env.BASE_URL; // "/" in dev, "/kopri-adda/" on Pages

export function registerServiceWorker() {
  // Only in production builds: in dev a service worker would cache Vite's
  // modules and fight hot reload.
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE }).catch(() => {});
  });
}

// Chrome/Edge/Android fire `beforeinstallprompt` once, possibly before React
// mounts, so we catch it at module load and hand it to whoever asks later.
let deferredPrompt = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

export function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true // iOS Safari
  );
}

function isIOS() {
  const ua = window.navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
}

// { mode: "prompt" | "ios" | "installed" | "unavailable", install() }
export function useInstallApp() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);

  let mode = "unavailable";
  if (isStandalone()) mode = "installed";
  else if (deferredPrompt) mode = "prompt";
  else if (isIOS()) mode = "ios";

  const install = async () => {
    if (!deferredPrompt) return false;
    const p = deferredPrompt;
    deferredPrompt = null;
    p.prompt();
    const choice = await p.userChoice.catch(() => null);
    notify();
    return choice?.outcome === "accepted";
  };

  return { mode, install };
}
