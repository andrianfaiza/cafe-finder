import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Tombol switch bahasa `in` / `en`.
 * Diposisi di sebelah kiri tombol "Lokasi saya" sesuai permintaan.
 */
export function LangSwitch({ className }: { className?: string }) {
  const { lang, setLang, t } = useLang();

  return (
    <div
      role="group"
      aria-label={t("header.langAria")}
      className={cn("flex h-9 shrink-0 items-center gap-0.5 rounded-full border border-input bg-secondary/60 p-0.5", className)}
    >
      {(["in", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={cn(
            "flex size-7 items-center justify-center rounded-full text-[11px] font-semibold lowercase transition-colors",
            lang === l
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
