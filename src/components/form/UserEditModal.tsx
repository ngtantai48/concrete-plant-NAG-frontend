"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { userApi } from "@/services/user.service";
import type { AppDispatch } from "@/store";
import { updateUser } from "@/store/slices/userSlice";
import type { UpdateUserPayload, User, UserRole } from "@/types/user";
import { format, isValid, parse } from "date-fns";
import { Calendar as CalendarIcon, Loader2, Save, UserCog, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Controller, useForm } from "react-hook-form";
import { useDispatch } from "react-redux";
import { toast } from "sonner";
import { z } from "zod";
import { useEffect } from "react";

interface UserEditModalProps {
  open: boolean;
  user: User | null;
  onClose: () => void;
}

const joinDateSchema = z
  .string()
  .min(1, "Vui lòng chọn ngày vào làm")
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày vào làm không hợp lệ");

const editUserSchema = z.object({
  user_full_name: z.string().trim().min(1, "Vui lòng nhập họ tên"),
  user_email: z.string().trim().email("Email không hợp lệ"),
  user_phone_number: z.string().trim().min(1, "Vui lòng nhập số điện thoại").max(20, "Số điện thoại quá dài"),
  user_address: z.string().trim().optional(),
  username: z.string().trim().min(3, "Username phải có ít nhất 3 ký tự").max(100, "Username quá dài"),
  password: z.string().max(100, "Mật khẩu quá dài").optional().refine((value) => !value || value.length >= 6, "Mật khẩu phải có ít nhất 6 ký tự"),
  role: z.enum(["admin", "manager", "dispatcher", "driver", "user"]),
  user_join_date: joinDateSchema,
  user_work_shift: z.string().trim(),
});

type EditUserFormValues = z.infer<typeof editUserSchema>;

const normalizeDate = (date?: string | null) => {
  if (!date) return new Date().toISOString().slice(0, 10);
  return date.split("T")[0];
};

const parseDateValue = (value?: string) => {
  if (!value) return undefined;
  const parsed = parse(value, "yyyy-MM-dd", new Date());
  return isValid(parsed) ? parsed : undefined;
};

const normalizeRole = (role?: string): UserRole => {
  const allowedRoles: UserRole[] = ["admin", "manager", "dispatcher", "driver", "user"];
  return allowedRoles.includes(role as UserRole) ? (role as UserRole) : "user";
};

