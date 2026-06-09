"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAppSelector } from "@/hooks/use-app-selector";
import { multiService } from "@/services/multi.service";
import dayjs from "dayjs";
import "dayjs/locale/vi";
import { MessageCircle, MoreHorizontal, Pen, RefreshCw, Send, SendHorizontal, Trash2, User } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

dayjs.locale("vi");

export interface VehicleMaintenanceComment {
  id: string;
  user_id: number;
  user_name: string;
  content: string;
  created_at: string;
  updated_at?: string;
  parent_id?: string | null;
}

interface CommentNode extends VehicleMaintenanceComment {
  children: CommentNode[];
}

function createCommentId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getInitials(name?: string | null) {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[parts.length - 1]?.[0] || "U").toUpperCase();
}

function formatRelativeTime(date: string) {
  const now = dayjs();
  const target = dayjs(date);
  const diffMinutes = now.diff(target, "minute");
  if (diffMinutes < 60) return `${Math.max(0, diffMinutes)} phút`;

  const diffHours = now.diff(target, "hour");
  if (diffHours < 24) return `${diffHours} giờ`;

  return `${now.diff(target, "day")} ngày`;
}

function formatDetailedTime(date: string) {
  return dayjs(date).format("dddd, D MMMM, YYYY [lúc] HH:mm");
}

function buildCommentTree(comments: VehicleMaintenanceComment[]) {
  const map = new Map<string, CommentNode>();
  const roots: CommentNode[] = [];

  comments.forEach((comment) => {
    map.set(comment.id, { ...comment, children: [] });
  });

  comments.forEach((comment) => {
    const node = map.get(comment.id);
    if (!node) return;

    if (comment.parent_id && map.has(comment.parent_id)) {
      map.get(comment.parent_id)?.children.push(node);
      return;
    }

    roots.push(node);
  });

  const sortChildren = (nodes: CommentNode[]) => {
    nodes.sort((left, right) => dayjs(left.created_at).diff(dayjs(right.created_at)));
    nodes.forEach((node) => sortChildren(node.children));
  };

  roots.sort((left, right) => dayjs(right.created_at).diff(dayjs(left.created_at)));
  roots.forEach((root) => sortChildren(root.children));

  return roots;
}

