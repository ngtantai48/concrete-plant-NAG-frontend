import { cookies } from 'next/headers';
import requestConfig from './request';

export async function getLocaleMessages() {
    const cookieStore = await cookies();
    const localeFromCookie = cookieStore.get('locale')?.value || 'vi';

    return await requestConfig({ requestLocale: Promise.resolve(localeFromCookie) });
}
