"use client";

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
import { useRoles } from "@/hooks/use-roles";
import { cn } from "@/lib/utils";
import { userApi } from "@/services/user.service";
import type { AppDispatch } from "@/store";
import { addUser } from "@/store/slices/userSlice";
import type { CreateUserPayload } from "@/types/user";
import { zodResolver } from "@hookform/resolvers/zod";
import { format, isValid, parse } from "date-fns";
import { Calendar as CalendarIcon, Eye, EyeOff, Loader2, UserPlus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useDispatch } from "react-redux";
import { toast } from "sonner";
import { z } from "zod";

interface UserCreateModalProps {
  open: boolean;
  onClose: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);
const joinDateSchema = z
  .string()
  .min(1, "Vui lòng chọn ngày vào làm")
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày vào làm không hợp lệ");

const parseDateValue = (value?: string) => {
  if (!value) return undefined;
  const parsed = parse(value, "yyyy-MM-dd", new Date());
  return isValid(parsed) ? parsed : undefined;
};

const createUserSchema = z.object({
  user_full_name: z.string().trim().min(1, "Vui lòng nhập họ tên"),
  user_short_name: z.string().trim().optional(),
  user_email: z.string().trim().email("Email không hợp lệ"),
  user_phone_number: z
    .string()
    .trim()
    .min(1, "Vui lòng nhập số điện thoại")
    .max(20, "Số điện thoại quá dài"),
  user_address: z.string().trim().optional(),
  username: z
    .string()
    .trim()
    .min(3, "Username phải có ít nhất 3 ký tự")
    .max(100, "Username quá dài"),
  password: z.string().min(6, "Mật khẩu phải có ít nhất 6 ký tự").max(100, "Mật khẩu quá dài"),
  role: z.string().trim().min(1, "Vui lòng chọn vai trò"),
  user_join_date: joinDateSchema,
  user_work_shift: z.string().trim(),
});

type CreateUserFormValues = z.infer<typeof createUserSchema>;

const requiredMark = <span className="text-red-500">*</span>;

