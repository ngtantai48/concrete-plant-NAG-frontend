"use client";

import { Button } from "@/components/ui/button";
import lotTagApi, { analyzeLotTagFormula, type LotTag } from "@/services/lot-tag.service";
import {
  buildLotTagFormulaMessages,
  parseLotTagFormulaResponse,
} from "@/services/lot-tag-formula-llm";
import {
  DEFAULT_LOT_TAG_GROUP,
  getVehicleDayTagGroup,
  slugifyLotTagKey,
} from "@/services/vehicle-day-tag-utils";
import { Alert, Descriptions, Form, Input, Modal, Tag } from "antd";
import { ArrowLeft, Sparkles, Tags } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const MAX_AI_QUESTION_ROUNDS = 5;

interface LotTagFormValues {
  lot_tag_name: string;
  lot_tag_rule?: string;
}

// Kết quả AI đã chốt, chờ người dùng xác nhận cuối trước khi ghi DB.
interface LotTagPreview {
  name: string;
  rule: string;
  key: string;
  sortGroup: number | null;
  summary: string;
}

/**
 * Modal thêm/sửa 1 tag lốt, 2 bước:
 *  1) Xem trước: AI phân tích luật (hỏi lại nếu mơ hồ, tối đa 5 vòng) → chốt công thức xếp.
 *  2) Xác nhận: hiện preview (tên + luật + vị trí xếp) rồi người dùng mới bấm tạo/lưu.
 */
