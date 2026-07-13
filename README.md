# The Studio

A private, calm, Markdown-native environment for identity architecture, life design, reflection, and imagination.

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
