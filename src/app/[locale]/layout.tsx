import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import {
  Dela_Gothic_One,
  Geist,
  Geist_Mono,
  Noto_Sans_JP,
} from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { routing } from "@/i18n/routing";
import {
  languageAlternates,
  localePath,
  ogAlternateLocales,
  ogLocale,
} from "@/i18n/urls";
import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

/* Japanese text on devices without Hiragino. The face is split into over a
   hundred unicode-range files, and preloading them reads 1.5 MB per page, so
   only the characters in use are fetched. */
const noto = Noto_Sans_JP({
  display: "swap",
  preload: false,
  variable: "--font-noto",
  weight: ["400", "700"],
});

/* The heading face. Packages sharing one face are hard to tell apart. */
const display = Dela_Gothic_One({
  display: "swap",
  preload: false,
  variable: "--font-display",
  weight: "400",
});

type LayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: Omit<LayoutProps, "children">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });

  return {
    alternates: {
      canonical: localePath(locale),
      languages: languageAlternates(),
    },
    applicationName: "niconico-embed-player",
    description: t("description"),
    formatDetection: { telephone: false },
    metadataBase: new URL("https://niconico-embed-player.kkweb.io"),
    openGraph: {
      alternateLocale: ogAlternateLocales(locale),
      description: t("description"),
      locale: ogLocale(locale),
      title: t("title"),
      type: "website",
      url: localePath(locale),
    },
    title: t("title"),
    twitter: {
      card: "summary_large_image",
      description: t("description"),
      title: t("title"),
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#0b0b0f",
};

export default async function Layout({ children, params }: LayoutProps) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  return (
    <html
      className={`${geistSans.variable} ${geistMono.variable} ${noto.variable} ${display.variable}`}
      lang={locale}
    >
      <body className="font-sans antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <Analytics />
      </body>
    </html>
  );
}
