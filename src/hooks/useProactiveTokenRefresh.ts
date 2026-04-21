import { useEffect, useRef } from "react";
import { useAppSelector } from "@/hooks/use-app-selector";
import { jwtDecode } from "jwt-decode";
import authApi from "@/services/auth.service";
import { getStore } from "@/lib/http";
import { logoutSuccess } from "@/store/slices/authSlice";

/**
 * Proactive Token Refresh Hook
 *
 * Tự động refresh access token TRƯỚC khi nó hết hạn (sớm hơn 5 phút).
 * Giải quyết vấn đề: khi dashboard chạy idle không có user interaction,
 * token hết hạn → server dừng gửi "update" events → fetchAll không chạy → data cũ.
 *
 * Hook này chạy độc lập, không phụ thuộc vào HTTP interceptor (interceptor chỉ chạy
 * khi có HTTP request, nhưng nếu không có request nào thì token không bao giờ được refresh).
 */

const REFRESH_BEFORE_EXPIRY_S = 5 * 60; // Refresh trước 5 phút khi hết hạn

function getTokenData(token: string): { exp: number; iat?: number } | null {
  try {
    const decoded: any = jwtDecode(token);
    if (typeof decoded.exp !== "number") return null;
    console.log("[ProactiveTokenRefresh] Token data exp:", decoded.exp);
    return { exp: decoded.exp, iat: decoded.iat };
  } catch {
    return null;
  }
}

export function useProactiveTokenRefresh() {
  const tokenState = useAppSelector((state: any) => state.auth.token);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRefreshingRef = useRef(false);

  useEffect(() => {
    // Cleanup timer cũ
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!tokenState) return;

    const tokenData = getTokenData(tokenState);
    if (!tokenData) return;

    const { exp, iat } = tokenData;
    const nowS = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = exp - nowS;

    if (timeUntilExpiry <= 0) {
      doRefresh();
      return;
    }

    // Tính toán thời điểm refresh an toàn:
    // Mặc định refresh trước 5 phút (300s).
    // Nếu token có lifetime ngắn (ví dụ server set 5 phút), ta refresh sau 80% lifetime.
    const totalLifetime = iat ? exp - iat : timeUntilExpiry;
    const refreshBufferS = Math.min(REFRESH_BEFORE_EXPIRY_S, Math.floor(totalLifetime * 0.2));

    const refreshInMs = Math.max(timeUntilExpiry - refreshBufferS, 0) * 1000;

    console.log(
      `[ProactiveTokenRefresh] Token lifetime: ${Math.round(totalLifetime / 60)}m, Expiring in: ${Math.round(timeUntilExpiry / 60)}m. Will refresh in: ${Math.round(refreshInMs / 1000 / 60)}m (Buffer: ${refreshBufferS}s)`
    );

    timerRef.current = setTimeout(() => {
      doRefresh();
    }, refreshInMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [tokenState]);

  function doRefresh() {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;

    console.log("[ProactiveTokenRefresh] Đang tự động refresh token...");

    authApi
      .refreshToken()
      .then((res) => {
        const newToken = res.data.accessToken;
        const store = getStore();
        store?.dispatch({
          type: "auth/login/fulfilled",
          payload: {
            user_id: res.data.user_id,
            role: res.data.role,
            role_id: res.data.role_id,
            accessToken: newToken,
            user_full_name: res.data.user_full_name,
          },
        });
        console.log("[ProactiveTokenRefresh] ✅ Token đã được refresh thành công");
      })
      .catch((err) => {
        console.error("[ProactiveTokenRefresh] ❌ Refresh thất bại:", err);
        const store = getStore();
        store?.dispatch(logoutSuccess());
      })
      .finally(() => {
        isRefreshingRef.current = false;
      });
  }
}
