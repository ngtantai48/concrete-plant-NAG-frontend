# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
pnpm dev                # Start dev server on localhost:3000

# Build
pnpm build              # Production build (allocates 4GB heap)

# Linting & Formatting
pnpm lint               # ESLint check
pnpm lint:fix           # ESLint auto-fix
pnpm format             # Prettier check
pnpm format:fix         # Prettier auto-fix
```

No test runner is configured in this project.

## Architecture Overview

This is a **Next.js App Router** application for managing a concrete plant (Nguyen Anh Group). It uses React 19, TypeScript, and pnpm.

### Route Structure & Auth

Routes are organized into two layout groups:
- `(auth)` — public pages (login, forgot-password)
- `(dashboard)` — protected pages guarded by `AuthGuard`

The home page (`/`) renders a `RoleRedirect` component that maps the authenticated user's role to their dashboard. Three roles exist: `admin`, `customer`, `user`. Role constants and dashboard mappings are in `src/constants/`.

**AuthGuard** (`src/guards/`) wraps protected pages, checks Redux auth state, and validates `roles` prop for RBAC. Unauthorized access calls Next.js `forbidden()`.

### State Management

- **Redux Toolkit** (`src/store/`) — auth state only (user, token, isAuthenticated). Use `useAppSelector`/`useAppDispatch` from `src/hooks/`.
- **Zustand** (`src/hooks/use-navigation-store.ts`) — navigation state.

The HTTP client (`src/lib/http.ts`) has the Redux store injected into it for reading the JWT token in request interceptors.

### HTTP & Services

`src/lib/http.ts` is the Axios instance. It:
- Reads the JWT from Redux on every request
- Checks token expiry via `jwt-decode` and auto-refreshes before sending
- Queues concurrent requests during refresh to avoid race conditions
- Calls `handleHttpError()` from `src/lib/http-error.ts` on failed responses (triggers logout on 401/403 for non-auth endpoints)

All API calls go through service files in `src/services/`, one file per domain (e.g., `vehicle.service.ts`, `driver.service.ts`). Services export an API object with typed methods.

### Internationalization

**next-intl** with two locales: `vi` (default) and `en`. The locale is stored in a cookie. Translation files are in `src/i18n/messages/{locale}.json`. The `LanguageSwitcher` component sets the cookie and calls `router.refresh()`.

When adding new strings, add keys to **both** `vi.json` and `en.json`.

### Real-time (Socket.io)

`src/context/socket-context.tsx` manages the Socket.io connection. Components access it via `useSocket()`. The socket authenticates using the JWT token. Environment variables: `NEXT_PUBLIC_SOCKET_URL` and `NEXT_PUBLIC_SOCKET_PATH`.

### UI Stack

- **Ant Design** — primary UI component library (tables, forms, modals)
- **Shadcn UI** (new-york style) — secondary components in `src/components/ui/`
- **Tailwind CSS v4** — utility classes; PostCSS via `@tailwindcss/postcss`
- **Radix UI** — headless primitives underlying Shadcn
- Forms use **React Hook Form** + **Zod** for validation

### External Integrations

- **VTracking GPS** — external GPS service proxied through `src/app/api/vtracking/`. The Next.js route handler caches a presence token and re-authenticates when it expires.
- **MinIO** — S3-compatible storage at `minio.savinatestinghub.com`; configured as a remote image pattern in `next.config.ts`.

## Path Aliases

`@/*` maps to `src/*` (defined in `tsconfig.json`). Always use `@/` for imports within the project.

## Environment Variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend REST API base URL |
| `NEXT_PUBLIC_SOCKET_URL` | Socket.io server URL |
| `NEXT_PUBLIC_SOCKET_PATH` | Socket.io path (optional) |
| `VTRACKING_ORG_ID` | External vtracking org ID (server-only) |
| `VTRACKING_PRESENCE` | Cached vtracking presence token (optional) |

## Code Style

Prettier config: double quotes, semicolons, trailing commas (es5), 100 char print width, 2-space tabs, LF line endings.

## Commit Rules (BẮT BUỘC)

- **KHÔNG bao giờ thêm `Co-Authored-By:` hay bất kỳ AI tag/trailer nào** vào commit message. Repo này không cho phép xuất hiện tag AI co-author.
- Commit message chỉ ghi nội dung thay đổi, không tiết lộ AI assistance.
- Nếu cần xóa trailer khỏi commit cũ: dùng `git filter-branch -f --msg-filter 'grep -v "^Co-Authored-By:" || true' <range>` rồi `git push --force-with-lease`.
