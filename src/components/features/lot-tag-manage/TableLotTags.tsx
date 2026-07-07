"use client";

import { Button } from "@/components/ui/button";
import { PERMISSIONS } from "@/constants/permissions";
import { SIDEBAR } from "@/constants/route";
import { usePermissions } from "@/hooks/use-permissions";
import lotTagApi, { type LotTag } from "@/services/lot-tag.service";
import { getVehicleDayTagGroup } from "@/services/vehicle-day-tag-utils";
import { Input, Pagination, Popconfirm, Space, Table, Tag, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { PenSquare, Plus, RefreshCw, Search, Tags, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getVehicleDayTagChipTone } from "@/components/features/work-arrangement/assignment/shared";
import LotTagFormModal from "./LotTagFormModal";

const normalizeText = (value?: string | null) => value?.toLowerCase().trim() || "";

// Ánh xạ tông tag → màu antd Tag (dùng chung palette với chip ở nơi khác).
const ANTD_TAG_COLOR: Record<string, string> = {
  slate: "default",
  teal: "cyan",
  amber: "gold",
  emerald: "green",
  sky: "blue",
  violet: "purple",
  indigo: "geekblue",
};

export default function TableLotTags() {
  const t = useTranslations("WorkAssignmentPage");
  const tCommon = useTranslations("Common");
  const { hasActionAccess } = usePermissions();

  const [tags, setTags] = useState<LotTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshDisabled, setRefreshDisabled] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<LotTag | null>(null);
  const [searchText, setSearchText] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const canCreate = hasActionAccess(SIDEBAR.LOT_TAGS, PERMISSIONS.LOT_TAGS.CREATE);
  const canUpdate = hasActionAccess(SIDEBAR.LOT_TAGS, PERMISSIONS.LOT_TAGS.UPDATE);
  const canDelete = hasActionAccess(SIDEBAR.LOT_TAGS, PERMISSIONS.LOT_TAGS.DELETE);

  const groupOf = useCallback(
    (tag: LotTag) => tag.sort_group ?? getVehicleDayTagGroup(tag.lot_tag_key),
    []
  );

  // Số nhóm nội bộ (10/20/…) → thứ hạng gọi lốt gọn (1, 2, 3…) theo thứ tự tăng dần.
  const rankByGroup = useMemo(() => {
    const distinct = Array.from(new Set(tags.map(groupOf))).sort((a, b) => a - b);
    const map = new Map<number, number>();
    distinct.forEach((group, index) => map.set(group, index + 1));
    return map;
  }, [tags, groupOf]);

  const fetchTags = useCallback(async () => {
    setLoading(true);
    try {
      setTags(await lotTagApi.list());
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (error as Error)?.message ||
        t("lotTagLoadFailed");
      toast.error(t("lotTagLoadFailed"), { description: message });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchText]);

  // Luôn xếp theo thứ tự gọi lốt (nhóm tăng dần), trong cùng nhóm theo tên — để gộp ô nhóm.
  const filteredTags = useMemo(() => {
    const keyword = normalizeText(searchText);
    const base = keyword
      ? tags.filter(
          (tag) =>
            normalizeText(tag.lot_tag_name).includes(keyword) ||
            normalizeText(tag.lot_tag_rule).includes(keyword)
        )
      : tags;
    return [...base].sort(
      (a, b) => groupOf(a) - groupOf(b) || a.lot_tag_name.localeCompare(b.lot_tag_name)
    );
  }, [searchText, tags, groupOf]);

  const pagedTags = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTags.slice(start, start + pageSize);
  }, [currentPage, filteredTags, pageSize]);

  // rowSpan cho cột Nhóm: dòng đầu mỗi nhóm ôm trọn số dòng cùng nhóm, dòng sau = 0 (bị gộp).
  const groupRowSpans = useMemo(() => {
    const spans: number[] = [];
    for (let i = 0; i < pagedTags.length; i++) {
      if (i > 0 && groupOf(pagedTags[i]) === groupOf(pagedTags[i - 1])) {
        spans.push(0);
        continue;
      }
      let count = 1;
      while (
        i + count < pagedTags.length &&
        groupOf(pagedTags[i + count]) === groupOf(pagedTags[i])
      ) {
        count++;
      }
      spans.push(count);
    }
    return spans;
  }, [pagedTags, groupOf]);

  const handleRefresh = () => {
    if (refreshDisabled > 0) return;
    fetchTags();
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
    setEditingTag(null);
    setModalOpen(true);
  };

  const openEditModal = (tag: LotTag) => {
    setEditingTag(tag);
    setModalOpen(true);
  };

  const handleDelete = async (tag: LotTag) => {
    try {
      await lotTagApi.delete(tag.lot_tag_id);
      toast.success(t("lotTagDeleted"));
      fetchTags();
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (error as Error)?.message ||
        t("lotTagDeleteFailed");
      toast.error(t("lotTagDeleteFailed"), { description: message });
    }
  };

  const columns: ColumnsType<LotTag> = [
    {
      title: "#",
      key: "index",
      width: 56,
      align: "center",
      render: (_value, _record, index) => (currentPage - 1) * pageSize + index + 1,
    },
    {
      title: t("lotTagColName"),
      dataIndex: "lot_tag_name",
      key: "lot_tag_name",
      render: (value: string, record) => (
        <Tag color={ANTD_TAG_COLOR[getVehicleDayTagChipTone(record.lot_tag_key)] || "default"}>
          {value}
        </Tag>
      ),
    },
    {
      title: t("lotTagColRule"),
      dataIndex: "lot_tag_rule",
      key: "lot_tag_rule",
      render: (value: string | null) =>
        value || <span className="text-slate-400 italic">{t("lotTagNoRule")}</span>,
    },
    {
      title: (
        <Tooltip title={t("lotTagGroupHint")}>
          <span>{t("lotTagColGroup")}</span>
        </Tooltip>
      ),
      key: "sort_group",
      width: 120,
      align: "center",
      onCell: (_record, index) => ({ rowSpan: groupRowSpans[index ?? 0] ?? 1 }),
      render: (_value: unknown, record: LotTag) => (
        <Tag color="blue" bordered={false} className="font-semibold">
          {t("lotTagGroupShort", { group: rankByGroup.get(groupOf(record)) ?? 1 })}
        </Tag>
      ),
    },
    ...(canUpdate || canDelete
      ? [
          {
            title: t("lotTagActions"),
            key: "actions",
            align: "center" as const,
            fixed: "right" as const,
            width: 130,
            render: (_value: unknown, record: LotTag) => (
              <Space size="middle">
                {canUpdate && (
                  <Tooltip title={t("lotTagEdit")}>
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
                    title={t("lotTagDeleteConfirm", { name: record.lot_tag_name })}
                    okText={t("lotTagDeleteOk")}
                    cancelText={t("lotCaptureCancel")}
                    placement="leftBottom"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => handleDelete(record)}
                  >
                    <Tooltip title={t("lotTagDelete")}>
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
      <div className="animate-fade-in m-10 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-slate-100 bg-slate-50/50 p-6 md:p-8">
          <div className="flex-1">
            <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
              <Tags className="size-8 text-blue-600" />
              {t("lotTagPageTitle")}
            </h1>
            <p className="mt-2 text-lg text-slate-500">{t("lotTagPageSubtitle")}</p>
          </div>

          <div className="mt-2 flex flex-wrap gap-3 sm:mt-0">
            {canCreate && (
              <Button variant="primary" onClick={openAddModal}>
                <Plus className="size-4" />
                {t("lotTagAddButton")}
              </Button>
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

        <div className="flex flex-col gap-4 px-6 py-6 sm:flex-row sm:items-center md:px-8">
          <Input
            allowClear
            className="max-w-sm"
            prefix={<Search className="mr-1 size-4 text-slate-400" />}
            placeholder={t("lotTagSearchPlaceholder")}
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </div>

        <div className="animate-slide-up overflow-hidden border-t border-slate-200">
          <Table
            columns={columns}
            dataSource={pagedTags}
            rowKey="lot_tag_id"
            loading={loading}
            pagination={false}
            bordered
            scroll={{ x: "max-content" }}
            tableLayout="auto"
          />

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 p-4">
            <div className="text-sm text-slate-500">
              {filteredTags.length > 0 ? (
                <>
                  <i>{t("lotTagTotal")}</i>: <b>{filteredTags.length}</b>
                </>
              ) : null}
            </div>
            <Pagination
              current={currentPage}
              pageSize={pageSize}
              total={filteredTags.length}
              align="end"
              showSizeChanger
              onChange={(page, size) => {
                setCurrentPage(page);
                setPageSize(size);
              }}
            />
          </div>
        </div>

        {!loading && filteredTags.length === 0 && (
          <div className="py-12 text-center text-gray-500">
            <Tags className="mx-auto mb-3 size-12 text-gray-300" />
            <p className="text-lg">{t("lotTagEmpty")}</p>
            <p className="mt-2 text-sm">{t("lotTagEmptyHint")}</p>
          </div>
        )}
      </div>

      <LotTagFormModal
        open={modalOpen}
        editingTag={editingTag}
        existingTags={tags}
        onClose={() => setModalOpen(false)}
        onSaved={fetchTags}
      />
    </>
  );
}
