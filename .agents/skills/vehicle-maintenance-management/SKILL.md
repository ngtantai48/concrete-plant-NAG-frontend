---
name: vehicle-maintenance-management
description: Use when working on the full vehicle maintenance/repair feature: BE APIs, DB tables, FE list/detail pages, media upload, on-demand OCR, workflow approvals, histories, comments, Redux caching, permissions, and dedicated realtime maintenance notifications.
---

# Vehicle Maintenance Management

Use this skill for every task involving `/vehicle-maintenances`. This is a complete business workflow, not just a CRUD table.

This skill is also intended as a source map for another AI/code assistant to understand the implementation and write a user guide.

## Product Goal

Digitize the manual maintenance flow:

1. A driver or permitted user creates a draft maintenance/repair ticket for a vehicle.
2. The user enters repair description, invoice/payment data, and uploads invoice images/PDFs.
3. OCR is optional and runs only when the user clicks `Đọc thông tin hóa đơn`.
4. The user submits the ticket.
5. A dispatch reviewer checks and confirms or rejects it.
6. A production approver approves or rejects it.
7. The creator receives workflow status notifications.
8. Users can later review maintenance history by vehicle.

Do not assume a driver owns a fixed vehicle. A vehicle may be used by multiple drivers; driver context depends on assignment/schedule for a given date.

<!-- ## Repositories

Backend:

`D:\data\savina\nguyenanh-app-be-prod`

Frontend:

`D:\data\savina\concrete-plant-NAG-frontend` -->

## Important Files

Backend:

- `src/modules/api/v1/vehicle-maintenances/vehicle-maintenances.controller.ts`
- `src/modules/api/v1/vehicle-maintenances/vehicle-maintenances.service.ts`
- `src/modules/api/v1/vehicle-maintenances/dto/*.dto.ts`
- `src/repositories/vehicle-maintenances.repository.ts`
- `src/entities/vehicle-maintenances.entity.ts`
- `src/entities/vehicle-maintenance-documents.entity.ts`
- `src/entities/vehicle-maintenance-histories.entity.ts`
- `src/common/constants/entities.constant.ts`
- `src/common/constants/common.constant.ts`
- `src/common/constants/permissions.constant.ts`
- `src/common/utils/notification.util.ts`
- `src/gateways/notification.gateway.ts`

Frontend:

- `src/app/(home)/vehicle-maintenances/page.tsx`
- `src/app/(home)/vehicle-maintenances/[id]/page.tsx`
- `src/components/features/vehicle-maintenance-manage/TableVehicleMaintenances.tsx`
- `src/components/features/vehicle-maintenance-manage/VehicleMaintenanceDetail.tsx`
- `src/components/features/vehicle-maintenance-manage/VehicleMaintenanceDiscussion.tsx`
- `src/store/slices/vehicleMaintenanceSlice.ts`
- `src/services/vehicle-maintenance.service.ts`
- `src/services/vehicle.service.ts`
- `src/services/ocr.service.ts`
- `src/app/api/ocr/route.ts`
- `src/types/vehicle.d.ts`
- `src/constants/route.ts`
- `src/components/layout/Header.tsx`
- `src/context/socket-context.tsx`
- `src/lib/notification.ts`

## Permissions

Use permission constants. Do not hard-code role labels, because labels can change.

Current permission values:

- `/vehicle-maintenances__view`
- `/vehicle-maintenances__create`
- `/vehicle-maintenances__update`
- `/vehicle-maintenances__delete`
- `/vehicle-maintenances__submit`
- `/vehicle-maintenances__dispatch_review`
- `/vehicle-maintenances__production_approve`

Examples such as `Điều phối xe` or `Quản lý sản xuất` are only display labels.

## Data Model

Core tables:

- `vehicle_maintenances`: one ticket per maintenance/repair event.
- `vehicle_maintenance_documents`: uploaded invoice/supporting files linked to the ticket.
- `vehicle_maintenance_histories`: immutable workflow/action history.

Important `vehicle_maintenances` concepts:

- vehicle: `vehicle_id`
- time/location: `vehicle_maintenance_from_datetime`, `vehicle_maintenance_to_datetime`, `vehicle_maintenance_location`, `vehicle_maintenance_distance`
- ticket content: `vehicle_maintenance_description`, `vehicle_maintenance_type`, `vehicle_maintenance_rank`, `vehicle_maintenance_status`
- invoice/payment: `repair_unit_name`, `repair_unit_address`, `invoice_no`, `invoice_date`, `total_amount`, `currency`, `payment_status`, `deadline_pay`, `paid_at`
- OCR: `vehicle_maintenance_ocr_text`
- audit: `created_by`, `updated_by`, `reported_by`, `reviewed_by`, `reviewed_at`, `delete_flag`

