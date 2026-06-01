"use client";

import { Button } from "@/components/ui/button";
import { PERMISSIONS } from "@/constants/permissions";
import { SIDEBAR } from "@/constants/route";
import { useNavigationStore } from "@/hooks/use-navigation-store";
import { usePermissions } from "@/hooks/use-permissions";
import { departmentApi } from "@/services/department.service";
import { skillApi } from "@/services/skill.service";
import { userAssignmentApi } from "@/services/user-assignment.service";
import { userApi } from "@/services/user.service";
import type { Department, DepartmentPayload } from "@/types/department";
import type { Skill } from "@/types/skill";
import type { UserAssignment, UserAssignmentPayload } from "@/types/user-assignment";
import type { User } from "@/types/user";
import {
  Form,
  Input,
  Modal,
  Pagination,
  Popconfirm,
  Popover,
  Select,
  Space,
  Table,
  Tooltip,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  PenSquare,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

interface DepartmentFormValues {
  department_name: string;
  department_description?: string | null;
  department_root?: number | null;
  manager_id?: number | null;
  user_ids?: number[];
}

type DepartmentTreeNode = Department & {
  children?: DepartmentTreeNode[];
  treeIndex?: number;
  treeLevel?: number;
};

const normalizeText = (value?: string | null) => value?.toLowerCase().trim() || "";
const getDepartmentRoot = (department: Department) => Number(department.department_root || 0);

const buildDepartmentTree = (items: Department[]): DepartmentTreeNode[] => {
  const nodeMap = new Map<number, DepartmentTreeNode>();
  const roots: DepartmentTreeNode[] = [];

  items.forEach((department) => {
    nodeMap.set(department.department_id, { ...department });
  });

  items.forEach((department) => {
    const node = nodeMap.get(department.department_id);
    if (!node) return;

    const parentId = getDepartmentRoot(department);
    const parent = parentId > 0 ? nodeMap.get(parentId) : undefined;

    if (parent && parent.department_id !== node.department_id) {
      parent.children = [...(parent.children || []), node];
    } else {
      roots.push(node);
    }
  });

  let index = 0;

  const assignTreeMeta = (nodes: DepartmentTreeNode[], level: number): DepartmentTreeNode[] =>
    nodes.map((node) => {
      index += 1;
      const children = node.children?.length ? assignTreeMeta(node.children, level + 1) : undefined;

      return {
        ...node,
        children,
        treeIndex: index,
        treeLevel: level,
      };
    });

  return assignTreeMeta(roots, 0);
};

const getExpandableDepartmentKeys = (items: DepartmentTreeNode[]) => {
  const keys: number[] = [];

  const walk = (nodes: DepartmentTreeNode[]) => {
    nodes.forEach((node) => {
      if (node.children?.length) {
        keys.push(node.department_id);
        walk(node.children);
      }
    });
  };

  walk(items);
  return keys;
};

const getDepartmentManager = (department: Department) => {
  if (department.manager) return department.manager;
  if (department.manager_user) return department.manager_user;
  return Array.isArray(department.users) ? null : department.users || null;
};

const getUserDisplayName = (user: User) => {
  const name = user.user_full_name || user.username;
  return user.user_short_name ? `${name} (${user.user_short_name})` : name;
};

const getUserIdentityKey = (fullName?: string | null, shortName?: string | null) =>
  `${normalizeText(fullName)}::${normalizeText(shortName)}`;

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

export default function TableDepartments() {
  const t = useTranslations("DepartmentPage");
  const tCommon = useTranslations("Common");
  const { hasActionAccess } = usePermissions();
  const { setDirty } = useNavigationStore();

  const [form] = Form.useForm<DepartmentFormValues>();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [assignments, setAssignments] = useState<UserAssignment[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshDisabled, setRefreshDisabled] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [searchText, setSearchText] = useState("");
  const [expandedDepartmentKeys, setExpandedDepartmentKeys] = useState<number[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const canCreate = hasActionAccess(SIDEBAR.DEPARTMENTS, PERMISSIONS.DEPARTMENTS.CREATE);
  const canUpdate = hasActionAccess(SIDEBAR.DEPARTMENTS, PERMISSIONS.DEPARTMENTS.UPDATE);
  const canAssignUsers = hasActionAccess(SIDEBAR.DEPARTMENTS, PERMISSIONS.DEPARTMENTS.ASSIGN_USERS);
  const canDelete = hasActionAccess(SIDEBAR.DEPARTMENTS, PERMISSIONS.DEPARTMENTS.DELETE);

  const fetchDepartments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await departmentApi.list({ limit: 1000 });
      setDepartments(res.data.filter((department) => !department.delete_flag));
    } catch (error) {
      const message =
        (error as any)?.response?.data?.message || (error as Error)?.message || t("loadFailed");
      toast.error(t("loadFailed"), { description: message });
    } finally {
      setLoading(false);
    }
  }, [t]);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await userApi.list({ limit: 1000 });
      setUsers(res.data.filter((user) => !user.delete_flag));
    } catch {
      setUsers([]);
    }
  }, []);

  const fetchAssignments = useCallback(async () => {
    try {
      const res = await userAssignmentApi.list({ limit: 1000 });
      setAssignments(res.data.filter((assignment) => !assignment.delete_flag));
    } catch {
      setAssignments([]);
    }
  }, []);

  const fetchSkills = useCallback(async () => {
    try {
      const res = await skillApi.list({ limit: 1000 });
      setSkills(res.data.filter((skill) => !skill.delete_flag));
    } catch {
      setSkills([]);
    }
  }, []);

  useEffect(() => {
    fetchDepartments();
    fetchUsers();
    fetchAssignments();
    fetchSkills();
  }, [fetchAssignments, fetchDepartments, fetchSkills, fetchUsers]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchText]);

  const userMap = useMemo(() => {
    return new Map(users.map((user) => [user.user_id, user]));
  }, [users]);

  const departmentMap = useMemo(() => {
    return new Map(departments.map((department) => [department.department_id, department]));
  }, [departments]);

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
      map.set(normalizeText(department.department_name), department.department_id);
    });

    return map;
  }, [departments]);

  const skillIdByName = useMemo(() => {
    const map = new Map<string, number>();

    skills.forEach((skill) => {
      map.set(normalizeText(skill.skill_name), skill.skill_id);
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

      return departmentIdByName.get(normalizeText(getAssignmentDepartmentName(assignment))) || 0;
    },
    [departmentIdByName]
  );

  const resolveAssignmentSkillId = useCallback(
    (assignment: UserAssignment) => {
      const directSkillId = getAssignmentSkillId(assignment);
      if (directSkillId) return directSkillId;

      return skillIdByName.get(normalizeText(getAssignmentSkillName(assignment))) || 0;
    },
    [skillIdByName]
  );

  const assignmentByUserId = useMemo(() => {
    const map = new Map<number, UserAssignment>();

    assignments.forEach((assignment) => {
      const userId = resolveAssignmentUserId(assignment);
      if (userId) map.set(userId, assignment);
    });

    return map;
  }, [assignments, resolveAssignmentUserId]);

  const getLinkedDepartmentName = useCallback(
    (user: User) => {
      const assignment = assignmentByUserId.get(user.user_id);
      if (!assignment) return "";

      const departmentId = resolveAssignmentDepartmentId(assignment);
      return (
        departmentMap.get(departmentId)?.department_name || getAssignmentDepartmentName(assignment)
      );
    },
    [assignmentByUserId, departmentMap, resolveAssignmentDepartmentId]
  );

  const excludedParentIds = useMemo(() => {
    if (!editingDepartment) return new Set<number>();

    const excluded = new Set<number>([editingDepartment.department_id]);
    let changed = true;

    while (changed) {
      changed = false;
      departments.forEach((department) => {
        const parentId = getDepartmentRoot(department);
        if (parentId > 0 && excluded.has(parentId) && !excluded.has(department.department_id)) {
          excluded.add(department.department_id);
          changed = true;
        }
      });
    }

    return excluded;
  }, [departments, editingDepartment]);

  const managerOptions = useMemo(
    () =>
      users.map((user) => ({
        value: user.user_id,
        label: getUserDisplayName(user),
      })),
    [users]
  );

  const parentDepartmentOptions = useMemo(
    () => [
      {
        value: 0,
        label: t("rootDepartment"),
      },
      ...departments
        .filter((department) => !excludedParentIds.has(department.department_id))
        .map((department) => ({
          value: department.department_id,
          label: department.department_name,
        })),
    ],
    [departments, excludedParentIds, t]
  );

  const userOptions = useMemo(
    () =>
      users.map((user) => {
        const assignment = assignmentByUserId.get(user.user_id);
        const departmentName = getLinkedDepartmentName(user);

        return {
          value: user.user_id,
          label: getUserDisplayName(user),
          disabled: !assignment,
          searchLabel: [
            getUserDisplayName(user),
            user.username,
            user.user_email,
            user.user_phone_number,
            departmentName,
            assignment ? getAssignmentSkillName(assignment) : "",
          ]
            .filter(Boolean)
            .join(" "),
        };
      }),
    [assignmentByUserId, getLinkedDepartmentName, users]
  );

  const selectedUserIds = Form.useWatch("user_ids", form) || [];
  const selectedUsers = useMemo(
    () =>
      selectedUserIds
        .map((userId) => userMap.get(userId))
        .filter((user): user is User => Boolean(user)),
    [selectedUserIds, userMap]
  );

  const getManagerName = useCallback(
    (department: Department) => {
      const manager = getDepartmentManager(department);
      if (manager?.user_full_name) return manager.user_full_name;
      if (department.manager_id) {
        return userMap.get(department.manager_id)?.user_full_name || t("unknownManager");
      }
      return t("noManager");
    },
    [t, userMap]
  );

  const getParentDepartmentName = useCallback(
    (department: Department) => {
      const parentId = getDepartmentRoot(department);
      if (parentId === 0) return t("rootDepartment");
      return departmentMap.get(parentId)?.department_name || t("parentNotFound");
    },
    [departmentMap, t]
  );

  const getAssignedUsers = useCallback(
    (department: Department) => {
      const relationUsers = [
        ...(Array.isArray(department.users) ? department.users : []),
        ...(department.department_users || []),
      ];
      const uniqueUsers = new Map<number, User>();

      relationUsers.forEach((user) => {
        if (user?.user_id) uniqueUsers.set(user.user_id, user);
      });

      assignments.forEach((assignment) => {
        if (resolveAssignmentDepartmentId(assignment) !== department.department_id) return;

        const user = userMap.get(resolveAssignmentUserId(assignment));
        if (user?.user_id) uniqueUsers.set(user.user_id, user);
      });

      return Array.from(uniqueUsers.values());
    },
    [assignments, resolveAssignmentDepartmentId, resolveAssignmentUserId, userMap]
  );

  const filteredDepartments = useMemo(() => {
    const keyword = normalizeText(searchText);
    if (!keyword) return departments;

    const visibleDepartmentIds = new Set<number>();

    const addAncestors = (department: Department) => {
      let parentId = getDepartmentRoot(department);

      while (parentId > 0) {
        const parent = departmentMap.get(parentId);
        if (!parent || visibleDepartmentIds.has(parent.department_id)) return;

        visibleDepartmentIds.add(parent.department_id);
        parentId = getDepartmentRoot(parent);
      }
    };

    const addDescendants = (departmentId: number) => {
      departments.forEach((department) => {
        if (
          getDepartmentRoot(department) === departmentId &&
          !visibleDepartmentIds.has(department.department_id)
        ) {
          visibleDepartmentIds.add(department.department_id);
          addDescendants(department.department_id);
        }
      });
    };

    departments.forEach((department) => {
      const managerName = getManagerName(department);
      const parentName = getParentDepartmentName(department);
      const isMatched =
        normalizeText(department.department_name).includes(keyword) ||
        normalizeText(department.department_description).includes(keyword) ||
        normalizeText(managerName).includes(keyword) ||
        normalizeText(parentName).includes(keyword);

      if (!isMatched) return;

      visibleDepartmentIds.add(department.department_id);
      addAncestors(department);
      addDescendants(department.department_id);
    });

    return departments.filter((department) => visibleDepartmentIds.has(department.department_id));
  }, [departmentMap, departments, getManagerName, getParentDepartmentName, searchText]);

  const departmentTree = useMemo(
    () => buildDepartmentTree(filteredDepartments),
    [filteredDepartments]
  );

  useEffect(() => {
    setExpandedDepartmentKeys(getExpandableDepartmentKeys(departmentTree));
  }, [departmentTree]);

  const pagedDepartments = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return departmentTree.slice(start, start + pageSize);
  }, [currentPage, departmentTree, pageSize]);

  const handleRefresh = () => {
    if (refreshDisabled > 0) return;

    fetchDepartments();
    fetchUsers();
    fetchAssignments();
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
    setEditingDepartment(null);
    form.resetFields();
    form.setFieldsValue({ department_root: 0, user_ids: [] });
    setModalOpen(true);
  };

  const openEditModal = (department: Department) => {
    setEditingDepartment(department);
    form.setFieldsValue({
      department_name: department.department_name,
      department_description: department.department_description || "",
      department_root: getDepartmentRoot(department),
      manager_id: department.manager_id || undefined,
      user_ids: getAssignedUsers(department).map((user) => user.user_id),
    });
    setModalOpen(true);
  };

  const handleCancel = () => {
    setModalOpen(false);
    form.resetFields();
    setDirty(false);
  };

  const toPayload = (values: DepartmentFormValues): DepartmentPayload => ({
    department_name: values.department_name.trim(),
    department_description: values.department_description?.trim() || null,
    department_root: Number(values.department_root || 0),
    manager_id: values.manager_id || null,
  });

  const syncDepartmentUsers = async (departmentId: number, selectedUserIds: number[] = []) => {
    const nextUserIds = new Set(selectedUserIds);
    const previousUserIds = new Set(
      assignments
        .filter((assignment) => resolveAssignmentDepartmentId(assignment) === departmentId)
        .map(resolveAssignmentUserId)
        .filter(Boolean)
    );

    const usersWithoutAssignment = Array.from(nextUserIds)
      .filter((userId) => !assignmentByUserId.has(userId))
      .map((userId) => userMap.get(userId))
      .filter((user): user is User => Boolean(user));

    if (usersWithoutAssignment.length) {
      throw new Error(
        t("missingAssignmentForUsers", {
          names: usersWithoutAssignment.map(getUserDisplayName).join(", "),
        })
      );
    }

    const usersWithoutSkill = Array.from(nextUserIds)
      .filter((userId) => {
        const assignment = assignmentByUserId.get(userId);
        return assignment && !resolveAssignmentSkillId(assignment);
      })
      .map((userId) => userMap.get(userId))
      .filter((user): user is User => Boolean(user));

    if (usersWithoutSkill.length) {
      throw new Error(
        t("missingAssignmentSkillForUsers", {
          names: usersWithoutSkill.map(getUserDisplayName).join(", "),
        })
      );
    }

    const updateRequests = Array.from(nextUserIds).map((userId) => {
      const assignment = assignmentByUserId.get(userId);
      if (!assignment || resolveAssignmentDepartmentId(assignment) === departmentId) {
        return Promise.resolve();
      }

      const payload: UserAssignmentPayload = {
        user_id: userId,
        department_id: departmentId,
        skill_id: resolveAssignmentSkillId(assignment),
      };

      const assignmentId = getAssignmentRecordId(assignment);
      return assignmentId ? userAssignmentApi.updateById(assignmentId, payload) : Promise.resolve();
    });

    const deleteRequests = Array.from(previousUserIds)
      .filter((userId) => !nextUserIds.has(userId))
      .map((userId) => {
        const assignment = assignmentByUserId.get(userId);
        const assignmentId = assignment ? getAssignmentRecordId(assignment) : 0;
        return assignmentId ? userAssignmentApi.deleteById(assignmentId) : Promise.resolve();
      });

    await Promise.all([...updateRequests, ...deleteRequests]);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      let departmentId = editingDepartment?.department_id;

      if (editingDepartment) {
        if (canUpdate) {
          const savedDepartment = await departmentApi.update(
            editingDepartment.department_id,
            toPayload(values)
          );
          departmentId = savedDepartment.department_id || editingDepartment.department_id;
        }
      } else {
        const savedDepartment = await departmentApi.create(toPayload(values));
        departmentId = savedDepartment.department_id;
      }

      if (canAssignUsers && departmentId) {
        await syncDepartmentUsers(departmentId, values.user_ids || []);
      } else if (canAssignUsers) {
        toast.warning(t("assignUsersSkipped"));
      }

      const successMessage = editingDepartment
        ? canUpdate
          ? t("updateSuccess")
          : t("assignUsersSuccess")
        : t("createSuccess");
      toast.success(successMessage, { position: "top-right" });
      handleCancel();
      fetchDepartments();
      fetchUsers();
      fetchAssignments();
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

  const handleDelete = async (department: Department) => {
    try {
      await departmentApi.delete(department.department_id);
      toast.success(
        <>
          {t("departmentName")} <b>{department.department_name}</b> {t("deleteSuccess")}
        </>
      );
      fetchDepartments();
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

  const columns: ColumnsType<DepartmentTreeNode> = [
    {
      title: "#",
      key: "index",
      width: 56,
      align: "center",
      render: (_value, record) => record.treeIndex || 0,
    },
    {
      title: t("departmentName"),
      dataIndex: "department_name",
      key: "department_name",
      sorter: (a, b) => a.department_name.localeCompare(b.department_name),
      render: (value: string, record) => {
        const isChild = Number(record.treeLevel || 0) > 0;

        return (
          <div className="flex items-center gap-2">
            <span className={isChild ? "font-semibold text-slate-700" : "font-bold text-slate-900"}>
              {value}
            </span>
          </div>
        );
      },
    },
    {
      title: t("parentDepartment"),
      dataIndex: "department_root",
      key: "department_root",
      width: 220,
      render: (_value, record) => {
        const isRoot = getDepartmentRoot(record) === 0;

        return (
          <div className="flex flex-col gap-1">
            <span
              className={`w-fit rounded-md px-2 py-1 text-xs font-semibold ${
                isRoot
                  ? "border border-blue-100 bg-blue-50 text-blue-700"
                  : "border border-slate-200 bg-slate-50 text-slate-700"
              }`}
            >
              {isRoot ? t("rootDepartment") : t("childDepartment")}
            </span>
            {!isRoot ? (
              <span className="text-xs text-slate-500">{getParentDepartmentName(record)}</span>
            ) : null}
          </div>
        );
      },
    },
    {
      title: t("manager"),
      dataIndex: "manager_id",
      key: "manager_id",
      render: (_value, record) => (
        <span className="inline-flex items-center gap-2 rounded-md border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
          <UserRoundCheck className="size-3.5" />
          {getManagerName(record)}
        </span>
      ),
    },
    {
      title: t("assignedUsers"),
      key: "assigned_users",
      render: (_value, record) => {
        const assignedUsers = getAssignedUsers(record);
        if (assignedUsers.length === 0) {
          return (
            <span className="inline-flex items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-400">
              <UsersRound className="size-4" />
              {t("noAssignedUsers")}
            </span>
          );
        }

        return (
          <Popover
            placement="left"
            content={
              <div className="w-72">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-sm font-semibold text-slate-800">{t("assignedUsers")}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                    {t("peopleCount", { count: assignedUsers.length })}
                  </span>
                </div>
                <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                  {assignedUsers.map((user) => (
                    <div
                      key={user.user_id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">
                          {getUserDisplayName(user)}
                        </p>
                        <p className="truncate text-xs text-slate-500">{user.username}</p>
                      </div>
                      <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                        {user.role}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            }
          >
            <button
              type="button"
              className="group flex min-w-[280px] max-w-[420px] items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left transition-colors hover:border-blue-200 hover:bg-blue-50/40"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                <UsersRound className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-800">
                    {t("peopleCount", { count: assignedUsers.length })}
                  </span>
                  {assignedUsers.length > 5 ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                      +{assignedUsers.length - 5}
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block truncate text-xs text-slate-500">
                  {assignedUsers.slice(0, 3).map(getUserDisplayName).join(", ")}
                </span>
              </span>
            </button>
          </Popover>
        );
      },
    },
    {
      title: t("description"),
      dataIndex: "department_description",
      key: "department_description",
      render: (value: string | null) => value || <span className="text-slate-400 italic">-</span>,
    },
    ...(canUpdate || canAssignUsers || canDelete
      ? [
          {
            title: t("actions"),
            key: "actions",
            align: "center" as const,
            fixed: "right" as const,
            width: 150,
            render: (_value: unknown, record: DepartmentTreeNode) => (
              <Space size="middle">
                {(canUpdate || canAssignUsers) && (
                  <Tooltip title={canUpdate ? t("editTooltip") : t("assignUsersTooltip")}>
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
                        {t("confirmDelete")} <b>{record.department_name}</b>?
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
                  {t("addDepartment")}
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
            dataSource={pagedDepartments}
            rowKey="department_id"
            loading={loading}
            pagination={false}
            bordered
            expandable={{
              expandedRowKeys: expandedDepartmentKeys,
              expandRowByClick: true,
              indentSize: 24,
              expandIcon: ({ expanded, onExpand, record }) => {
                const hasChildren = Boolean(record.children?.length);

                if (!hasChildren) {
                  return <span className="mr-2 inline-flex size-7 shrink-0" />;
                }

                return (
                  <button
                    type="button"
                    className="mr-2 inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
                    onClick={(event) => {
                      event.stopPropagation();
                      onExpand(record, event);
                    }}
                    aria-label={expanded ? t("collapseDepartment") : t("expandDepartment")}
                  >
                    {expanded ? (
                      <ChevronDown className="size-4" />
                    ) : (
                      <ChevronRight className="size-4" />
                    )}
                  </button>
                );
              },
              onExpandedRowsChange: (keys) =>
                setExpandedDepartmentKeys(keys.map((key) => Number(key))),
            }}
            scroll={{ x: "max-content" }}
            tableLayout="auto"
          />

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 p-4">
            <div className="text-sm text-slate-500">
              {filteredDepartments.length > 0 ? (
                <>
                  <i>{t("total")}</i>: <b>{filteredDepartments.length}</b>
                </>
              ) : null}
            </div>
            <Pagination
              current={currentPage}
              pageSize={pageSize}
              total={departmentTree.length}
              align="end"
              showSizeChanger
              onChange={(page, size) => {
                setCurrentPage(page);
                setPageSize(size);
              }}
            />
          </div>
        </div>

        {!loading && filteredDepartments.length === 0 && (
          <div className="py-12 text-center text-gray-500">
            <Building2 className="mx-auto mb-3 size-12 text-gray-300" />
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
                editingDepartment ? "bg-amber-100" : "bg-blue-100"
              }`}
            >
              <UsersRound
                className={`size-5 ${editingDepartment ? "text-amber-600" : "text-blue-600"}`}
              />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                {editingDepartment ? t("editDepartment") : t("newDepartment")}
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">
                {editingDepartment ? t("editSubtitle") : t("newSubtitle")}
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
                editingDepartment
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
            name="department-form"
            layout="vertical"
            autoComplete="off"
            onValuesChange={onValuesChange}
            className="space-y-4"
          >
            <Form.Item
              label={<span className="font-medium text-slate-700">{t("departmentName")}</span>}
              name="department_name"
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
              <Input
                placeholder={t("namePlaceholder")}
                size="large"
                className="rounded-lg"
                disabled={!!editingDepartment && !canUpdate}
              />
            </Form.Item>

            <Form.Item
              label={<span className="font-medium text-slate-700">{t("parentDepartment")}</span>}
              name="department_root"
              initialValue={0}
            >
              <Select
                showSearch
                placeholder={t("parentDepartmentPlaceholder")}
                size="large"
                className="rounded-lg"
                options={parentDepartmentOptions}
                disabled={!!editingDepartment && !canUpdate}
                filterOption={(input, option) =>
                  String(option?.label ?? "")
                    .toLowerCase()
                    .includes(input.toLowerCase())
                }
              />
            </Form.Item>

            <Form.Item
              label={<span className="font-medium text-slate-700">{t("manager")}</span>}
              name="manager_id"
            >
              <Select
                allowClear
                showSearch
                placeholder={t("managerPlaceholder")}
                size="large"
                className="rounded-lg"
                options={managerOptions}
                disabled={!!editingDepartment && !canUpdate}
                filterOption={(input, option) =>
                  String(option?.label ?? "")
                    .toLowerCase()
                    .includes(input.toLowerCase())
                }
              />
            </Form.Item>

            <Form.Item
              label={<span className="font-medium text-slate-700">{t("assignedUsers")}</span>}
              name="user_ids"
            >
              <Select
                allowClear
                showSearch
                mode="multiple"
                maxTagCount="responsive"
                placeholder={t("assignedUsersPlaceholder")}
                size="large"
                className="rounded-lg"
                options={userOptions}
                disabled={!canAssignUsers}
                filterOption={(input, option) =>
                  String(option?.searchLabel ?? "")
                    .toLowerCase()
                    .includes(input.toLowerCase())
                }
                optionRender={(option) => {
                  const user = userMap.get(Number(option.value));
                  if (!user) return option.label;

                  const assignment = assignmentByUserId.get(user.user_id);
                  const departmentName = getLinkedDepartmentName(user);

                  return (
                    <div className="py-1">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-slate-800">
                          {getUserDisplayName(user)}
                        </div>
                        <div className="flex min-w-0 items-center gap-2 text-xs text-slate-500">
                          <span className="truncate">{user.username}</span>
                          {departmentName ? (
                            <span className="truncate rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                              {departmentName}
                            </span>
                          ) : null}
                          {assignment ? (
                            <span className="truncate rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-blue-600">
                              {getAssignmentSkillName(assignment)}
                            </span>
                          ) : (
                            <span className="truncate rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-600">
                              {t("missingAssignment")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
            </Form.Item>

            {selectedUsers.length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <UsersRound className="size-4 text-slate-500" />
                    {t("selectedUsers")}
                  </div>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">
                    {t("peopleCount", { count: selectedUsers.length })}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {selectedUsers.slice(0, 8).map((user) => (
                    <div
                      key={user.user_id}
                      className="flex min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-800">
                          {getUserDisplayName(user)}
                        </p>
                        <p className="truncate text-[11px] text-slate-500">{user.username}</p>
                      </div>
                    </div>
                  ))}
                  {selectedUsers.length > 8 ? (
                    <div className="flex items-center justify-center rounded-md border border-dashed border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-500">
                      +{selectedUsers.length - 8}
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            <Form.Item
              label={<span className="font-medium text-slate-700">{t("description")}</span>}
              name="department_description"
            >
              <Input.TextArea
                placeholder={t("descriptionPlaceholder")}
                rows={4}
                className="rounded-lg"
                disabled={!!editingDepartment && !canUpdate}
              />
            </Form.Item>
          </Form>
        </div>
      </Modal>
    </>
  );
}
