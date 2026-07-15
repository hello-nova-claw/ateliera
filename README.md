# Ateliera

A private studio for designing a life from the inside out.

## Development

Use Node.js 22 and pnpm 10.

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Workspace dependencies follow the architecture documented in the implementation plan and are enforced by ESLint.
