# Jenix Commerce (VPS Workspace)

This workspace follows `PROJECT.md` with a backend-first execution path.

## Stack in this setup

- Node.js 18/20
- Express modular backend
- pnpm workspace
- PM2 process management (no Docker workflow)

## Current implementation status

- Phase 0 (backend-first bootstrap): in progress
- Phase 1 backend (settings module): in progress

## Run locally

```bash
cmd /c pnpm install
cmd /c pnpm dev:backend
```

Health check:

- `GET http://localhost:4100/health`

## PM2 commands

```bash
cmd /c pnpm pm2:start
cmd /c pnpm pm2:status
cmd /c pnpm pm2:logs
cmd /c pnpm pm2:restart
cmd /c pnpm pm2:stop
```

## Important notes

- Docker is intentionally not used in this workspace.
- Provider-specific integrations are adapter placeholders until implemented.
- `.env.example` contains only non-secret keys.