Important `vehicle_maintenance_documents` concepts:

- link: `vehicle_maintenance_id`, `media_id`
- metadata: `document_type`, `description`, `sort_order`
- OCR: `ocr_status`, `ocr_text`, `ocr_raw`, `ocr_confidence`, `ocr_provider`, `ocr_error`
- audit: `created_by`, `updated_by`, `delete_flag`

Important `vehicle_maintenance_histories` concepts:

- `action`, `from_status`, `to_status`, `note`, `actor_id`, `actor_role`, `created_at`
- API response should expose actor as `{ id, role, role_label, name }`, not duplicate top-level `actor_id`/`actor_role`.
- `actor_role` in DB is a snapshot at action time. If the user role changes later, old history should still reflect the role used then.

## API Contract

Base path:

`/api/v1/vehicle-maintenances`

List/detail:

- `GET /vehicle-maintenances/list/name`: optimized table list.
- `GET /vehicle-maintenances/:id`: full detail.
- `GET /vehicle-maintenances/:id/history`: history timeline.
- `GET /vehicle-maintenances/driver-context?date=YYYY-MM-DD`: current user's vehicle assignment context.

Write/delete:

- `POST /vehicle-maintenances`
- `PUT /vehicle-maintenances/:id`
- `DELETE /vehicle-maintenances/:id`
- `POST /vehicle-maintenances/bulk-delete`

Workflow:

- `POST /vehicle-maintenances/:id/submit`
- `POST /vehicle-maintenances/:id/dispatch-approve`
- `POST /vehicle-maintenances/:id/dispatch-reject`
- `POST /vehicle-maintenances/:id/production-approve`
- `POST /vehicle-maintenances/:id/production-reject`
- `POST /vehicle-maintenances/:id/revert-approval`

Documents:

- `POST /vehicle-maintenances/:id/documents`
- `PUT /vehicle-maintenances/documents/:document_id`
- `DELETE /vehicle-maintenances/documents/:document_id`

OCR:

- `POST /vehicle-maintenances/:id/ocr`
- `POST /vehicle-maintenances/documents/:document_id/ocr`

Vehicle dropdown:

- `GET /api/v1/vehicles/list/name`

## Response Rules

`GET /vehicle-maintenances/list/name` should stay narrow for table performance. Return only the fields needed by the table: ids, vehicle display, maintenance time, rank, description, payment status/deadline, document count, and ticket status.

`GET /vehicle-maintenances/:id` should return full detail. Use singular `vehicle`, not `vehicles`.

Do not return duplicate top-level `media` once `documents[].media` exists:

```json
{
  "vehicle": {},
  "documents": [
    { "media": {} }
  ]
}
```

New responses should be wrapped consistently:

```json
{ "statusCode": 200, "data": {} }
```

or:

```json
{ "statusCode": 200, "data": [] }
```

The FE service has fallback normalization for older object-indexed responses, but BE should return the normalized shape.

## Frontend List Page

Route:

`/vehicle-maintenances`

Rules:

- Use `GET /vehicle-maintenances/list/name` for the table.
- Do not call `GET /vehicles/list/name` on initial table load.
- Call `GET /vehicles/list/name` only when opening a form that needs vehicle selection.
- Cache vehicle options in Redux; do not refetch if already loaded unless a forced refresh is intentional.
- Table has checkbox selection and no action column.
- Row click opens `/vehicle-maintenances/:id`.
- Checkbox click must not trigger row navigation.
- Bulk delete calls `POST /vehicle-maintenances/bulk-delete` and supports partial success.
- Keep selected row ids and pagination in Redux.

Expected table columns:

- checkbox
- index
- vehicle
- maintenance time
- rank
- work description
- payment
- document count
- status

## Frontend Detail Page

Route:

`/vehicle-maintenances/:id`

Rules:

