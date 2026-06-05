"use client";

import { Button } from "@/components/ui/button";
import { PERMISSIONS } from "@/constants/permissions";
import { SIDEBAR } from "@/constants/route";
import { USER_ASSIGNMENT_SHEET_ROWS } from "@/data/user-assignment-sheet";
import { useNavigationStore } from "@/hooks/use-navigation-store";
import { usePermissions } from "@/hooks/use-permissions";
import { departmentApi } from "@/services/department.service";
import { skillApi } from "@/services/skill.service";
import { userAssignmentApi } from "@/services/user-assignment.service";
import { userApi } from "@/services/user.service";
import type { Department } from "@/types/department";
import type { Skill } from "@/types/skill";
import type { UserAssignment, UserAssignmentPayload } from "@/types/user-assignment";
import type { User } from "@/types/user";
import { Form, Input, Modal, Pagination, Popconfirm, Select, Space, Table, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  FileSpreadsheet,
  Link2,
  Loader2,
  PenSquare,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UsersRound,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

interface AssignmentFormValues {
  user_id: number;
  department_id: number;
  skill_id: number;
}

const normalizeText = (value?: string | null) => value?.toLowerCase().trim() || "";

const normalizeLookupKey = (value?: string | null) =>
  (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/÷/g, " den ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .trim();

const getSheetSkillParts = (value?: string | null) =>
  (value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

const getUserDisplayName = (user: User) => {
  const name = user.user_full_name || user.username;
  return user.user_short_name ? `${name} (${user.user_short_name})` : name;
};

const getUserIdentityKey = (fullName?: string | null, shortName?: string | null) =>
  `${normalizeText(fullName)}::${normalizeText(shortName)}`;

const getSheetUserLookupKey = (fullName?: string | null, shortName?: string | null) =>
  normalizeLookupKey(`${fullName || ""} ${shortName || ""}`);

const getAssignmentUserId = (assignment: UserAssignment) =>
  Number(
    assignment.user_id ||
      (assignment as any).user?.user_id ||
      (assignment as any).users?.user_id ||
      0
  );

const getAssignmentRecordId = (assignment: UserAssignment) =>
  Number(assignment.user_assignment_id || assignment.assignment_id || 0);

const getAssignmentDepartmentId = (assignment: UserAssignment) =>
  Number(
    assignment.department_id ||
      (assignment as any).department?.department_id ||
      (assignment as any).departments?.department_id ||
      0
  );

const getAssignmentSkillId = (assignment: UserAssignment) =>
  Number(
    assignment.skill_id ||
      (assignment as any).skill?.skill_id ||
      (assignment as any).skills?.skill_id ||
      0
  );

const getAssignmentUserFullName = (assignment: UserAssignment) =>
  assignment.user_full_name ||
  (assignment as any).user?.user_full_name ||
  (assignment as any).users?.user_full_name ||
  "";

const getAssignmentUserShortName = (assignment: UserAssignment) =>
  assignment.user_short_name ||
  (assignment as any).user?.user_short_name ||
  (assignment as any).users?.user_short_name ||
  "";

const getAssignmentDepartmentName = (assignment: UserAssignment) =>
  assignment.department_name ||
  (assignment as any).department?.department_name ||
  (assignment as any).departments?.department_name ||
  "";

const getAssignmentSkillName = (assignment: UserAssignment) =>
  assignment.skill_name ||
  (assignment as any).skill?.skill_name ||
  (assignment as any).skills?.skill_name ||
  "";

export default function TableUserAssignments() {
  const t = useTranslations("UserAssignmentPage");
  const tCommon = useTranslations("Common");
  const { hasActionAccess } = usePermissions();
  const { setDirty } = useNavigationStore();

  const [form] = Form.useForm<AssignmentFormValues>();
  const [assignments, setAssignments] = useState<UserAssignment[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sheetImporting, setSheetImporting] = useState(false);
  const [refreshDisabled, setRefreshDisabled] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<UserAssignment | null>(null);
  const [searchText, setSearchText] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const watchedUserId = Form.useWatch("user_id", form);
  const canCreate = hasActionAccess(SIDEBAR.USER_ASSIGNMENTS, PERMISSIONS.USER_ASSIGNMENTS.CREATE);
  const canUpdate = hasActionAccess(SIDEBAR.USER_ASSIGNMENTS, PERMISSIONS.USER_ASSIGNMENTS.UPDATE);
  const canDelete = hasActionAccess(SIDEBAR.USER_ASSIGNMENTS, PERMISSIONS.USER_ASSIGNMENTS.DELETE);
  const canImportSheet = canUpdate;

  const userIdByAssignmentIdentity = useMemo(() => {
    const map = new Map<string, number>();

    users.forEach((user) => {
      map.set(getUserIdentityKey(user.user_full_name, user.user_short_name), user.user_id);
    });

    return map;
  }, [users]);

  const departmentIdByName = useMemo(() => {
    const map = new Map<string, number>();

    departments.forEach((department) => {
      map.set(normalizeLookupKey(department.department_name), department.department_id);
    });

    return map;
  }, [departments]);

  const skillIdByName = useMemo(() => {
    const map = new Map<string, number>();

    skills.forEach((skill) => {
      map.set(normalizeLookupKey(skill.skill_name), skill.skill_id);
    });

    return map;
  }, [skills]);

  const resolveAssignmentUserId = useCallback(
    (assignment: UserAssignment) => {
      const directUserId = getAssignmentUserId(assignment);
      if (directUserId) return directUserId;

      return (
        userIdByAssignmentIdentity.get(
          getUserIdentityKey(
            getAssignmentUserFullName(assignment),
            getAssignmentUserShortName(assignment)
          )
        ) || 0
      );
    },
    [userIdByAssignmentIdentity]
  );

  const resolveAssignmentDepartmentId = useCallback(
    (assignment: UserAssignment) => {
      const directDepartmentId = getAssignmentDepartmentId(assignment);
      if (directDepartmentId) return directDepartmentId;

      return (
        departmentIdByName.get(normalizeLookupKey(getAssignmentDepartmentName(assignment))) || 0
      );
    },
    [departmentIdByName]
  );

  const resolveAssignmentSkillId = useCallback(
    (assignment: UserAssignment) => {
      const directSkillId = getAssignmentSkillId(assignment);
      if (directSkillId) return directSkillId;

      return skillIdByName.get(normalizeLookupKey(getAssignmentSkillName(assignment))) || 0;
    },
    [skillIdByName]
  );

  const assignedUserIds = useMemo(() => {
    return new Set(assignments.map(resolveAssignmentUserId).filter(Boolean));
  }, [assignments, resolveAssignmentUserId]);

  const editingUserId = useMemo(
    () => (editingAssignment ? resolveAssignmentUserId(editingAssignment) : 0),
    [editingAssignment, resolveAssignmentUserId]
  );

  const userOptions = useMemo(
    () =>
      users
        .filter(
          (user) =>
            !assignedUserIds.has(user.user_id) ||
            user.user_id === watchedUserId ||
            user.user_id === editingUserId
        )
        .map((user) => ({
          value: user.user_id,
          label: getUserDisplayName(user),
          searchLabel: [
            user.user_full_name,
            user.user_short_name,
            user.username,
            user.user_phone_number,
            user.user_email,
          ]
            .filter(Boolean)
            .join(" "),
        })),
    [assignedUserIds, editingUserId, users, watchedUserId]
  );

  const departmentOptions = useMemo(
    () =>
      departments.map((department) => ({
        value: department.department_id,
        label: department.department_name,
      })),
    [departments]
  );

  const skillOptions = useMemo(
    () =>
      skills.map((skill) => ({
        value: skill.skill_id,
        label: skill.skill_name,
      })),
    [skills]
  );

  const fetchAssignments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await userAssignmentApi.list({ limit: 1000 });
      setAssignments(res.data.filter((assignment) => !assignment.delete_flag));
    } catch (error) {
      const message =
        (error as any)?.response?.data?.message || (error as Error)?.message || t("loadFailed");
      toast.error(t("loadFailed"), { description: message });
    } finally {
      setLoading(false);
    }
  }, [t]);

  const fetchLookupData = useCallback(async () => {
    try {
      const [usersRes, departmentsRes, skillsRes] = await Promise.all([
        userApi.list({ limit: 1000 }),
        departmentApi.list({ limit: 1000 }),
        skillApi.list({ limit: 1000 }),
      ]);

      setUsers(usersRes.data.filter((user) => !user.delete_flag));
      setDepartments(departmentsRes.data.filter((department) => !department.delete_flag));
      setSkills(skillsRes.data.filter((skill) => !skill.delete_flag));
    } catch {
      setUsers([]);
      setDepartments([]);
      setSkills([]);
    }
  }, []);

  const linkSheetAssignments = useCallback(async () => {
    if (!canImportSheet) return;

    setSheetImporting(true);

    try {
      const [usersRes, departmentsRes, skillsRes, assignmentsRes] = await Promise.all([
        userApi.list({ limit: 1000 }),
        departmentApi.list({ limit: 1000 }),
        skillApi.list({ limit: 1000 }),
        userAssignmentApi.list({ limit: 1000 }),
      ]);

      const activeUsers = usersRes.data.filter((user) => !user.delete_flag);
      const activeDepartments = departmentsRes.data.filter((department) => !department.delete_flag);
      const activeSkills = skillsRes.data.filter((skill) => !skill.delete_flag);
      const activeAssignments = assignmentsRes.data.filter((assignment) => !assignment.delete_flag);

      const userIdByKey = new Map<string, number>();
      const departmentIdByKey = new Map<string, number>();
      const skillIdByKey = new Map<string, number>();

      const setLookup = (
        map: Map<string, number>,
        value: string | null | undefined,
        id: number
      ) => {
        const key = normalizeLookupKey(value);
        if (key && !map.has(key)) map.set(key, id);
      };

      activeUsers.forEach((user) => {
        setLookup(
          userIdByKey,
          `${user.user_full_name || ""} ${user.user_short_name || ""}`,
          user.user_id
        );
        setLookup(userIdByKey, user.user_short_name, user.user_id);
        setLookup(userIdByKey, user.user_full_name, user.user_id);
        setLookup(userIdByKey, getUserDisplayName(user), user.user_id);
      });

      activeDepartments.forEach((department) => {
        setLookup(departmentIdByKey, department.department_name, department.department_id);
      });

      activeSkills.forEach((skill) => {
        setLookup(skillIdByKey, skill.skill_name, skill.skill_id);
      });

      const currentByUserId = new Map<number, UserAssignment>();

      activeAssignments.forEach((assignment) => {
        const userId =
          getAssignmentUserId(assignment) ||
          userIdByKey.get(normalizeLookupKey(getAssignmentUserShortName(assignment))) ||
          userIdByKey.get(normalizeLookupKey(getAssignmentUserFullName(assignment))) ||
          0;

        if (userId) currentByUserId.set(userId, assignment);
      });

      const resolveLocalDepartmentId = (assignment: UserAssignment) =>
        getAssignmentDepartmentId(assignment) ||
        departmentIdByKey.get(normalizeLookupKey(getAssignmentDepartmentName(assignment))) ||
        0;

      const resolveLocalSkillId = (assignment: UserAssignment) =>
        getAssignmentSkillId(assignment) ||
        skillIdByKey.get(normalizeLookupKey(getAssignmentSkillName(assignment))) ||
        0;

      let updated = 0;
      let unchanged = 0;
      let blankSkill = 0;
      let extraSkillCount = 0;

      const missingUsers: string[] = [];
      const missingAssignments: string[] = [];
      const missingDepartments: string[] = [];
      const missingSkills: string[] = [];
      const requestFailures: string[] = [];

      for (const row of USER_ASSIGNMENT_SHEET_ROWS) {
        const userId =
          userIdByKey.get(getSheetUserLookupKey(row.user_full_name, row.user_short_name)) ||
          userIdByKey.get(normalizeLookupKey(row.user_full_name)) ||
          userIdByKey.get(normalizeLookupKey(row.user_short_name)) ||
          0;

        if (!userId) {
          missingUsers.push(row.user_short_name || row.user_full_name);
          continue;
        }

        const currentAssignment = currentByUserId.get(userId);

        if (!currentAssignment) {
          missingAssignments.push(row.user_short_name || row.user_full_name);
          continue;
        }

        const sheetDepartmentId =
          departmentIdByKey.get(normalizeLookupKey(row.department_name)) || 0;
        const currentDepartmentId = resolveLocalDepartmentId(currentAssignment);
        const departmentId = currentDepartmentId || sheetDepartmentId;

        if (!departmentId) {
          missingDepartments.push(row.department_name);
          continue;
        }

        const skillParts = getSheetSkillParts(row.skill_names);

        if (skillParts.length === 0) {
          blankSkill += 1;
          continue;
        }

        const primarySkill = skillParts[0];
        const skillId = skillIdByKey.get(normalizeLookupKey(primarySkill)) || 0;

        if (!skillId) {
          missingSkills.push(`${row.user_short_name || row.user_full_name}: ${primarySkill}`);
          continue;
        }

        extraSkillCount += Math.max(skillParts.length - 1, 0);

        const payload: UserAssignmentPayload = {
          user_id: userId,
          department_id: departmentId,
          skill_id: skillId,
        };

        try {
          const currentSkillId = resolveLocalSkillId(currentAssignment);

          if (currentDepartmentId === departmentId && currentSkillId === skillId) {
            unchanged += 1;
            continue;
          }

          const assignmentId = getAssignmentRecordId(currentAssignment);
          if (!assignmentId) {
            missingAssignments.push(row.user_short_name || row.user_full_name);
            continue;
          }

          await userAssignmentApi.updateById(assignmentId, payload);
          updated += 1;

          currentByUserId.set(userId, {
            user_id: userId,
            department_id: departmentId,
            skill_id: skillId,
            user_full_name: row.user_full_name,
            user_short_name: row.user_short_name,
            department_name: getAssignmentDepartmentName(currentAssignment) || row.department_name,
            skill_name: primarySkill,
          });
        } catch {
          requestFailures.push(row.user_short_name || row.user_full_name);
        }
      }

      await fetchAssignments();
      await fetchLookupData();

      const skipped =
        blankSkill +
        missingUsers.length +
        missingAssignments.length +
        missingDepartments.length +
        missingSkills.length;
      toast.success(t("sheetLinkSuccess"), {
        description: t("sheetLinkSummary", { updated, unchanged, skipped }),
      });

      if (skipped || extraSkillCount || requestFailures.length) {
        const summarize = (items: string[]) =>
          items.length > 5 ? `${items.slice(0, 5).join(", ")}...` : items.join(", ");

        toast.warning(t("sheetLinkWarning"), {
          description: t("sheetLinkDetails", {
            blankSkill,
            extraSkillCount,
            missingUsers: summarize(missingUsers) || "-",
            missingAssignments: summarize(missingAssignments) || "-",
            missingDepartments: summarize(Array.from(new Set(missingDepartments))) || "-",
            missingSkills: summarize(missingSkills) || "-",
            requestFailures: summarize(requestFailures) || "-",
          }),
          duration: 10000,
        });
      }
    } catch (error) {
      const message =
        (error as any)?.response?.data?.message ||
        (error as Error)?.message ||
        t("sheetLinkFailed");
      toast.error(t("failed"), { description: message });
    } finally {
      setSheetImporting(false);
    }
  }, [canImportSheet, fetchAssignments, fetchLookupData, t]);

  const confirmLinkSheetAssignments = () => {
    Modal.confirm({
      title: t("sheetLinkConfirmTitle"),
      content: t("sheetLinkConfirmDescription"),
      okText: t("sheetLinkConfirmOk"),
      cancelText: t("cancelText"),
      onOk: linkSheetAssignments,
    });
  };

  useEffect(() => {
    fetchAssignments();
    fetchLookupData();
  }, [fetchAssignments, fetchLookupData]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchText]);

  const filteredAssignments = useMemo(() => {
    const keyword = normalizeText(searchText);
    if (!keyword) return assignments;

    return assignments.filter((assignment) => {
      return (
        normalizeText(getAssignmentUserFullName(assignment)).includes(keyword) ||
        normalizeText(getAssignmentUserShortName(assignment)).includes(keyword) ||
        normalizeText(getAssignmentDepartmentName(assignment)).includes(keyword) ||
        normalizeText(getAssignmentSkillName(assignment)).includes(keyword)
      );
    });
  }, [assignments, searchText]);

  const pagedAssignments = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAssignments.slice(start, start + pageSize);
  }, [currentPage, filteredAssignments, pageSize]);

  const handleRefresh = () => {
    if (refreshDisabled > 0) return;

    fetchAssignments();
    fetchLookupData();
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
    setEditingAssignment(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEditModal = (assignment: UserAssignment) => {
    const userId = resolveAssignmentUserId(assignment);
    const departmentId = resolveAssignmentDepartmentId(assignment);
    const skillId = resolveAssignmentSkillId(assignment);

    if (!userId) {
      toast.error(t("missingUserId"));
      return;
    }

    setEditingAssignment(assignment);
    form.setFieldsValue({
      user_id: userId,
      department_id: departmentId || undefined,
      skill_id: skillId || undefined,
    });
    setModalOpen(true);
  };

  const handleCancel = () => {
    setModalOpen(false);
    form.resetFields();
    setDirty(false);
  };

  const toPayload = (values: AssignmentFormValues): UserAssignmentPayload => ({
    user_id: values.user_id,
    department_id: values.department_id,
    skill_id: values.skill_id,
  });

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const payload = toPayload(values);
      setSaving(true);

      if (editingAssignment) {
        const assignmentId = getAssignmentRecordId(editingAssignment);

        if (!assignmentId) {
          toast.error(t("missingAssignmentId"));
          return;
        }

        await userAssignmentApi.updateById(assignmentId, payload);
      } else {
        await userAssignmentApi.create(payload);
      }

      toast.success(editingAssignment ? t("updateSuccess") : t("createSuccess"), {
        position: "top-right",
      });
      handleCancel();
      fetchAssignments();
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

  const handleDelete = async (assignment: UserAssignment) => {
    const assignmentId = getAssignmentRecordId(assignment);

    if (!assignmentId) {
      toast.error(t("missingAssignmentId"));
      return;
    }

    try {
      await userAssignmentApi.deleteById(assignmentId);
      toast.success(t("deleteSuccess"), { position: "top-right" });
      fetchAssignments();
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

  const columns: ColumnsType<UserAssignment> = [
    {
      title: t("fullName"),
      key: "user_full_name",
      render: (_value, record) => (
        <span className="font-semibold text-slate-800">
          {getAssignmentUserFullName(record) || "-"}
        </span>
      ),
    },
    {
      title: t("shortName"),
      key: "user_short_name",
      width: 160,
      render: (_value, record) =>
        getAssignmentUserShortName(record) ? (
          <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
            {getAssignmentUserShortName(record)}
          </span>
        ) : (
          <span className="text-slate-400 italic">-</span>
        ),
    },
    {
      title: t("department"),
      key: "department_name",
      render: (_value, record) => (
        <span className="font-medium text-slate-700">
          {getAssignmentDepartmentName(record) || "-"}
        </span>
      ),
    },
    {
      title: t("skill"),
      key: "skill_name",
      render: (_value, record) => (
        <span className="font-medium text-slate-700">{getAssignmentSkillName(record) || "-"}</span>
      ),
    },
    ...(canUpdate || canDelete
      ? [
          {
            title: t("actions"),
            key: "actions",
            align: "center" as const,
            fixed: "right" as const,
            width: 140,
            render: (_value: unknown, record: UserAssignment) => (
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
                        {t("confirmDelete")} <b>{getAssignmentUserFullName(record)}</b>?
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
                  {t("addAssignment")}
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
            dataSource={pagedAssignments}
            rowKey={(record) =>
              String(
                getAssignmentRecordId(record) ||
                  resolveAssignmentUserId(record) ||
                  `${getAssignmentUserFullName(record)}-${getAssignmentDepartmentName(record)}-${getAssignmentSkillName(record)}`
              )
            }
            loading={loading}
            pagination={false}
            bordered
            scroll={{ x: "max-content" }}
            tableLayout="auto"
          />

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 p-4">
            <div className="text-sm text-slate-500">
              {filteredAssignments.length > 0 ? (
                <>
                  <i>{t("total")}</i>: <b>{filteredAssignments.length}</b>
                </>
              ) : null}
            </div>
            <Pagination
              current={currentPage}
              pageSize={pageSize}
              total={filteredAssignments.length}
              align="end"
              showSizeChanger
              onChange={(page, size) => {
                setCurrentPage(page);
                setPageSize(size);
              }}
            />
          </div>
        </div>

        {!loading && filteredAssignments.length === 0 && (
          <div className="py-12 text-center text-gray-500">
            <Link2 className="mx-auto mb-3 size-12 text-gray-300" />
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
                editingAssignment ? "bg-amber-100" : "bg-blue-100"
              }`}
            >
              <UsersRound
                className={`size-5 ${editingAssignment ? "text-amber-600" : "text-blue-600"}`}
              />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                {editingAssignment ? t("editAssignment") : t("newAssignment")}
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">
                {editingAssignment ? t("editSubtitle") : t("newSubtitle")}
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
                editingAssignment
                  ? "bg-amber-600 hover:bg-amber-700"
                  : "bg-blue-600 hover:bg-blue-700"
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
            name="user-assignment-form"
            layout="vertical"
            autoComplete="off"
            onValuesChange={onValuesChange}
            className="space-y-4"
          >
            <Form.Item
              label={<span className="font-medium text-slate-700">{t("fullName")}</span>}
              name="user_id"
              rules={[{ required: true, message: t("requiredUser") }]}
            >
              <Select
                showSearch
                placeholder={t("userPlaceholder")}
                size="large"
                className="rounded-lg"
                options={userOptions}
                disabled={!!editingAssignment}
                filterOption={(input, option) =>
                  String(option?.searchLabel ?? "")
                    .toLowerCase()
                    .includes(input.toLowerCase())
                }
              />
            </Form.Item>

            <Form.Item
              label={<span className="font-medium text-slate-700">{t("department")}</span>}
              name="department_id"
              rules={[{ required: true, message: t("requiredDepartment") }]}
            >
              <Select
                showSearch
                placeholder={t("departmentPlaceholder")}
                size="large"
                className="rounded-lg"
                options={departmentOptions}
                filterOption={(input, option) =>
                  String(option?.label ?? "")
                    .toLowerCase()
                    .includes(input.toLowerCase())
                }
              />
            </Form.Item>

            <Form.Item
              label={<span className="font-medium text-slate-700">{t("skill")}</span>}
              name="skill_id"
              rules={[{ required: true, message: t("requiredSkill") }]}
            >
              <Select
                showSearch
                placeholder={t("skillPlaceholder")}
                size="large"
                className="rounded-lg"
                options={skillOptions}
                filterOption={(input, option) =>
                  String(option?.label ?? "")
                    .toLowerCase()
                    .includes(input.toLowerCase())
                }
              />
            </Form.Item>
          </Form>
        </div>
      </Modal>
    </>
  );
}
