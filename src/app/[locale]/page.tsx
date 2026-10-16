import { getTranslations, setRequestLocale } from "next-intl/server";
import { Demo } from "./demo";
import { LanguageSwitch } from "./language-switch";

type PageProps = {
  params: Promise<{ locale: string }>;
};

const LINKS = [
  {
    href: "https://github.com/piro0919/niconico-embed-player",
    label: "GitHub",
  },
  { href: "https://buymeacoffee.com/piro0919", label: "Buy Me a Coffee" },
  { href: "https://www.npmjs.com/package/niconico-embed-player", label: "npm" },
];

export default async function Page({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("header");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-zinc-800 px-5 py-3">
        <h1 className="font-display text-base text-white">
          niconico-embed-player
        </h1>
        <p className="mr-auto text-xs text-zinc-500">{t("tagline")}</p>
        <span className="text-xs text-zinc-600">{t("unofficial")}</span>
        <LanguageSwitch />
      </header>

      <main className="flex flex-1 flex-col px-5 py-8">
        <Demo />
      </main>

      <footer className="flex flex-wrap items-center gap-4 border-t border-zinc-800 px-5 py-4 text-sm">
        <code className="rounded border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 font-mono text-xs text-zinc-300">
          npm i niconico-embed-player
        </code>
        {LINKS.map((link) => (
          <a
            className="text-zinc-500 transition-colors hover:text-zinc-300"
            href={link.href}
            key={link.label}
            rel="noreferrer"
            target="_blank"
          >
            {link.label} →
          </a>
        ))}
        <a
          className="ml-auto text-zinc-600 transition-colors hover:text-zinc-400"
          href="https://kkweb.io/"
          rel="noreferrer"
          target="_blank"
        >
          kkweb.io
        </a>
      </footer>
    </div>
  );
}
