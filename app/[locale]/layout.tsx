import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import { isLocale, locales, type Locale } from "@/i18n/config";
import { translate } from "@/i18n/resources";
import "../globals.css";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export function generateMetadata({ params }: { params: { locale: string } }): Metadata {
  if (!isLocale(params.locale)) return {};
  const locale = params.locale;
  return {
    title: translate(locale, "metadata.title"),
    description: translate(locale, "metadata.description"),
    alternates: {
      canonical: `/${locale}`,
      languages: { "zh-CN": "/zh-CN", en: "/en", "x-default": "/zh-CN" }
    },
    openGraph: {
      type: "website",
      locale: locale === "zh-CN" ? "zh_CN" : "en_US",
      alternateLocale: locale === "zh-CN" ? ["en_US"] : ["zh_CN"],
      title: translate(locale, "metadata.title"),
      description: translate(locale, "metadata.description")
    }
  };
}

export default function LocalizedLayout({ children, params }: { children: React.ReactNode; params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  return (
    <html lang={params.locale}>
      <body><LocaleProvider locale={params.locale as Locale}>{children}</LocaleProvider></body>
    </html>
  );
}
