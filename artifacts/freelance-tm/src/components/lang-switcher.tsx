import { useI18n, Lang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

const flags: Record<Lang, string> = { ru: "РУ", tk: "ТМ", en: "EN" };

export function LangSwitcher() {
  const { lang, setLang } = useI18n();
  const langs: Lang[] = ["ru", "tk", "en"];

  return (
    <div className="flex items-center gap-0.5 bg-white/5 border border-white/10 rounded-lg p-0.5">
      {langs.map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={`px-2 py-1 rounded text-xs font-bold transition-colors ${
            lang === l
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {flags[l]}
        </button>
      ))}
    </div>
  );
}
