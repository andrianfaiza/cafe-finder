import { Coffee, MapPin, SearchX } from "lucide-react";
import { cn } from "@/lib/utils";
import { haversineKm, type CafeSpot } from "@/lib/cafes";
import { useSnapDrawer } from "@/hooks/useSnapDrawer";
import { useLang } from "@/lib/i18n";
import { useEffect, useMemo, useRef, type TouchEvent } from "react";

export type SortMode = "near" | "far";

interface CafeListProps {
  spots: CafeSpot[];
  label: string | null;
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  userPos: { lat: number; lng: number } | null;
  sort: SortMode;
  routeError: string | null;
  onSelect: (spot: CafeSpot) => void;
  onClose: () => void;
  onSortChange: (mode: SortMode) => void;
}

const fmtDist = (km: number) =>
  km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;

export function CafeList({
  spots,
  label,
  loading,
  error,
  selectedId,
  userPos,
  sort,
  routeError,
  onSelect,
  onClose,
  onSortChange,
}: CafeListProps) {
  const { t } = useLang();
  const drawer = useSnapDrawer("half"); // default half-open saat pertama kali muncul

  // Ref untuk mendeteksi tap vs drag pada handle strip
  const handleStartPos = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: TouchEvent) => {
    // Jalankan handler drag dari hook, lalu catat posisi untuk deteksi tap.
    drawer.touchProps.onTouchStart(e);
    const touch = e.touches[0];
    handleStartPos.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (e: TouchEvent) => {
    // Selesaikan drag dulu supaya snap mengikuti posisi/kecepatan.
    drawer.touchProps.onTouchEnd();
    if (!handleStartPos.current) return;
    const touch = e.changedTouches[0];
    const dx = Math.abs(touch.clientX - handleStartPos.current.x);
    const dy = Math.abs(touch.clientY - handleStartPos.current.y);
    // Jika gerakan < 8px, anggap sebagai tap → cycle snap
    if (dx < 8 && dy < 8) {
      drawer.cycleSnap();
    }
    handleStartPos.current = null;
  };

  // Jika loading, auto buka ke half
  const prevLoading = useRef(loading);
  const setSnap = drawer.setSnap;
  useEffect(() => {
    if (loading && !prevLoading.current) {
      setSnap("half");
    }
    prevLoading.current = loading;
  }, [loading, setSnap]);

  const sortedSpots = useMemo(() => {
    if (!userPos) return spots;
    return [...spots].sort((a, b) => {
      const da = haversineKm(userPos.lat, userPos.lng, a.lat, a.lng);
      const db = haversineKm(userPos.lat, userPos.lng, b.lat, b.lng);
      return sort === "near" ? da - db : db - da;
    });
  }, [spots, userPos, sort]);

  const displayLabel = label ?? t("list.thisArea");

  return (
    <>
      {/* Backdrop dim (mobile only, full open) */}
      {drawer.isMobile && drawer.snap === "full" && (
        <div
          className="fixed inset-0 z-30 bg-black/20 backdrop-blur-[1px] transition-opacity md:hidden"
          onClick={() => drawer.setSnap("half")}
          aria-hidden="true"
        />
      )}

      <aside
        aria-label={t("list.results")}
        className={cn(
          "z-40 flex flex-col overflow-hidden rounded-t-2xl bg-background shadow-2xl ring-1 ring-border",
          "fixed inset-x-0 bottom-0",
          "md:absolute md:inset-x-auto md:top-12 md:right-4 md:bottom-4 md:w-80 md:rounded-2xl",
        )}
        style={
          drawer.isMobile
            ? {
                height: drawer.heightPx,
                transition: drawer.dragging ? "none" : "height 300ms cubic-bezier(0.2, 0.9, 0.3, 1)",
              }
            : undefined
        }
      >
        {/* === HANDLE DRAG STRIP (mobile only) === */}
        <div
          {...drawer.touchProps}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          role="button"
          tabIndex={0}
          aria-label={t("drawer.handleAria")}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") {
              e.preventDefault();
              drawer.setSnap("full");
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              drawer.setSnap("collapsed");
            }
          }}
          className="shrink-0 cursor-grab touch-none select-none py-2 md:hidden active:cursor-grabbing"
        >
          {/* Indikator handle bar — garis horizontal kecil di tengah */}
          <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-muted-foreground/40" />
        </div>

        {/* === HEADER === */}
        <header
          {...drawer.touchProps}
          className={cn(
            "flex shrink-0 items-center gap-2 border-b border-border px-4 py-3 touch-none",
          )}
        >
          <Coffee className="size-5 shrink-0 text-primary" />
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
            {loading ? t("list.searching") : label ?? t("list.results")}
          </h2>

          {!loading && !error && userPos && (
            <div
              className="flex shrink-0 items-center gap-1"
              role="radiogroup"
              aria-label={t("list.results")}
            >
              <button
                type="button"
                aria-pressed={sort === "near"}
                onClick={() => onSortChange(sort === "near" ? "far" : "near")}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  sort === "near"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                )}
              >
                {t("list.nearest")}
              </button>
              <button
                type="button"
                aria-pressed={sort === "far"}
                onClick={() => onSortChange(sort === "far" ? "near" : "far")}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  sort === "far"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                )}
              >
                {t("list.farthest")}
              </button>
            </div>
          )}

          <button
            type="button"
            aria-label={t("list.closeAria")}
            onClick={onClose}
            className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <SearchX className="size-4" />
          </button>
        </header>

        {/* === CONTENT SCROLLABLE === */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {error && (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <MapPin className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {t("list.loadingIn", { label: displayLabel })}
              </p>
            </div>
          ) : sortedSpots.length === 0 && !error ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                {t("list.emptyIn", { label: displayLabel })}
              </p>
              <p className="text-xs text-muted-foreground/70">{t("list.emptyHint")}</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {sortedSpots.map((spot) => (
                <li key={spot.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(spot)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/60",
                      spot.id === selectedId && "bg-secondary",
                    )}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg">
                      ☕
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{spot.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {spot.address || "—"}
                      </p>
                    </div>
                    {userPos && (
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {fmtDist(haversineKm(userPos.lat, userPos.lng, spot.lat, spot.lng))}{" "}
                        {t("list.fromYou")}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {routeError && (
            <div className="px-4 py-3">
              <p className="text-xs text-destructive">{routeError}</p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
