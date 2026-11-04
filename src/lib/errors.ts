import type { MsgKey, Params } from "@/lib/i18n";

/**
 * Error yang membawa key pesan i18n, bukan string mentah.
 * Dilempar dari layer data (cafes.ts / routes.ts) yang tidak punya akses
 * ke React context, lalu diterjemahkan saat ditampilkan (translateError).
 */
export class AppError extends Error {
  key: MsgKey;
  params?: Params;

  constructor(key: MsgKey, params?: Params) {
    super(params ? `${key} ${JSON.stringify(params)}` : key);
    this.name = "AppError";
    this.key = key;
    this.params = params;
  }
}

/** Terjemahkan error apa pun menjadi teks sesuai bahasa aktif. */
export function translateError(
  err: unknown,
  t: (key: MsgKey, params?: Params) => string,
  fallbackKey: MsgKey = "error.generic",
): string {
  if (err instanceof AppError) return t(err.key, err.params);
  if (err instanceof Error && err.message) return err.message;
  return t(fallbackKey);
}
