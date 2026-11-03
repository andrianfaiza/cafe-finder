import { useEffect, useRef, useState } from "react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { Coffee, Loader2, Locate, Moon, Search, Sun, X } from "lucide-react";
import { Map, MapAccuracyCircle, MapMarker, MapRoute, MarkerContent, MarkerPopup } from "@/components/ui/map";
import type { MapRef } from "@/components/ui/map";
import { CafeList } from "@/components/CafeList";
import {
  fetchCafesAround,
  fetchCafesForPlace,
  geocodePlaces,
  haversineKm,
  type CafeSpot,
} from "@/lib/cafes";
import { fetchDrivingRoute, type RouteResult } from "@/lib/routes";
import { attachViewportCafes, type ViewportCafeLoader } from "@/lib/mapCafeLayer";
import { cn } from "@/lib/utils";

type UserPos = { lat: number; lng: number; accuracy?: number };

const DEFAULT_CENTER: [number, number] = [113.5, -6.2];
const DEFAULT_ZOOM = 4;

function requestPosition(): Promise<UserPos & { accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Browser tidak mendukung lokasi."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (err) => reject(new Error(err.code === 1 ? "Izin lokasi ditolak." : "Gagal mengambil lokasi.")),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });
}

export default function App() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [label, setLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cafes, setCafes] = useState<CafeSpot[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [userPos, setUserPos] = useState<UserPos | null>(null);
  const [sort, setSort] = useState<"near" | "far">("near");

  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routing, setRouting] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  const mapRef = useRef<MapRef | null>(null);
  const searchAbort = useRef<AbortController | null>(null);
  const routeAbort = useRef<AbortController | null>(null);
  const loaderRef = useRef<ViewportCafeLoader | null>(null);
  const cafesRef = useRef<CafeSpot[]>([]);
  cafesRef.current = cafes;
  const selectRef = useRef<(cafe: CafeSpot) => void>(() => {});

  // Pemuatan bounding box: hanya kafe di area peta yang sedang terlihat
  // yang diminta; tiap pan/zoom (moveend) layer viewport dimuat ulang.
  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    const timer = window.setInterval(() => {
      if (cancelled) return;
      const map = mapRef.current;
      if (!map) {
        if (++tries > 200) window.clearInterval(timer);
        return;
      }
      window.clearInterval(timer);
      loaderRef.current = attachViewportCafes(map, {
        getExcludeIds: () => new Set(cafesRef.current.map((c) => c.id)),
        onSelect: (spot) => {
          if (cafesRef.current.some((c) => c.id === spot.id)) {
            selectRef.current(spot);
          } else {
            map.easeTo({
              center: [spot.lng, spot.lat],
              zoom: Math.max(map.getZoom(), 12),
              duration: 500,
            });
          }
        },
      });
    }, 150);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      loaderRef.current?.detach();
      loaderRef.current = null;
    };
  }, []);

  // Kafe yang sudah ada di list (marker DOM berlabel) jangan digambar
  // ulang oleh layer viewport.
  useEffect(() => {
    loaderRef.current?.refresh();
  }, [cafes]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // Auto-locate saat buka app: GPS hidup, titik user + cari kafe sekitar.
  useEffect(() => {
    let watchId: number | null = null;
    let mounted = true;

    const start = async () => {
      try {
        const pos = await requestPosition();
        if (!mounted) return;
        setUserPos(pos);
        mapRef.current?.flyTo({ center: [pos.lng, pos.lat], zoom: 15, duration: 1000 });
        setLabel("Lokasi kamu");
        setError(null);
        runSearch((signal) => fetchCafesAround(pos.lat, pos.lng, 10000, signal));
      } catch {
        // Izin ditolak — biarkan default Indonesia.
      }
      if ("geolocation" in navigator && mounted) {
        watchId = navigator.geolocation.watchPosition(
          (p) => setUserPos({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
          () => {},
          { enableHighAccuracy: true, maximumAge: 60000 },
        );
      }
    };
    start();
    return () => {
      mounted = false;
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  useEffect(
    () => () => {
      searchAbort.current?.abort();
      routeAbort.current?.abort();
    },
    [],
  );

  const clearRoute = () => {
    routeAbort.current?.abort();
    routeAbort.current = null;
    setRoute(null);
    setRouting(false);
    setRouteError(null);
  };

  const runSearch = async (fn: (signal: AbortSignal) => Promise<CafeSpot[]>) => {
    searchAbort.current?.abort();
    const ac = new AbortController();
    searchAbort.current = ac;
    setSearching(true);
    setError(null);
    setSelectedId(null);
    clearRoute();
    try {
      const found = await fn(ac.signal);
      setCafes(found);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setCafes([]);
      setError((err as Error).message || "Terjadi kesalahan.");
    } finally {
      setSearching(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q || searching) return;
    searchAbort.current?.abort();
    setSearching(true);
    setError(null);
    setSelectedId(null);
    clearRoute();
    try {
      const places = await geocodePlaces(q);
      if (!places.length) {
        setError(`Tempat "${q}" tidak ditemukan. Coba nama kota lain.`);
        return;
      }
      const place = places[0];
      setLabel(place.label);
      if (place.bbox) {
        mapRef.current?.fitBounds(
          [
            [place.bbox[0], place.bbox[1]],
            [place.bbox[2], place.bbox[3]],
          ],
          { padding: 70, maxZoom: 15, duration: 1200 },
        );
      } else {
        mapRef.current?.flyTo({ center: [place.lng, place.lat], zoom: 14, duration: 1200 });
      }
      await runSearch((signal) => fetchCafesForPlace(place, signal));
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError((err as Error).message || "Gagal mencari tempat.");
    } finally {
      setSearching(false);
    }
  };

  const handleLocate = async () => {
    if (locating) return;
    searchAbort.current?.abort();
    setLocating(true);
    setError(null);
    clearRoute();
    try {
      const pos = await requestPosition();
      setUserPos(pos);
      mapRef.current?.flyTo({ center: [pos.lng, pos.lat], zoom: 15, duration: 1200 });
      setLabel("Lokasi kamu");
      setLocating(false);
      await runSearch((signal) => fetchCafesAround(pos.lat, pos.lng, 10000, signal));
    } catch (err) {
      setError((err as Error).message || "Gagal mengambil lokasi.");
    } finally {
      setLocating(false);
    }
  };

  const handleSelectCafe = async (cafe: CafeSpot) => {
    setSelectedId(cafe.id);
    clearRoute();

    let pos = userPos;
    if (!pos) {
      try {
        pos = await requestPosition();
        setUserPos(pos);
      } catch {
        setRouteError("Izinkan akses lokasi untuk membuat rute.");
        return;
      }
    }

    const ac = new AbortController();
    routeAbort.current = ac;
    setRouting(true);
    setRouteError(null);
    try {
      const r = await fetchDrivingRoute([pos.lng, pos.lat], [cafe.lng, cafe.lat], ac.signal);
      if (routeAbort.current === ac) {
        setRoute(r);
        // Fokus ke geometri rute sebenarnya (bukan hanya 2 titik) agar seperti Google Maps
        if (r.coordinates.length > 0) {
          mapRef.current?.fitBounds(r.coordinates as any, { padding: 90, maxZoom: 17, duration: 800 });
        } else {
          mapRef.current?.fitBounds(
            [[pos.lng, pos.lat], [cafe.lng, cafe.lat]],
            { padding: 90, duration: 800 },
          );
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setRouteError((err as Error).message || "Gagal membuat rute.");
        mapRef.current?.flyTo({ center: [cafe.lng, cafe.lat], zoom: 16, duration: 800 });
      }
    } finally {
      if (routeAbort.current === ac) setRouting(false);
    }
  };
  selectRef.current = handleSelectCafe;

  const handleClear = () => {
    setSelectedId(null);
    clearRoute();
  };

  const selectedCafe = cafes.find((c) => c.id === selectedId) ?? null;
  const distanceKm = route ? route.distanceM / 1000 : 0;
  const durationMin = route ? Math.max(1, Math.round(route.durationS / 60)) : 0;

  const straightLineLabel =
    userPos && selectedCafe
      ? `${haversineKm(userPos.lat, userPos.lng, selectedCafe.lat, selectedCafe.lng).toFixed(1)} km lurus`
      : "";

  return (
    <>
      <header className="sticky top-0 z-50 flex h-16 items-center gap-3 border-b border-border bg-background px-4">
        <a href="/" className="flex shrink-0 items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Coffee className="size-5" />
          </span>
          <span className="text-lg font-semibold tracking-tight">Cafe Finder</span>
        </a>

        <form onSubmit={handleSearch} className="mx-auto w-full max-w-[520px] flex-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari kota atau tempat… (mis. Bandung, Melbourne)"
              aria-label="Cari lokasi kafe"
              className="h-10 w-full rounded-full border border-input bg-secondary/60 pl-10 pr-14 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:bg-background"
            />
            <button
              type="submit"
              disabled={searching || !query.trim()}
              className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              aria-label="Cari"
            >
              {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            </button>
          </div>
        </form>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleLocate}
            disabled={locating}
            title="Pakai lokasi saya"
            aria-label="Pakai lokasi saya"
            className="flex size-9 items-center justify-center rounded-full border border-input bg-secondary/60 text-secondary-foreground transition-colors hover:bg-secondary disabled:opacity-60"
          >
            {locating ? <Loader2 className="size-4 animate-spin" /> : <Locate className="size-4" />}
          </button>
          <button
            type="button"
            onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
            title={theme === "light" ? "Mode gelap" : "Mode terang"}
            aria-label="Ganti tema"
            className="flex size-9 items-center justify-center rounded-full border border-input bg-secondary/60 text-secondary-foreground transition-colors hover:bg-secondary"
          >
            {theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
          </button>
        </div>
      </header>

      <main className="relative h-[calc(100vh-4rem)]">
        <Map ref={mapRef} center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} theme={theme}>
          {route && <MapRoute coordinates={route.coordinates} color="#2563eb" width={5} />}

          {userPos && (
            <>
              <MapAccuracyCircle
                latitude={userPos.lat}
                longitude={userPos.lng}
                radius={Math.max(userPos.accuracy ?? 30, 10)}
                fillColor="#2563eb22"
                strokeColor="#2563eb55"
              />
              <MapMarker latitude={userPos.lat} longitude={userPos.lng}>
                <MarkerContent>
                  <span className="relative flex size-5 items-center justify-center">
                    <span className="absolute inline-flex size-5 animate-ping rounded-full bg-blue-500/40" />
                    <span className="relative size-3.5 rounded-full border-2 border-white bg-blue-600 shadow-md" />
                  </span>
                </MarkerContent>
              </MapMarker>
            </>
          )}

          {cafes.map((cafe) => {
            const active = cafe.id === selectedId;
            return (
              <MapMarker
                key={cafe.id}
                latitude={cafe.lat}
                longitude={cafe.lng}
                anchor="bottom"
                onClick={(e) => {
              e.stopPropagation();
              handleSelectCafe(cafe);
            }}
              >
                <MarkerContent>
                  <span className="relative flex flex-col items-center">
                    {/* Label nama di atas pin agar titik pin tepat di lokasi kafe */}
                    <span
                      className={cn(
                        "pointer-events-none mb-1 max-w-[140px] truncate rounded-md bg-white/90 px-1.5 py-0.5 text-[11px] font-medium text-gray-800 shadow-sm ring-1 ring-black/5",
                        active && "bg-primary text-white ring-primary",
                      )}
                    >
                      {cafe.name}
                    </span>
                    <span
                      className={cn(
                        "flex size-9 items-center justify-center rounded-full border-2 text-white shadow-md transition-transform hover:scale-110",
                        active
                          ? "z-10 scale-110 border-white bg-primary"
                          : "border-white/70 bg-primary/80",
                      )}
                    >
                      <Coffee className="size-5" />
                    </span>
                  </span>
                </MarkerContent>
                {active && (
                  <MarkerPopup offset={28} open>
                    <div className="space-y-2 p-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-popover-foreground">
                          {cafe.name}
                        </h3>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(null);
                            clearRoute();
                          }}
                          aria-label="Tutup"
                          className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {cafe.address ?? "Alamat tidak tersedia"}
                      </p>
                      {straightLineLabel && (
                        <p className="text-xs text-muted-foreground">Jarak lurus {straightLineLabel}</p>
                      )}
                      {routing && (
                        <p className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="size-3.5 animate-spin" />
                          Membuat rute berkendara…
                        </p>
                      )}
                      {routeError && <p className="text-xs text-destructive">{routeError}</p>}
                      {route && (
                        <p className="text-sm font-medium text-foreground">
                          Rute berkendara: {distanceKm >= 1 ? `${distanceKm.toFixed(1)} km` : `${Math.round(route.distanceM)} m`} · ±{durationMin} mnt
                        </p>
                      )}
                    </div>
                  </MarkerPopup>
                )}
              </MapMarker>
            );
          })}
        </Map>
      </main>

      {label || searching || error ? (
        <CafeList
          cafes={cafes}
          label={label}
          loading={searching}
          error={error}
          selectedId={selectedId}
          userPos={userPos}
          sort={sort}
          onSelect={handleSelectCafe}
          onClose={handleClear}
          onSortChange={setSort}
        />
      ) : null}
      <SpeedInsights />
    </>
  );
}
