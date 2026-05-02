import { ADMIN, COMMON } from "@/constants/route";
import {
  CalendarCheck, Car, Gauge, Layers, MapPin, Package, UsersRound,
  Wrench, Settings, ShieldCheck, UserCog, UtensilsCrossed
} from "lucide-react";
import React from "react";

export interface PageFunc {
  key: string;
  label: string;
}

export interface NavItem {
  key: string;
  label: string; // Translation key in 'Sidebar' namespace
  icon?: React.ReactNode;
  actions?: PageFunc[];
  children?: NavItem[];
  roles?: string[]; // Optional: restrict this item to specific roles (e.g., ['admin', 'dispatcher'])
}

export const navigationConfig: NavItem[] = [
  {
    key: COMMON.DASHBOARD,
    label: "dashboard",
    icon: <Gauge />,
    actions: [
      { key: "view", label: "Xem (View)" },
      { key: "manual_sort", label: "Sắp xếp thủ công (Manual sort)" },
      { key: "sync_slots", label: "Đồng bộ lốt xe (Sync slots)" },
    ],
  },
  {
    key: "user-manage-group",
    label: "userManagement",
    icon: <UsersRound />,
    roles: ["admin"],
    children: [
      {
        key: ADMIN.USER_MANAGE,
        label: "allUsers",
        icon: <UserCog size={18} />,
        actions: [
          { key: "view", label: "Xem" },
          { key: "add", label: "Thêm" },
          { key: "edit", label: "Sửa" },
          { key: "delete", label: "Xóa" },
        ],
      },
      {
        key: ADMIN.ROLE_PERMISSIONS,
        label: "rolePermissions",
        icon: <ShieldCheck size={18} />,
        roles: ["admin"],
        actions: [
          { key: "view", label: "Xem" },
          { key: "edit", label: "Sửa" },
        ],
      },
    ],
  },
  {
    key: COMMON.VEHICLES,
    label: "vehicles",
    icon: <Car />,
    actions: [
      { key: "view", label: "Xem" },
      { key: "add", label: "Thêm" },
      { key: "edit", label: "Sửa" },
      { key: "delete", label: "Xóa" },
    ],
  },
  {
    key: COMMON.VEHICLE_MAINTENANCES,
    label: "vehicleMaintenances",
    icon: <Wrench />,
    actions: [
      { key: "view", label: "Xem" },
      { key: "add", label: "Thêm" },
      { key: "edit", label: "Sửa" },
      { key: "delete", label: "Xóa" },
    ],
  },
  {
    key: COMMON.VEHICLE_TYPES,
    label: "vehicleTypes",
    icon: <Layers />,
    actions: [
      { key: "view", label: "Xem" },
      { key: "add", label: "Thêm" },
      { key: "edit", label: "Sửa" },
      { key: "delete", label: "Xóa" },
    ],
  },
  {
    key: COMMON.STATIONS,
    label: "stations",
    icon: <MapPin />,
    actions: [
      { key: "view", label: "Xem" },
      { key: "add", label: "Thêm" },
      { key: "edit", label: "Sửa" },
      { key: "delete", label: "Xóa" },
    ],
  },
  {
    key: "tools-group",
    label: "tools",
    icon: <Package />,
    children: [
      {
        key: COMMON.MEAL_CHECK,
        label: "mealCheck",
        icon: <UtensilsCrossed size={18} />,
        actions: [
          { key: "view", label: "Xem" },
          { key: "add", label: "Thêm" },
          { key: "edit", label: "Sửa" },
          { key: "delete", label: "Xóa" },
        ],
      },
      {
        key: COMMON.ATTENDANCE,
        label: "attendance",
        icon: <CalendarCheck size={18} />,
        actions: [
          { key: "view", label: "Xem" },
          { key: "add", label: "Thêm" },
          { key: "edit", label: "Sửa" },
          { key: "delete", label: "Xóa" },
        ],
      },
    ],
  },
  {
    key: COMMON.SYSTEM_SETTINGS,
    label: "systemSettings",
    icon: <Settings />,
    actions: [
      { key: "view", label: "Xem" },
      { key: "edit", label: "Sửa" },
    ],
  },
];
