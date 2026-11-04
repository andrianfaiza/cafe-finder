import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from "react";

/**
 * Snap points untuk bottom sheet (user spec): 
 * - collapsed: 100px (peek)
 * - half: 40% viewport height
 * - full: 80% viewport height
 */
export type DrawerSnap = "collapsed" | "half" | "full";

const SNAP_ORDER: readonly DrawerSnap[] = ["collapsed", "half", "full"] as const;

const COLLAPSED_PX = 100;
const HALF_RATIO = 0.4;
const FULL_RATIO = 0.8;

// Fliring threshold: > 0.35 px/ms dianggap swipe ke atas/bawah
const FLING_VELOCITY = 0.35;
// Momentum projection: kecepatan diproyeksikan sejauh ~90ms
const FLING_PROJECTION_MS = 90;

/** Hook matchMedia query untuk mendeteksi mobile vs desktop. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);

    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

type DragState = {
  active: boolean;
  startY: number;
  startH: number;
  lastY: number;
  lastH: number;
  lastT: number;
  velocity: number;
  moved: boolean;
};

/**
 * Bottom sheet dengan snap points dan gesture touch drag (tanpa library eksternal).
 * Returns:
 * - isMobile: true pada tampilan di bawah md breakpoint (768px)
 * - snap: status snap saat ini
 * - setSnap / cycleSnap: ubah snap atau cycle otomatis
 * - heightPx: tinggi actual (px), dipakai di style
 * - dragging: sedang drag/tidak
 * - bounds: nilai px per snap point
 * - touchProps: handler yang dipasang ke elemen drag (handle + header)
 */
export function useSnapDrawer(initialSnap: DrawerSnap = "half") {
  // Mobile? (Tailwind md breakpoint = 768px → max-width: 767.98px)
  const isMobile = useMediaQuery("(max-width: 767.98px)");

  // Track viewport height biar half/full update pas resize window
  const [viewportH, setViewportH] = useState<number>(() => window.innerHeight);
  useEffect(() => {
    const onResize = () => setViewportH(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const bounds: Record<DrawerSnap, number> = useMemo(
    () => ({
      collapsed: COLLAPSED_PX,
      half: Math.round(viewportH * HALF_RATIO),
      full: Math.round(viewportH * FULL_RATIO),
    }),
    [viewportH],
  );

  // Snap state & animasi
  const [snap, setSnapState] = useState<DrawerSnap>(initialSnap);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const heightPx = dragHeight ?? bounds[snap];
  const heightRef = useRef(heightPx);
  heightRef.current = heightPx;

  // Ref untuk tracking drag movement & velocity
  const drag = useRef<DragState>({
    active: false,
    startY: 0,
    startH: 0,
    lastY: 0,
    lastH: 0,
    lastT: performance.now(),
    velocity: 0,
    moved: false,
  });

  // Setter stable (tidak berubah identity tiap render)
  const setSnap = useCallback(
    (next: DrawerSnap) => {
      setSnapState(next);
      setDragHeight(null);
      setDragging(false);
      drag.current.active = false;
    },
    [],
  );

  const cycleSnap = useCallback(() => {
    setSnapState((current) => {
      const idx = SNAP_ORDER.indexOf(current);
      return SNAP_ORDER[(idx + 1) % SNAP_ORDER.length];
    });
    setDragHeight(null);
  }, []);

  /** Tentukan snap target berdasarkan posisi dan kecepatan release. */
  const snapForHeight = useCallback(
    (h: number, velocity: number): DrawerSnap => {
      // Jika ada velocity positif (ke atas), proyeksikan dulu
      const projected =
        Math.abs(velocity) >= FLING_VELOCITY ? h + velocity * FLING_PROJECTION_MS : h;

      let best: DrawerSnap = "collapsed";
      let bestDist = Number.POSITIVE_INFINITY;

      for (const s of SNAP_ORDER) {
        const d = Math.abs(bounds[s] - projected);
        if (d < bestDist) {
          bestDist = d;
          best = s;
        }
      }

      return best;
    },
    [bounds],
  );

  const clamp = useCallback((h: number) => Math.min(bounds.full, Math.max(bounds.collapsed, h)), [bounds]);

  // Touch handlers (attached to handle strip & optionally header area)
  const onTouchStart = useCallback((e: TouchEvent) => {
    // Hanya aktifkan pada mobile
    if (!isMobile) return;

    const y = e.touches[0].clientY;
    drag.current = {
      active: true,
      startY: y,
      startH: heightRef.current,
      lastY: y,
      lastH: heightRef.current,
      lastT: performance.now(),
      velocity: 0,
      moved: false,
    };
    setDragging(true);
  }, [isMobile]);

  const onTouchMove = useCallback(
    (e: TouchEvent) => {
      const d = drag.current;
      if (!d.active || !isMobile) return;

      const y = e.touches[0].clientY;
      const dy = d.startY - y; // positif = geser ke atas
      const h = clamp(d.startH + dy);

      const now = performance.now();
      const dt = now - d.lastT;
      if (dt > 0) {
        d.velocity = (h - d.lastH) / dt;
      }

      if (Math.abs(dy) > 6) {
        d.moved = true;
      }

      d.lastY = y;
      d.lastH = h;
      d.lastT = now;
      setDragHeight(h);
    },
    [clamp, isMobile],
  );

  const endDrag = useCallback(() => {
    const d = drag.current;
    if (!d.active || !isMobile) return;
    d.active = false;
    setDragging(false);
    setDragHeight(null);

    const finalH = d.lastH ?? heightRef.current;
    const targetSnap = snapForHeight(finalH, d.velocity);
    setSnapState(targetSnap);
  }, [isMobile, snapForHeight]);

  const touchProps = {
    onTouchStart,
    onTouchMove,
    onTouchEnd: endDrag,
    onTouchCancel: endDrag,
  };

  return {
    isMobile,
    snap,
    setSnap,
    cycleSnap,
    heightPx,
    dragging,
    bounds,
    touchProps,
  };
}
