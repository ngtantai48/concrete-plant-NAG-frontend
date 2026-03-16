import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

export default getRequestConfig(async () => {
    const supportedLocales = ['vi', 'en'];
    const cookieStore = await cookies();
    const localeFromCookie = cookieStore.get('locale')?.value;
    const locale = localeFromCookie && supportedLocales.includes(localeFromCookie) ? localeFromCookie : 'vi';

    const messages = (await import(`@/i18n/messages/${locale}.json`)).default;

    return {
        locale,
        messages
    };
});
