"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import lotTagApi, { type LotTag } from "@/services/lot-tag.service";
import orderApi from "@/services/order.service";
import systemApi from "@/services/system.service";
import { DEFAULT_LOT_TAG_GROUP, type VehicleDayTag } from "@/services/vehicle-day-tag-utils";
import { workAssignmentApi, workMixSlotApi } from "@/services/work-arrangement.service";
import type { WorkMixSlotItem } from "@/types/work-arrangement";
import { message, Modal, Select as AntSelect, Skeleton } from "antd";
import dayjs from "dayjs";
import { ArrowDownUp, ChevronDown, ChevronUp, FileSpreadsheet, Truck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getFullLotOrderUpdates,
  getLotItemKey,
  getLotOrderMoveUpdates,
  getPersistedLotOrderPosition,
  getPersistedLotOrderUpdates,
  isPersistedLotOrderItem,
  moveLotItemByDirection,
  moveLotItemToPosition,
  sortLotItemsByGroup,
  type LotOrderMoveUpdate,
} from "./lot-capture-order";
import { Chip, filterSelectOptionByLabel, getVehicleDayTagChipTone } from "./shared";

const getDefaultLotCaptureName = () => `Lốt ${dayjs().format("H")}H`;

const normalizeLotVehicleName = (raw: unknown) => {
  const upper = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  const match = upper.match(/^X0*(\d+)$/);
  return match ? `X${match[1]}` : upper;
};

const buildLotSyncMap = (items: WorkMixSlotItem[]) => {
  const maToStt: Record<string, number> = {};
  const skipped: { order_number: number; reason: string; raw: unknown }[] = [];

  items.forEach((item, index) => {
    const maX = normalizeLotVehicleName(item.vehicle_name);
    if (!/^X\d+$/.test(maX)) {
      skipped.push({
        order_number: item.order_number,
        reason: "invalid_vehicle_name",
        raw: item.vehicle_name,
      });
      return;
    }
    if (maX in maToStt) {
      skipped.push({ order_number: item.order_number, reason: "duplicate", raw: maX });
      return;
    }
    maToStt[maX] = index + 1;
  });

  return { maToStt, skipped };
};

const isPendingLotItem = (item: WorkMixSlotItem) => {
  const status = String(item.order_status || item.group || "").toLowerCase();
  return !status || status === "pending";
};

const getLotVehicleLabel = (item?: WorkMixSlotItem) => {
  if (!item) return "";
  return [item.vehicle_license_plate, item.vehicle_name].filter(Boolean).join(" | ");
};

const sortLotItemsByPendingStatus = (items: WorkMixSlotItem[]) =>
  [...items].sort((a, b) => {
    const aPending = isPendingLotItem(a);
    const bPending = isPendingLotItem(b);
    if (aPending !== bPending) return aPending ? -1 : 1;
    return (a.order_number || 0) - (b.order_number || 0);
  });

// Đưa toàn bộ xe trực ca (có thể nhiều) xuống cuối lốt, giữ thứ tự hiện tại giữa chúng.
const moveDutyVehiclesToEnd = (items: WorkMixSlotItem[], dutyVehicleIds: number[]) => {
  if (dutyVehicleIds.length === 0) return items;
  const dutySet = new Set(dutyVehicleIds);
  const persistedItems = items.filter(isPersistedLotOrderItem);
  const otherItems = items.filter((item) => !isPersistedLotOrderItem(item));
  const dutyItems = persistedItems.filter((item) => dutySet.has(Number(item.vehicle_id)));
  if (dutyItems.length === 0) return items;
  return [
    ...persistedItems.filter((item) => !dutySet.has(Number(item.vehicle_id))),
    ...dutyItems,
    ...otherItems,
  ];
};

export type LotCaptureModalProps = {
  open: boolean;
  onClose: () => void;
  /** "YYYY-MM-DD" — chỉ dùng để fetch tên tài xế khi không truyền driverNameByVehicleId. */
  workDate: string;
  /** Quyền SYNC_SLOTS → disable nút Chụp lốt. */
  canSync: boolean;
  /** Map vehicle_id → tên tài xế. Nếu thiếu, modal tự fetch bố trí xe bồn trong ngày. */
  driverNameByVehicleId?: Map<number, string>;
  /** Gọi sau khi chụp thành công, kèm tên lốt vừa chụp. */
  onCaptured?: (lotName: string) => void;
  /** Báo trạng thái loading||saving cho spinner của nút bên ngoài. */
  onLoadingChange?: (loading: boolean) => void;
};

