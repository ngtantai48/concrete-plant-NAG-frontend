"use client";

import {
  AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAppDispatch, useAppSelector } from "@/hooks/use-app-selector";
import { usePermissions } from "@/hooks/use-permissions";
import authApi from "@/services/auth.service";
import { logoutSuccess } from "@/store/slices/authSlice";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function GuestGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { isAuthenticated } = useAppSelector((state) => state.auth);
  const { getDefaultRoute } = usePermissions();
  const [showNoAccess, setShowNoAccess] = useState(false);

  useEffect(() => {
    const handleNoAccessLogout = async () => {
      try {
        await authApi.logout();
      } catch (error) {
        console.error("Silent logout API failed:", error);
      }

      dispatch(logoutSuccess());
      // localStorage.removeItem("accessToken");
      // localStorage.removeItem("user");
      setShowNoAccess(true);
    };

    if (isAuthenticated) {
      const redirectTo = getDefaultRoute();
      if (redirectTo === "/login") {
        handleNoAccessLogout();
      } else {
        router.push(redirectTo);
      }
    }
  }, [isAuthenticated, router, getDefaultRoute, dispatch]);

  return (
    <>
      {children}
      <AlertDialog open={showNoAccess} onOpenChange={setShowNoAccess}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600">Truy cập bị từ chối</AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              Tài khoản của bạn không được cấp quyền. <br />
              Vui lòng đăng nhập tài khoản khác để sử dụng!
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowNoAccess(false)}>
              Xác nhận
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
