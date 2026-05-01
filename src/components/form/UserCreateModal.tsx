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
import { addUser } from "@/store/slices/userSlice";
import type { CreateUserPayload, UserRole } from "@/types/user";
import { format, isValid, parse } from "date-fns";
import { Calendar as CalendarIcon, Loader2, UserPlus, X } from "lucide-react";
import { useTranslations } from "next-intl";
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
  user_email: z.string().trim().email("Email không hợp lệ"),
  user_phone_number: z.string().trim().min(1, "Vui lòng nhập số điện thoại").max(20, "Số điện thoại quá dài"),
  user_address: z.string().trim().optional(),
  username: z.string().trim().min(3, "Username phải có ít nhất 3 ký tự").max(100, "Username quá dài"),
  password: z.string().min(6, "Mật khẩu phải có ít nhất 6 ký tự").max(100, "Mật khẩu quá dài"),
  role: z.enum(["admin", "manager", "dispatcher", "driver", "user"]),
  user_join_date: joinDateSchema,
  user_work_shift: z.string().trim(),
});

type CreateUserFormValues = z.infer<typeof createUserSchema>;

export default function UserCreateModal({ open, onClose }: UserCreateModalProps) {
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
  } = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      user_full_name: "",
      user_email: "",
      user_phone_number: "",
      user_address: "",
      username: "",
      password: "",
      role: "admin",
      user_join_date: today(),
      user_work_shift: "",
    },
  });

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !isSubmitting) {
      reset();
      onClose();
    }
  };

  const onSubmit = async (values: CreateUserFormValues) => {
    try {
      const payload: CreateUserPayload = {
        ...values,
        user_address: values.user_address || "",
        user_work_shift: values.user_work_shift || "",
      };
      const newUser = await userApi.create(payload);
      dispatch(addUser(newUser));
      toast.success(t("createSuccess", { name: newUser.user_full_name }));
      reset();
      onClose();
    } catch (error) {
      const message =
        (error as any)?.response?.data?.message ||
        (error as Error)?.message ||
        t("createFailed");
      toast.error(t("failed"), { description: message });
    }
  };

  const errorText = (message?: string) => (
    <p className={`mt-0.5 min-h-4 text-xs font-medium text-red-500 ${message ? "" : "opacity-0"}`}>
      {message || " "}
    </p>
  );
  const requiredMark = <span className="text-red-500">*</span>;
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
            <div className="space-y-1">
              <Label htmlFor="create-user-full-name">
                {t("full_name")}
                {requiredMark}
              </Label>
              <Input id="create-user-full-name" {...register("user_full_name")} placeholder="VD: Nguyễn Văn A" />
              {errorText(errors.user_full_name?.message)}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="create-user-email">
                  {t("email")}
                  {requiredMark}
                </Label>
                <Input id="create-user-email" type="email" {...register("user_email")} placeholder="example@email.com" />
                {errorText(errors.user_email?.message)}
              </div>
              <div className="space-y-1">
                <Label htmlFor="create-user-phone">
                  {t("phone_number")}
                  {requiredMark}
                </Label>
                <Input id="create-user-phone" {...register("user_phone_number")} placeholder="0123456789" />
                {errorText(errors.user_phone_number?.message)}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="create-user-address">
                {t("address")}
                {optionalLabel}
              </Label>
              <Textarea id="create-user-address" {...register("user_address")} placeholder="VD: 123 Đường ABC, Quận 1, TP.HCM" />
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
                <Input id="create-username" {...register("username")} placeholder="VD: nguyenvana" />
                {errorText(errors.username?.message)}
              </div>
              <div className="space-y-1">
                <Label htmlFor="create-password">
                  {t("password")}
                  {requiredMark}
                </Label>
                <Input id="create-password" type="password" {...register("password")} placeholder="******" />
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
                        <SelectItem value="admin">{tRoles("admin")}</SelectItem>
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
              <Label htmlFor="create-work-shift">
                {t("work_shift")}
                {optionalLabel}
              </Label>
              <Input id="create-work-shift" {...register("user_work_shift")} placeholder={t("workShiftPlaceholder")} />
              {errorText(errors.user_work_shift?.message)}
            </div>
          </section>

          <DialogFooter className="border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              <X className="size-4" />
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting} className="bg-blue-600 text-white hover:bg-blue-700">
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
              {isSubmitting ? t("saving") : t("add")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