export default function LotCaptureModal({
  open,
  onClose,
  workDate,
  canSync,
  driverNameByVehicleId,
  onCaptured,
  onLoadingChange,
}: LotCaptureModalProps) {
  const t = useTranslations("WorkAssignmentPage");

  const [lotCaptureName, setLotCaptureName] = useState(getDefaultLotCaptureName);
  const [lotDutyVehicleIds, setLotDutyVehicleIds] = useState<number[]>([]);
  const [lotCaptureItems, setLotCaptureItems] = useState<WorkMixSlotItem[]>([]);
  const [lotCaptureLoading, setLotCaptureLoading] = useState(false);
  const [lotCaptureSaving, setLotCaptureSaving] = useState(false);
  const [lotOrderSaving, setLotOrderSaving] = useState(false);
  const [fetchedDriverNames, setFetchedDriverNames] = useState<Map<number, string>>(new Map());
  const [dayTagByVehicleId, setDayTagByVehicleId] = useState<Map<number, VehicleDayTag>>(new Map());
  const [lotTagsByKey, setLotTagsByKey] = useState<Map<string, LotTag>>(new Map());
  const dutyPrefilledRef = useRef(false);

  const getTagDisplayName = useCallback(
    (key: VehicleDayTag) => lotTagsByKey.get(key)?.lot_tag_name ?? "",
    [lotTagsByKey]
  );
  const catalogDayTagByVehicleId = useMemo(() => {
    const map = new Map<number, VehicleDayTag>();
    for (const [vehicleId, tag] of dayTagByVehicleId) {
      if (lotTagsByKey.has(tag)) map.set(vehicleId, tag);
    }
    return map;
  }, [dayTagByVehicleId, lotTagsByKey]);
  const driverNames = driverNameByVehicleId ?? fetchedDriverNames;
  const dutyVehicleIdSet = useMemo(() => new Set(lotDutyVehicleIds), [lotDutyVehicleIds]);

  const loadLotCaptureItems = useCallback(
    async (nextDutyVehicleIds: number[]) => {
      setLotCaptureLoading(true);
      try {
        const items = await workMixSlotApi.getList({ includeAllMixerVehicles: true });
        setLotCaptureItems(
          moveDutyVehiclesToEnd(sortLotItemsByPendingStatus(items), nextDutyVehicleIds)
        );
        if (items.length === 0) message.warning(t("lotCaptureEmpty"));
      } catch (error) {
        const msg = error instanceof Error ? error.message : t("unknownError");
        message.error(`${t("lotCaptureLoadFailed")}: ${msg}`);
        setLotCaptureItems([]);
      } finally {
        setLotCaptureLoading(false);
      }
    },
    [t]
  );

  // Đọc bố trí xe bồn trong ngày: tên tài xế (khi không được truyền vào) + tag trạng thái xe.
  const loadArrangementInfo = useCallback(async () => {
    try {
      const bootstrap = await workAssignmentApi.getBootstrap(workDate);
      const personById = new Map(
        bootstrap.personnel.map((person) => [Number(person.user_id), person])
      );
      const nameMap = new Map<number, string>();
      const tagMap = new Map<number, VehicleDayTag>();
      for (const assignment of bootstrap.mixer.draft.mixer_assignments) {
        if (assignment.day_tag != null) {
          tagMap.set(Number(assignment.vehicle_id), assignment.day_tag);
        }
        if (assignment.user_id == null) continue;
        const person = personById.get(Number(assignment.user_id));
        const name = person?.user_full_name?.trim() || person?.user_short_name?.trim() || "";
        if (name) nameMap.set(Number(assignment.vehicle_id), name);
      }
      setFetchedDriverNames(nameMap);
      setDayTagByVehicleId(tagMap);
    } catch (error) {
      console.error("[LotCaptureModal] load arrangement info error:", error);
      setFetchedDriverNames(new Map());
      setDayTagByVehicleId(new Map());
    }
  }, [workDate]);

  // Danh mục tag động (tên + luật sắp xếp cho LLM) từ bảng lot_tags.
  const loadLotTagCatalog = useCallback(async () => {
    try {
      const list = await lotTagApi.list();
      setLotTagsByKey(new Map(list.map((tag) => [tag.lot_tag_key, tag])));
    } catch (error) {
      console.error("[LotCaptureModal] load lot tag catalog error:", error);
      setLotTagsByKey(new Map());
    }
  }, []);

  // Mỗi lần mở: reset tên + xe trực ca, tải hàng đợi, bố trí (tài xế + tag) và danh mục tag.
  useEffect(() => {
    if (!open) return;
    setLotCaptureName(getDefaultLotCaptureName());
    setLotDutyVehicleIds([]);
    setDayTagByVehicleId(new Map());
    dutyPrefilledRef.current = false;
    void loadLotCaptureItems([]);
    void loadArrangementInfo();
    void loadLotTagCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Gợi ý sẵn xe trực ca = các xe được tag "trực sản xuất" ở Bố trí công việc (vẫn sửa tay được).
  useEffect(() => {
    if (!open || dutyPrefilledRef.current || catalogDayTagByVehicleId.size === 0) return;
    const taggedDutyIds = Array.from(catalogDayTagByVehicleId.entries())
      .filter(([, tag]) => tag === "truc_san_xuat")
      .map(([vehicleId]) => vehicleId);
    if (taggedDutyIds.length === 0) return;
    dutyPrefilledRef.current = true;
    setLotDutyVehicleIds((current) => (current.length > 0 ? current : taggedDutyIds));
  }, [open, catalogDayTagByVehicleId]);

  useEffect(() => {
    onLoadingChange?.(lotCaptureLoading || lotCaptureSaving || lotOrderSaving);
  }, [lotCaptureLoading, lotCaptureSaving, lotOrderSaving, onLoadingChange]);

  const runLotOrderUpdates = useCallback(
    async (updates: LotOrderMoveUpdate[], previousItems: WorkMixSlotItem[]) => {
      if (updates.length === 0) return;

      setLotOrderSaving(true);
      try {
        for (const update of updates) {
          await orderApi.update(update.orderId, { order_number: update.targetPosition });
        }
      } catch (error) {
        console.error("[LotCaptureModal] order reorder error:", error);
        setLotCaptureItems(previousItems);
        message.error(t("lotOrderSyncFailed"));
      } finally {
        setLotOrderSaving(false);
      }
    },
    [t]
  );

  const persistLotOrderChanges = useCallback(
    async (itemKeys: string[], nextItems: WorkMixSlotItem[], previousItems: WorkMixSlotItem[]) => {
      await runLotOrderUpdates(getPersistedLotOrderUpdates(nextItems, itemKeys), previousItems);
    },
    [runLotOrderUpdates]
  );

  const moveLotCaptureItem = useCallback(
    (itemKey: string, direction: -1 | 1) => {
      const nextItems = moveLotItemByDirection(lotCaptureItems, itemKey, direction);
      if (nextItems === lotCaptureItems) return;

      setLotCaptureItems(nextItems);
      void persistLotOrderChanges([itemKey], nextItems, lotCaptureItems);
    },
    [lotCaptureItems, persistLotOrderChanges]
  );

  const moveLotCaptureItemTo = useCallback(
    (itemKey: string, toPosition: number) => {
      const nextItems = moveLotItemToPosition(lotCaptureItems, itemKey, toPosition);
      if (nextItems === lotCaptureItems) return;

      setLotCaptureItems(nextItems);
      void persistLotOrderChanges([itemKey], nextItems, lotCaptureItems);
    },
    [lotCaptureItems, persistLotOrderChanges]
  );

  // Xếp theo tag: chỉ dùng CÔNG THỨC sort_group đã chốt trong danh mục lot_tags.
  // Catalog rỗng thì không dùng lại bộ tag seed cũ.
  const applyRuleSort = useCallback(() => {
    const groupForTag = (key: VehicleDayTag) => {
      const tag = lotTagsByKey.get(key);
      if (!tag) return null;
      return tag.sort_group ?? DEFAULT_LOT_TAG_GROUP;
    };
    const dutyGroup = groupForTag("truc_san_xuat");

    const groupByVehicleId = new Map<number, number>();
    for (const [vehicleId, tag] of catalogDayTagByVehicleId) {
      const group = groupForTag(tag);
      if (group != null) groupByVehicleId.set(vehicleId, group);
    }
    if (dutyGroup != null) {
      for (const vehicleId of lotDutyVehicleIds) {
        if (!groupByVehicleId.has(vehicleId)) groupByVehicleId.set(vehicleId, dutyGroup);
      }
    }

    const nextItems = sortLotItemsByGroup(lotCaptureItems, groupByVehicleId);
    if (nextItems === lotCaptureItems) {
      message.info(t("lotRuleSortNoChange"));
      return;
    }

    const updates = getLotOrderMoveUpdates(lotCaptureItems, nextItems);
    setLotCaptureItems(nextItems);
    void runLotOrderUpdates(updates, lotCaptureItems);
  }, [
    catalogDayTagByVehicleId,
    lotCaptureItems,
    lotDutyVehicleIds,
    lotTagsByKey,
    runLotOrderUpdates,
    t,
  ]);

  const applyDutyVehicleToEnd = useCallback(() => {
    if (lotDutyVehicleIds.length === 0) return;
    const nextItems = moveDutyVehiclesToEnd(lotCaptureItems, lotDutyVehicleIds);
    if (nextItems === lotCaptureItems) return;

    const dutyItemKeys = nextItems
      .filter((item) => lotDutyVehicleIds.includes(Number(item.vehicle_id)))
      .map(getLotItemKey);
    setLotCaptureItems(nextItems);
    void persistLotOrderChanges(dutyItemKeys, nextItems, lotCaptureItems);
  }, [lotCaptureItems, lotDutyVehicleIds, persistLotOrderChanges]);

  const handleCaptureLots = useCallback(async () => {
    const lotName = lotCaptureName.trim() || getDefaultLotCaptureName();
    const dutyVehicles = lotCaptureItems.filter((item) =>
      dutyVehicleIdSet.has(Number(item.vehicle_id))
    );
    const dutyVehicleLabels = dutyVehicles.map((item) => getLotVehicleLabel(item)).filter(Boolean);
    const primaryDutyVehicle = dutyVehicles[0];
    const snapshotNote = dutyVehicleLabels.length
      ? `${lotName} - ${t("lotDutyVehicle")}: ${dutyVehicleLabels.join(", ")}`
      : lotName;
    // Ghi lại tag của từng xe vào mô tả snapshot để lịch sử tra được vì sao xe đứng vị trí đó.
    const tagSummary = lotCaptureItems
      .map((item) => {
        const tag = catalogDayTagByVehicleId.get(Number(item.vehicle_id));
        return tag
          ? `${item.vehicle_name || item.vehicle_license_plate}=${getTagDisplayName(tag)}`
          : "";
      })
      .filter(Boolean)
      .join(", ");
    const snapshotDescription = tagSummary ? `${snapshotNote} | Tag: ${tagSummary}` : snapshotNote;
    const { maToStt, skipped } = buildLotSyncMap(lotCaptureItems);
    const lotCount = Object.keys(maToStt).length;

    if (skipped.length > 0) console.warn("[LotCaptureModal] skipped:", skipped);
    if (lotCount === 0) {
      message.warning(t("lotCaptureEmpty"));
      return;
    }

    setLotCaptureSaving(true);

    // Ép order_number trên backend khớp thứ tự lốt đang hiển thị (kể cả khi không bấm nút sắp
    // xếp từng xe) trước khi chụp, để bảng lốt ở dashboard trùng với sheet ngay sau khi chụp.
    await runLotOrderUpdates(getFullLotOrderUpdates(lotCaptureItems), lotCaptureItems);

    const pushToSheet = async () => {
      const res = await fetch("/api/google-sheets/bo-tri-cv/sync-lot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maToStt, lotName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Sync failed");
      if (data.unmatchedMaX?.length > 0) {
        console.warn("[LotCaptureModal] mã X không có trong sheet cột H:", data.unmatchedMaX);
      }
      return data;
    };

    try {
      const [sheetResult, snapshotResult] = await Promise.allSettled([
        pushToSheet(),
        systemApi.captureTankerLotSync({
          lot_name: lotName,
          duty_vehicle_id: primaryDutyVehicle ? Number(primaryDutyVehicle.vehicle_id) : undefined,
          duty_vehicle_name: primaryDutyVehicle?.vehicle_name || undefined,
          duty_vehicle_license_plate: primaryDutyVehicle?.vehicle_license_plate || undefined,
          snapshot_note: snapshotNote,
          multi_description: snapshotDescription,
        }),
      ]);

      if (sheetResult.status === "fulfilled") {
        const data = sheetResult.value;
        message.success(t("lotSyncSuccess", { count: data.updated ?? lotCount }));
      } else {
        console.error("[LotCaptureModal] sheet error:", sheetResult.reason);
        message.error(t("lotSyncFailed"));
      }

      if (snapshotResult.status === "fulfilled") {
        message.success(t("lotCaptureSuccess", { name: lotName }));
        onCaptured?.(lotName);
      } else {
        console.error("[LotCaptureModal] snapshot error:", snapshotResult.reason);
        message.error(t("lotCaptureFailed"));
      }

      if (sheetResult.status === "fulfilled" || snapshotResult.status === "fulfilled") {
        onClose();
      }
    } finally {
      setLotCaptureSaving(false);
    }
  }, [
    catalogDayTagByVehicleId,
    getTagDisplayName,
    dutyVehicleIdSet,
    lotCaptureItems,
    lotCaptureName,
    onCaptured,
    onClose,
    runLotOrderUpdates,
    t,
  ]);

  const dutyVehicleOptions = useMemo(
    () =>
      Array.from(
        new Map(lotCaptureItems.map((item) => [Number(item.vehicle_id), item])).values()
      ).map((item) => ({
        value: Number(item.vehicle_id),
        label: getLotVehicleLabel(item),
      })),
    [lotCaptureItems]
  );

  const lotPositionOptions = useMemo(
    () =>
      Array.from(
        { length: lotCaptureItems.filter(isPersistedLotOrderItem).length },
        (_, position) => ({
          value: position + 1,
          label: String(position + 1),
        })
      ),
    [lotCaptureItems]
  );

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={handleCaptureLots}
      okText={t("lotCaptureConfirm")}
      cancelText={t("lotCaptureCancel")}
      confirmLoading={lotCaptureSaving}
      okButtonProps={{
        disabled: !canSync || lotCaptureLoading || lotOrderSaving || lotCaptureItems.length === 0,
      }}
      title={t("lotCaptureTitle")}
      width={520}
    >
      <div className="space-y-3 pt-1">
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {t("lotCaptureDescription")}
        </div>
        <Input
          value={lotCaptureName}
          onChange={(event) => setLotCaptureName(event.target.value)}
          placeholder={t("lotCaptureNamePlaceholder")}
          className="h-9 rounded-none border-slate-300 bg-white shadow-none focus-visible:ring-teal-500/20"
        />
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Truck size={15} className="text-teal-600" />
            {t("lotDutyVehicle")}
          </div>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <AntSelect
                mode="multiple"
                showSearch
                allowClear
                disabled={lotCaptureLoading}
                value={lotDutyVehicleIds}
                onChange={(value) => setLotDutyVehicleIds(value as number[])}
                placeholder={t("lotDutyVehiclePlaceholder")}
                options={dutyVehicleOptions}
                filterOption={filterSelectOptionByLabel}
                className="w-full [&_.ant-select-selector]:!rounded-none"
              />
            </div>
            <Button
              type="button"
              size="sm"
              onClick={applyDutyVehicleToEnd}
              disabled={
                lotCaptureLoading ||
                lotCaptureSaving ||
                lotOrderSaving ||
                lotDutyVehicleIds.length === 0
              }
              title={t("lotDutyApplyHint")}
              className="h-9 shrink-0 bg-teal-600 text-white hover:bg-teal-700"
            >
              {t("lotDutyApply")}
            </Button>
          </div>
        </div>
        <div className="rounded-md border border-slate-200">
          <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800">
            <FileSpreadsheet size={16} className="text-teal-600" />
            {t("lotCapturePreview", { count: lotCaptureItems.length })}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={applyRuleSort}
              disabled={lotCaptureLoading || lotCaptureSaving || lotOrderSaving}
              title={t("lotRuleSortHint")}
              className="ml-auto h-7 gap-1 border-teal-600 px-2 text-xs font-semibold text-teal-700 hover:bg-teal-50"
            >
              <ArrowDownUp size={13} />
              {t("lotRuleSort")}
            </Button>
          </div>
          <div className="max-h-[240px] overflow-y-auto p-2">
            {lotCaptureLoading ? (
              <Skeleton active paragraph={{ rows: 4 }} />
            ) : lotCaptureItems.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-slate-400">
                {t("lotCaptureEmpty")}
              </div>
            ) : (
              <div className="space-y-1">
                {lotCaptureItems.map((item, index) => {
                  const itemKey = getLotItemKey(item);
                  const isPersistedOrder = isPersistedLotOrderItem(item);
                  const persistedOrderPosition = getPersistedLotOrderPosition(
                    lotCaptureItems,
                    itemKey
                  );
                  const isDutyVehicle = dutyVehicleIdSet.has(Number(item.vehicle_id));
                  const isUnreturnedVehicle = item.group === "unreturned";
                  const persistedOrderCount = lotPositionOptions.length;
                  const canReorderTo =
                    isPersistedOrder &&
                    !lotCaptureSaving &&
                    !lotOrderSaving &&
                    persistedOrderCount > 1;
                  const driverName = driverNames.get(Number(item.vehicle_id)) || "";
                  const hasPersonnel = driverName !== "";
                  const dayTag = catalogDayTagByVehicleId.get(Number(item.vehicle_id));
                  return (
                    <div
                      key={`${item.order_id}-${item.vehicle_id}`}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm",
                        isDutyVehicle ? "bg-teal-50 ring-1 ring-teal-200" : "bg-slate-50"
                      )}
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-semibold text-slate-900">
                        {item.vehicle_license_plate} | {item.vehicle_name}
                      </span>
                      {dayTag && (
                        <Chip tone={getVehicleDayTagChipTone(dayTag)}>
                          {getTagDisplayName(dayTag)}
                        </Chip>
                      )}
                      <Chip
                        tone={
                          isDutyVehicle || isUnreturnedVehicle
                            ? "amber"
                            : hasPersonnel
                              ? "teal"
                              : "slate"
                        }
                        title={hasPersonnel ? driverName : undefined}
                      >
                        {isDutyVehicle ? (
                          t("lotDutyVehicleShort")
                        ) : isUnreturnedVehicle ? (
                          t("lotNotReturned")
                        ) : hasPersonnel ? (
                          <span className="block max-w-[160px] truncate">{driverName}</span>
                        ) : (
                          t("lotNoPersonnel")
                        )}
                      </Chip>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          aria-label={t("lotOrderMoveUp")}
                          disabled={!canReorderTo || persistedOrderPosition <= 1}
                          onClick={() => moveLotCaptureItem(itemKey, -1)}
                          className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <ChevronUp size={14} />
                        </button>
                        <button
                          type="button"
                          aria-label={t("lotOrderMoveDown")}
                          disabled={!canReorderTo || persistedOrderPosition >= persistedOrderCount}
                          onClick={() => moveLotCaptureItem(itemKey, 1)}
                          className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <ChevronDown size={14} />
                        </button>
                        <AntSelect
                          aria-label={t("lotOrderMoveTo")}
                          disabled={!canReorderTo}
                          options={lotPositionOptions}
                          size="small"
                          title={t("lotOrderMoveToTitle")}
                          value={isPersistedOrder ? persistedOrderPosition : undefined}
                          onChange={(value) => moveLotCaptureItemTo(itemKey, Number(value))}
                          className="w-[58px] [&_.ant-select-selector]:!h-7 [&_.ant-select-selector]:!rounded [&_.ant-select-selector]:!border-slate-200 [&_.ant-select-selection-item]:!text-xs"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
