"use client";

import React, { useEffect, useRef, useState } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Popconfirm } from "antd";
import { CheckCircle2, AlertTriangle, Wrench, Loader2, HelpCircle } from "lucide-react";
import vehicleApi from "@/services/vehicle.service";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface VehicleStatusChangeProps {
  vehicleId: number;
  currentStatus: string;
  vehiclePlate: string;
  onStatusChanged?: () => void;
  className?: string;
}

const STATUSES = [
  {
    value: "available",
    label: "Sẵn sàng",
    icon: CheckCircle2,
    activeClass: "border-emerald-400 bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-100",
    dotClass: "bg-emerald-500",
  },
  {
    value: "incident",
    label: "Sự cố",
    icon: AlertTriangle,
    activeClass: "border-red-400 bg-red-50 text-red-700 shadow-sm shadow-red-100",
    dotClass: "bg-red-500",
  },
  {
    value: "maintenance",
    label: "Bảo dưỡng",
    icon: Wrench,
    activeClass: "border-amber-400 bg-amber-50 text-amber-700 shadow-sm shadow-amber-100",
    dotClass: "bg-amber-500",
  },
  {
    value: "other",
    label: "Việc khác",
    icon: HelpCircle,
    activeClass: "border-purple-400 bg-purple-50 text-purple-700 shadow-sm shadow-purple-100",
    dotClass: "bg-purple-500",
  },
] as const;

const VehicleStatusChange = ({
  vehicleId,
  currentStatus,
  vehiclePlate,
  onStatusChanged,
  className,
}: VehicleStatusChangeProps) => {
  // Track the "known server status" — starts from prop, updated after successful API call
  const knownStatus = useRef(currentStatus);
  const [selectedStatus, setSelectedStatus] = useState(currentStatus);
  const [isUpdating, setIsUpdating] = useState(false);

  // Sync when parent prop changes (e.g. after fetchAll completes)
  useEffect(() => {
    knownStatus.current = currentStatus;
    setSelectedStatus(currentStatus);
  }, [currentStatus]);

  const hasChanged = selectedStatus !== knownStatus.current;

  const handleUpdate = async () => {
    if (!hasChanged) return;
    setIsUpdating(true);
    try {
      await vehicleApi.update(vehicleId, { vehicle_status: selectedStatus });
      // Update the known status immediately so hasChanged becomes false
      knownStatus.current = selectedStatus;
      // Force re-render to reflect the new baseline
      setSelectedStatus(selectedStatus);
      toast.success(`Đã cập nhật trạng thái xe ${vehiclePlate} thành công`);
      onStatusChanged?.();
    } catch {
      toast.error("Cập nhật trạng thái thất bại");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <RadioGroup
        value={selectedStatus}
        onValueChange={setSelectedStatus}
        className="flex items-center gap-1"
      >
        {STATUSES.map((status) => {
          const Icon = status.icon;
          const isSelected = selectedStatus === status.value;
          return (
            <Label
              key={status.value}
              htmlFor={`status-${vehicleId}-${status.value}`}
              className={cn(
                "flex items-center gap-1.5 cursor-pointer rounded-md border px-2.5 py-1 text-xs font-semibold transition-all select-none",
                isSelected
                  ? status.activeClass
                  : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50"
              )}
            >
              <RadioGroupItem
                value={status.value}
                id={`status-${vehicleId}-${status.value}`}
                className="sr-only"
              />
              <Icon className="h-3.5 w-3.5" />
              {status.label}
            </Label>
          );
        })}
      </RadioGroup>

      <Popconfirm
        title="Xác nhận thay đổi trạng thái"
        description={
          <>
            Chuyển trạng thái xe <strong>{vehiclePlate}</strong> sang{" "}
            <strong>{STATUSES.find((s) => s.value === selectedStatus)?.label}</strong>?
          </>
        }
        onConfirm={handleUpdate}
        okText="Xác nhận"
        cancelText="Hủy"
        okButtonProps={{ loading: isUpdating }}
        disabled={!hasChanged || isUpdating}
        getPopupContainer={(triggerNode) => triggerNode.parentNode as HTMLElement}
        zIndex={9999}
      >
        <Button
          size="sm"
          disabled={!hasChanged || isUpdating}
          className={cn(
            "h-7 px-3 text-xs font-bold uppercase transition-all",
            hasChanged
              ? "bg-sky-600 hover:bg-sky-700 text-white shadow-sm"
              : "bg-slate-100 text-slate-400 cursor-not-allowed"
          )}
        >
          {isUpdating ? (<Loader2 className="h-3.5 w-3.5 animate-spin" />) : ("Cập nhật")}
        </Button>
      </Popconfirm>
    </div>
  );
};

export default React.memo(VehicleStatusChange);
