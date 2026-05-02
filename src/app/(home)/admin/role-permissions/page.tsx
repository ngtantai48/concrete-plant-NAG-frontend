import RolePermissionsManager from "@/components/features/admin/role-permissions/RolePermissionsManager";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Phân quyền người dùng | NAG",
  description: "Quản lý quyền truy cập của các vai trò trong hệ thống",
};

export default function RolePermissionsPage() {
  return <RolePermissionsManager />;
}
