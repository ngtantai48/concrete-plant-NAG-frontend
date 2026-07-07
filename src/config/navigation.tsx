import { PERMISSIONS } from "@/constants/permissions";
import { SIDEBAR } from "@/constants/route";
import {
  ArrowRightLeft,
  Award,
  Bot,
  Briefcase,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Car,
  ClipboardCheck,
  ClipboardList,
  Fuel,
  Gauge,
  Layers,
  Link2,
  MapPin,
  Package,
  Settings2,
  ShieldCheck,
  Tags,
  UserCog,
  UsersRound,
  UtensilsCrossed,
  Wrench,
} from "lucide-react";
import React from "react";

export interface PageFunc {
  key: string;
  label: string;
}

export interface NavItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  actions?: PageFunc[];
  children?: NavItem[];
  roles?: string[];
  /** Ẩn khỏi menu sidebar nhưng vẫn giữ trong config (vẫn sinh cây phân quyền + vẫn là route hợp lệ). */
  hideInSidebar?: boolean;
  /** Các route key khác cũng cho phép hiện mục này (vd trang gộp mở được bằng 1 trong 2 quyền). */
  extraAccessKeys?: string[];
}

export const navigationConfig: NavItem[] = [
  {
    key: SIDEBAR.DASHBOARD,
    label: "dashboard",
    icon: <Gauge />,
    actions: [
      { key: PERMISSIONS.DASHBOARD.VIEW, label: "Xem thông tin chung" },
      { key: PERMISSIONS.DASHBOARD.ORDER_DETAIL, label: "Xem chi tiết các chuyến xe (đơn hàng)" },
      { key: PERMISSIONS.DASHBOARD.SYNC_SLOTS, label: "Thao tác đồng bộ lốt xe" },
      { key: PERMISSIONS.DASHBOARD.HISTORY, label: "Xem lịch sử lốt xe" },
      { key: PERMISSIONS.DASHBOARD.CHECKLOG, label: "Xem nhật ký vận hành" },
      { key: PERMISSIONS.DASHBOARD.MANUAL_SORT, label: "Thao tác sắp xếp thứ tự lốt xe" },
      { key: PERMISSIONS.DASHBOARD.VIEW_MAP, label: "Xem bản đồ" },
      {
        key: PERMISSIONS.DASHBOARD.MANUAL_CAMERA_FALLBACK,
        label: "Thao tác cho xe vào/xuất trạm (camera sự cố)",
      },
      { key: PERMISSIONS.DASHBOARD.SYSTEM_SETTINGS, label: "Cấu hình vận hành" },
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
      { key: PERMISSIONS.VEHICLE_MAINTENANCES.SUBMIT, label: "Gửi phiếu bảo trì" },
      { key: PERMISSIONS.VEHICLE_MAINTENANCES.DISPATCH_REVIEW, label: "Kiểm tra bảo trì" },
      { key: PERMISSIONS.VEHICLE_MAINTENANCES.PRODUCTION_APPROVE, label: "Phê duyệt bảo trì" },
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
    key: "reports-group",
    label: "reports",
    icon: <ClipboardList />,
    children: [
      {
        key: SIDEBAR.REPORT_PRODUCTION,
        label: "reportProduction",
        icon: <Gauge size={18} />,
      },
      {
        key: SIDEBAR.REPORT_FUEL,
        label: "reportFuel",
        icon: <ArrowRightLeft size={18} />,
      },
    ],
  },
  {
    key: SIDEBAR.PARKING_IDLE_ENGINE,
    label: "parkingIdleEngine",
    icon: <Fuel />,
    actions: [
      { key: PERMISSIONS.PARKING_IDLE_ENGINE.VIEW, label: "Xem giám sát nổ máy trong bãi" },
      { key: PERMISSIONS.PARKING_IDLE_ENGINE.SETTINGS, label: "Cấu hình cảnh báo nổ máy" },
    ],
  },
  {
    key: "tools-group",
    label: "tools",
    icon: <Package />,
    children: [
      {
        key: SIDEBAR.CALENDAR,
        label: "calendar",
        icon: <CalendarDays size={18} />,
        actions: [{ key: PERMISSIONS.CALENDAR.VIEW, label: "Xem lịch âm/dương" }],
      },
      {
        key: SIDEBAR.MEAL_CHECK,
        label: "mealCheck",
        icon: <UtensilsCrossed size={18} />,
      },
      {
        key: SIDEBAR.WORK_ATTENDANCE,
        label: "workAttendance",
        icon: <CalendarDays size={18} />,
        // Gộp vào "Bố trí công việc": ẩn khỏi menu nhưng giữ trong config để bảng phân quyền vẫn cấp được quyền chấm công.
        hideInSidebar: true,
        actions: [
          { key: PERMISSIONS.WORK_ATTENDANCE.VIEW, label: "Xem bảng công" },
          { key: PERMISSIONS.WORK_ATTENDANCE.UPDATE, label: "Cập nhật nghỉ nửa ngày" },
        ],
      },
      {
        key: SIDEBAR.WORK_ARRANGEMENTS_EXPERIMENT,
        label: "workArrangementsExperiment",
        icon: <ClipboardList size={18} />,
        // Bản thử nghiệm đã lên làm trang chính (/work-arrangements); URL này giữ bản gốc, ẩn khỏi menu.
        hideInSidebar: true,
        extraAccessKeys: [SIDEBAR.WORK_ARRANGEMENTS, SIDEBAR.WORK_ATTENDANCE, SIDEBAR.WORKS],
      },
      {
        key: SIDEBAR.WORK_ARRANGEMENTS,
        label: "workArrangements",
        icon: <BriefcaseBusiness size={18} />,
        // Trang "Bố trí công việc" gộp 2 tab (Phân công + Chấm công); hiện ở menu nếu có 1 trong 2 quyền.
        extraAccessKeys: [SIDEBAR.WORK_ATTENDANCE],
        actions: [
          { key: PERMISSIONS.WORK_ARRANGEMENTS.VIEW, label: "Xem phân công" },
          { key: PERMISSIONS.WORK_ARRANGEMENTS.UPDATE, label: "Cập nhật phân công" },
        ],
      },
      {
        key: SIDEBAR.LOT_TAG_REQUESTS,
        label: "lotTagRequests",
        icon: <ClipboardCheck size={18} />,
        actions: [
          { key: PERMISSIONS.LOT_TAG_REQUESTS.VIEW, label: "Xem đơn xin bận" },
          { key: PERMISSIONS.LOT_TAG_REQUESTS.CREATE, label: "Tạo đơn xin bận" },
          { key: PERMISSIONS.LOT_TAG_REQUESTS.REVIEW, label: "Duyệt/từ chối đơn xin bận" },
          { key: PERMISSIONS.LOT_TAG_REQUESTS.CANCEL, label: "Hủy đơn xin bận" },
        ],
      },
    ],
  },
  {
    key: SIDEBAR.AI_ASSISTANT,
    label: "aiAssistant",
    icon: <Bot />,
    // roles: [ROLES.ADMIN],
  },
  {
    key: "category-group",
    label: "category",
    icon: <Settings2 />,
    children: [
      {
        key: SIDEBAR.VEHICLE_TYPES,
        label: "vehicleTypes",
        icon: <Layers size={18} />,
        actions: [
          { key: PERMISSIONS.VEHICLE_TYPES.VIEW, label: "Xem danh sách loại phương tiện" },
          { key: PERMISSIONS.VEHICLE_TYPES.CREATE, label: "Thêm loại phương tiện" },
          { key: PERMISSIONS.VEHICLE_TYPES.UPDATE, label: "Sửa loại phương tiện" },
          { key: PERMISSIONS.VEHICLE_TYPES.DELETE, label: "Xóa loại phương tiện" },
        ],
      },
      {
        key: SIDEBAR.DEPARTMENTS,
        label: "departments",
        icon: <Building2 size={18} />,
        actions: [
          { key: PERMISSIONS.DEPARTMENTS.VIEW, label: "Xem danh sách bộ phận" },
          { key: PERMISSIONS.DEPARTMENTS.CREATE, label: "Thêm bộ phận" },
          { key: PERMISSIONS.DEPARTMENTS.UPDATE, label: "Sửa bộ phận" },
          { key: PERMISSIONS.DEPARTMENTS.ASSIGN_USERS, label: "Gán nhân sự vào bộ phận" },
          { key: PERMISSIONS.DEPARTMENTS.DELETE, label: "Xóa bộ phận" },
        ],
      },
      {
        key: SIDEBAR.SKILLS,
        label: "skills",
        icon: <Award size={18} />,
        actions: [
          { key: PERMISSIONS.SKILLS.VIEW, label: "Xem danh sách tay nghề" },
          { key: PERMISSIONS.SKILLS.CREATE, label: "Thêm tay nghề" },
          { key: PERMISSIONS.SKILLS.UPDATE, label: "Sửa tay nghề" },
          { key: PERMISSIONS.SKILLS.DELETE, label: "Xóa tay nghề" },
        ],
      },
      {
        key: SIDEBAR.USER_ASSIGNMENTS,
        label: "userAssignments",
        icon: <Link2 size={18} />,
        actions: [
          { key: PERMISSIONS.USER_ASSIGNMENTS.VIEW, label: "Xem danh mục nhân sự" },
          { key: PERMISSIONS.USER_ASSIGNMENTS.CREATE, label: "Thêm nhân sự" },
          { key: PERMISSIONS.USER_ASSIGNMENTS.UPDATE, label: "Sửa nhân sự" },
          { key: PERMISSIONS.USER_ASSIGNMENTS.DELETE, label: "Xóa nhân sự" },
        ],
      },
      {
        key: SIDEBAR.WORKS,
        label: "works",
        icon: <Briefcase size={18} />,
        actions: [
          { key: PERMISSIONS.WORKS.VIEW, label: "Xem danh sách công việc" },
          { key: PERMISSIONS.WORKS.CREATE, label: "Thêm công việc" },
          { key: PERMISSIONS.WORKS.UPDATE, label: "Sửa công việc" },
          { key: PERMISSIONS.WORKS.DELETE, label: "Xóa công việc" },
        ],
      },
      {
        key: SIDEBAR.LOT_TAGS,
        label: "lotTags",
        icon: <Tags size={18} />,
        actions: [
          { key: PERMISSIONS.LOT_TAGS.VIEW, label: "Xem danh sách tag lốt" },
          { key: PERMISSIONS.LOT_TAGS.CREATE, label: "Thêm tag lốt" },
          { key: PERMISSIONS.LOT_TAGS.UPDATE, label: "Sửa tag lốt" },
          { key: PERMISSIONS.LOT_TAGS.DELETE, label: "Xóa tag lốt" },
        ],
      },
    ],
  },
  {
    key: "user-manage-group",
    label: "userManagement",
    icon: <UsersRound />,
    // roles: [ROLES.ADMIN],
    children: [
      {
        key: SIDEBAR.USER_MANAGE,
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
        // roles: [ROLES.ADMIN],
        actions: [
          { key: PERMISSIONS.PERMISSIONS_MANAGE.VIEW, label: "Xem quyền hạn" },
          { key: PERMISSIONS.PERMISSIONS_MANAGE.UPDATE, label: "Chỉnh sửa quyền hạn" },
        ],
      },
    ],
  },
];
