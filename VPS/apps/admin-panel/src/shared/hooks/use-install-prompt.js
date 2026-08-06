import { useCallback, useEffect, useState } from "react";

function isStandaloneDisplay() {
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
    window.navigator.standalone === true
  );
}

// Android Chrome fires beforeinstallprompt once the PWA installability
// criteria are met (manifest + registered service worker + HTTPS). The
// event can only be prompted once, so it's captured here and handed to
// whatever button calls promptInstall(). iOS Safari never fires this event
// at all — canInstall just stays false there, which is fine since iOS has
// no equivalent programmatic install flow.
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(isStandaloneDisplay);

  useEffect(() => {
    function onBeforeInstallPrompt(event) {
      event.preventDefault();
      setDeferredPrompt(event);
    }
    function onAppInstalled() {
      setDeferredPrompt(null);
      setInstalled(true);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return outcome === "accepted";
  }, [deferredPrompt]);

  return { canInstall: Boolean(deferredPrompt) && !installed, promptInstall };
}
