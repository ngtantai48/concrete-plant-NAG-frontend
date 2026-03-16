import LoginForm from "@/components/form/LoginForm";
import GuestGuard from "@/guards/GuestGuard";
import { getTranslations } from 'next-intl/server';
import ThreeWrapper from "@/components/ThreeWrapper";
import Image from "next/image";
import LogoMini from "@/assets/images/logo-mini.png";

export default async function LoginPage() {
    const t = await getTranslations('FormLogin');

    return (
        <GuestGuard>
            <main className="relative flex min-h-screen items-center justify-center overflow-hidden">
                {/* 3D Background */}
                <ThreeWrapper />

                {/* Login Container (Glassmorphism) */}
                <div className="z-10 flex w-full max-w-md flex-col items-center gap-8 rounded-3xl bg-white/10 p-10 backdrop-blur-md shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] border border-white/20 animate-fade-in mx-4">
                    {/* Header: Logo / Brand */}
                    <div className="flex flex-col items-center gap-2">
                        <div className="flex items-center justify-center mb-2">
                            <Image className="h-24 w-auto object-contain drop-shadow-md" src={LogoMini} alt="Nguyên Anh Group Logo" priority />
                        </div>
                        <div className="text-center">
                            {/* <h1 className="text-3xl font-bold tracking-tight text-white mb-2">NGUYÊN ANH GROUP</h1> */}
                            <p className="text-indigo-200 text-sm font-medium">{t('welcome')}</p>
                        </div>
                    </div>

                    {/* Form Section */}
                    <div className="w-full animate-slide-up">
                        <LoginForm />
                    </div>
                </div>
            </main>
        </GuestGuard>
    );
}