- Default mode is read-only. All fields are disabled.
- `Chỉnh sửa` requires confirmation before enabling fields.
- `Lưu` calls update API, uploads/adds pending documents, then returns to read-only mode.
- `Xóa` requires confirmation, deletes, then routes back to the list.
- `Hoàn duyệt` appears for approved tickets when the actor has `/vehicle-maintenances__production_approve`.
- `Hoàn duyệt` must require a reason and a target status: `reviewing`, `submitted`, or `rejected`.
- Do not block `Hoàn duyệt` based on `payment_status`; responsibility remains with the reviewer/approver and the history row is the audit trail.
- `Back` routes to `SIDEBAR.VEHICLE_MAINTENANCES`.
- Use `SIDEBAR.VEHICLE_MAINTENANCES` from `src/constants/route.ts`; do not hard-code `/vehicle-maintenances`.
- If there are unsaved edits, Back/menu navigation must show a confirmation dialog before leaving.

Layout:

- left column: `Thông tin bảo trì`, `Hóa đơn và thanh toán`
- right column: `Mô tả công việc`, `Tài liệu và OCR`, `Thảo luận chung`
- `Lịch sử xử lý` has max height and scrolls when overflowing.

UI expectations:

- controls should have consistent height/width;
- avoid too many nested backgrounds;
- long areas scroll instead of pushing layout;
- VND input displays `.` for thousands and `,` for decimals, while state/API payload remains numeric.

## Media and OCR

Uploads:

1. Upload file to `/api/v1/media`.
2. Use returned `media_id` to create a maintenance document.
3. Use `media_reference_type = "vehicle_maintenances"`.

Preview:

- image files preview inline with Ant Design `Image`;
- PDF files open in a new tab;
- avoid redundant file-name blocks when preview already communicates the file.

Deletion:

- Ticket/document deletion is soft delete.
- Do not physically delete MinIO files unless a separate cleanup policy is designed.

OCR:

- OCR is optional and user-triggered only.
- Button text is `Đọc thông tin hóa đơn`.
- OCR fills `vehicle_maintenance_ocr_text`, and the user can edit it before save.
- `ocr_status` should move through meaningful states such as `pending`, `processing`, `done/success`, and `failed`.
- FE proxy lives at `src/app/api/ocr/route.ts` and uses the configured OpenAI-compatible OCR/chat completions provider.

## Discussion Comments

`Thảo luận chung` follows the existing comment chat behavior from:

- `src/components/features/common/TestingDetail.tsx`
- `src/components/features/common/TestingCommentChat.tsx`

Use the existing multi/comment API pattern. Do not add a maintenance-specific comment API unless product asks for it.

Support root comments, child replies, and temporary reply input under the selected comment.

## Workflow and History

Statuses:

- `draft`
- `submitted`
- `reviewing`
- `approved`
- `rejected`

Actions:

- `create`
- `update`
- `submit`
- `dispatch_approve`
- `dispatch_reject`
- `production_approve`
- `production_reject`
- `revert_approval`

Typical transitions:

- `draft` or `rejected` -> `submitted`
- `submitted` -> `reviewing`
- `submitted` -> `rejected`
- `reviewing` -> `approved`
- `reviewing` -> `rejected`
- `approved` -> `reviewing`, `submitted`, or `rejected` via `revert_approval`

`revert_approval` is the "Hoàn duyệt" action. It uses the existing production-approval permission, not a new permission. On success it clears `reviewed_by` and `reviewed_at`; the previous approval remains visible in history.

Every workflow transition should write one history row.

Do not add noisy document history actions such as `document_added`, `document_updated`, or `document_deleted` unless product explicitly asks for document-level audit history.

## Maintenance Notifications

Maintenance workflow notifications are separate from existing lot/transport notifications.

Header buttons:

- Bell: tooltip `Thông báo lốt xe`, shows notifications where `type !== "vehicle_maintenance"`.
- Wrench: tooltip `Thông báo bảo trì xe`, shows only notifications where `type === "vehicle_maintenance"`.

Clicking a maintenance notification should mark it as read and navigate to:

`SIDEBAR.VEHICLE_MAINTENANCES/{vehicle_maintenance_id}`

Do not hard-code `user_id: "all"` when marking as read. Use:

```ts
notification.userId ?? notification.user_id ?? "all"
```

Recipients:

- `submit`: users with `/vehicle-maintenances__dispatch_review`
- `dispatch_approve`: users with `/vehicle-maintenances__production_approve`, plus the ticket creator
- `dispatch_reject`: ticket creator
- `production_approve`: ticket creator
- `production_reject`: ticket creator
- `revert_approval` to `reviewing`: users with `/vehicle-maintenances__production_approve`, plus the ticket creator
- `revert_approval` to `submitted`: users with `/vehicle-maintenances__dispatch_review`, plus the ticket creator
- `revert_approval` to `rejected`: ticket creator

