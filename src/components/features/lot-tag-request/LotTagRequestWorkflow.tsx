"use client";

import { Button } from "@/components/ui/button";
import { PERMISSIONS } from "@/constants/permissions";
import { SIDEBAR } from "@/constants/route";
import { useAppSelector } from "@/hooks/use-app-selector";
import { usePermissions } from "@/hooks/use-permissions";
import lotTagRequestApi, {
  type LotTagRequest,
  type LotTagRequestStatus,
  type LotTagRequestWorkflowAction,
} from "@/services/lot-tag-request.service";
import {
  getLotTagRequestAvailableActions,
  getLotTagRequestStatusTone,
} from "@/services/lot-tag-request-workflow";
import lotTagApi, { type LotTag } from "@/services/lot-tag.service";
import vehicleApi from "@/services/vehicle.service";
import vehicleMaintenanceApi from "@/services/vehicle-maintenance.service";
import type { Vehicle } from "@/types/vehicle";
import {
  Alert,
  DatePicker,
  Form,
  Input,
  Modal,
  Pagination,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import {
  Ban,
  Check,
  ClipboardCheck,
  Loader2,
  Plus,
  RefreshCw,
  Tags,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type StatusFilter = LotTagRequestStatus | "all";

interface CreateFormValues {
  work_date: Dayjs;
  vehicle_id: number;
  lot_tag_key: string;
  request_reason?: string;
}

const STATUS_FILTERS: StatusFilter[] = ["pending", "all", "approved", "rejected", "canceled"];

const STATUS_COLOR_BY_TONE: Record<string, string> = {
  amber: "gold",
  emerald: "green",
  red: "red",
  slate: "default",
};

const extractVehicleRows = (payload: unknown): Vehicle[] => {
  if (Array.isArray(payload)) return payload as Vehicle[];
  if (!payload || typeof payload !== "object") return [];

  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.data)) return record.data as Vehicle[];
  if (record.data && typeof record.data === "object") {
    const nested = record.data as Record<string, unknown>;
    if (Array.isArray(nested.data)) return nested.data as Vehicle[];
    if (Array.isArray(nested.items)) return nested.items as Vehicle[];
  }
  if (Array.isArray(record.items)) return record.items as Vehicle[];
  if (Array.isArray(record.results)) return record.results as Vehicle[];
  return [];
};

const mergeVehicles = (left: Vehicle[], right: Vehicle[]) => {
  const map = new Map<number, Vehicle>();
  [...left, ...right].forEach((vehicle) => {
    if (vehicle?.vehicle_id) map.set(vehicle.vehicle_id, vehicle);
  });
  return Array.from(map.values());
};

const formatVehicleLabel = (
  vehicle?: {
    vehicle_id: number;
    vehicle_license_plate?: string | null;
    vehicle_name?: string | null;
  } | null
) => {
  if (!vehicle) return "";
  return (
    [vehicle.vehicle_license_plate, vehicle.vehicle_name].filter(Boolean).join(" · ") ||
    `#${vehicle.vehicle_id}`
  );
};

const getApiErrorStatus = (error: unknown) =>
  (error as { response?: { status?: number } })?.response?.status;

const getApiErrorMessage = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
  (error as Error)?.message ||
  fallback;