export default function UserEditModal({ open, user, onClose }: UserEditModalProps) {
  const t = useTranslations("UserManage");
  const tCommon = useTranslations("Common");
  const tRoles = useTranslations("Sidebar.role");
  const dispatch = useDispatch<AppDispatch>();

  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
  } = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      user_full_name: "",
      user_email: "",
      user_phone_number: "",
      user_address: "",
      username: "",
      password: "",
      role: "user",
      user_join_date: normalizeDate(),
      user_work_shift: "",
    },
  });

  useEffect(() => {
    if (!user) return;

    reset({
      user_full_name: user.user_full_name || "",
      user_email: user.user_email || "",
      user_phone_number: user.user_phone_number || "",
      user_address: user.user_address || "",
      username: user.username || "",
      password: "",
      role: normalizeRole(user.role),
      user_join_date: normalizeDate(user.user_join_date),
      user_work_shift: user.user_work_shift || "",
    });
  }, [reset, user]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !isSubmitting) {
      onClose();
    }
  };

  const onSubmit = async (values: EditUserFormValues) => {
    if (!user) return;

    try {
      const payload: UpdateUserPayload = {
        user_full_name: values.user_full_name,
        user_email: values.user_email,
        user_phone_number: values.user_phone_number,
        user_address: values.user_address || "",
        username: values.username,
        role: values.role,
        user_join_date: values.user_join_date,
        user_work_shift: values.user_work_shift || "",
        ...(values.password ? { password: values.password } : {}),
      };

      const updatedUser = await userApi.update(user.user_id, payload);
      dispatch(updateUser(updatedUser));
      toast.success(t("updateSuccess", { name: updatedUser.user_full_name }));
      onClose();
    } catch (error) {
      const message =
        (error as any)?.response?.data?.message ||
        (error as Error)?.message ||
        t("updateFailed");
      toast.error(t("failed"), { description: message });
    }
  };

  const errorText = (message?: string) => (
    <p className={`mt-0.5 min-h-4 text-xs font-medium text-red-500 ${message ? "" : "opacity-0"}`}>
      {message || " "}
    </p>
  );
  const requiredMark = <span className="text-red-500">*</span>;
  const optionalLabel = (<span className="text-xs font-normal text-slate-500">({tCommon("optional")})</span>);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-amber-100">
              <UserCog className="size-5 text-amber-600" />
            </div>
            <div>
              <DialogTitle>{t("editTitle")}</DialogTitle>
              <DialogDescription>{t("editSubtitle")}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 px-4">
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-700">{t("personalInfo")}</h3>
            <div className="space-y-1">
              <Label htmlFor="edit-user-full-name">
                {t("full_name")}
                {requiredMark}
              </Label>
              <Input id="edit-user-full-name" {...register("user_full_name")} />
              {errorText(errors.user_full_name?.message)}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="edit-user-email">
                  {t("email")}
                  {requiredMark}
                </Label>
                <Input id="edit-user-email" type="email" {...register("user_email")} />
                {errorText(errors.user_email?.message)}
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-user-phone">
                  {t("phone_number")}
                  {requiredMark}
                </Label>
                <Input id="edit-user-phone" {...register("user_phone_number")} />
                {errorText(errors.user_phone_number?.message)}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="edit-user-address">
                {t("address")}
                {optionalLabel}
              </Label>
              <Textarea id="edit-user-address" {...register("user_address")} />
              {errorText(errors.user_address?.message)}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-700">{t("accountInfo")}</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="edit-username">
                  {t("username")}
                  {requiredMark}
                </Label>
                <Input id="edit-username" {...register("username")} className="bg-slate-50" disabled />
                {errorText(errors.username?.message)}
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-password">
                  {t("newPassword")}
                  {optionalLabel}
                </Label>
                <Input id="edit-password" type="password" {...register("password")} placeholder={t("passwordOptional")} />
                {errorText(errors.password?.message)}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>
                  {t("role")}
                  {requiredMark}
                </Label>
                <Controller
                  control={control}
                  name="role"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={(value: UserRole) => field.onChange(value)}>
                      <SelectTrigger className="w-full bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {/* <SelectItem value="admin">{tRoles("admin")}</SelectItem> */}
                        <SelectItem value="manager">{tRoles("manager")}</SelectItem>
                        <SelectItem value="dispatcher">{tRoles("dispatcher")}</SelectItem>
                        <SelectItem value="driver">{tRoles("driver")}</SelectItem>
                        <SelectItem value="user">{tRoles("user")}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                {errorText(errors.role?.message)}
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-join-date">
                  {t("join_date")}
                  {requiredMark}
                </Label>
                <Controller
                  control={control}
                  name="user_join_date"
                  render={({ field }) => {
                    const selectedDate = parseDateValue(field.value);

                    return (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            className={cn(
                              "w-full justify-between bg-white text-left font-normal",
                              !selectedDate && "text-muted-foreground"
                            )}
                          >
                            {selectedDate ? format(selectedDate, "dd/MM/yyyy") : tCommon("selectDate")}
                            <CalendarIcon className="ml-2 size-4 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 z-[300]" align="start">
                          <Calendar
                            mode="single"
                            selected={selectedDate}
                            onSelect={(date) => field.onChange(date ? format(date, "yyyy-MM-dd") : "")}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    );
                  }}
                />
                {errorText(errors.user_join_date?.message)}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="edit-work-shift">
                {t("work_shift")}
                {optionalLabel}
              </Label>
              <Input id="edit-work-shift" {...register("user_work_shift")} placeholder={t("workShiftPlaceholder")} />
              {errorText(errors.user_work_shift?.message)}
            </div>
          </section>

          <DialogFooter className="border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              <X className="size-4" />
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting} className="bg-amber-600 text-white hover:bg-amber-700">
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {isSubmitting ? t("saving") : tCommon("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
