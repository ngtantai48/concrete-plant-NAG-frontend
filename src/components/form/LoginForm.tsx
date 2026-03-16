"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppSelector } from "@/hooks/use-app-selector";
import vi from "@/locales/vi";
import { AppDispatch, RootState } from "@/store/index";
import { login } from "@/store/slices/authSlice";
import { Eye, EyeOff, Lock, User, Truck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { toast } from "sonner";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";


export default function LoginForm() {
    const t = useTranslations("FormLogin");
    const dispatch = useDispatch<AppDispatch>();
    const { loading } = useAppSelector((state: RootState) => state.auth);

    const usernameInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (usernameInputRef.current) {
            usernameInputRef.current.focus();
        }
    }, []);

    const [formState, setFormState] = useState({
        username: "",
        password: "",
        remember: false,
    });
    const [formError, setFormError] = useState<{ username?: string; password?: string }>({});
    const [showPassword, setShowPassword] = useState(false);

    const validate = () => {
        const errs: typeof formError = {};
        if (!formState.username) {
            errs.username = `${t('username')} ${t('validation.required')}`;
        } else if (formState.username.length < 3) {
            errs.username = t('errors.ERR_COMMON::USERNAME_TOO_SHORT').split("\n")[0];

        }
        if (!formState.password) {
            errs.password = `${t('password')} ${t('validation.required')}`;
        } else if (formState.password.length < 6) {
            errs.password = t('errors.ERR_COMMON::PASSWORD_TOO_SHORT').split("\n")[0];
        }
        setFormError(errs);
        return Object.keys(errs).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        if (!validate()) return;

        try {
            const resultAction = await dispatch(
                login({
                    username: formState.username.trim(),
                    password: formState.password,
                })
            );

            if (login.rejected.match(resultAction)) {
                const err = resultAction.payload || resultAction.error?.message;
                toast.error(vi.errors[err as string] || err || "Đăng nhập thất bại!", { position: "top-right" });
            }
        } catch (err: any) {
            toast.error("Đã xảy ra lỗi không xác định.", { position: "top-right" });
        }
    };


    return (
        <div className="w-full rounded-2xl bg-white/95 shadow-2xl border border-white/20 p-8">
            <div className="mb-8 text-center">
                <h2 className="text-2xl font-bold text-gray-800 mb-1">{t('login')}</h2>
                <p className="text-sm text-gray-600">{t('please_login')}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                    <Label className="text-sm font-semibold text-gray-700" htmlFor="username">{t('username')}</Label>
                    <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                        <Input id="username" type="text" placeholder={t('username')}
                            className={`pl-10 h-12 border-2 rounded-xl bg-gray-50/50 transition-all duration-200 ${formError.username
                                ? "border-red-500 focus-visible:ring-red-400"
                                : "border-gray-200 focus-visible:border-amber-500 focus-visible:ring-amber-200"
                                }`}
                            ref={usernameInputRef}
                            value={formState.username}
                            onChange={(e) => setFormState({ ...formState, username: e.target.value })}
                        />
                    </div>
                    {formError.username && (
                        <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                            <span className="inline-block w-1 h-1 rounded-full bg-red-500"></span>
                            {formError.username}
                        </p>
                    )}
                    {!formError.username && (
                        <div className="h-4"></div>
                    )}
                </div>

                <div className="space-y-2">
                    <Label className="text-sm font-semibold text-gray-700" htmlFor="password">{t('password')}</Label>
                    <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                        <Input
                            type={showPassword ? "text" : "password"}
                            id="password"
                            value={formState.password}
                            onChange={(e) =>
                                setFormState({ ...formState, password: e.target.value })
                            }
                            placeholder={vi.signIn.placeholder.password}
                            className={`pl-10 pr-10 h-12 border-2 rounded-xl bg-gray-50/50 transition-all duration-200 ${formError.password
                                ? "border-red-500 focus-visible:ring-red-400"
                                : "border-gray-200 focus-visible:border-amber-500 focus-visible:ring-amber-200"
                                }`}
                        />
                        <button type="button"
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                            onClick={() => setShowPassword(!showPassword)}
                        >
                            {showPassword ? (<EyeOff className="h-5 w-5" />) : (<Eye className="h-5 w-5" />)}
                        </button>
                    </div>
                    {formError.password && (
                        <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                            <span className="inline-block w-1 h-1 rounded-full bg-red-500"></span>
                            {formError.password}
                        </p>
                    )}
                    {!formError.password && (
                        <div className="h-4"></div>
                    )}
                </div>

                <div className="flex items-center justify-between pb-5">
                    <div className="flex items-center space-x-2">
                        <Checkbox
                            id="remember"
                            checked={formState.remember}
                            onCheckedChange={(checked) => setFormState({ ...formState, remember: checked === true })}
                        />
                        <Label className="text-sm text-gray-600 cursor-pointer font-normal" htmlFor="remember">{t('remember_me')}</Label>
                    </div>
                </div>

                <Button
                    type="submit"
                    disabled={loading}
                    className="w-full h-14 mt-4 text-base font-bold tracking-wide uppercase rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-900 shadow-[0_4px_14px_0_rgba(245,158,11,0.39)] hover:shadow-[0_6px_20px_rgba(245,158,11,0.23)] hover:-translate-y-1 transition-all duration-200 flex items-center justify-center gap-2"
                >
                    {loading ? (
                        <span className="flex items-center gap-2">
                            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-900 border-t-transparent"></span>
                            {t('handling')}
                        </span>
                    ) : (
                        <>
                            <Truck className="h-5 w-5" />
                            {t('sign_in')}
                        </>
                    )}
                </Button>
            </form>

            <div className="flex flex-col items-center mt-6 text-center border-t border-gray-100 pt-6">
                <div className="flex flex-col relative justify-center text-slate-500 font-bold mb-6">
                    <span className="px-6 uppercase text-sm tracking-widest text-amber-600 mb-1">
                        {t('system')}
                    </span>
                    <span className="px-6 uppercase text-lg tracking-wider">
                        {t('company')}
                    </span>
                </div>
                <LanguageSwitcher />
            </div>

        </div>
    );
}
