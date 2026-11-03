export type RouteResult = {
  coordinates: [number, number][]; // [lng, lat] pairs — same order MapLibre uses
  distanceM: number;
  durationS: number;
};

// Driving directions via the free public OSRM demo server (no key needed).
export async function fetchDrivingRoute(
  from: [number, number],
  to: [number, number],
  signal?: AbortSignal | null,
): Promise<RouteResult> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson&alternatives=3`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Gagal membuat rute (${res.status})`);
  }
  const data = await res.json();
  if (data.code !== "Ok" || !data.routes?.length) {
    throw new Error("Rute berkendara tidak ditemukan untuk lokasi ini.");
  }
  // Pilih rute terdekat (jarak terpendek) di antaranya seperti Google Maps
  const route = data.routes.reduce(
    (best: typeof data.routes[0], r: typeof data.routes[0]) =>
      r.distance <= best.distance ? r : best,
    data.routes[0],
  );
  return {
    coordinates: route.geometry.coordinates as [number, number][],
    distanceM: route.distance,
    durationS: route.duration,
  };
}