export default function LotTagFormModal({
  open,
  editingTag,
  existingTags,
  onClose,
  onSaved,
}: {
  open: boolean;
  editingTag: LotTag | null;
  existingTags: LotTag[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("WorkAssignmentPage");
  const [form] = Form.useForm<LotTagFormValues>();
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiQuestion, setAiQuestion] = useState<string | null>(null);
  const [aiAnswer, setAiAnswer] = useState("");
  const [qaHistory, setQaHistory] = useState<{ question: string; answer: string }[]>([]);
  const [preview, setPreview] = useState<LotTagPreview | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editingTag) {
      form.setFieldsValue({
        lot_tag_name: editingTag.lot_tag_name,
        lot_tag_rule: editingTag.lot_tag_rule || "",
      });
    } else {
      form.resetFields();
    }
    setAiQuestion(null);
    setAiAnswer("");
    setQaHistory([]);
    setPreview(null);
  }, [open, editingTag, form]);

  const resetAi = () => {
    setAiQuestion(null);
    setAiAnswer("");
    setQaHistory([]);
  };

  // Bước 1 — phân tích: ra câu hỏi (mơ hồ) hoặc ra preview (đã chốt).
  const handleAnalyze = async () => {
    let values: LotTagFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const name = values.lot_tag_name.trim();
    const rule = (values.lot_tag_rule || "").trim();

    let key = editingTag?.lot_tag_key ?? "";
    if (!editingTag) {
      key = slugifyLotTagKey(name);
      if (!key) {
        toast.warning(t("lotTagNameRequired"));
        return;
      }
      if (existingTags.some((tag) => tag.lot_tag_key === key)) {
        toast.warning(t("lotTagDuplicate"));
        return;
      }
    }

    // Sửa mà không đổi mô tả luật → không cần AI, giữ nguyên vị trí.
    const ruleChanged = !editingTag || (editingTag.lot_tag_rule || "").trim() !== rule;
    if (!ruleChanged) {
      setPreview({
        name,
        rule,
        key,
        sortGroup: editingTag?.sort_group ?? null,
        summary: t("lotTagPreviewUnchanged"),
      });
      return;
    }

    setAnalyzing(true);
    try {
      const pendingQa =
        aiQuestion && aiAnswer.trim()
          ? [...qaHistory, { question: aiQuestion, answer: aiAnswer.trim() }]
          : qaHistory;

      let formula: ReturnType<typeof parseLotTagFormulaResponse> = null;
      try {
        const content = await analyzeLotTagFormula(
          buildLotTagFormulaMessages({
            name,
            rule,
            existingTags: existingTags
              .filter((tag) => tag.lot_tag_id !== editingTag?.lot_tag_id)
              .map((tag) => ({
                name: tag.lot_tag_name,
                rule: tag.lot_tag_rule || "",
                sort_group: tag.sort_group ?? getVehicleDayTagGroup(tag.lot_tag_key),
              })),
            qaHistory: pendingQa,
          })
        );
        formula = parseLotTagFormulaResponse(content);
      } catch (error) {
        console.error("[LotTagFormModal] AI formula error:", error);
      }

      if (formula?.status === "question") {
        if (pendingQa.length >= MAX_AI_QUESTION_ROUNDS) {
          toast.warning(t("lotTagFormulaTooVague"));
          return;
        }
        setQaHistory(pendingQa);
        setAiQuestion(formula.question);
        setAiAnswer("");
        return;
      }

      if (formula?.status === "ok") {
        resetAi();
        setPreview({ name, rule, key, sortGroup: formula.sort_group, summary: formula.summary });
        return;
      }

      // AI không phản hồi / không đọc được → KHÔNG tự gán nhóm sai, báo lỗi để thử lại.
      toast.error(t("lotTagFormulaUnavailable"));
    } finally {
      setAnalyzing(false);
    }
  };

  // Bước 2 — xác nhận: ghi DB đúng preview đã duyệt.
  const handleConfirm = async () => {
    if (!preview) return;
    setSaving(true);
    try {
      if (editingTag) {
        await lotTagApi.update(editingTag.lot_tag_id, {
          lot_tag_name: preview.name,
          lot_tag_rule: preview.rule,
          ...(preview.sortGroup != null ? { sort_group: preview.sortGroup } : {}),
        });
      } else {
        const maxOrder = existingTags.reduce(
          (max, tag) => Math.max(max, tag.display_order ?? 0),
          0
        );
        await lotTagApi.create({
          lot_tag_key: preview.key,
          lot_tag_name: preview.name,
          lot_tag_rule: preview.rule,
          sort_group: preview.sortGroup ?? DEFAULT_LOT_TAG_GROUP,
          display_order: maxOrder + 1,
        });
      }
      toast.success(t("lotTagSaved"));
      onSaved();
      onClose();
    } catch (error) {
      const msg =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (error as Error)?.message ||
        t("lotTagSaveFailed");
      toast.error(t("lotTagSaveFailed"), { description: msg });
    } finally {
      setSaving(false);
    }
  };

  const title = preview
    ? editingTag
      ? t("lotTagPreviewTitleUpdate")
      : t("lotTagPreviewTitleCreate")
    : editingTag
      ? t("lotTagEditTitle")
      : t("lotTagAddTitle");

  const analyzeLabel = aiQuestion ? t("lotTagAnswerSend") : t("lotTagAnalyzeButton");
  const confirmLabel = editingTag ? t("lotTagConfirmUpdate") : t("lotTagConfirmCreate");

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={
        <div className="flex items-center gap-2">
          <Tags className="size-5 text-blue-600" />
          {title}
        </div>
      }
      width={560}
      destroyOnClose
      footer={
        preview ? (
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setPreview(null)}
              disabled={saving}
              className="min-w-[100px] gap-1"
            >
              <ArrowLeft className="size-4" />
              {t("lotTagBackEdit")}
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={saving}
              className="min-w-[140px] bg-blue-600 text-white hover:bg-blue-700"
            >
              {confirmLabel}
            </Button>
          </div>
        ) : (
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={analyzing}
              className="min-w-[100px]"
            >
              {t("lotCaptureCancel")}
            </Button>
            <Button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="min-w-[140px] gap-1 bg-blue-600 text-white hover:bg-blue-700"
            >
              <Sparkles className="size-4" />
              {analyzing ? t("lotTagAnalyzing") : analyzeLabel}
            </Button>
          </div>
        )
      }
    >
      {preview ? (
        <div className="space-y-3 pt-2">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {t("lotTagPreviewIntro")}
          </div>
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label={t("lotTagColName")}>
              <Tag color="blue">{preview.name}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t("lotTagColRule")}>
              {preview.rule || <span className="text-slate-400 italic">{t("lotTagNoRule")}</span>}
            </Descriptions.Item>
            <Descriptions.Item label={t("lotTagPreviewPosition")}>
              <span className="text-slate-800">{preview.summary}</span>
            </Descriptions.Item>
          </Descriptions>
        </div>
      ) : (
        <Form form={form} layout="vertical" autoComplete="off" className="pt-2">
          <Form.Item
            name="lot_tag_name"
            label={t("lotTagColName")}
            rules={[
              { required: true, message: t("lotTagNameRequired") },
              {
                validator: (_, value?: string) =>
                  !value || value.trim()
                    ? Promise.resolve()
                    : Promise.reject(t("lotTagNameRequired")),
              },
            ]}
          >
            <Input placeholder={t("lotTagNamePlaceholder")} />
          </Form.Item>

          <Form.Item name="lot_tag_rule" label={t("lotTagColRule")}>
            <Input.TextArea rows={3} maxLength={2000} placeholder={t("lotTagRulePlaceholder")} />
          </Form.Item>

          {aiQuestion && (
            <Alert
              type="info"
              showIcon
              className="mb-2"
              message={aiQuestion}
              description={
                <Input
                  value={aiAnswer}
                  onChange={(event) => setAiAnswer(event.target.value)}
                  placeholder={t("lotTagAnswerPlaceholder")}
                  className="mt-1"
                  onPressEnter={handleAnalyze}
                />
              }
            />
          )}
        </Form>
      )}
    </Modal>
  );
}
