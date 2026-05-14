---
name: yard-vehicles-dashboard
description: Use when working on /admin/dashboard Ready Vehicles / Xe trong bai logic, including inYardVehicles, yardOrders, Vtracking GPS distance, order_init_datetime sorting, or related dashboard performance fixes.
---

# Yard Vehicles Dashboard Logic

Use this project-local skill whenever a request touches the `/admin/dashboard` "Ready Vehicles" / "Xe trong bai" panel or nearby code paths.

## Core Behavior

- The visible vehicle list is still based on Vtracking GPS/geofence data from `useNearbyVehicles`.
- A vehicle appears in "Xe trong bai" only when it is `inRange` and its Vtracking `vehicle_name` starts with `X`.
- Distance is realtime GPS distance from Vtracking and must keep updating in the card.
- Do not sort this panel by GPS distance.
- Do not use Vtracking `timestamp` as the yard-entry time. That timestamp is the latest GPS/device update time.

## Yard Entry Time Source

- The displayed time and sort key are `order.order_init_datetime`.
- Backend creates the order when GPS detects the vehicle entering the yard radius, so `order_init_datetime` is the durable yard-entry time.
- The same order can move through these yard statuses while keeping the same `order_init_datetime`:
  - `pending`
  - `collecting`
  - `transporting`
- Fetch all three statuses and merge them into `yardOrders`.
- Backend does not currently support a multi-status `order_status` param, so keep three parallel `orderApi.getByStatus(...)` calls unless backend support is explicitly added.

## Mapping Vehicles To Orders

- Build a map from `yardOrders` to entry time.
- Key priority:
  - `order.vehicles.vehicle_license_plate`
  - fallback `order.vehicles.vehicle_name`
- Match Vtracking vehicles using:
  - `v.license_plate`
  - fallback `v.vehicle_name`
- Normalize keys with trim + uppercase.
- If multiple valid orders match one vehicle unexpectedly, use the earliest `order_init_datetime`.

## Important Non-Goals

- Do not filter yard orders by `stations.station_id`.
- `stations` on an order is the destination/processing station, not the yard. Station id `4` is only backend context for yard GPS detection and is not represented as order station logic here.
- Do not replace the three status requests with `getAll` + frontend filtering unless explicitly requested; that may fetch unnecessary order data.
- Do not persist yard entry time in frontend state/localStorage for this feature; backend order data is the source of truth.

## Current Implementation Pointers

- `src/components/features/admin/dashboard/AdminDashboard.tsx`
  - `yardOrders`
  - `yardOrderInitTimeByVehicleKey`
  - `inYardVehicles`
  - the Ready Vehicles / Xe trong bai `<li key={v.device_id}>` render
- `src/hooks/useNearbyVehicles.ts`
  - computes `distance` and `inRange`
  - should not sort by distance by default
- `src/services/order.service.ts`
  - `getByStatus(status: string)` supports one status per request

## Validation

After edits, run:

```bash
pnpm exec tsc --noEmit --ignoreDeprecations 6.0
```

For React-specific changes, also run:

```bash
npx -y react-doctor@latest . --verbose --diff
```
