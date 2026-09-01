"use client";

import { Button, DatePicker, Input, Pagination, Select, Table, Tag, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { Dayjs } from "dayjs";
import { RefreshCw, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import auditLogApi, { AuditLog, ListAuditLogsParams } from "@/services/audit-log.service";

const { RangePicker } = DatePicker;

const actionColors: Record<string, string> = {
  create: "green",
  update: "blue",
  delete: "red",
  submit: "gold",
  approve: "green",
  reject: "red",
  cancel: "orange",
};

const methodColors: Record<string, string> = {
  POST: "green",
  PUT: "blue",
  PATCH: "purple",
  DELETE: "red",
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "-";
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format("DD/MM/YYYY HH:mm:ss") : value;
};

const getUserLabel = (record: AuditLog) => {
  const user = record.users;
  return user?.user_short_name || user?.user_full_name || (record.user_id ? `#${record.user_id}` : "-");
};

const JsonPreview = ({ value }: { value: Record<string, unknown> | null }) => {
  if (!value || Object.keys(value).length === 0) {
    return <span className="text-slate-400">-</span>;
  }

  const content = JSON.stringify(value, null, 2);

  return (
    <Tooltip title={<pre className="max-w-xl whitespace-pre-wrap text-xs">{content}</pre>}>
      <code className="block max-w-xs truncate rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700">
        {JSON.stringify(value)}
      </code>
    </Tooltip>
  );
};

export default function AuditLogsTable() {
  const t = useTranslations("AuditLogsPage");
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [auditModule, setAuditModule] = useState<string | undefined>();
  const [auditAction, setAuditAction] = useState<string | undefined>();
  const [httpMethod, setHttpMethod] = useState<string | undefined>();
  const [success, setSuccess] = useState<string | undefined>();
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);

  const fetchLogs = useCallback(
    async (nextPage = page, nextLimit = limit) => {
      setLoading(true);
      try {
        const params: ListAuditLogsParams = {
          page: nextPage,
          limit: nextLimit,
          search: search.trim() || undefined,
          audit_module: auditModule || undefined,
          audit_action: auditAction || undefined,
          http_method: httpMethod || undefined,
          success: success === undefined ? undefined : success === "true",
          from_date: range?.[0]?.format("YYYY-MM-DD"),
          to_date: range?.[1]?.format("YYYY-MM-DD"),
        };
        const result = await auditLogApi.list(params);
        setLogs(result.data || []);
        setTotal(result.total || 0);
        setPage(result.page || nextPage);
        setLimit(result.limit || nextLimit);
      } catch {
        toast.error(t("loadFailed"), { position: "top-right" });
      } finally {
        setLoading(false);
      }
    },
    [auditAction, auditModule, httpMethod, limit, page, range, search, success, t]
  );

  useEffect(() => {
    fetchLogs(1, limit);
  }, [auditAction, auditModule, httpMethod, range, search, success]);

  const columns = useMemo<ColumnsType<AuditLog>>(
    () => [
      {
        title: t("time"),
        dataIndex: "created_at",
        key: "created_at",
        width: 170,
        render: formatDateTime,
      },
      {
        title: t("user"),
        key: "user",
        width: 160,
        render: (_, record) => (
          <div className="min-w-0">
            <div className="truncate font-semibold text-slate-800">{getUserLabel(record)}</div>
            <div className="text-xs text-slate-500">{record.user_role || "-"}</div>
          </div>
        ),
      },
      {
        title: t("action"),
        dataIndex: "audit_action",
        key: "audit_action",
        width: 130,
        render: (value: string) => <Tag color={actionColors[value] || "default"}>{value}</Tag>,
      },
      {
        title: t("module"),
        dataIndex: "audit_module",
        key: "audit_module",
        width: 160,
        render: (value: string) => <span className="font-medium text-slate-700">{value}</span>,
      },
      {
        title: t("target"),
        dataIndex: "target_id",
        key: "target_id",
        width: 100,
        render: (value: string | null) => value || "-",
      },
      {
        title: t("method"),
        dataIndex: "http_method",
        key: "http_method",
        width: 100,
        render: (value: string) => <Tag color={methodColors[value] || "default"}>{value}</Tag>,
      },
      {
        title: t("status"),
        key: "status",
        width: 120,
        render: (_, record) => (
          <Tag color={record.success ? "green" : "red"}>
            {record.status_code} {record.success ? t("success") : t("failed")}
          </Tag>
        ),
      },
      {
        title: t("path"),
        dataIndex: "request_path",
        key: "request_path",
        width: 280,
        render: (value: string) => <code className="text-xs text-slate-700">{value}</code>,
      },
      {
        title: t("body"),
        dataIndex: "request_body",
        key: "request_body",
        width: 260,
        render: (value: Record<string, unknown> | null) => <JsonPreview value={value} />,
      },
      {
        title: t("ip"),
        dataIndex: "ip_address",
        key: "ip_address",
        width: 150,
        render: (value: string | null) => value || "-",
      },
      {
        title: t("duration"),
        dataIndex: "duration_ms",
        key: "duration_ms",
        width: 110,
        align: "right",
        render: (value: number | null) => (value == null ? "-" : `${value}ms`),
      },
    ],
    [t]
  );

  const moduleOptions = [
    "users",
    "vehicles",
    "vehicle-types",
    "vehicle-maintenances",
    "stations",
    "orders",
    "transports",
    "lot-tags",
    "lot-tag-requests",
    "permissions",
    "departments",
    "skills",
    "works",
    "work-arrangement-days",
    "work-arrangement-items",
  ].map((value) => ({ value, label: value }));

  return (
    <div className="m-10 rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-slate-100 bg-slate-50/60 p-6 md:p-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{t("title")}</h1>
          <p className="mt-2 text-lg text-slate-500">{t("subtitle")}</p>
        </div>
        <Button icon={<RefreshCw className="h-4 w-4" />} onClick={() => fetchLogs()}>
          {t("refresh")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
        <Input
          allowClear
          className="w-64"
          placeholder={t("searchPlaceholder")}
          prefix={<Search className="h-4 w-4 text-slate-400" />}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Select
          allowClear
          className="w-52"
          placeholder={t("module")}
          options={moduleOptions}
          value={auditModule}
          onChange={setAuditModule}
        />
        <Select
          allowClear
          className="w-44"
          placeholder={t("action")}
          options={["create", "update", "delete", "submit", "approve", "reject", "cancel"].map((value) => ({
            value,
            label: value,
          }))}
          value={auditAction}
          onChange={setAuditAction}
        />
        <Select
          allowClear
          className="w-36"
          placeholder={t("method")}
          options={["POST", "PUT", "PATCH", "DELETE"].map((value) => ({ value, label: value }))}
          value={httpMethod}
          onChange={setHttpMethod}
        />
        <Select
          allowClear
          className="w-40"
          placeholder={t("status")}
          options={[
            { value: "true", label: t("success") },
            { value: "false", label: t("failed") },
          ]}
          value={success}
          onChange={setSuccess}
        />
        <RangePicker
          format="DD/MM/YYYY"
          value={range}
          onChange={(value) => setRange(value as [Dayjs, Dayjs] | null)}
        />
      </div>

      <Table
        columns={columns}
        dataSource={logs}
        loading={loading}
        pagination={false}
        rowKey="audit_log_id"
        scroll={{ x: 1700 }}
      />

      <div className="flex justify-end border-t border-slate-100 p-4">
        <Pagination
          current={page}
          pageSize={limit}
          total={total}
          showSizeChanger
          showTotal={(value) => `${t("total")}: ${value}`}
          onChange={(nextPage, nextLimit) => fetchLogs(nextPage, nextLimit)}
        />
      </div>
    </div>
  );
}
