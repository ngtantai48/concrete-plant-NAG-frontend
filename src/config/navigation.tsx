import { PERMISSIONS } from "@/constants/permissions";
import { ROLES } from "@/constants/roles";
import { SIDEBAR } from "@/constants/route";
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
    key: SIDEBAR.DASHBOARD,
    label: "dashboard",
    icon: <Gauge />,
    actions: [
      { key: PERMISSIONS.DASHBOARD.VIEW, label: "Xem" },
      { key: PERMISSIONS.DASHBOARD.MANUAL_SORT, label: "Sắp xếp thứ tự lốt xe" },
      { key: PERMISSIONS.DASHBOARD.SYNC_SLOTS, label: "Đồng bộ lốt xe" },
      { key: PERMISSIONS.DASHBOARD.MANUAL_CAMERA_FALLBACK, label: "Thao tác thủ công (camera sự cố)" },
    ],
  },
  {
    key: "user-manage-group",
    label: "userManagement",
    icon: <UsersRound />,
    roles: [ROLES.ADMIN],
    children: [
      {
        key: SIDEBAR.USER_MANAGE,   // đang sai ở key này, xem xét đổi cấu trúc route lại
        label: "allUsers",
        icon: <UserCog size={18} />,
        actions: [
          { key: PERMISSIONS.USER_MANAGE.VIEW, label: "Xem danh sách người dùng" },
          { key: PERMISSIONS.USER_MANAGE.CREATE, label: "Thêm người dùng" },
          { key: PERMISSIONS.USER_MANAGE.UPDATE, label: "Sửa người dùng" },
          { key: PERMISSIONS.USER_MANAGE.DELETE, label: "Xóa người dùng" },
        ],
      },
      {
        key: SIDEBAR.ROLE_PERMISSIONS,
        label: "rolePermissions",
        icon: <ShieldCheck size={18} />,
        roles: [ROLES.ADMIN],
        actions: [
          { key: PERMISSIONS.PERMISSIONS_MANAGE.VIEW, label: "Xem quyền hạn" },
          { key: PERMISSIONS.PERMISSIONS_MANAGE.UPDATE, label: "Chỉnh sửa quyền hạn" },
        ],
      },
    ],
  },
  {
    key: SIDEBAR.VEHICLES,
    label: "vehicles",
    icon: <Car />,
    actions: [
      { key: PERMISSIONS.VEHICLES.VIEW, label: "Xem danh sách phương tiện" },
      { key: PERMISSIONS.VEHICLES.CREATE, label: "Thêm phương tiện" },
      { key: PERMISSIONS.VEHICLES.UPDATE, label: "Sửa phương tiện" },
      { key: PERMISSIONS.VEHICLES.DELETE, label: "Xóa phương tiện" },
    ],
  },
  {
    key: SIDEBAR.VEHICLE_MAINTENANCES,
    label: "vehicleMaintenances",
    icon: <Wrench />,
    actions: [
      { key: PERMISSIONS.VEHICLE_MAINTENANCES.VIEW, label: "Xem dữ liệu bảo trì" },
      { key: PERMISSIONS.VEHICLE_MAINTENANCES.CREATE, label: "Thêm bảo trì" },
      { key: PERMISSIONS.VEHICLE_MAINTENANCES.UPDATE, label: "Sửa bảo trì" },
      { key: PERMISSIONS.VEHICLE_MAINTENANCES.DELETE, label: "Xóa bảo trì" },
    ],
  },
  {
    key: SIDEBAR.VEHICLE_TYPES,
    label: "vehicleTypes",
    icon: <Layers />,
    actions: [
      { key: PERMISSIONS.VEHICLE_TYPES.VIEW, label: "Xem danh sách loại phương tiện" },
      { key: PERMISSIONS.VEHICLE_TYPES.CREATE, label: "Thêm loại phương tiện" },
      { key: PERMISSIONS.VEHICLE_TYPES.UPDATE, label: "Sửa loại phương tiện" },
      { key: PERMISSIONS.VEHICLE_TYPES.DELETE, label: "Xóa loại phương tiện" },
    ],
  },
  {
    key: SIDEBAR.STATIONS,
    label: "stations",
    icon: <MapPin />,
    actions: [
      { key: PERMISSIONS.STATIONS.VIEW, label: "Xem danh sách bãi/trạm" },
      { key: PERMISSIONS.STATIONS.CREATE, label: "Thêm bãi/trạm" },
      { key: PERMISSIONS.STATIONS.UPDATE, label: "Sửa bãi/trạm" },
      { key: PERMISSIONS.STATIONS.DELETE, label: "Xóa bãi/trạm" },
    ],
  },
  {
    key: "tools-group",
    label: "tools",
    icon: <Package />,
    children: [
      {
        key: SIDEBAR.MEAL_CHECK,
        label: "mealCheck",
        icon: <UtensilsCrossed size={18} />,
        // actions: [
        //   { key: PERMISSIONS.MEAL_CHECK.VIEW, label: "Xem" },
        // ],
      },
      {
        key: SIDEBAR.ATTENDANCE,
        label: "attendance",
        icon: <CalendarCheck size={18} />,
        // actions: [
        //   { key: PERMISSIONS.ATTENDANCE.VIEW, label: "Xem" },
        // ],
      },
    ],
  },
  {
    key: SIDEBAR.SYSTEM_SETTINGS,
    label: "systemSettings",
    icon: <Settings />,
    actions: [
      { key: PERMISSIONS.SYSTEM_SETTINGS.VIEW, label: "Xem" },
      { key: PERMISSIONS.SYSTEM_SETTINGS.UPDATE, label: "Sửa" },
    ],
  },
];
