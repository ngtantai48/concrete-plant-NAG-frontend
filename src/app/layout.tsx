import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getLocaleMessages } from "@/i18n/server";
import '@/lib/fontawesome';
import { Providers } from "@/store/providers";
import InitAuth from "@/utils/init-auth";
import type { Metadata } from "next";
import { NextIntlClientProvider } from 'next-intl';
import { Suspense } from "react";
import "./globals.css";


export const metadata: Metadata = {
  title: "Nguyên Anh Group",
  description: "Trợ lý điều hành bê tông và đội xe Nguyên Anh Group",
  icons: {
    icon: [
      { url: "/icons/nguyen-anh-ai-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/nguyen-anh-ai-48.png", sizes: "48x48", type: "image/png" },
    ],
    apple: [{ url: "/icons/nguyen-anh-ai-180.png", sizes: "180x180", type: "image/png" }],
  },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode; }>) {
  const { locale, messages } = await getLocaleMessages();

  return (
    <html lang={locale}>
      <head>
        {process.env.NEXT_PUBLIC_API_URL && (
          <link rel="preconnect" href={new URL(process.env.NEXT_PUBLIC_API_URL).origin} />
        )}
      </head>
      {/* <body className={`${barlow.variable} font-sans`}> */}
      <body>
        <Providers>
          <Suspense fallback={null}>
            <InitAuth />
          </Suspense>

          <NextIntlClientProvider locale={locale} messages={messages}>
            <TooltipProvider>
              {children}
            </TooltipProvider>
          </NextIntlClientProvider>

          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
