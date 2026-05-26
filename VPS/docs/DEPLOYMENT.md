# Deployment (PM2 First)

This workspace uses PM2 instead of Docker.

## Prerequisites

- Node.js 18+ and pnpm
- Ubuntu VPS with Nginx and SSL (Phase 20 scripts planned)

## Install

```bash
pnpm install
```

## Run with PM2

```bash
pnpm pm2:start
pnpm pm2:status
pnpm pm2:logs
```

## Health check

```bash
curl http://localhost:4100/health
```
