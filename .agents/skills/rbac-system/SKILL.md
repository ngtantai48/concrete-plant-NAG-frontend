---
name: rbac-system
description: Front-end Role-Based Access Control (RBAC) system documentation. Use this skill when dealing with permissions, hiding/showing buttons, gating routes, or managing the navigation configuration.
---

# Role-Based Access Control (RBAC) System

This project implements a flexible, Front-end-driven Role-Based Access Control (RBAC) system. The core philosophy is that **`navigation.tsx` serves as the Single Source of Truth** for both rendering the Sidebar menu and generating the Permission Management Tree.

## Core Architecture

### 1. Single Source of Truth (`src/config/navigation.tsx`)
The `navigationConfig` object defines all modules, pages, and the specific actions available within those pages.
- Every `NavItem` represents a page or a group.
- `roles?: string[]`: Defines which roles can even see this item in the Sidebar/Permission Tree.
- `actions?: { key: string, label: string }[]`: Defines granular actions inside that page (e.g., `view`, `add`, `edit`, `delete`). **Important:** The `view` action is the foundational action.

### 2. Constants (`src/constants/route.ts`)
We NEVER use hardcoded string paths when checking permissions. We use the constants defined in `route.ts`.
```typescript
export const COMMON = {
  SYSTEM_SETTINGS: "/system-settings",
  // ...
};
```

### 3. The Hook (`src/hooks/use-permissions.ts`)
This hook provides the runtime methods to check if the current user has access to a specific page or action.
- Permissions are retrieved directly from the Redux auth state (`user.permissions`), which is synced from the Backend.
- The `admin` role is hard-coded to bypass all checks (`return true`).

### 4. The Route Guard (`src/guards/AuthGuard.tsx`)
Every page transition is intercepted here. It checks `hasPageAccess(pathname)`. If the user does not have permission, they are automatically signed out silently and redirected to the login page to prevent unauthorized access.

### 5. Admin UI (`src/components/features/role-permissions/RolePermissionsManager.tsx`)
A dedicated UI for the `admin` to assign permissions to non-admin roles.
- Roles are loaded dynamically from the Backend via `src/hooks/use-roles.ts`; do not hardcode role tabs such as `manager`, `dispatcher`, `driver`, or `user`.
- The `admin` role is intentionally hidden from the permission management tabs because admin always has all permissions through the bypass in `use-permissions.ts`.
- Role tabs support create, edit label, soft-delete, and manual drag sorting. Sorting is UI-only and persisted in local storage with `nag-role-permissions-tab-order`.
- Add/edit/delete role popups use shadcn `Dialog` + Tailwind. Keep Ant Design for `Tabs` and `Tree`.
- When closing the add/edit role dialog, do **not** immediately reset `editingRole` or `roleLabel`. Radix Dialog close animation can still render the old content; resetting those fields during close makes the visible dialog text jump from edit mode to create mode. Reset these fields only when opening create/edit dialogs.
- Uses Ant Design's `Tree` for the complex parent-child check logic.
- Enforces strict logic: You cannot check `add`/`edit`/`delete` without also checking `view`. If you uncheck `view`, all other actions are automatically unchecked.
- **Payload format to BE**: Sends a JSON object of type `Record<string, string[]>` mapping roles to their assigned permission keys.
- **Cross-Platform Consistency (Leaf-node only logic)**: The payload is strictly filtered to only send **leaf node keys** (e.g., `/dashboard__view` or individual page keys with no actions) and completely strips out parent/group keys (e.g., `/dashboard` or `tools-group`). This prevents cross-platform data synchronization bugs (especially with mobile apps that only manage leaf nodes). The Ant Design `Tree` component is smart enough to automatically display parent nodes as "Fully Checked" on the UI when all their leaf nodes are provided, even if the parent key itself is missing from the payload.
  ```json
  {
    "manager": [
      "/system-settings__view",
      "/system-settings__edit"
    ],
    "dispatcher": [
      "/orders__view"
    ]
  }
  ```

### 6. Dynamic Redirection (`src/components/auth/RoleRedirect.tsx`)
Upon successful login, the system avoids hardcoded redirect maps. Instead, it uses `getDefaultRoute()` from the `usePermissions` hook to scan the `navigationConfig` and automatically redirect the user to the **first page they have permission to view**. This prevents infinite redirect loops and 403 errors for users who do not have access to the standard dashboard.

---

## How to use the RBAC System

### 1. Gating a Component / Button (Checking Action Access)
To hide or disable a button based on user permissions, use `hasActionAccess`. 
Always pass the route constant from `route.ts`.

```tsx
import { usePermissions } from "@/hooks/use-permissions";
import { COMMON } from "@/constants/route";

export function MyComponent() {
  const { hasActionAccess } = usePermissions();

  return (
    <div>
      {hasActionAccess(COMMON.SYSTEM_SETTINGS, 'edit') && (
        <button>Lưu thay đổi</button>
      )}
    </div>
  );
}
```

### 2. Adding a New Page / Action to the System
If you are building a new page or adding a new feature (e.g., an export button) that needs permission control, follow these EXACT steps:

1. Add the route to `src/constants/route.ts`.
2. Add the page and its actions to `src/config/navigation.tsx`:
```tsx
  {
    key: COMMON.NEW_PAGE,
    label: "newPage",
    icon: <FileText />,
    actions: [
      { key: "view", label: "Xem" },
      { key: "export", label: "Xuất file" }, // Add your new action here
    ],
  },
```
3. Use `hasActionAccess(COMMON.NEW_PAGE, 'export')` in your component.
4. The Admin can now go to the Role Permissions Manager page and check the "Xuất file" checkbox to grant this permission.

---

## Best Practices
- **Do not micro-manage actions:** You do not need a separate permission for `save`, `update`, `open_modal`. Group them logically under a single `edit` action. If a user can `edit`, they can obviously save.
- **Always rely on `COMMON` constants:** Luôn luôn định nghĩa route bằng các định nghĩa trong file `src/constants/route.ts`. Tuyệt đối không hardcode dạng chuỗi như `'/my-page'`. Nếu route thay đổi trong tương lai, hệ thống phân quyền sẽ bị lỗi nếu hardcode.
- **Admin bypass:** Remember that testing with the `admin` role will always grant access. To test permissions, log in as `manager` or `dispatcher`.
