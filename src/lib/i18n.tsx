import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Bahasa antarmuka. "in" = Indonesia, "en" = English.
 * Kode ini dipakai apa adanya di tombol switch (lowercase).
 */
export const LANGS = ["in", "en"] as const;
export type Lang = (typeof LANGS)[number];

/** Nilai atribut <html lang> yang benar untuk tiap bahasa UI. */
const HTML_LANG: Record<Lang, string> = { in: "id", en: "en" };

const LANG_STORAGE_KEY = "cafe-finder:lang";

export type Params = Record<string, string | number>;

/**
 * Sumber kebenaran kamus. Semua key di bawah HARUS ada di blok "en"
 * (dicek TypeScript lewat Record<MsgKey, string>).
 */
const inMessages = {
  "header.searchPlaceholder": "Cari kota atau tempat… (mis. Bandung, Melbourne)",
  "header.searchAria": "Cari lokasi kafe",
  "header.searchSubmitAria": "Cari",
  "header.langAria": "Ganti bahasa",
  "header.locateAria": "Pakai lokasi saya",
  "header.themeAria": "Ganti tema",
  "header.themeToDark": "Mode gelap",
  "header.themeToLight": "Mode terang",

  // Label sumber pencarian
  "label.myLocation": "Lokasi kamu",

  // Daftar kafe (CafeList)
  "list.results": "Hasil kafe",
  "list.searching": "Mencari kafe…",
  "list.nearest": "Terdekat",
  "list.farthest": "Terjauh",
  "list.nearestAria": "Urutkan terdekat dulu",
  "list.farthestAria": "Urutkan terjauh dulu",
  "list.closeAria": "Tutup hasil pencarian",
  "list.loadingIn": "Mencari kafe di sekitar {label}…",
  "list.thisArea": "area ini",
  "list.emptyIn": "Tidak ada kafe ditemukan di sekitar {label}.",
  "list.emptyHint": "Coba nama kota lain atau geser peta lalu cari lagi.",
  "list.unnamedCafe": "Kafe Tanpa Nama",
  "list.fromYou": "dari kamu",

  // Bottom sheet
  "drawer.handleAria": "Geser ke atas untuk membuka, ke bawah untuk menutup",

  // Popup marker peta
  "popup.noAddress": "Alamat tidak tersedia",
  "popup.straightLine": "Jarak lurus {dist}",
  "popup.routing": "Membuat rute berkendara…",
  "popup.route": "Rute berkendara: {dist} · ±{mins} mnt",
  "popup.closeAria": "Tutup",

  // Pesan error (dilempar sebagai AppError, diterjemahkan saat ditampilkan)
  "error.geoUnsupported": "Browser tidak mendukung lokasi.",
  "error.geoDenied": "Izin lokasi ditolak.",
  "error.geoFailed": "Gagal mengambil lokasi.",
  "error.generic": "Terjadi kesalahan.",
  "error.placeNotFound": 'Tempat "{q}" tidak ditemukan. Coba nama kota lain.',
  "error.placeSearch": "Gagal mencari tempat.",
  "error.geoRateLimited": "Pencarian lokasi dibatasi sementara, coba lagi sebentar.",
  "error.geoStatus": "Gagal mencari lokasi ({status})",
  "error.cafeStatus": "Gagal memuat kafe ({status})",
  "error.cafeBusy": "Layanan kafe (OpenStreetMap) sibuk, coba lagi sebentar.",
  "error.routeNeedLocation": "Izinkan akses lokasi untuk membuat rute.",
  "error.routeFailed": "Gagal membuat rute.",
  "error.routeStatus": "Gagal membuat rute ({status})",
  "error.routeNotFound": "Rute berkendara tidak ditemukan untuk lokasi ini.",
} as const;

export type MsgKey = keyof typeof inMessages;

