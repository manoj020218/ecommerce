import { useEffect, useRef } from "react";

// Calls `refresh` every `intervalMs` while the browser tab is visible, and
// once right away when the tab becomes visible again (so a dashboard left
// open in a background tab shows current numbers when you return to it).
// No polling while hidden — no load on the backend from forgotten tabs.
export function useAutoRefresh(refresh, intervalMs = 60000) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    let timer = null;
    const isVisible = () => typeof document === "undefined" || document.visibilityState !== "hidden";
    const start = () => {
      if (timer) return;
      timer = setInterval(() => { if (isVisible()) refreshRef.current(); }, intervalMs);
    };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const onVisibility = () => {
      if (isVisible()) { refreshRef.current(); start(); } else { stop(); }
    };
    if (isVisible()) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { stop(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [intervalMs]);
}