export default function UserCreateModal({ open, onClose }: UserCreateModalProps) {
  const t = useTranslations("UserManage");
  const tCommon = useTranslations("Common");
  const { roles, loading: rolesLoading } = useRoles();
  const dispatch = useDispatch<AppDispatch>();
  const [showPassword, setShowPassword] = useState(false);
  const defaultRole = useMemo(
    () =>
      roles.find((role) => role.role === "user")?.role ||
      roles.find((role) => role.role !== "admin")?.role ||
      roles[0]?.role ||
      "user",
    [roles]
  );

  const {
    control,
    formState: { errors, isSubmitting },
    getValues,
    handleSubmit,
    register,
    reset,
    setValue,
  } = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      user_full_name: "",
      user_short_name: "",
      user_email: "",
      user_phone_number: "",
      user_address: "",
      username: "",
      password: "",
      role: "user",
      user_join_date: today(),
      user_work_shift: "",
    },
  });

  useEffect(() => {
    if (!open || roles.length === 0) return;

    const currentRole = getValues("role");
    if (!roles.some((role) => role.role === currentRole)) {
      setValue("role", defaultRole, { shouldValidate: true });
    }
  }, [defaultRole, getValues, open, roles, setValue]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !isSubmitting) {
      setShowPassword(false);
      reset();
      onClose();
    }
  };

  const onSubmit = async (values: CreateUserFormValues) => {
    try {
      const payload: CreateUserPayload = {
        ...values,
        user_short_name: values.user_short_name || "",
        user_address: values.user_address || "",
        user_work_shift: values.user_work_shift || "",
      };
      const newUser = await userApi.create(payload);
      dispatch(addUser(newUser));
      toast.success(t("createSuccess", { name: newUser.user_full_name }));
      setShowPassword(false);
      reset();
      onClose();
    } catch (error) {
      const message =
        (error as any)?.response?.data?.message || (error as Error)?.message || t("createFailed");
      toast.error(t("failed"), { description: message });
    }
  };

  const errorText = (message?: string) => (
    <p className={`mt-0.5 min-h-4 text-xs font-medium text-red-500 ${message ? "" : "opacity-0"}`}>
      {message || " "}
    </p>
  );
  const optionalLabel = (
    <span className="text-xs font-normal text-slate-500">({tCommon("optional")})</span>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-blue-100">
              <UserPlus className="size-5 text-blue-600" />
            </div>
            <div>
              <DialogTitle>{t("createTitle")}</DialogTitle>
              <DialogDescription>{t("createSubtitle")}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 px-4">
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-700">{t("personalInfo")}</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="create-user-full-name">
                  {t("full_name")}
                  {requiredMark}
                </Label>
                <Input
                  id="create-user-full-name"
                  {...register("user_full_name")}
                  placeholder="VD: Nguyễn Văn A"
                />
                {errorText(errors.user_full_name?.message)}
              </div>

              <div className="space-y-1">
                <Label htmlFor="create-user-short-name">
                  {t("short_name")}
                  {optionalLabel}
                </Label>
                <Input
                  id="create-user-short-name"
                  {...register("user_short_name")}
                  placeholder="VD: A, Văn A"
                />
                {errorText(errors.user_short_name?.message)}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="create-user-email">
                  {t("email")}
                  {requiredMark}
                </Label>
                <Input
                  id="create-user-email"
                  type="email"
                  {...register("user_email")}
                  placeholder="example@email.com"
                />
                {errorText(errors.user_email?.message)}
              </div>
              <div className="space-y-1">
                <Label htmlFor="create-user-phone">
                  {t("phone_number")}
                  {requiredMark}
                </Label>
                <Input
                  id="create-user-phone"
                  {...register("user_phone_number")}
                  placeholder="0123456789"
                />
                {errorText(errors.user_phone_number?.message)}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="create-user-address">
                {t("address")}
                {optionalLabel}
              </Label>
              <Textarea
                id="create-user-address"
                {...register("user_address")}
                placeholder="VD: 123 Đường ABC, Quận 1, TP.HCM"
              />
              {errorText(errors.user_address?.message)}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-700">{t("accountInfo")}</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="create-username">
                  {t("username")}
                  {requiredMark}
                </Label>
                <Input
                  id="create-username"
                  {...register("username")}
                  placeholder="VD: nguyenvana"
                />
                {errorText(errors.username?.message)}
              </div>
              <div className="space-y-1">
                <Label htmlFor="create-password">
                  {t("password")}
                  {requiredMark}
                </Label>
                <div className="relative">
                  <Input
                    id="create-password"
                    type={showPassword ? "text" : "password"}
                    {...register("password")}
                    placeholder="******"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-2 top-1/2 rounded-md p-1 text-slate-500 transition hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring -translate-y-1/2"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
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
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={rolesLoading}
                    >
                      <SelectTrigger className="w-full bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {roles.length > 0 ? (
                          // roles.map((role) => (
                          roles
                            .filter((role) => role.role !== "admin")
                            .map((role) => (
                              <SelectItem key={role.id} value={role.role}>
                                {role.role_label}
                              </SelectItem>
                            ))
                        ) : (
                          <SelectItem value="user" disabled>
                            Chưa có vai trò
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errorText(errors.role?.message)}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="create-join-date">
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
                            {selectedDate
                              ? format(selectedDate, "dd/MM/yyyy")
                              : tCommon("selectDate")}
                            <CalendarIcon className="ml-2 size-4 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="z-[300] w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={selectedDate}
                            onSelect={(date) =>
                              field.onChange(date ? format(date, "yyyy-MM-dd") : "")
                            }
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    );
                  }}
                />
                {errorText(errors.user_join_date?.message)}
              </div>

              <div className="space-y-1">
                <Label htmlFor="create-work-shift">
                  {t("work_shift")}
                  {optionalLabel}
                </Label>
                <Input
                  id="create-work-shift"
                  {...register("user_work_shift")}
                  placeholder={t("workShiftPlaceholder")}
                />
                {errorText(errors.user_work_shift?.message)}
              </div>
            </div>
          </section>

          <DialogFooter className="border-t border-slate-100 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              <X className="size-4" />
              {tCommon("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              {isSubmitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <UserPlus className="size-4" />
              )}
              {isSubmitting ? t("saving") : t("add")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