const enMessages: Record<MsgKey, string> = {
  // Header
  "header.searchPlaceholder": "Search city or place… (e.g. Bandung, Melbourne)",
  "header.searchAria": "Search cafe locations",
  "header.searchSubmitAria": "Search",
  "header.langAria": "Switch language",
  "header.locateAria": "Use my location",
  "header.themeAria": "Toggle theme",
  "header.themeToDark": "Dark mode",
  "header.themeToLight": "Light mode",

  // Search source label
  "label.myLocation": "Your location",

  // Cafe list
  "list.results": "Cafe results",
  "list.searching": "Searching for cafés…",
  "list.nearest": "Nearest",
  "list.farthest": "Farthest",
  "list.nearestAria": "Sort by nearest first",
  "list.farthestAria": "Sort by farthest first",
  "list.closeAria": "Close search results",
  "list.loadingIn": "Searching for cafés around {label}…",
  "list.thisArea": "this area",
  "list.emptyIn": "No cafés found around {label}.",
  "list.emptyHint": "Try another city name, or pan the map and search again.",
  "list.unnamedCafe": "Unnamed Cafe",
  "list.fromYou": "from you",

  // Bottom sheet
  "drawer.handleAria": "Drag up to open, drag down to close",

  // Map marker popup
  "popup.noAddress": "Address unavailable",
  "popup.straightLine": "Straight-line distance {dist}",
  "popup.routing": "Building driving route…",
  "popup.route": "Driving route: {dist} · ~{mins} min",
  "popup.closeAria": "Close",

  // Errors
  "error.geoUnsupported": "This browser doesn't support geolocation.",
  "error.geoDenied": "Location permission denied.",
  "error.geoFailed": "Failed to get your location.",
  "error.generic": "Something went wrong.",
  "error.placeNotFound": 'Place "{q}" not found. Try another city name.',
  "error.placeSearch": "Failed to search places.",
  "error.geoRateLimited":
    "Location search is rate-limited right now. Please try again in a moment.",
  "error.geoStatus": "Failed to search location ({status})",
  "error.cafeStatus": "Failed to load cafes ({status})",
  "error.cafeBusy":
    "The cafe service (OpenStreetMap) is busy, please try again in a moment.",
  "error.routeNeedLocation": "Allow location access to create a route.",
  "error.routeFailed": "Failed to create route.",
  "error.routeStatus": "Failed to create route ({status})",
  "error.routeNotFound": "No driving route found for this location.",
};

const messages: Record<Lang, Record<MsgKey, string>> = {
  in: inMessages,
  en: enMessages,
};

/** Terjemahkan satu key + interpolasi {param}. */
export function translate(lang: Lang, key: MsgKey, params?: Params): string {
  let out: string = messages[lang][key] ?? messages.in[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      out = out.replaceAll(`{${name}}`, String(value));
    }
  }
  return out;
}

export type TFunc = (key: MsgKey, params?: Params) => string;

type LangContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
  t: TFunc;
};

const LangContext = createContext<LangContextValue | null>(null);

function readStoredLang(): Lang {
  try {
    const saved = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === "en" || saved === "in") return saved;
  } catch {
    // private mode / storage diblokir — pakai default
  }
  return "in";
}

export function LangProvider({
  children,
  initialLang,
}: {
  children: ReactNode;
  initialLang?: Lang;
}) {
  const [lang, setLang] = useState<Lang>(() => initialLang ?? readStoredLang());

  useEffect(() => {
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
      // abaikan
    }
    document.documentElement.lang = HTML_LANG[lang];
  }, [lang]);

  const t = useCallback<TFunc>((key, params) => translate(lang, key, params), [lang]);

  const toggleLang = useCallback(
    () => setLang((prev) => (prev === "in" ? "en" : "in")),
    [],
  );

  const value = useMemo<LangContextValue>(
    () => ({ lang, setLang, toggleLang, t }),
    [lang, toggleLang, t],
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

/** Akses bahasa aktif + penerjemah. Wajib di dalam <LangProvider>. */
export function useLang(): LangContextValue {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang() harus dipakai di dalam <LangProvider>");
  return ctx;
}
