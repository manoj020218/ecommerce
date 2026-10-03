import { apiFetch } from "../api/http-client";

// Phone notifications (2026-10-03): subscribe this device for order updates
// and offers. Works on Android (browser or installed app) and on iPhone only
// when the site is installed to the Home Screen (iOS 16.4+).

export function isPushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function notificationPermission() {
  return isPushSupported() ? Notification.permission : "unsupported";
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function registration() {
  return navigator.serviceWorker.ready;
}

export async function getCurrentSubscription() {
  if (!isPushSupported()) return null;
  try {
    const reg = await registration();
    return await reg.pushManager.getSubscription();
  } catch (_error) {
    return null;
  }
}

// Must be called from a button tap (browsers require a user gesture).
export async function enablePush() {
  if (!isPushSupported()) throw new Error("This phone/browser doesn't support notifications.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications are blocked. Allow them in your browser settings.");
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { publicKey } = await apiFetch("/push/public-key");
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
  }
  await apiFetch("/customer/push/subscribe", { method: "POST", auth: true, body: { subscription: sub.toJSON() } });
  return true;
}

export async function disablePush() {
  const sub = await getCurrentSubscription();
  if (!sub) return false;
  try {
    await apiFetch("/customer/push/unsubscribe", { method: "POST", auth: true, body: { endpoint: sub.endpoint } });
  } catch (_error) {
    // still unsubscribe locally
  }
  await sub.unsubscribe();
  return true;
}

// Re-send this phone's subscription after login (e.g. the phone had allowed
// notifications for an earlier account session).
export async function syncPushSubscription() {
  if (notificationPermission() !== "granted") return;
  const sub = await getCurrentSubscription();
  if (!sub) return;
  try {
    await apiFetch("/customer/push/subscribe", { method: "POST", auth: true, body: { subscription: sub.toJSON() } });
  } catch (_error) {
    // ignore
  }
}

export function listMyNotifications() {
  return apiFetch("/customer/push/notifications", { auth: true });
}
