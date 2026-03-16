'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { setCookie } from 'cookies-next';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import Image from 'next/image';

export function LanguageSwitcher() {
    const router = useRouter();
    const locale = useLocale();
    const [isPending, startTransition] = useTransition();
    const t = useTranslations('Header');

    const handleChange = (newLocale: string) => {
        if (newLocale === locale) return;

        setCookie('locale', newLocale, { path: '/' });

        startTransition(() => {
            router.refresh();
        });
    };

    const renderFlag = (locale: string) => {
        switch (locale) {
            case 'vi':
                return '/flags/vn.svg';
            case 'en':
                return '/flags/us.svg';
            default:
                return '/flags/us.svg';
        }
    };

    return (
        <Select onValueChange={handleChange} value={locale}>
            <SelectTrigger className="min-w-[150px] flex items-center justify-between px-3">
                <SelectValue>
                    <div className="flex gap-2">
                        <Image src={renderFlag(locale)} alt={locale} width={20} height={20} />
                        <span className="text-sm font-medium">{t(`languages.${locale}`)}</span>
                    </div>
                </SelectValue>
            </SelectTrigger>

            <SelectContent className="z-[9999]">
                <SelectItem value="vi">
                    <div className="flex gap-2">
                        <Image src="/flags/vn.svg" alt="vn" width={20} height={20} />
                        <span>{t('languages.vi')}</span>
                    </div>
                </SelectItem>
                <SelectItem value="en">
                    <div className="flex gap-2">
                        <Image src="/flags/us.svg" alt="us" width={20} height={20} />
                        <span>{t('languages.en')}</span>
                    </div>
                </SelectItem>
            </SelectContent>
        </Select>
    );
}