export default function LotTagRequestWorkflow() {
  const t = useTranslations("LotTagRequestPage");
  const tCommon = useTranslations("Common");
  const { hasActionAccess } = usePermissions();
  const authUser = useAppSelector((state) => state.auth.user);

  const canCreate = hasActionAccess(SIDEBAR.LOT_TAG_REQUESTS, PERMISSIONS.LOT_TAG_REQUESTS.CREATE);
  const canReview = hasActionAccess(SIDEBAR.LOT_TAG_REQUESTS, PERMISSIONS.LOT_TAG_REQUESTS.REVIEW);
  const canCancel = hasActionAccess(SIDEBAR.LOT_TAG_REQUESTS, PERMISSIONS.LOT_TAG_REQUESTS.CANCEL);
  const canDelete = hasActionAccess(SIDEBAR.LOT_TAG_REQUESTS, PERMISSIONS.LOT_TAG_REQUESTS.DELETE);

  const [createForm] = Form.useForm<CreateFormValues>();
  const [requests, setRequests] = useState<LotTagRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [serverUnavailable, setServerUnavailable] = useState(false);
  const [refreshDisabled, setRefreshDisabled] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [filterDate, setFilterDate] = useState<Dayjs | null>(dayjs());
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [lotTags, setLotTags] = useState<LotTag[]>([]);
  const [vehicleOptions, setVehicleOptions] = useState<Vehicle[]>([]);
  const [vehicleLoading, setVehicleLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionTarget, setActionTarget] = useState<{
    request: LotTagRequest;
    action: LotTagRequestWorkflowAction;
  } | null>(null);
  const [actionNote, setActionNote] = useState("");
  const [processingId, setProcessingId] = useState<number | null>(null);

  const lotTagOptions = useMemo(
    () => lotTags.map((tag) => ({ value: tag.lot_tag_key, label: tag.lot_tag_name })),
    [lotTags]
  );
  const lotTagByKey = useMemo(
    () => new Map(lotTags.map((tag) => [tag.lot_tag_key, tag])),
    [lotTags]
  );
  const vehicleSelectOptions = useMemo(
    () =>
      vehicleOptions.map((vehicle) => ({
        value: vehicle.vehicle_id,
        label: formatVehicleLabel(vehicle),
      })),
    [vehicleOptions]
  );

  const statusLabel = useCallback(
    (status: StatusFilter) => {
      if (status === "all") return t("tabAll");
      return t(
        status === "pending"
          ? "statusPending"
          : status === "approved"
            ? "statusApproved"
            : status === "rejected"
              ? "statusRejected"
              : "statusCanceled"
      );
    },
    [t]
  );

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const result = await lotTagRequestApi.list({
        page: currentPage,
        limit: pageSize,
        status: statusFilter,
        work_date: filterDate?.format("YYYY-MM-DD"),
        mine: !canReview,
      });
      setServerUnavailable(false);
      setRequests(result.data);
      setTotal(result.total);
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      setServerUnavailable(status === 404);
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (error as Error)?.message ||
        t("loadFailed");
      toast.error(t("loadFailed"), { description: message });
      setRequests([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [canReview, currentPage, filterDate, pageSize, statusFilter, t]);

  const loadCatalog = useCallback(async () => {
    try {
      setLotTags(await lotTagApi.list());
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (error as Error)?.message ||
        t("catalogLoadFailed");
      toast.error(t("catalogLoadFailed"), { description: message });
    }
  }, [t]);

  const loadVehicleOptions = useCallback(
    async (date: Dayjs) => {
      setVehicleLoading(true);
      try {
        let assignedVehicles: Vehicle[] = [];
        let defaultVehicleId: number | null = null;

        try {
          const context = await vehicleMaintenanceApi.getDriverContext({
            date: date.format("YYYY-MM-DD"),
          });
          assignedVehicles = (context.data.assigned_vehicles_today || []) as Vehicle[];
          defaultVehicleId = context.data.default_vehicle_id;
        } catch {
          assignedVehicles = [];
        }

        let allVehicles: Vehicle[] = [];
        if (canReview || assignedVehicles.length === 0) {
          const vehicleResponse = await vehicleApi.getListName({ limit: 1000 });
          allVehicles = extractVehicleRows(vehicleResponse.data);
        }
        const fallbackVehicles = canReview || assignedVehicles.length === 0 ? allVehicles : [];
        const nextVehicles = mergeVehicles(assignedVehicles, fallbackVehicles);
        setVehicleOptions(nextVehicles);

        const selectedVehicleId = createForm.getFieldValue("vehicle_id");
        const fallbackVehicleId = defaultVehicleId ?? nextVehicles[0]?.vehicle_id;
        if (!selectedVehicleId && fallbackVehicleId) {
          createForm.setFieldValue("vehicle_id", fallbackVehicleId);
        }
      } catch (error) {
        const message =
          (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          (error as Error)?.message ||
          t("vehicleLoadFailed");
        toast.error(t("vehicleLoadFailed"), { description: message });
        setVehicleOptions([]);
      } finally {
        setVehicleLoading(false);
      }
    },
    [canReview, createForm, t]
  );

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    void fetchRequests();
  }, [fetchRequests]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterDate, statusFilter]);

  const handleRefresh = () => {
    if (refreshDisabled > 0) return;
    void fetchRequests();
    void loadCatalog();
    setRefreshDisabled(15);
    const interval = window.setInterval(() => {
      setRefreshDisabled((prev) => {
        if (prev <= 1) {
          window.clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const openCreateDialog = () => {
    const workDate = filterDate ?? dayjs();
    createForm.resetFields();
    createForm.setFieldsValue({ work_date: workDate });
    setCreateOpen(true);
    void loadVehicleOptions(workDate);
  };

  const handleCreate = async (values: CreateFormValues) => {
    const tag = lotTagByKey.get(values.lot_tag_key);
    if (!tag) {
      toast.warning(t("noTags"));
      return;
    }

    setSubmitting(true);
    try {
      await lotTagRequestApi.create({
        work_date: values.work_date.format("YYYY-MM-DD"),
        vehicle_id: values.vehicle_id,
        lot_tag_id: tag.lot_tag_id,
        lot_tag_key: tag.lot_tag_key,
        request_reason: values.request_reason?.trim() || null,
      });
      toast.success(t("requestCreated"));
      setCreateOpen(false);
      void fetchRequests();
    } catch (error) {
      const status = getApiErrorStatus(error);
      const message =
        status === 404
          ? t("requestCreateUnsupported")
          : getApiErrorMessage(error, t("requestCreateFailed"));
      toast.error(t("requestCreateFailed"), { description: message });
    } finally {
      setSubmitting(false);
    }
  };

  const openActionDialog = (request: LotTagRequest, action: LotTagRequestWorkflowAction) => {
    setActionNote("");
    setActionTarget({ request, action });
  };

  const handleWorkflowAction = async () => {
    if (!actionTarget) return;
    const { request, action } = actionTarget;
    const trimmedNote = actionNote.trim();
    if ((action === "reject" || action === "cancel") && !trimmedNote) {
      toast.warning(
        action === "reject" ? t("rejectReasonPlaceholder") : t("cancelReasonPlaceholder")
      );
      return;
    }

    setProcessingId(request.lot_tag_request_id);
    try {
      if (action === "approve") {
        await lotTagRequestApi.approve(request.lot_tag_request_id, { note: trimmedNote || null });
        toast.success(t("approveSuccess"));
      } else if (action === "reject") {
        await lotTagRequestApi.reject(request.lot_tag_request_id, { reason: trimmedNote });
        toast.success(t("rejectSuccess"));
      } else if (action === "cancel") {
        await lotTagRequestApi.cancel(request.lot_tag_request_id, { reason: trimmedNote });
        toast.success(t("cancelSuccess"));
      } else {
        await lotTagRequestApi.remove(request.lot_tag_request_id);
        toast.success(t("deleteSuccess"));
      }
      setActionTarget(null);
      void fetchRequests();
    } catch (error) {
      const status = getApiErrorStatus(error);
      const message =
        status === 404
          ? t("workflowActionUnsupported")
          : getApiErrorMessage(error, t("actionFailed"));
      toast.error(t("actionFailed"), { description: message });
    } finally {
      setProcessingId(null);
    }
  };

  const columns = useMemo<ColumnsType<LotTagRequest>>(
    () => [
      {
        title: "#",
        key: "index",
        width: 56,
        align: "center",
        render: (_value, _record, index) => (currentPage - 1) * pageSize + index + 1,
      },
      {
        title: t("colDate"),
        dataIndex: "work_date",
        key: "work_date",
        width: 112,
        render: (value: string) => (value ? dayjs(value).format("DD/MM/YYYY") : ""),
      },
      {
        title: t("colVehicle"),
        key: "vehicle",
        width: 170,
        render: (_value, record) => (
          <span className="font-medium text-slate-800">
            {formatVehicleLabel(record.vehicle) ||
              (record.vehicle_id ? `#${record.vehicle_id}` : "")}
          </span>
        ),
      },
      {
        title: t("colTag"),
        key: "lot_tag",
        width: 150,
        render: (_value, record) => (
          <Tag color="cyan">{record.lot_tag?.lot_tag_name || record.lot_tag_key}</Tag>
        ),
      },
      {
        title: t("colRequester"),
        key: "requester",
        width: 170,
        render: (_value, record) =>
          record.requested_by_user?.user_full_name ||
          record.requested_by_user?.user_short_name ||
          (record.requested_by ? `#${record.requested_by}` : ""),
      },
      {
        title: t("colReason"),
        dataIndex: "request_reason",
        key: "request_reason",
        render: (value: string | null) => value || <span className="text-slate-400">-</span>,
      },
      {
        title: t("colStatus"),
        key: "request_status",
        width: 128,
        align: "center",
        render: (_value, record) => (
          <Tag color={STATUS_COLOR_BY_TONE[getLotTagRequestStatusTone(record.request_status)]}>
            {statusLabel(record.request_status)}
          </Tag>
        ),
      },
      {
        title: t("colReviewer"),
        key: "reviewer",
        width: 160,
        render: (_value, record) =>
          record.reviewed_by_user?.user_full_name ||
          (record.reviewed_by ? (
            `#${record.reviewed_by}`
          ) : (
            <span className="text-slate-400">-</span>
          )),
      },
      {
        title: t("colActions"),
        key: "actions",
        width: 170,
        fixed: "right",
        align: "center",
        render: (_value, record) => {
          const actions = getLotTagRequestAvailableActions(record, {
            canReview,
            canCancel,
            canDelete,
          });
          if (actions.length === 0) return <span className="text-slate-400">-</span>;

          const isProcessing = processingId === record.lot_tag_request_id;
          return (
            <Space size="small">
              {actions.includes("approve") && (
                <Tooltip title={t("approve")}>
                  <Button
                    type="button"
                    size="iconSquare"
                    variant="outline"
                    disabled={isProcessing}
                    onClick={() => openActionDialog(record, "approve")}
                  >
                    {isProcessing ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Check className="size-4 text-emerald-600" />
                    )}
                  </Button>
                </Tooltip>
              )}
              {actions.includes("reject") && (
                <Tooltip title={t("reject")}>
                  <Button
                    type="button"
                    size="iconSquare"
                    variant="outline"
                    disabled={isProcessing}
                    onClick={() => openActionDialog(record, "reject")}
                  >
                    <X className="size-4 text-red-500" />
                  </Button>
                </Tooltip>
              )}
              {actions.includes("cancel") && (
                <Tooltip title={t("cancel")}>
                  <Button
                    type="button"
                    size="iconSquare"
                    variant="outline"
                    disabled={isProcessing}
                    onClick={() => openActionDialog(record, "cancel")}
                  >
                    <Ban className="size-4 text-slate-500" />
                  </Button>
                </Tooltip>
              )}
              {actions.includes("delete") && (
                <Tooltip title={t("delete")}>
                  <Button
                    type="button"
                    size="iconSquare"
                    variant="outline"
                    disabled={isProcessing}
                    onClick={() => openActionDialog(record, "delete")}
                  >
                    <Trash2 className="size-4 text-red-600" />
                  </Button>
                </Tooltip>
              )}
            </Space>
          );
        },
      },
    ],
    [canCancel, canDelete, canReview, currentPage, pageSize, processingId, statusLabel, t]
  );

  const actionTitle = actionTarget
    ? t(
        actionTarget.action === "approve"
          ? "actionTitleApprove"
          : actionTarget.action === "reject"
            ? "actionTitleReject"
            : actionTarget.action === "cancel"
              ? "actionTitleCancel"
              : "actionTitleDelete"
      )
    : "";
  const actionPlaceholder =
    actionTarget?.action === "reject"
      ? t("rejectReasonPlaceholder")
      : actionTarget?.action === "cancel"
        ? t("cancelReasonPlaceholder")
        : t("notePlaceholder");

  return (
    <>
      <div className="min-h-screen bg-slate-100 p-5 text-slate-900 md:p-8">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
          <header className="flex flex-col gap-3 border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 text-xl font-bold text-slate-950 md:text-2xl">
                <ClipboardCheck className="size-6 text-teal-600" />
                {t("title")}
              </h1>
              <p className="mt-1 text-sm text-slate-500">{t("subtitle")}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {canCreate && (
                <Button type="button" variant="primary" onClick={openCreateDialog}>
                  <Plus className="size-4" />
                  {t("createButton")}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={handleRefresh}
                disabled={refreshDisabled > 0}
                className="min-w-[120px]"
              >
                <RefreshCw className={`size-4 ${refreshDisabled > 0 ? "animate-spin" : ""}`} />
                {refreshDisabled > 0
                  ? `${tCommon("refresh")} (${refreshDisabled}s)`
                  : tCommon("refresh")}
              </Button>
            </div>
          </header>

          <section className="border border-slate-200 bg-white shadow-sm">
            {serverUnavailable && (
              <Alert
                type="warning"
                showIcon
                className="rounded-none border-0 border-b border-amber-200"
                message={t("serverUnavailableTitle")}
                description={t("serverUnavailableDescription")}
              />
            )}
            <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                {STATUS_FILTERS.map((status) => (
                  <Button
                    key={status}
                    type="button"
                    variant={statusFilter === status ? "primary" : "outline"}
                    size="sm"
                    onClick={() => setStatusFilter(status)}
                  >
                    {status === "pending"
                      ? t("tabPending")
                      : status === "all"
                        ? t("tabAll")
                        : status === "approved"
                          ? t("tabApproved")
                          : status === "rejected"
                            ? t("tabRejected")
                            : t("tabCanceled")}
                  </Button>
                ))}
              </div>
              <DatePicker
                allowClear
                value={filterDate}
                onChange={setFilterDate}
                format="DD/MM/YYYY"
                className="h-9 w-full max-w-[180px]"
                placeholder={t("dateLabel")}
              />
            </div>

            <Table
              columns={columns}
              dataSource={requests}
              rowKey="lot_tag_request_id"
              loading={loading}
              pagination={false}
              scroll={{ x: "max-content" }}
              tableLayout="auto"
              locale={{ emptyText: t("empty") }}
              bordered
            />

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 p-4">
              <div className="text-sm text-slate-500">
                {total > 0 ? (
                  <>
                    <i>{t("total")}</i>: <b>{total}</b>
                  </>
                ) : null}
              </div>
              <Pagination
                current={currentPage}
                pageSize={pageSize}
                total={total}
                align="end"
                showSizeChanger
                onChange={(page, size) => {
                  setCurrentPage(page);
                  setPageSize(size);
                }}
              />
            </div>
          </section>
        </div>
      </div>

      <Modal
        open={createOpen}
        title={
          <span className="flex items-center gap-2">
            <Tags className="size-5 text-teal-600" />
            {t("createDialogTitle")}
          </span>
        }
        onCancel={() => setCreateOpen(false)}
        destroyOnClose
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={submitting}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => createForm.submit()}
              disabled={submitting || lotTags.length === 0 || vehicleOptions.length === 0}
            >
              {submitting && <Loader2 className="size-4 animate-spin" />}
              {t("submitRequest")}
            </Button>
          </div>
        }
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate} className="pt-2">
          <Form.Item
            name="work_date"
            label={t("dateLabel")}
            rules={[{ required: true, message: t("dateLabel") }]}
          >
            <DatePicker
              format="DD/MM/YYYY"
              className="h-10 w-full"
              allowClear={false}
              onChange={(date) => date && loadVehicleOptions(date)}
            />
          </Form.Item>
          <Form.Item
            name="vehicle_id"
            label={t("vehicleLabel")}
            rules={[{ required: true, message: t("noVehicles") }]}
          >
            <Select
              showSearch
              loading={vehicleLoading}
              options={vehicleSelectOptions}
              optionFilterProp="label"
              placeholder={t("vehicleLabel")}
              suffixIcon={<Truck className="size-4 text-slate-400" />}
              notFoundContent={t("noVehicles")}
            />
          </Form.Item>
          <Form.Item
            name="lot_tag_key"
            label={t("tagLabel")}
            rules={[{ required: true, message: t("noTags") }]}
          >
            <Select
              showSearch
              options={lotTagOptions}
              optionFilterProp="label"
              placeholder={t("tagLabel")}
              suffixIcon={<Tags className="size-4 text-slate-400" />}
              notFoundContent={t("noTags")}
            />
          </Form.Item>
          <Form.Item name="request_reason" label={t("reasonLabel")}>
            <Input.TextArea rows={3} maxLength={500} placeholder={t("reasonPlaceholder")} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={Boolean(actionTarget)}
        title={actionTitle}
        onCancel={() => setActionTarget(null)}
        destroyOnClose
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setActionTarget(null)}
              disabled={processingId != null}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              type="button"
              variant={
                actionTarget?.action === "reject" || actionTarget?.action === "delete"
                  ? "destructive"
                  : "primary"
              }
              onClick={handleWorkflowAction}
              disabled={processingId != null}
            >
              {processingId != null && <Loader2 className="size-4 animate-spin" />}
              {actionTarget?.action === "approve"
                ? t("approve")
                : actionTarget?.action === "reject"
                  ? t("reject")
                  : actionTarget?.action === "cancel"
                    ? t("cancel")
                    : t("delete")}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 pt-2">
          {actionTarget && (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <div className="font-semibold text-slate-900">
                {formatVehicleLabel(actionTarget.request.vehicle)} ·{" "}
                {actionTarget.request.lot_tag?.lot_tag_name || actionTarget.request.lot_tag_key}
              </div>
              <div className="mt-1">
                {dayjs(actionTarget.request.work_date).format("DD/MM/YYYY")} ·{" "}
                {actionTarget.request.requested_by_user?.user_full_name ||
                  actionTarget.request.requested_by_user?.user_short_name ||
                  authUser?.fullName ||
                  ""}
              </div>
            </div>
          )}
          {actionTarget?.action === "delete" ? (
            <Alert type="warning" showIcon message={t("deleteWarning")} />
          ) : (
            <Input.TextArea
              rows={3}
              maxLength={500}
              value={actionNote}
              onChange={(event) => setActionNote(event.target.value)}
              placeholder={actionPlaceholder}
            />
          )}
        </div>
      </Modal>
    </>
  );
}
