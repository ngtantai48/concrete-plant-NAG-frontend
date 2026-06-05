"use client";

import { Button } from "@/components/ui/button";
import { PERMISSIONS } from "@/constants/permissions";
import { SIDEBAR } from "@/constants/route";
import { useNavigationStore } from "@/hooks/use-navigation-store";
import { usePermissions } from "@/hooks/use-permissions";
import { skillApi } from "@/services/skill.service";
import type { Skill, SkillPayload } from "@/types/skill";
import { Form, Input, Modal, Pagination, Popconfirm, Space, Table, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { Award, PenSquare, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

interface SkillFormValues {
  skill_name: string;
  skill_description?: string | null;
}

const normalizeText = (value?: string | null) => value?.toLowerCase().trim() || "";

export default function TableSkills() {
  const t = useTranslations("SkillPage");
  const tCommon = useTranslations("Common");
  const { hasActionAccess } = usePermissions();
  const { setDirty } = useNavigationStore();

  const [form] = Form.useForm<SkillFormValues>();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshDisabled, setRefreshDisabled] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [searchText, setSearchText] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const canCreate = hasActionAccess(SIDEBAR.SKILLS, PERMISSIONS.SKILLS.CREATE);
  const canUpdate = hasActionAccess(SIDEBAR.SKILLS, PERMISSIONS.SKILLS.UPDATE);
  const canDelete = hasActionAccess(SIDEBAR.SKILLS, PERMISSIONS.SKILLS.DELETE);

  const fetchSkills = useCallback(async () => {
    setLoading(true);
    try {
      const res = await skillApi.list({ limit: 1000 });
      setSkills(res.data.filter((skill) => !skill.delete_flag));
    } catch (error) {
      const message =
        (error as any)?.response?.data?.message || (error as Error)?.message || t("loadFailed");
      toast.error(t("loadFailed"), { description: message });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchText]);

  const filteredSkills = useMemo(() => {
    const keyword = normalizeText(searchText);
    if (!keyword) return skills;

    return skills.filter(
      (skill) =>
        normalizeText(skill.skill_name).includes(keyword) ||
        normalizeText(skill.skill_description).includes(keyword)
    );
  }, [searchText, skills]);

  const pagedSkills = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredSkills.slice(start, start + pageSize);
  }, [currentPage, filteredSkills, pageSize]);

  const handleRefresh = () => {
    if (refreshDisabled > 0) return;

    fetchSkills();
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
    setEditingSkill(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEditModal = (skill: Skill) => {
    setEditingSkill(skill);
    form.setFieldsValue({
      skill_name: skill.skill_name,
      skill_description: skill.skill_description || "",
    });
    setModalOpen(true);
  };

  const handleCancel = () => {
    setModalOpen(false);
    form.resetFields();
    setDirty(false);
  };

  const toPayload = (values: SkillFormValues): SkillPayload => ({
    skill_name: values.skill_name.trim(),
    skill_description: values.skill_description?.trim() || null,
  });

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      if (editingSkill) {
        await skillApi.update(editingSkill.skill_id, toPayload(values));
      } else {
        await skillApi.create(toPayload(values));
      }

      toast.success(editingSkill ? t("updateSuccess") : t("createSuccess"), {
        position: "top-right",
      });
      handleCancel();
      fetchSkills();
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

  const handleDelete = async (skill: Skill) => {
    try {
      await skillApi.delete(skill.skill_id);
      toast.success(
        <>
          {t("skillName")} <b>{skill.skill_name}</b> {t("deleteSuccess")}
        </>
      );
      fetchSkills();
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

  const columns: ColumnsType<Skill> = [
    {
      title: "#",
      key: "index",
      width: 56,
      align: "center",
      render: (_value, _record, index) => (currentPage - 1) * pageSize + index + 1,
    },
    {
      title: t("skillName"),
      dataIndex: "skill_name",
      key: "skill_name",
      sorter: (a, b) => a.skill_name.localeCompare(b.skill_name),
      render: (value: string) => <span className="font-semibold text-slate-800">{value}</span>,
    },
    {
      title: t("description"),
      dataIndex: "skill_description",
      key: "skill_description",
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
            render: (_value: unknown, record: Skill) => (
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
                        {t("confirmDelete")} <b>{record.skill_name}</b>?
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
                  {t("addSkill")}
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
            dataSource={pagedSkills}
            rowKey="skill_id"
            loading={loading}
            pagination={false}
            bordered
            scroll={{ x: "max-content" }}
            tableLayout="auto"
          />

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 p-4">
            <div className="text-sm text-slate-500">
              {filteredSkills.length > 0 ? (
                <>
                  <i>{t("total")}</i>: <b>{filteredSkills.length}</b>
                </>
              ) : null}
            </div>
            <Pagination
              current={currentPage}
              pageSize={pageSize}
              total={filteredSkills.length}
              align="end"
              showSizeChanger
              onChange={(page, size) => {
                setCurrentPage(page);
                setPageSize(size);
              }}
            />
          </div>
        </div>

        {!loading && filteredSkills.length === 0 && (
          <div className="py-12 text-center text-gray-500">
            <Award className="mx-auto mb-3 size-12 text-gray-300" />
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
                editingSkill ? "bg-amber-100" : "bg-blue-100"
              }`}
            >
              <Award className={`size-5 ${editingSkill ? "text-amber-600" : "text-blue-600"}`} />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                {editingSkill ? t("editSkill") : t("newSkill")}
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">
                {editingSkill ? t("editSubtitle") : t("newSubtitle")}
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
                editingSkill ? "bg-amber-600 hover:bg-amber-700" : "bg-blue-600 hover:bg-blue-700"
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
            name="skill-form"
            layout="vertical"
            autoComplete="off"
            onValuesChange={onValuesChange}
            className="space-y-4"
          >
            <Form.Item
              label={<span className="font-medium text-slate-700">{t("skillName")}</span>}
              name="skill_name"
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
              label={<span className="font-medium text-slate-700">{t("description")}</span>}
              name="skill_description"
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
