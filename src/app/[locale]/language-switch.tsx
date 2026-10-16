"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

export function LanguageSwitch() {
  const locale = useLocale();
  const t = useTranslations("language");
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-0.5 rounded-full bg-white/5 p-0.5 text-xs ring-1 ring-white/10">
      {(["en", "ja"] as const).map((target) => (
        <Link
          className={`rounded-full px-3 py-1 transition-colors ${
            locale === target
              ? "bg-white/15 text-white"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
          href={pathname}
          key={target}
          locale={target}
        >
          {t(target)}
        </Link>
      ))}
    </div>
  );
}
