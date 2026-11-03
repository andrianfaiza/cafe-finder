import type { GeoJSONSource, MapLayerMouseEvent } from "maplibre-gl";
import type * as GeoJSON from "geojson";
import type { MapRef } from "@/components/ui/map";
import { fetchCafesInViewport, type CafeSpot } from "@/lib/cafes";

// Layer kafe berbasis bounding box: hanya area yang terlihat di viewport
// yang diminta ke Overpass, tiap pan/zoom (moveend) data dimuat ulang.
const VIEWPORT_SOURCE = "viewport-cafes";
const ICON_LAYER = "viewport-cafes-icon";
const LABEL_LAYER = "viewport-cafes-label";
const LOGO_ID = "cafe-logo";

type BBox = [number, number, number, number]; // w, s, e, n

const EMPTY_FC: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

function addLogoIcon(map: MapRef) {
  if (map.hasImage(LOGO_ID)) return;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
  ctx.fillStyle = "#2563eb";
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.font = `${Math.round(size * 0.48)}px "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("☕", size / 2, size / 2 + 2);
  const img = ctx.getImageData(0, 0, size, size);
  map.addImage(LOGO_ID, img, { pixelRatio: 2 });
}

// Ambil fontstack yang benar-benar dipakai style aktif (karto host fonts
// sendiri; menebak nama font lain bikin glyph 404 dan label hilang).
function resolveTextFont(map: MapRef): string[] | null {
  const style = map.getStyle() as { glyphs?: string; layers?: { layout?: Record<string, unknown> }[] };
  if (!style?.glyphs) return null;
  for (const layer of style.layers ?? []) {
    const tf = layer.layout?.["text-font"];
    if (Array.isArray(tf) && tf.length) return tf as string[];
  }
  return null;
}

function subBoxes(b: BBox, cols: number, rows: number): BBox[] {
  if (cols <= 1 && rows <= 1) return [b];
  const [w, s, e, n] = b;
  const out: BBox[] = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      out.push([
        w + ((e - w) * i) / cols,
        s + ((n - s) * j) / rows,
        w + ((e - w) * (i + 1)) / cols,
        s + ((n - s) * (j + 1)) / rows,
      ]);
    }
  }
  return out;
}

export type ViewportCafeLoader = {
  // Render ulang cache dengan excludeIds terbaru (tanpa fetch ulang).
  refresh: () => void;
  detach: () => void;
};

export function attachViewportCafes(
  map: MapRef,
  opts: {
    getExcludeIds?: () => Set<string>;
    onSelect?: (spot: CafeSpot) => void;
  } = {},
): ViewportCafeLoader {
  let lastSpots: CafeSpot[] = [];
  let debounce: number | undefined;
  let ac: AbortController | null = null;
  let destroyed = false;

  const render = () => {
    const src = map.getSource(VIEWPORT_SOURCE) as GeoJSONSource | undefined;
    if (!src) return;
    const exclude = opts.getExcludeIds?.() ?? new Set<string>();
    const spots = exclude.size
      ? lastSpots.filter((c) => !exclude.has(c.id))
      : lastSpots;
    src.setData({
      type: "FeatureCollection",
      features: spots.map((c) => ({
        type: "Feature",
        properties: { id: c.id, name: c.name },
        geometry: { type: "Point", coordinates: [c.lng, c.lat] },
      })),
    } as GeoJSON.FeatureCollection);
  };

  const load = async () => {
    if (destroyed) return;
    const bounds = map.getBounds();
    const w = Math.max(-180, bounds.getWest());
    const e = Math.min(180, bounds.getEast());
    const s = Math.max(-85, bounds.getSouth());
    const n = Math.min(85, bounds.getNorth());
    if (e <= w || n <= s) return;
    const zoom = map.getZoom();
    ac?.abort();
    ac = new AbortController();
    const { signal } = ac;
    try {
      // Zoom jauh: bagi viewport jadi 4 box biar distribusinya merata
      // (satu query dunia besar cuma mengembalikan cafe 'paling awal').
      const [cols, rows] = zoom < 9 ? [2, 2] : [1, 1];
      const limitPerBox = zoom < 9 ? 120 : 240;
      const boxes = subBoxes([w, s, e, n], cols, rows);
      const groups = await Promise.all(
        boxes.map((b) => fetchCafesInViewport(b, signal, limitPerBox).catch(() => [] as CafeSpot[])),
      );
      if (destroyed || signal.aborted) return;
      const seen = new Set<string>();
      const spots: CafeSpot[] = [];
      for (const g of groups) {
        for (const c of g) {
          if (!seen.has(c.id)) {
            seen.add(c.id);
            spots.push(c);
          }
        }
      }
      lastSpots = spots;
      render();
    } catch {
      // abort / semua mirror gagal — biarkan layer sebelumnya bertahan
    }
  };

  const scheduleLoad = () => {
    window.clearTimeout(debounce);
    debounce = window.setTimeout(load, 450);
  };

  const setUp = () => {
    if (destroyed || map.isStyleLoaded?.() === false) return;
    addLogoIcon(map);
    if (!map.getSource(VIEWPORT_SOURCE)) {
      map.addSource(VIEWPORT_SOURCE, { type: "geojson", data: EMPTY_FC });
    }
    if (!map.getLayer(ICON_LAYER)) {
      map.addLayer({
        id: ICON_LAYER,
        type: "symbol",
        source: VIEWPORT_SOURCE,
        layout: {
          "icon-image": LOGO_ID,
          "icon-size": ["interpolate", ["linear"], ["zoom"], 4, 0.4, 8, 0.55, 12, 0.8, 16, 0.9],
          "icon-allow-overlap": false,
        },
      });
    }
    const font = resolveTextFont(map);
    if (font && !map.getLayer(LABEL_LAYER)) {
      map.addLayer({
        id: LABEL_LAYER,
        type: "symbol",
        source: VIEWPORT_SOURCE,
        minzoom: 12,
        layout: {
          "text-field": ["get", "name"],
          "text-font": font,
          "text-size": 11,
          "text-offset": [0, 1.1],
          "text-anchor": "top",
          "text-optional": true,
        },
      });
    }
    render();
  };

  const onMoveEnd = () => scheduleLoad();

  // Ganti tema = setStyle ulang → source/layer custom hilang; pasang lagi
  // saat style idle berikutnya, data pakai cache (tidak fetch ulang).
  const onStyleIdle = () => {
    if (!map.getLayer(ICON_LAYER)) setUp();
  };

  const onClick = (e: MapLayerMouseEvent) => {
    const id = String(e.features?.[0]?.properties?.id ?? "");
    const spot = lastSpots.find((c) => c.id === id);
    if (spot) opts.onSelect?.(spot);
  };

  const onEnter = () => {
    map.getCanvas().style.cursor = "pointer";
  };
  const onLeave = () => {
    map.getCanvas().style.cursor = "";
  };

  if (map.isStyleLoaded()) {
    setUp();
  } else {
    map.once("load", setUp);
  }
  map.on("idle", onStyleIdle);
  map.on("moveend", onMoveEnd);
  map.on("click", ICON_LAYER, onClick);
  map.on("mouseenter", ICON_LAYER, onEnter);
  map.on("mouseleave", ICON_LAYER, onLeave);
  scheduleLoad();

  return {
    refresh: render,
    detach: () => {
      destroyed = true;
      window.clearTimeout(debounce);
      ac?.abort();
      map.off("idle", onStyleIdle);
      map.off("moveend", onMoveEnd);
      map.off("click", ICON_LAYER, onClick);
      map.off("mouseenter", ICON_LAYER, onEnter);
      map.off("mouseleave", ICON_LAYER, onLeave);
      if (map.getLayer(LABEL_LAYER)) map.removeLayer(LABEL_LAYER);
      if (map.getLayer(ICON_LAYER)) map.removeLayer(ICON_LAYER);
      if (map.getSource(VIEWPORT_SOURCE)) map.removeSource(VIEWPORT_SOURCE);
    },
  };
}
