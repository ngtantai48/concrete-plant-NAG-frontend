"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { 
  Save, 
  RefreshCw, 
  Clock, 
  AlertCircle, 
  RotateCcw, 
  Settings2,
  Info
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import systemApi from "@/services/system.service";

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

  const onSubmit = async (data: SystemSettingsFormValues) => {
    setLoading(true);
    try {
      await systemApi.updateTransportsRuntime(data);
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
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 bg-white/50 rounded-3xl border border-dashed border-gray-200">
        <RefreshCw className="h-10 w-10 animate-spin text-amber-500" />
        <p className="font-semibold text-gray-500">Đang đồng bộ dữ liệu...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-4">
      <div className="bg-white shadow-[0_4px_20px_rgba(0,0,0,0.03)] rounded-3xl overflow-hidden border border-slate-100">
        {/* Header Section Section */}
        <div className="bg-slate-50/50 p-6 md:p-8 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white shadow-sm rounded-2xl border border-slate-100">
              <Settings2 className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800 tracking-tight">
                {t("title")}
              </h1>
              <p className="text-slate-400 text-sm font-medium mt-0.5">Cấu hình các ngưỡng vận hành thời gian thực cho hệ thống</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-8 md:p-10">
          <div className="space-y-8">
            
            {/* Setting Item 1 */}
            <div className="flex flex-col lg:flex-row lg:items-center gap-6 group">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-blue-50 rounded-xl">
                    <Clock className="h-5 w-5 text-blue-600" />
                  </div>
                  <h3 className="font-bold text-slate-700 text-base">Lấy hàng hợp lệ</h3>
                </div>
                <p className="text-sm text-slate-500 leading-relaxed max-w-2xl">
                  {t("cmr_station_min_stay_minutes")}
                </p>
              </div>
              <div className="w-full lg:w-52 relative">
                <Input
                  type="number"
                  step="0.1"
                  className={`h-12 bg-slate-50/30 border-2 text-lg font-bold pr-16 rounded-2xl focus-visible:ring-blue-100 focus-visible:border-blue-500 transition-all ${
                    errors.cmr_station_min_stay_minutes ? "border-red-200" : "border-slate-100"
                  }`}
                  {...register("cmr_station_min_stay_minutes", { valueAsNumber: true })}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">phút</span>
                {errors.cmr_station_min_stay_minutes && (
                  <p className="text-xs text-red-500 absolute -bottom-6 left-1 font-medium">{errors.cmr_station_min_stay_minutes.message}</p>
                )}
              </div>
            </div>

            <div className="h-px bg-slate-50 w-full"></div>

            {/* Setting Item 2 */}
            <div className="flex flex-col lg:flex-row lg:items-center gap-6 group">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-amber-50 rounded-xl">
                    <AlertCircle className="h-5 w-5 text-amber-600" />
                  </div>
                  <h3 className="font-bold text-slate-700 text-base">Cảnh báo rời bãi</h3>
                </div>
                <p className="text-sm text-slate-500 leading-relaxed max-w-2xl">
                  {t("station_checkout_vehicle_checkin_warning_minutes")}
                </p>
              </div>
              <div className="w-full lg:w-52 relative">
                <Input
                  type="number"
                  step="0.1"
                  className={`h-12 bg-slate-50/30 border-2 text-lg font-bold pr-16 rounded-2xl focus-visible:ring-amber-100 focus-visible:border-amber-500 transition-all ${
                    errors.station_checkout_vehicle_checkin_warning_minutes ? "border-red-200" : "border-slate-100"
                  }`}
                  {...register("station_checkout_vehicle_checkin_warning_minutes", { valueAsNumber: true })}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">phút</span>
                {errors.station_checkout_vehicle_checkin_warning_minutes && (
                  <p className="text-xs text-red-500 absolute -bottom-6 left-1 font-medium">{errors.station_checkout_vehicle_checkin_warning_minutes.message}</p>
                )}
              </div>
            </div>

            <div className="h-px bg-slate-50 w-full"></div>

            {/* Setting Item 3 */}
            <div className="flex flex-col lg:flex-row lg:items-center gap-6 group">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-purple-50 rounded-xl">
                    <RotateCcw className="h-5 w-5 text-purple-600" />
                  </div>
                  <h3 className="font-bold text-slate-700 text-base">Reset lốt chuyến</h3>
                </div>
                <p className="text-sm text-slate-500 leading-relaxed max-w-2xl">
                  {t("station_checkout_vehicle_checkin_timeout_minutes")}
                </p>
              </div>
              <div className="w-full lg:w-52 relative">
                <Input
                  type="number"
                  step="0.1"
                  className={`h-12 bg-slate-50/30 border-2 text-lg font-bold pr-16 rounded-2xl focus-visible:ring-purple-100 focus-visible:border-purple-500 transition-all ${
                    errors.station_checkout_vehicle_checkin_timeout_minutes ? "border-red-200" : "border-slate-100"
                  }`}
                  {...register("station_checkout_vehicle_checkin_timeout_minutes", { valueAsNumber: true })}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">phút</span>
                {errors.station_checkout_vehicle_checkin_timeout_minutes && (
                  <p className="text-xs text-red-500 absolute -bottom-6 left-1 font-medium">{errors.station_checkout_vehicle_checkin_timeout_minutes.message}</p>
                )}
              </div>
            </div>

          </div>

          {/* Footer Actions */}
          <div className="mt-12 flex flex-col sm:flex-row items-center justify-between gap-6 p-6 bg-slate-50/80 rounded-2xl border border-slate-100">
            <div className="flex items-center gap-3 text-slate-400">
              <Info className="h-5 w-5" />
              <p className="text-[11px] font-semibold italic">Thay đổi sẽ có hiệu lực ngay lập tức sau khi lưu.</p>
            </div>
            
            <div className="flex items-center gap-4 w-full sm:w-auto">
              <Button
                type="button"
                variant="ghost"
                onClick={() => fetchData()}
                disabled={loading}
                className="flex-1 sm:flex-none h-11 px-6 rounded-xl font-bold text-slate-500 hover:bg-white"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${fetching ? "animate-spin" : ""}`} />
                Làm mới
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="flex-1 sm:flex-none h-11 px-10 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold shadow-lg shadow-amber-200"
              >
                {loading ? (
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Lưu cấu hình
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
