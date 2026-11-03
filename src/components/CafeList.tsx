import { Coffee, MapPin, SearchX } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { type CafeSpot } from "@/lib/cafes";
import { haversineKm } from "@/lib/cafes";

type Sort = "near" | "far";

type CafeListProps = {
  cafes: CafeSpot[];
  label: string | null;
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  userPos: { lat: number; lng: number } | null;
  sort: Sort;
  onSelect: (cafe: CafeSpot) => void;
  onClose: () => void;
  onSortChange: (v: Sort) => void;
};

const fmtDist = (km: number) =>
  km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;

export function CafeList({
  cafes,
  label,
  loading,
  error,
  selectedId,
  userPos,
  sort,
  onSelect,
  onClose,
  onSortChange,
}: CafeListProps) {
  const sorted = [...cafes].sort((a, b) => {
    if (!userPos) return a.name.localeCompare(b.name);
    const da = haversineKm(userPos.lat, userPos.lng, a.lat, a.lng);
    const db = haversineKm(userPos.lat, userPos.lng, b.lat, b.lng);
    return sort === "near" ? da - db : db - da;
  });

  return (
    <aside className="absolute top-12 right-4 bottom-4 z-40 w-[calc(100%-1rem)] max-w-[400px] md:w-80">
      <Card className="flex h-full flex-col overflow-hidden shadow-xl ring-1 ring-border">
        <CardHeader className="flex items-center justify-between gap-2 px-4 py-3 bg-background">
          <div className="flex items-center gap-2 min-w-0">
            <Coffee className="size-5 text-primary shrink-0" />
            <CardTitle className="truncate text-sm">
              {loading ? "Mencari kafe…" : label ?? "Hasil kafe"}
            </CardTitle>
          </div>
          {!loading && !error && userPos && (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => onSortChange("near")}
                aria-label="Urutkan terdekat dulu"
                className={cn(
                  "px-2 py-1 text-xs border rounded",
                  sort === "near"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                Terdekat
              </button>
              <button
                type="button"
                onClick={() => onSortChange("far")}
                aria-label="Urutkan terjauh dulu"
                className={cn(
                  "px-2 py-1 text-xs border rounded",
                  sort === "far"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                Terjauh
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            aria-label="Tutup hasil pencarian"
          >
            <span className="sr-only">Tutup hasil pencarian</span>
            <SearchX className="size-4" />
          </button>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-y-auto p-0">
          {error && (
            <div className="px-4 py-3 flex gap-2 items-start rounded-lg bg-destructive text-destructive-foreground">
              <SearchX className="mt-0.5 size-4 shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}
          {loading && !error && (
            <div className="px-4 py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <Coffee className="size-6 animate-pulse" />
              <p className="text-sm">
                Mencari kafe di sekitar <span className="font-medium">{label ?? "area ini"}</span>…
              </p>
            </div>
          )}
          {!loading && !error && cafes.length === 0 && label && (
            <div className="px-4 py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <Coffee className="size-6 opacity-50" />
              <p className="text-sm">
                Tidak ada kafe ditemukan di sekitar <strong className="font-medium">{label}</strong>.
              </p>
              <p className="text-xs">Coba nama kota lain atau geser peta lalu cari lagi.</p>
            </div>
          )}
          {!loading && !error &&
            sorted.map((cafe) => {
              const km = userPos
                ? haversineKm(userPos.lat, userPos.lng, cafe.lat, cafe.lng)
                : null;
              return (
                <button
                  key={cafe.id}
                  type="button"
                  onClick={() => onSelect(cafe)}
                  className={cn(
                    "w-full border-b border-border px-4 py-3 text-left transition-colors",
                    selectedId === cafe.id ? "bg-accent" : "hover:bg-accent",
                  )}
                >
                  <span className="flex items-start gap-3">
                    <MapPin className="mt-1 size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex flex-col gap-0.5">
                      <span className="block truncate text-sm font-medium">{cafe.name}</span>
                      {cafe.address && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {cafe.address}
                        </span>
                      )}
                      {km != null && (
                        <span className="block text-xs font-medium text-foreground">
                          {fmtDist(km)} dari kamu
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
        </CardContent>
      </Card>
    </aside>
  );
}