Reject/approve notifications should target the concrete ticket creator, not every user with `/vehicle-maintenances__submit`. This avoids notifying unrelated drivers or submit-capable users.

If the creator user has been deleted or cannot log in anymore, the workflow must still succeed. Current behavior may write an orphaned Redis notification for the old `created_by`/`reported_by` user id; no active socket will consume it and Redis TTL will eventually remove it. Only add an active-user existence check or fallback recipient, such as admin/manager, if product explicitly wants that stricter behavior.

Do not notify the actor themselves unless product asks for self-notification. Deduplicate recipients.

Messages must stay role-neutral:

- `submit`: `Phiếu bảo trì xe {vehicle} đã được gửi, cần kiểm tra.`
- `dispatch_approve`: `Phiếu bảo trì xe {vehicle} đã được xác nhận, chờ duyệt.`
- `dispatch_reject`: `Phiếu bảo trì xe {vehicle} đã bị từ chối, cần kiểm tra lại.`
- `production_approve`: `Phiếu bảo trì xe {vehicle} đã được duyệt.`
- `production_reject`: `Phiếu bảo trì xe {vehicle} đã bị từ chối, cần kiểm tra lại.`
- `revert_approval` to `reviewing`: `Phiếu bảo trì xe {vehicle} đã được hoàn duyệt, chờ phê duyệt lại.`
- `revert_approval` to `submitted`: `Phiếu bảo trì xe {vehicle} đã được hoàn duyệt, cần kiểm tra lại.`
- `revert_approval` to `rejected`: `Phiếu bảo trì xe {vehicle} đã được hoàn duyệt, cần chỉnh sửa lại.`

Vehicle label priority:

1. `vehicle_license_plate | vehicle_name`
2. license plate
3. vehicle name
4. `#vehicle_id`

## Socket and Lot Notification Compatibility

Notification socket auth must use `JwtUtil.verify(token)` so socket auth matches HTTP guard behavior.

Maintenance refresh should be targeted:

```ts
NotificationUtil.publishUsersChange(recipientIds, {
  type: "vehicle_maintenance",
  event,
  vehicle_maintenance_id,
});
```

Gateway behavior:

- payload has `target_user_ids`: emit `notification:refresh` only to `notification:room:{userId}`;
- no `target_user_ids`: broadcast as before.

Existing lot/transport notifications should keep working because:

- transport uses `type: "transport"`;
- transport still calls `NotificationUtil.publishGlobalChange(...)`;
- Bell includes all notifications where `type !== "vehicle_maintenance"`;
- targeted maintenance refresh does not replace global refresh;
- mark-read still supports global `userId: "all"`.

Workflow notification failure must not fail the workflow transition. Catch and log actual errors only. Do not leave temporary debug logs in production source.

## Debugging Checklist

Missing maintenance notification:

1. Confirm workflow action succeeded.
2. Confirm target users have the exact permission constant.
3. Confirm Redis notification exists for target users.
4. Confirm socket auth is accepted.
5. Confirm socket joined `notification:room:{userId}`.
6. Confirm `notification:get_all` returns the maintenance item.
7. Confirm Header split places it in the Wrench list.
8. Confirm click navigation uses `SIDEBAR.VEHICLE_MAINTENANCES`.

Data looks heavy/duplicated:

1. Table page must use `/vehicle-maintenances/list/name`.
2. Detail page must use `/vehicle-maintenances/:id`.
3. Vehicle dropdown options must load lazily and cache.
4. Detail response must use `vehicle`, not `vehicles`.
5. Media should appear under `documents[].media`, not top-level `media`.

File upload fails:

1. Check `/api/v1/media` response.
2. If BE runs locally and MinIO runs in Docker, ensure the MinIO host is reachable from local BE; Docker-only hostnames such as `minio-s3` may not resolve locally.
3. Check `media_reference_type = "vehicle_maintenances"`.
4. Check document record creation after media upload succeeds.

## Validation

Backend:

```bash
npx tsc --noEmit --pretty false --incremental false --project tsconfig.dev.json
```

Frontend:

```bash
npx tsc --noEmit --pretty false --incremental false
```

After React changes, run React Doctor if available.

Do not run `pnpm build`, `pnpm lint`, or `pnpm build` if the user wants to run those themselves.
