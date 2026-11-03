export type CafeSpot = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address?: string;
};

export type PlaceResult = {
  label: string;
  lat: number;
  lng: number;
  bbox?: [number, number, number, number]; // west, south, east, north
};

interface RawPlace {
  lat: string;
  lon: string;
  display_name?: string;
  name?: string;
  boundingbox?: [string, string, string, string];
}

interface OverpassEl {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassRes {
  elements: OverpassEl[];
}

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

// Public Overpass mirrors. The main instance rate-limits aggressively, so on
// 429/504/5xx (or a network error) we fall through to the next mirror and
// retry the whole list once with a short backoff before giving up.
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function geocodePlaces(
  query: string,
  signal?: AbortSignal | null,
): Promise<PlaceResult[]> {
  const url = `${NOMINATIM_URL}?format=jsonv2&limit=5&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { signal });
  if (res.status === 403) {
    throw new Error("Pencarian lokasi dibatasi sementara, coba lagi sebentar.");
  }
  if (!res.ok) {
    throw new Error(`Gagal mencari lokasi (${res.status})`);
  }
  const data: RawPlace[] = await res.json();
  return data.map((p) => {
    const bbox = p.boundingbox
      ? ([Number(p.boundingbox[2]), Number(p.boundingbox[0]), Number(p.boundingbox[3]), Number(p.boundingbox[1])] as [number, number, number, number])
      : undefined;
    return {
      label: p.display_name ?? p.name ?? query,
      lat: Number(p.lat),
      lng: Number(p.lon),
      bbox,
    };
  });
}

async function overpassQuery(
  query: string,
  signal?: AbortSignal | null,
): Promise<OverpassRes> {
  let lastError: unknown = null;
  for (let round = 0; round < 2; round++) {
    for (const url of OVERPASS_ENDPOINTS) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: "data=" + encodeURIComponent(query),
          signal,
        });
        if (res.status === 429 || res.status === 504 || res.status >= 500) {
          lastError = new Error(`overpass ${res.status}`);
          await sleep(800);
          continue; // this mirror is busy — try the next one
        }
        if (!res.ok) {
          throw new Error(`Gagal memuat kafe (${res.status})`);
        }
        return (await res.json()) as OverpassRes;
      } catch (err) {
        if ((err as Error).name === "AbortError") throw err;
        if ((err as Error).message.startsWith("Gagal")) throw err;
        lastError = err; // network hiccup — try the next mirror
        await sleep(800);
      }
    }
  }
  console.error("Overpass failed on all endpoints:", lastError);
  throw new Error("Layanan kafe (OpenStreetMap) sibuk, coba lagi sebentar.");
}

export async function fetchCafesAround(
  lat: number,
  lng: number,
  radiusMeters: number,
  signal?: AbortSignal | null,
): Promise<CafeSpot[]> {
  const r = Math.min(Math.max(Math.round(radiusMeters), 500), 8000);
  const q = `[out:json][timeout:25];(node["amenity"="cafe"](around:${r},${lat},${lng});way["amenity"="cafe"](around:${r},${lat},${lng}););out center tags 200;`;
  const data = await overpassQuery(q, signal);
  return collectSpots(data);
}

// Cafes inside a [west, south, east, north] bbox — the right shape for a city
// search, since one circle can't cover a whole city.
async function fetchCafesInBbox(
  [w, s, e, n]: [number, number, number, number],
  signal?: AbortSignal | null,
): Promise<CafeSpot[]> {
  const q = `[out:json][timeout:25];(node["amenity"="cafe"](${s},${w},${n},${e});way["amenity"="cafe"](${s},${w},${n},${e}););out center tags 200;`;
  return collectSpots(await overpassQuery(q, signal));
}

// Pick the right search shape for a geocoded place.
export async function fetchCafesForPlace(
  place: PlaceResult,
  signal?: AbortSignal | null,
): Promise<CafeSpot[]> {
  if (!place.bbox) return fetchCafesAround(place.lat, place.lng, 2500, signal);
  const [w, s, e, n] = place.bbox;
  if (haversineKm(s, w, s, e) > 80 || haversineKm(s, w, n, w) > 80) {
    // province / country sized → just search around its center point
    return fetchCafesAround(place.lat, place.lng, 4000, signal);
  }
  return fetchCafesInBbox(place.bbox, signal);
}

// Nama yang jelas bukan kafe (warung makan / resto / kuliner spesifik) —
// OSM sering menagihnya amenity=cafe meski faktanya kedai makan.
const NOT_CAFE_RE =
  /\b(warung|rumah makan|restoran|bakso|soto|pecel|rawon|gado|sate|bubur|mie ayam|ayam geprek|ayam bakar|nasi (goreng|padang|uduk|kuning|box)|seafood|bebek|steak|pizza hut|kfc|mcdonald)\b/i;

function collectSpots(data: OverpassRes): CafeSpot[] {
  const seen = new Set<string>();
  const spots: CafeSpot[] = [];
  for (const el of data.elements) {
    const tags = el.tags ?? {};
    const lat2 = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat2 == null || lon == null) continue;
    const id = `${el.type}${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const name = tags.name ?? "Kafe Tanpa Nama";
    if (NOT_CAFE_RE.test(name)) continue;
    const address = [tags["addr:housenumber"], tags["addr:street"], tags["addr:city"]]
      .filter(Boolean)
      .join(", ");
    spots.push({
      id,
      name,
      lat: lat2,
      lng: lon,
      address: address || undefined,
    });
  }
  spots.sort((a, b) => a.name.localeCompare(b.name));
  return spots.slice(0, 150);
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
