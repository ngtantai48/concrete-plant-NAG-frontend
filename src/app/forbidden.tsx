import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export default async function Forbidden() {
    const t = await getTranslations('Forbidden');

    return (
        <div className="h-full flex flex-col items-center justify-center bg-gray-50 px-6">
            <div className="text-center max-w-md">
                <h1 className="text-5xl font-bold mb-4 text-red-500">403</h1>
                <h2 className="text-2xl font-semibold mb-2">{t('access_forbidden')}</h2>
                <p className="text-gray-600 mb-6 whitespace-pre-line">{t('description')}</p>

                <Button variant="outline" asChild className="shadow-md">
                    <Link href="/">{t('back')}</Link>
                </Button>
            </div>
        </div>
    )
}
