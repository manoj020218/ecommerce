const request = require("supertest");
const { createApp } = require("../app");

let app;

beforeAll(() => {
  app = createApp();
});

describe("GET /health", () => {
  it("returns 200 with healthy status", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.service).toBe("jenix-backend");
    expect(res.body.data.status).toBe("healthy");
  });
});

describe("unknown routes", () => {
  it("returns 404 for unknown API path", async () => {
    const res = await request(app).get("/api/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("returns 404 for non-API unknown path", async () => {
    const res = await request(app).get("/not-a-route-at-all");
    expect(res.status).toBe(404);
  });
});