export default function VehicleMaintenanceDiscussion({ maintenanceId }: { maintenanceId: number }) {
  const currentUser = useAppSelector((state) => state.auth.user);
  const [comments, setComments] = useState<VehicleMaintenanceComment[]>([]);
  const [discussMultiId, setDiscussMultiId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [deleteTarget, setDeleteTarget] = useState<VehicleMaintenanceComment | null>(null);
  const replyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [quickReplyValues, setQuickReplyValues] = useState<Record<string, string>>({});
  const quickReplyRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const fetchComments = useCallback(async () => {
    if (!Number.isFinite(maintenanceId) || maintenanceId <= 0) return;

    setLoading(true);
    try {
      const result = await multiService.getVehicleMaintenanceDiscussComments<VehicleMaintenanceComment>(
        maintenanceId
      );
      setComments(result.comments);
      setDiscussMultiId(result.multiId);
    } catch (error) {
      console.error(error);
      setComments([]);
      setDiscussMultiId(null);
      toast.error("Không tải được thảo luận chung");
    } finally {
      setLoading(false);
    }
  }, [maintenanceId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  useEffect(() => {
    if (!replyingId || !replyTextareaRef.current) return;
    replyTextareaRef.current.focus();
    const length = replyTextareaRef.current.value.length;
    replyTextareaRef.current.setSelectionRange(length, length);
  }, [replyingId]);

  const commentTree = useMemo(() => buildCommentTree(comments), [comments]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const ensureExpanded = (id: string) => {
    setExpandedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const saveComments = async (nextComments: VehicleMaintenanceComment[]) => {
    const returnedId = await multiService.saveVehicleMaintenanceDiscussComments(
      maintenanceId,
      nextComments,
      discussMultiId
    );
    if (!discussMultiId && returnedId) setDiscussMultiId(returnedId);
    setComments(nextComments);
  };

  const handleSubmit = async (text: string, parentId: string | null = null) => {
    if (!currentUser) {
      toast.error("Bạn chưa đăng nhập");
      return;
    }

    const trimmed = text.trim();
    if (!trimmed) return;

    setSubmitting(true);
    try {
      const newComment: VehicleMaintenanceComment = {
        id: createCommentId(),
        user_id: currentUser.id,
        user_name: currentUser.fullName || "User",
        content: trimmed,
        created_at: dayjs().toISOString(),
        parent_id: parentId,
      };

      await saveComments([...comments, newComment]);

      if (parentId) {
        setReplyingId(null);
        setReplyContent("");
        ensureExpanded(parentId);
      } else {
        setContent("");
      }

      toast.success("Đã gửi bình luận");
    } catch (error) {
      console.error(error);
      toast.error("Gửi bình luận thất bại");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (comment: VehicleMaintenanceComment) => {
    setReplyingId(null);
    setEditingId(comment.id);
    setEditContent(comment.content);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const trimmed = editContent.trim();
    if (!trimmed) {
      toast.warning("Nội dung không được để trống");
      return;
    }

    setSubmitting(true);
    try {
      await saveComments(
        comments.map((comment) =>
          comment.id === editingId
            ? { ...comment, content: trimmed, updated_at: dayjs().toISOString() }
            : comment
        )
      );
      setEditingId(null);
      setEditContent("");
      toast.success("Đã cập nhật bình luận");
    } catch (error) {
      console.error(error);
      toast.error("Cập nhật bình luận thất bại");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    const idsToDelete = new Set([commentId]);
    const collectChildren = (parentId: string) => {
      comments.forEach((comment) => {
        if (comment.parent_id !== parentId) return;
        idsToDelete.add(comment.id);
        collectChildren(comment.id);
      });
    };
    collectChildren(commentId);

    setSubmitting(true);
    try {
      await saveComments(comments.filter((comment) => !idsToDelete.has(comment.id)));
      toast.success("Đã xóa bình luận");
    } catch (error) {
      console.error(error);
      toast.error("Xóa bình luận thất bại");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await handleDelete(deleteTarget.id);
    setDeleteTarget(null);
  };

  const handleReplyClick = (comment: VehicleMaintenanceComment, depth: number) => {
    setEditingId(null);
    const hasChildren = comments.some((item) => item.parent_id === comment.id);
    const tag = `**${comment.user_name}** `;

    if (hasChildren || depth === 2) {
      let targetParentId = comment.id;
      if (depth === 2 && comment.parent_id) {
        targetParentId = comment.parent_id;
      }

      if (!expandedIds.has(targetParentId)) {
        toggleExpand(targetParentId);
      }

      window.setTimeout(() => {
        const input = quickReplyRefs.current[targetParentId];
        if (!input) return;

        input.focus();
        setQuickReplyValues((prev) => {
          const currentValue = prev[targetParentId] || "";
          if (currentValue.includes(tag)) return prev;
          return { ...prev, [targetParentId]: tag + currentValue };
        });

        const length = input.value.length;
        input.setSelectionRange(length, length);
      }, 100);
      return;
    }

    setReplyingId(comment.id);
    setReplyContent(tag);
    ensureExpanded(comment.id);
  };

  const handleQuickSubmit = async (parentId: string) => {
    const text = quickReplyValues[parentId];
    if (!text?.trim()) return;

    await handleSubmit(text, parentId);
    setQuickReplyValues((prev) => ({ ...prev, [parentId]: "" }));
  };

  const cancelReply = () => {
    setReplyingId(null);
    setReplyContent("");
  };

  const renderCommentNode = (
    node: CommentNode,
    depth = 0,
    isLast = false,
    isFirst = false
  ): React.ReactNode => {
    const isOwner = currentUser?.id === node.user_id;
    const isEditing = editingId === node.id;
    const isReplying = replyingId === node.id;
    const isRoot = depth === 0;
    const isExpanded = expandedIds.has(node.id);
    const childCount = node.children.length;
    const lineOffsetX = "20px";
    const lineTop = isFirst ? "-45px" : "0px";
    const curveHeight = "30px";

    return (
      <div key={node.id} className="relative">
        {!isRoot ? (
          !isLast ? (
            <>
              <div
                className="pointer-events-none absolute border-l-2 border-slate-200"
                style={{ left: `-${lineOffsetX}`, top: lineTop, bottom: 0 }}
              />
              <div
                className="pointer-events-none absolute rounded-bl-xl border-b-2 border-l-2 border-slate-200"
                style={{
                  left: `-${lineOffsetX}`,
                  top: lineTop,
                  width: lineOffsetX,
                  height: `calc(${curveHeight} - ${lineTop})`,
                }}
              />
            </>
          ) : (
            <div
              className="pointer-events-none absolute rounded-bl-xl border-b-2 border-l-2 border-slate-200"
              style={{
                left: `-${lineOffsetX}`,
                top: lineTop,
                width: lineOffsetX,
                height: `calc(${curveHeight} - ${lineTop})`,
              }}
            />
          )
        ) : null}

        <div
          className={`group relative flex gap-3 rounded-lg border border-transparent transition-colors ${isRoot ? "mb-4 p-0" : "mb-0 p-2 pb-3"
            }`}
        >
          {(childCount > 0 || isReplying) ? (
            <div
              className="pointer-events-none absolute border-l-2 border-slate-200"
              style={{
                left: isRoot ? "20px" : "24px",
                top: "50px",
                bottom: isRoot ? "-16px" : "0px",
                width: "2px",
                marginLeft: "-1px",
                zIndex: 0,
              }}
            />
          ) : null}

          <Avatar className={`${isRoot ? "h-10 w-10" : "h-8 w-8"} relative mt-1`}>
            <AvatarFallback
              className={`text-[10px] font-bold text-white md:text-sm ${isOwner ? "bg-blue-500" : "bg-emerald-500"
                }`}
            >
              {getInitials(node.user_name)}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2 group/bubble">
              <div className={`relative rounded-2xl ${isEditing ? "w-full" : "bg-slate-100 px-3 py-2"}`}>
                {!isEditing ? (
                  <>
                    <span className="mb-0.5 block cursor-pointer text-[13px] font-bold leading-tight text-slate-900 hover:underline">
                      {node.user_name}
                    </span>
                    <div className="break-words text-[14px] leading-snug text-slate-800">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          strong: ({ children }) => (
                            <strong className="cursor-pointer font-bold text-slate-900 hover:underline">
                              {children}
                            </strong>
                          ),
                          p: ({ children }) => (
                            <p className="mb-0 whitespace-pre-wrap leading-relaxed">{children}</p>
                          ),
                        }}
                      >
                        {node.content}
                      </ReactMarkdown>
                    </div>
                  </>
                ) : (
                  <div className="mt-1 w-full">
                    <Textarea
                      value={editContent}
                      onChange={(event) => setEditContent(event.target.value)}
                      className="mb-2 min-h-[64px] bg-white"
                      disabled={submitting}
                    />
                    <div className="flex justify-start gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>
                        Hủy
                      </Button>
                      <Button variant="primary" size="sm" onClick={handleSaveEdit} disabled={submitting}>
                        Lưu
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {isOwner && !isEditing ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="iconSquare"
                      className="mt-1 h-8 w-8 rounded-full opacity-0 transition-opacity group-hover/bubble:opacity-100 data-[state=open]:opacity-100"
                    >
                      <MoreHorizontal size={16} className="text-slate-500" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-40 p-1" align="start" side="bottom">
                    <div className="flex flex-col">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 justify-start px-2 font-normal"
                        onClick={() => handleEdit(node)}
                      >
                        <Pen size={14} className="mr-2" /> Chỉnh sửa
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 justify-start px-2 font-normal text-red-600 hover:bg-red-50 hover:text-red-700"
                        onClick={() => setDeleteTarget(node)}
                      >
                        <Trash2 size={14} className="mr-2" /> Xóa
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              ) : null}
            </div>

            {!isEditing ? (
              <div className="ml-2 mt-0.5 flex select-none items-center gap-3 text-[12px] font-medium text-slate-500">
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-pointer hover:underline">
                        {formatRelativeTime(node.created_at)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="rounded-md p-2 text-xs">
                      {formatDetailedTime(node.created_at)}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <span
                  className="cursor-pointer font-bold hover:text-blue-600 hover:underline"
                  onClick={() => handleReplyClick(node, depth)}
                >
                  Trả lời
                </span>
                {node.updated_at ? <span className="text-[12px] italic text-slate-400">(đã chỉnh sửa)</span> : null}
              </div>
            ) : null}
          </div>
        </div>

        {/* Children & Reply Input Container */}
        {(childCount > 0 || isReplying) ? (
          <div className={`${isRoot ? "ml-10 mb-4" : "ml-11"} relative pl-0 pb-0`}>
            {/* 1. If Collapsed and Has Children: Show View Button */}
            {!isExpanded && childCount > 0 ? (
              <div className="relative flex items-center pb-2 pt-0">
                <div
                  className="pointer-events-none absolute rounded-bl-xl border-b-2 border-l-2 border-slate-200"
                  style={{
                    left: `-${lineOffsetX}`,
                    top: "-1px",
                    width: lineOffsetX,
                    height: "14px",
                  }}
                />
                <button
                  type="button"
                  className="flex h-6 cursor-pointer items-center gap-2 text-sm font-bold text-slate-600 hover:underline"
                  style={{ marginLeft: "8px" }}
                  onClick={() => toggleExpand(node.id)}
                >
                  {childCount === 1 ? "Xem 1 phản hồi" : `Xem tất cả ${childCount} phản hồi`}
                </button>
              </div>
            ) : null}

            {/* 2. If Expanded: Loop */}
            {isExpanded
              ? node.children.map((child, index) => {
                const hasPersistentBox = depth < 2 && childCount > 0;
                const isLastChild = index === node.children.length - 1 && !isReplying && !hasPersistentBox;
                return renderCommentNode(child, depth + 1, isLastChild, index === 0);
              })
              : null}

            {/* 3. Reply Input (Temporary from "Trả lời" link) */}
            {isReplying ? (
              <div className="relative flex gap-2 pb-2 pl-1 pt-2 animate-in fade-in slide-in-from-top-1">
                <div
                  className="pointer-events-none absolute rounded-bl-xl border-b-2 border-l-2 border-slate-200"
                  style={{
                    left: `-${lineOffsetX}`,
                    top: childCount === 0 ? lineTop : "0px",
                    width: lineOffsetX,
                    height: childCount === 0 ? `calc(${curveHeight} - ${lineTop})` : curveHeight,
                  }}
                />
                <Avatar className="mt-0.5 h-8 w-8">
                  <AvatarFallback className="bg-slate-200 text-xs font-bold text-slate-600">
                    {getInitials(currentUser?.fullName || "U")}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <Textarea
                    ref={replyTextareaRef}
                    placeholder={`Trả lời dưới tên ${currentUser?.fullName || "User"}...`}
                    value={replyContent}
                    onChange={(event) => setReplyContent(event.target.value)}
                    className="mb-2 min-h-[48px] text-sm"
                    disabled={submitting}
                  />
                  <div className="flex justify-start gap-2">
                    <Button variant="outline" size="sm" onClick={cancelReply}>
                      Hủy
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleSubmit(replyContent, node.id)}
                      disabled={submitting || !replyContent.trim()}
                    >
                      Trả lời
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            {/* 4. Persistent Quick Reply (at bottom of expanded list, level 0 & 1 only, only if children exist) */}
            {isExpanded && depth < 2 && childCount > 0 ? (
              <div className="relative flex gap-2 pb-2 pl-1 pt-2">
                <div
                  className="pointer-events-none absolute rounded-bl-xl border-b-2 border-l-2 border-slate-200"
                  style={{
                    left: `-${lineOffsetX}`,
                    top: childCount === 0 ? lineTop : "0px",
                    width: lineOffsetX,
                    height: childCount === 0 ? `calc(24px - ${lineTop})` : "24px",
                  }}
                />
                <Avatar className="mt-0.5 h-7 w-7">
                  <AvatarFallback className="bg-slate-200 text-[10px] font-bold text-slate-600">
                    {getInitials(currentUser?.fullName || "U")}
                  </AvatarFallback>
                </Avatar>
                <div className="relative flex-1">
                  <Textarea
                    ref={(element) => {
                      quickReplyRefs.current[node.id] = element;
                    }}
                    placeholder={`Trả lời dưới tên ${currentUser?.fullName || "User"}...`}
                    value={quickReplyValues[node.id] || ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      setQuickReplyValues((prev) => ({ ...prev, [node.id]: value }));
                      event.target.style.height = "32px";
                      event.target.style.height = `${Math.min(event.target.scrollHeight, 150)}px`;
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" || event.shiftKey) return;
                      event.preventDefault();
                      handleQuickSubmit(node.id);
                    }}
                    className="mb-0 h-[48px] max-h-[150px] min-h-[48px] resize-none rounded-2xl border-none bg-slate-100 px-3 py-1.5 pr-12 text-[13px] placeholder:text-slate-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                    disabled={submitting}
                  />
                  {quickReplyValues[node.id]?.trim() ? (
                    <div className="absolute right-1 top-1/2 -translate-y-1/2">
                      <TooltipProvider delayDuration={300}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="iconCircle"
                              onClick={() => handleQuickSubmit(node.id)}
                              disabled={submitting}
                            >
                              <SendHorizontal className="size-4 text-blue-600" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p className="text-xs">Bình luận</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <Card className="h-full rounded-lg border border-slate-200 shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <MessageCircle className="size-5 text-blue-600" />
          Thảo luận chung
        </CardTitle>
        <CardDescription className="pl-7 text-sm text-slate-500">
          Trao đổi công khai giữa các thành viên liên quan đến phiếu bảo trì.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-5 flex gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-slate-200 font-bold text-slate-600">
              <User className="size-4" />
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-1 gap-4 flex-row">
            <Textarea
              className="min-h-[38px] resize-none pr-12"
              placeholder="Viết bình luận công khai..."
              value={content}
              onChange={(event) => setContent(event.target.value)}
              disabled={submitting}
            />
            <Button size="lg" variant="primary" onClick={() => handleSubmit(content, null)} disabled={submitting || !content.trim()}>
              <Send />
              Gửi
            </Button>
          </div>
        </div>

        <div className="max-h-[460px] space-y-4 overflow-y-auto pr-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
              <RefreshCw className="size-4 animate-spin" />
              Đang tải thảo luận...
            </div>
          ) : commentTree.length > 0 ? (
            commentTree.map((root) => renderCommentNode(root, 0, true, true))
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400">
              <MessageCircle size={42} className="mb-2 opacity-20" />
              <p>Chưa có thảo luận nào</p>
            </div>
          )}
        </div>

        <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Xóa bình luận</AlertDialogTitle>
              <AlertDialogDescription>Bạn có chắc muốn xóa bình luận này?</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={submitting}>Hủy</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 text-white hover:bg-red-700"
                disabled={submitting}
                onClick={(event) => {
                  event.preventDefault();
                  confirmDelete();
                }}
              >
                Xóa
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
