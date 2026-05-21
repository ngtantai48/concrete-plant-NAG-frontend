"use client";

import { usePermissions } from "@/hooks/use-permissions";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Clock, Info, RefreshCw, RotateCcw, Save, Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SIDEBAR } from "@/constants/route";
import systemApi from "@/services/system.service";
import { PERMISSIONS } from "@/constants/permissions";

const systemSettingsSchema = z.object({
  cmr_station_min_stay_minutes: z
    .number({ message: "Vui lòng nhập số" })
    .min(0, { message: "Không được nhập số âm" }),
  station_checkout_vehicle_checkin_warning_minutes: z
    .number({ message: "Vui lòng nhập số" })
    .min(0, { message: "Không được nhập số âm" }),
  station_checkout_vehicle_checkin_timeout_minutes: z
    .number({ message: "Vui lòng nhập số" })
    .min(0, { message: "Không được nhập số âm" }),
}).refine(data => data.station_checkout_vehicle_checkin_warning_minutes < data.station_checkout_vehicle_checkin_timeout_minutes, {
  message: "Thời gian cảnh báo phải nhỏ hơn thời gian reset",
  path: ["station_checkout_vehicle_checkin_warning_minutes"],
});

type SystemSettingsFormValues = z.infer<typeof systemSettingsSchema>;

export default function SystemSettingsForm() {
  const t = useTranslations("SystemSettingsPage");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [pendingData, setPendingData] = useState<SystemSettingsFormValues | null>(null);
  const { hasActionAccess } = usePermissions();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SystemSettingsFormValues>({
    resolver: zodResolver(systemSettingsSchema),
    defaultValues: {
      cmr_station_min_stay_minutes: 0,
      station_checkout_vehicle_checkin_warning_minutes: 0,
      station_checkout_vehicle_checkin_timeout_minutes: 0,
    },
  });

  const fetchData = async () => {
    setFetching(true);
    try {
      const response = await systemApi.getTransportsRuntime();
      if (response.data && response.data.multi_data) {
        reset(response.data.multi_data);
      }
    } catch (error) {
      console.error("Failed to fetch settings", error);
      toast.error("Không thể tải cấu hình");
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const onSubmit = (data: SystemSettingsFormValues) => {
    setPendingData(data);
    setIsConfirmDialogOpen(true);
  };

  const handleConfirmSave = async () => {
    if (!pendingData) return;
    setIsConfirmDialogOpen(false);
    setLoading(true);
    try {
      await systemApi.updateTransportsRuntime(pendingData);
      toast.success(t("saveSuccess"));
      fetchData();
    } catch (error) {
      console.error("Failed to update settings", error);
      toast.error(t("saveError"));
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] gap-4 bg-white">
        <DialogTitle className="sr-only">{t("title")}</DialogTitle>
        <DialogDescription className="sr-only">Đang tải cấu hình...</DialogDescription>
        <RefreshCw className="h-8 w-8 animate-spin text-indigo-500" />
        <p className="text-sm font-medium text-slate-500">Đang tải cấu hình...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-white">
      <DialogHeader className="px-6 py-5 border-b">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600">
            <Settings2 className="h-6 w-6" />
          </div>
          <div>
            <DialogTitle className="text-xl font-bold">{t("title")}</DialogTitle>
            <DialogDescription className="mt-1">
              Cấu hình các ngưỡng vận hành thời gian thực cho hệ thống
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col">
        <div className="p-6 space-y-8">
          {/* Setting Item 1 */}
          <div className="grid gap-4 sm:grid-cols-4 items-start">
            <div className="sm:col-span-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-500" />
                <Label className="text-base font-bold text-slate-700">Lấy hàng hợp lệ</Label>
              </div>
              <p className="text-sm text-slate-500">
                {t("cmr_station_min_stay_minutes")}
              </p>
            </div>
            <div className="relative">
              <Input
                type="number"
                step="0.1"
                className={`h-10 text-center pr-12 font-bold ${errors.cmr_station_min_stay_minutes ? "border-red-500" : ""}`}
                {...register("cmr_station_min_stay_minutes", { valueAsNumber: true })}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">phút</span>
              {errors.cmr_station_min_stay_minutes && (
                <p className="text-[10px] text-red-500 absolute -bottom-4 left-0">{errors.cmr_station_min_stay_minutes.message}</p>
              )}
            </div>
          </div>

          <div className="h-px bg-slate-100" />

          {/* Setting Item 2 */}
          <div className="grid gap-4 sm:grid-cols-4 items-start">
            <div className="sm:col-span-3">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                <Label className="text-base font-bold text-slate-700">Cảnh báo rời bãi</Label>
              </div>
              <p className="text-sm text-slate-500">
                {t("station_checkout_vehicle_checkin_warning_minutes")}
              </p>
            </div>
            <div className="relative">
              <Input
                type="number"
                step="0.1"
                className={`h-10 text-center pr-12 font-bold ${errors.station_checkout_vehicle_checkin_warning_minutes ? "border-red-500" : ""}`}
                {...register("station_checkout_vehicle_checkin_warning_minutes", { valueAsNumber: true })}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">phút</span>
              {errors.station_checkout_vehicle_checkin_warning_minutes && (
                <p className="text-[10px] text-red-500 absolute -bottom-4 left-0">{errors.station_checkout_vehicle_checkin_warning_minutes.message}</p>
              )}
            </div>
          </div>

          <div className="h-px bg-slate-100" />

          {/* Setting Item 3 */}
          <div className="grid gap-4 sm:grid-cols-4 items-start">
            <div className="sm:col-span-3">
              <div className="flex items-center gap-2 mb-1">
                <RotateCcw className="h-4 w-4 text-purple-500" />
                <Label className="text-base font-bold text-slate-700">Reset lốt chuyến</Label>
              </div>
              <p className="text-sm text-slate-500">
                {t("station_checkout_vehicle_checkin_timeout_minutes")}
              </p>
            </div>
            <div className="relative">
              <Input
                type="number"
                step="0.1"
                className={`h-10 text-center pr-12 font-bold ${errors.station_checkout_vehicle_checkin_timeout_minutes ? "border-red-500" : ""}`}
                {...register("station_checkout_vehicle_checkin_timeout_minutes", { valueAsNumber: true })}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">phút</span>
              {errors.station_checkout_vehicle_checkin_timeout_minutes && (
                <p className="text-[10px] text-red-500 absolute -bottom-4 left-0">{errors.station_checkout_vehicle_checkin_timeout_minutes.message}</p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="p-6 border-t bg-slate-50/50 sm:justify-between items-center">
          <div className="hidden sm:flex items-center gap-2 text-slate-400">
            <Info className="h-4 w-4" />
            <p className="text-sm font-semibold italic">Thay đổi có hiệu lực ngay sau khi lưu.</p>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Button type="submit" disabled={loading}  >
              {loading ? <RefreshCw className="animate-spin" /> : <Save />}
              Lưu cấu hình
            </Button>
          </div>
        </DialogFooter>
      </form>

      <AlertDialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận lưu thay đổi?</AlertDialogTitle>
            <AlertDialogDescription>
              Các thiết lập ngưỡng thời gian vận hành sẽ được cập nhật.<br />Bạn có chắc chắn muốn lưu không?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy bỏ</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmSave}>
              Xác nhận lưu
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
