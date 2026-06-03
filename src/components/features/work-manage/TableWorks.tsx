"use client";

import { Button } from "@/components/ui/button";
import { PERMISSIONS } from "@/constants/permissions";
import { SIDEBAR } from "@/constants/route";
import { useNavigationStore } from "@/hooks/use-navigation-store";
import { usePermissions } from "@/hooks/use-permissions";
import { workApi } from "@/services/work.service";
import type { Work, WorkPayload } from "@/types/work";
import {
  Form,
  Input,
  Modal,
  Pagination,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { Briefcase, PenSquare, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

interface WorkFormValues {
  work_name: string;
  work_description?: string | null;
  work_root?: number | null;
}

const normalizeText = (value?: string | null) => value?.toLowerCase().trim() || "";

export default function TableWorks() {
  const t = useTranslations("WorkPage");
  const tCommon = useTranslations("Common");
  const { hasActionAccess } = usePermissions();
  const { setDirty } = useNavigationStore();

  const [form] = Form.useForm<WorkFormValues>();
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshDisabled, setRefreshDisabled] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingWork, setEditingWork] = useState<Work | null>(null);
  const [searchText, setSearchText] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const canCreate = hasActionAccess(SIDEBAR.WORKS, PERMISSIONS.WORKS.CREATE);
  const canUpdate = hasActionAccess(SIDEBAR.WORKS, PERMISSIONS.WORKS.UPDATE);
  const canDelete = hasActionAccess(SIDEBAR.WORKS, PERMISSIONS.WORKS.DELETE);

  const fetchWorks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await workApi.list({ limit: 1000 });
      setWorks(res.data.filter((work) => !work.delete_flag));
    } catch (error) {
      const message =
        (error as any)?.response?.data?.message || (error as Error)?.message || t("loadFailed");
      toast.error(t("loadFailed"), { description: message });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchWorks();
  }, [fetchWorks]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchText]);

  const worksById = useMemo(() => {
    const map = new Map<number, Work>();
    for (const work of works) map.set(work.work_id, work);
    return map;
  }, [works]);

  const rootName = useCallback(
    (root?: number | null) => (root ? worksById.get(root)?.work_name || `#${root}` : ""),
    [worksById]
  );

  const filteredWorks = useMemo(() => {
    const keyword = normalizeText(searchText);
    if (!keyword) return works;

    return works.filter(
      (work) =>
        normalizeText(work.work_name).includes(keyword) ||
        normalizeText(work.work_description).includes(keyword) ||
        normalizeText(rootName(work.work_root)).includes(keyword)
    );
  }, [searchText, works, rootName]);

  const pagedWorks = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredWorks.slice(start, start + pageSize);
  }, [currentPage, filteredWorks, pageSize]);

  // Tùy chọn "công việc gốc" (cha) — loại trừ chính nó khi sửa để tránh tự làm cha.
  const rootOptions = useMemo(
    () => [
      { value: 0, label: t("rootNone") },
      ...works
        .filter((work) => !editingWork || work.work_id !== editingWork.work_id)
        .map((work) => ({ value: work.work_id, label: work.work_name })),
    ],
    [works, editingWork, t]
  );

  const handleRefresh = () => {
    if (refreshDisabled > 0) return;

    fetchWorks();
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

  const openAddModal = () => {
    setEditingWork(null);
    form.resetFields();
    form.setFieldsValue({ work_root: 0 });
    setModalOpen(true);
  };

  const openEditModal = (work: Work) => {
    setEditingWork(work);
    form.setFieldsValue({
      work_name: work.work_name,
      work_description: work.work_description || "",
      work_root: work.work_root ?? 0,
    });
    setModalOpen(true);
  };

  const handleCancel = () => {
    setModalOpen(false);
    form.resetFields();
    setDirty(false);
  };

  const toPayload = (values: WorkFormValues): WorkPayload => ({
    work_name: values.work_name.trim(),
    work_description: values.work_description?.trim() || null,
    work_root: typeof values.work_root === "number" ? values.work_root : 0,
  });

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      if (editingWork) {
        await workApi.update(editingWork.work_id, toPayload(values));
      } else {
        await workApi.create(toPayload(values));
      }

      toast.success(editingWork ? t("updateSuccess") : t("createSuccess"), {
        position: "top-right",
      });
      handleCancel();
      fetchWorks();
    } catch (error) {
      const hasFieldErrors = Array.isArray((error as { errorFields?: unknown[] }).errorFields);
      if (hasFieldErrors) return;

      const message =
        (error as any)?.response?.data?.message || (error as Error)?.message || t("saveFailed");
      toast.error(t("failed"), { description: message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (work: Work) => {
    try {
      await workApi.delete(work.work_id);
      toast.success(
        <>
          {t("workName")} <b>{work.work_name}</b> {t("deleteSuccess")}
        </>
      );
      fetchWorks();
    } catch (error) {
      const message =
        (error as any)?.response?.data?.message || (error as Error)?.message || t("deleteFailed");
      toast.error(t("failed"), { description: message });
    }
  };

  const onValuesChange = () => {
    if (!useNavigationStore.getState().isDirty) {
      setDirty(true);
    }
  };

  const columns: ColumnsType<Work> = [
    {
      title: "#",
      key: "index",
      width: 56,
      align: "center",
      render: (_value, _record, index) => (currentPage - 1) * pageSize + index + 1,
    },
    {
      title: t("workName"),
      dataIndex: "work_name",
      key: "work_name",
      sorter: (a, b) => a.work_name.localeCompare(b.work_name),
      render: (value: string) => <span className="font-semibold text-slate-800">{value}</span>,
    },
    {
      title: t("rootColumn"),
      dataIndex: "work_root",
      key: "work_root",
      render: (value: number | null) =>
        value ? (
          <span className="text-slate-700">{rootName(value)}</span>
        ) : (
          <Tag color="green">{t("rootBadge")}</Tag>
        ),
    },
    {
      title: t("description"),
      dataIndex: "work_description",
      key: "work_description",
      render: (value: string | null) => value || <span className="text-slate-400 italic">-</span>,
    },
    ...(canUpdate || canDelete
      ? [
          {
            title: t("actions"),
            key: "actions",
            align: "center" as const,
            fixed: "right" as const,
            width: 150,
            render: (_value: unknown, record: Work) => (
              <Space size="middle">
                {canUpdate && (
                  <Tooltip title={t("editTooltip")}>
                    <Button
                      variant="outline"
                      size="iconSquare"
                      onClick={() => openEditModal(record)}
                    >
                      <PenSquare className="size-4 text-blue-600" />
                    </Button>
                  </Tooltip>
                )}
                {canDelete && (
                  <Popconfirm
                    title={t("confirmTitle")}
                    description={
                      <span>
                        {t("confirmDelete")} <b>{record.work_name}</b>?
                      </span>
                    }
                    okText={t("okText")}
                    cancelText={t("cancelText")}
                    placement="leftBottom"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => handleDelete(record)}
                  >
                    <Tooltip title={t("deleteTooltip")}>
                      <Button variant="outline" size="iconSquare">
                        <Trash2 className="size-4 text-red-500" />
                      </Button>
                    </Tooltip>
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <div className="m-10 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm animate-fade-in">
        <div className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-slate-100 bg-slate-50/50 p-6 md:p-8">
          <div className="flex-1">
            <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
              {t("title")}
            </h1>
            <p className="mt-2 text-lg text-slate-500">{t("subtitle")}</p>
          </div>

          <div className="mt-2 flex flex-wrap gap-3 sm:mt-0">
            {canCreate && (
              <Tooltip title={t("addTooltip")}>
                <Button variant="primary" onClick={openAddModal}>
                  <Plus className="size-4" />
                  {t("addWork")}
                </Button>
              </Tooltip>
            )}

            <Tooltip title={tCommon("refreshData")}>
              <Button
                className="min-w-[120px] transition-smooth hover:bg-slate-100"
                variant="outline"
                onClick={handleRefresh}
                disabled={refreshDisabled > 0}
              >
                <RefreshCw className={`size-4 ${refreshDisabled > 0 ? "animate-spin" : ""}`} />
                <span>
                  {refreshDisabled > 0
                    ? `${tCommon("refresh")} (${refreshDisabled}s)`
                    : tCommon("refresh")}
                </span>
              </Button>
            </Tooltip>
          </div>
        </div>

        <div className="flex flex-col gap-4 px-6 py-6 md:px-8 sm:flex-row sm:items-center">
          <Input
            allowClear
            className="max-w-sm"
            prefix={<Search className="mr-1 size-4 text-slate-400" />}
            placeholder={t("searchPlaceholder")}
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </div>

        <div
          className="overflow-hidden border-t border-slate-200 animate-slide-up"
          style={{ animationDelay: "100ms" }}
        >
          <Table
            columns={columns}
            dataSource={pagedWorks}
            rowKey="work_id"
            loading={loading}
            pagination={false}
            bordered
            scroll={{ x: "max-content" }}
            tableLayout="auto"
          />

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 p-4">
            <div className="text-sm text-slate-500">
              {filteredWorks.length > 0 ? (
                <>
                  <i>{t("total")}</i>: <b>{filteredWorks.length}</b>
                </>
              ) : null}
            </div>
            <Pagination
              current={currentPage}
              pageSize={pageSize}
              total={filteredWorks.length}
              align="end"
              showSizeChanger
              onChange={(page, size) => {
                setCurrentPage(page);
                setPageSize(size);
              }}
            />
          </div>
        </div>

        {!loading && filteredWorks.length === 0 && (
          <div className="py-12 text-center text-gray-500">
            <Briefcase className="mx-auto mb-3 size-12 text-gray-300" />
            <p className="text-lg">{t("emptyTitle")}</p>
            <p className="mt-2 text-sm">{t("emptyHint")}</p>
          </div>
        )}
      </div>

      <Modal
        title={
          <div className="flex items-center gap-3 border-b border-slate-200 pb-4">
            <div
              className={`flex size-10 items-center justify-center rounded-full ${
                editingWork ? "bg-amber-100" : "bg-blue-100"
              }`}
            >
              <Briefcase className={`size-5 ${editingWork ? "text-amber-600" : "text-blue-600"}`} />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                {editingWork ? t("editWork") : t("newWork")}
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">
                {editingWork ? t("editSubtitle") : t("newSubtitle")}
              </p>
            </div>
          </div>
        }
        open={modalOpen}
        onCancel={handleCancel}
        width={560}
        styles={{
          body: {
            maxHeight: "75vh",
            overflowY: "auto",
            padding: "24px",
          },
        }}
        footer={
          <div className="mt-2 flex justify-end gap-3 border-t border-slate-200 pt-4">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={saving}
              className="min-w-[100px]"
            >
              {t("cancel")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className={`min-w-[140px] text-white ${
                editingWork ? "bg-amber-600 hover:bg-amber-700" : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {t("save")}
            </Button>
          </div>
        }
        destroyOnClose
      >
        <div className="p-2">
          <Form
            form={form}
            name="work-form"
            layout="vertical"
            autoComplete="off"
            onValuesChange={onValuesChange}
            className="space-y-4"
          >
            <Form.Item
              label={<span className="font-medium text-slate-700">{t("workName")}</span>}
              name="work_name"
              rules={[
                { required: true, message: t("requiredName") },
                {
                  validator: (_, value?: string) => {
                    if (!value || value.trim()) return Promise.resolve();
                    return Promise.reject(t("requiredName"));
                  },
                },
              ]}
            >
              <Input placeholder={t("namePlaceholder")} size="large" className="rounded-lg" />
            </Form.Item>

            <Form.Item
              label={<span className="font-medium text-slate-700">{t("rootLabel")}</span>}
              name="work_root"
            >
              <Select
                size="large"
                className="w-full"
                showSearch
                optionFilterProp="label"
                placeholder={t("rootPlaceholder")}
                options={rootOptions}
              />
            </Form.Item>

            <Form.Item
              label={<span className="font-medium text-slate-700">{t("description")}</span>}
              name="work_description"
            >
              <Input.TextArea
                placeholder={t("descriptionPlaceholder")}
                rows={4}
                className="rounded-lg"
              />
            </Form.Item>
          </Form>
        </div>
      </Modal>
    </>
  );
}
