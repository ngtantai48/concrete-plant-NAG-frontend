"use client";

import http from "@/lib/http";
import { Button, message, Select, Table, Tag, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { ClipboardList, RefreshCw, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";

interface DriverRice {
  driver_rice_id: number;
  vehicle_name: string;
  license_plate: string;
  driver_name: string | null;
}

interface DriverOption {
  value: string;
  label: string;
}

export default function DriverRiceManager() {
  const t = useTranslations("DriverRice");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [records, setRecords] = useState<DriverRice[]>([]);
  const [editedNames, setEditedNames] = useState<Record<number, string>>({});
  const [driverOptions, setDriverOptions] = useState<DriverOption[]>([]);

  const fetchDrivers = useCallback(async () => {
    try {
      const res = await fetch("/api/google-sheets/attendance/personnel");
      const data = await res.json();
      const personnel = data.personnel || [];
      setDriverOptions(
        personnel
          .map((p: { tenVT: string; hoTen: string }) => ({
            value: p.hoTen,
            label: `${p.hoTen} (${p.tenVT})`,
          }))
          .sort((a: DriverOption, b: DriverOption) => a.label.localeCompare(b.label))
      );
    } catch {
      setDriverOptions([]);
    }
  }, []);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await http.get<{ data: DriverRice[] }>("/driver-rice");
      const data = res.data?.data || res.data || [];
      setRecords(Array.isArray(data) ? data : []);
      setEditedNames({});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown";
      message.error(t("fetchError") + ": " + msg);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchRecords();
    fetchDrivers();
  }, [fetchRecords, fetchDrivers]);

  const handleNameChange = useCallback((id: number, value: string) => {
    setEditedNames((prev) => ({ ...prev, [id]: value }));
  }, []);

  const handleSave = useCallback(async (record: DriverRice) => {
    const newName = editedNames[record.driver_rice_id];
    if (newName === undefined || newName === record.driver_name) return;

    setSaving(true);
    try {
      await http.put(`/driver-rice/${record.driver_rice_id}`, {
        driver_name: newName || null,
      });
      setRecords((prev) =>
        prev.map((r) =>
          r.driver_rice_id === record.driver_rice_id
            ? { ...r, driver_name: newName || null }
            : r
        )
      );
      setEditedNames((prev) => {
        const next = { ...prev };
        delete next[record.driver_rice_id];
        return next;
      });
      message.success(t("saveSuccess", { vehicle: record.vehicle_name }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown";
      message.error(t("saveError") + ": " + msg);
    } finally {
      setSaving(false);
    }
  }, [editedNames, t]);

  const hasEdits = useMemo(() => Object.keys(editedNames).length > 0, [editedNames]);
  const filledCount = useMemo(() => records.filter((r) => r.driver_name).length, [records]);
  const emptyCount = useMemo(() => records.filter((r) => !r.driver_name).length, [records]);

  const handleSaveAll = useCallback(async () => {
    const entries = Object.entries(editedNames);
    if (entries.length === 0) return;

    setSaving(true);
    let successCount = 0;
    try {
      for (const [idStr, name] of entries) {
        const id = Number(idStr);
        await http.put(`/driver-rice/${id}`, { driver_name: name || null });
        successCount++;
      }
      await fetchRecords();
      message.success(t("saveAllSuccess", { count: successCount }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown";
      message.error(t("saveError") + ": " + msg);
    } finally {
      setSaving(false);
    }
  }, [editedNames, fetchRecords, t]);

  const columns: ColumnsType<DriverRice> = [
    {
      title: "#",
      key: "index",
      width: 50,
      align: "center",
      render: (_: unknown, __: unknown, index: number) => index + 1,
    },
    {
      title: t("vehicleName"),
      dataIndex: "vehicle_name",
      key: "vehicle_name",
      width: 120,
      sorter: (a, b) => a.vehicle_name.localeCompare(b.vehicle_name),
      render: (val: string) => (
        <span className="font-semibold text-neutral-800">{val}</span>
      ),
    },
    {
      title: t("licensePlate"),
      dataIndex: "license_plate",
      key: "license_plate",
      width: 160,
      render: (val: string) => (
        <span className="font-mono text-sm bg-neutral-100 px-2 py-0.5 rounded border border-neutral-200">
          {val}
        </span>
      ),
    },
    {
      title: t("driverName"),
      key: "driver_name",
      width: 280,
      render: (_: unknown, record: DriverRice) => {
        const currentValue =
          editedNames[record.driver_rice_id] !== undefined
            ? editedNames[record.driver_rice_id]
            : record.driver_name || undefined;
        const isEdited = editedNames[record.driver_rice_id] !== undefined;

        return (
          <div className="flex items-center gap-2">
            <Select
              value={currentValue || undefined}
              onChange={(val) => handleNameChange(record.driver_rice_id, val || "")}
              placeholder={t("selectDriver")}
              size="small"
              allowClear
              showSearch
              optionFilterProp="label"
              options={driverOptions}
              className={`flex-1 ${isEdited ? "[&_.ant-select-selector]:border-amber-400!" : ""}`}
              style={{ minWidth: 180 }}
              getPopupContainer={(triggerNode) => triggerNode.parentElement || document.body}
            />
            {isEdited && (
              <Tooltip title={t("save")}>
                <Button
                  type="primary"
                  size="small"
                  icon={<Save size={13} />}
                  onClick={() => handleSave(record)}
                  loading={saving}
                  style={{ backgroundColor: "#b45309", borderColor: "#b45309" }}
                />
              </Tooltip>
            )}
          </div>
        );
      },
    },
    {
      title: t("status"),
      key: "status",
      width: 100,
      align: "center",
      filters: [
        { text: t("assigned"), value: "assigned" },
        { text: t("unassigned"), value: "unassigned" },
      ],
      onFilter: (value, record) =>
        value === "assigned" ? !!record.driver_name : !record.driver_name,
      render: (_: unknown, record: DriverRice) =>
        record.driver_name ? (
          <Tag color="success">{t("assigned")}</Tag>
        ) : (
          <Tag color="default">{t("unassigned")}</Tag>
        ),
    },
  ];

  return (
    <div className="px-6 py-8 max-w-[1400px]">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <ClipboardList size={22} className="text-amber-600" strokeWidth={2.5} />
          <h1 className="text-2xl font-bold m-0 tracking-tight text-neutral-800">
            {t("title")}
          </h1>
        </div>
        <p className="text-neutral-500 text-sm m-0 ml-[34px]">{t("description")}</p>
      </div>

      <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-5 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
              {t("total")}:
            </span>
            <span className="text-base font-bold text-neutral-800">{records.length}</span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button
              icon={<Save size={15} />}
              onClick={handleSaveAll}
              loading={saving}
              disabled={!hasEdits}
              type="primary"
              style={{
                fontWeight: 600,
                backgroundColor: hasEdits ? "#b45309" : undefined,
                borderColor: hasEdits ? "#b45309" : undefined,
              }}
            >
              {t("saveAll")} {hasEdits && `(${Object.keys(editedNames).length})`}
            </Button>
            <Button
              icon={<RefreshCw size={15} />}
              onClick={fetchRecords}
              loading={loading}
              style={{ fontWeight: 600 }}
            >
              {t("refresh")}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <Tooltip title={t("total")}>
          <div className="flex items-center gap-2 bg-neutral-100 border border-neutral-200 rounded-md px-4 py-2.5">
            <span className="text-2xl font-bold text-neutral-800 tabular-nums leading-none">
              {records.length}
            </span>
            <span className="text-xs text-neutral-500 font-medium uppercase">{t("total")}</span>
          </div>
        </Tooltip>

        <Tooltip title={t("assigned")}>
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-md px-4 py-2.5">
            <span className="text-2xl font-bold text-emerald-700 tabular-nums leading-none">
              {filledCount}
            </span>
            <span className="text-xs text-emerald-600 font-medium uppercase">{t("assigned")}</span>
          </div>
        </Tooltip>

        <Tooltip title={t("unassigned")}>
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-md px-4 py-2.5">
            <span className="text-2xl font-bold text-red-700 tabular-nums leading-none">
              {emptyCount}
            </span>
            <span className="text-xs text-red-600 font-medium uppercase">{t("unassigned")}</span>
          </div>
        </Tooltip>
      </div>

      <Table
        columns={columns}
        dataSource={records}
        rowKey="driver_rice_id"
        loading={loading}
        pagination={{ pageSize: 50, size: "small", showSizeChanger: false }}
        scroll={{ x: 700 }}
        size="middle"
        rowClassName={(record) =>
          record.driver_name
            ? "bg-emerald-50/40 hover:bg-emerald-50/70!"
            : "bg-red-50/30 hover:bg-red-50/50!"
        }
      />
    </div>
  );
}
