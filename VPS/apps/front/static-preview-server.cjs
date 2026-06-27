const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const distRoot = path.resolve(__dirname, "dist");
const port = Number(process.argv[2] || process.env.PORT || 4174);
const host = process.argv[3] || process.env.HOST || "::";

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

const localhostPreviewServiceWorker = `
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((key) => caches.delete(key)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({
        includeUncontrolled: true,
        type: "window"
      });
      await Promise.all(clients.map((client) => client.navigate(client.url)));
    })()
  );
});
`;

function safePathname(urlPathname = "/") {
  try {
    return decodeURIComponent(urlPathname);
  } catch (_error) {
    return "/";
  }
}

function resolveFilePath(urlPathname) {
  const cleanPathname = safePathname(urlPathname).replace(/^\/+/, "");
  const requestedPath = cleanPathname ? path.join(distRoot, cleanPathname) : distRoot;
  const normalizedPath = path.normalize(requestedPath);

  if (!normalizedPath.startsWith(distRoot)) {
    return null;
  }

  return normalizedPath;
}

function sendFile(response, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[extension] || "application/octet-stream";
  const fileName = path.basename(filePath);
  const noStore =
    extension === ".html" ||
    fileName === "sw.js" ||
    fileName === "manifest.webmanifest";

  response.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": noStore ? "no-store" : "public, max-age=600"
  });

  fs.createReadStream(filePath).pipe(response);
}

function sendPreviewServiceWorker(response) {
  response.writeHead(200, {
    "Content-Type": "text/javascript; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(localhostPreviewServiceWorker);
}

function sendIndex(response) {
  sendFile(response, path.join(distRoot, "index.html"));
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1");

  if (url.pathname === "/sw.js") {
    sendPreviewServiceWorker(response);
    return;
  }

  const candidatePath = resolveFilePath(url.pathname);

  if (!candidatePath) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  fs.stat(candidatePath, (statError, stats) => {
    if (!statError && stats.isFile()) {
      sendFile(response, candidatePath);
      return;
    }

    if (!statError && stats.isDirectory()) {
      const indexPath = path.join(candidatePath, "index.html");
      fs.stat(indexPath, (indexError, indexStats) => {
        if (!indexError && indexStats.isFile()) {
          sendFile(response, indexPath);
          return;
        }

        sendIndex(response);
      });
      return;
    }

    sendIndex(response);
  });
});

server.listen(port, host, () => {
  const displayHost = host === "::" ? "localhost" : host;
  console.log(`Storefront static preview listening on http://${displayHost}:${port}`);
});
