import { z } from "zod";
import type { LatLng, TravelMatrix } from "./types";

/**
 * Routing providers: the only source of drive times and distances (spec 03
 * §4 "never fabricate travel estimates"). The Mapbox adapter stays off until
 * a token is configured on the server; the sample provider exists only for
 * the labelled practice comparison with sample stores.
 *
 * Mapbox terms: geocoding here is "temporary" (the default), whose results
 * may not be stored or cached — the starting point is geocoded per
 * comparison and thrown away. Matrix results are used for that comparison only.
 */

export interface RoutingStop {
  key: string;
  location: LatLng;
}

export type RoutingErrorKind = "not_configured" | "auth" | "rate_limited" | "unavailable" | "bad_request" | "no_route";

export class RoutingError extends Error {
  constructor(
    message: string,
    readonly kind: RoutingErrorKind,
  ) {
    super(message);
    this.name = "RoutingError";
  }
}

export interface RoutingProvider {
  readonly id: string;
  readonly displayName: string;
  readonly isSample: boolean;
  matrix(start: LatLng, stops: readonly RoutingStop[]): Promise<TravelMatrix>;
  /** Address or ZIP → coordinates (not stored). */
  geocode(text: string): Promise<LatLng | null>;
}

export function validLatLng(p: unknown): p is LatLng {
  const v = p as LatLng;
  return Boolean(v) && Number.isFinite(v.lat) && Number.isFinite(v.lng) && Math.abs(v.lat) <= 90 && Math.abs(v.lng) <= 180;
}

// ---------------------------------------------------------------------------
// Mapbox (Matrix API v1 + Geocoding API v6)
// ---------------------------------------------------------------------------
const cell = z.number().nonnegative().finite().nullable();
const matrixResponse = z.object({
  code: z.string(),
  durations: z.array(z.array(cell)).optional(),
  distances: z.array(z.array(cell)).optional(),
  message: z.string().optional(),
});
const geocodeResponse = z.object({
  features: z
    .array(z.object({ geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }).optional() }))
    .default([]),
});

export interface MapboxConfig {
  accessToken: string;
  /** "mapbox/driving" (up to 25 points) — traffic-aware routing allows only 10. */
  profile?: "mapbox/driving" | "mapbox/driving-traffic";
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  now?: () => Date;
}

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

export class MapboxRoutingProvider implements RoutingProvider {
  readonly id = "mapbox";
  readonly displayName = "Mapbox";
  readonly isSample = false;
  private readonly profile: string;
  private readonly base: string;
  private readonly http: typeof fetch;

  constructor(private readonly config: MapboxConfig) {
    if (!config.accessToken) throw new RoutingError("Routing isn't configured.", "not_configured");
    this.profile = config.profile ?? "mapbox/driving";
    this.base = (config.baseUrl ?? "https://api.mapbox.com").replace(/\/$/, "");
    this.http = config.fetch ?? fetch;
  }

  private async get(url: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 8000);
    let res: Response;
    try {
      res = await this.http(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    } catch {
      throw new RoutingError("The routing service didn't respond.", "unavailable");
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401 || res.status === 403) throw new RoutingError("The routing service rejected the access token.", "auth");
    if (res.status === 429) throw new RoutingError("Too many route lookups right now. Try again in a minute.", "rate_limited");
    if (res.status === 422) throw new RoutingError("The routing service couldn't use those locations.", "bad_request");
    if (!res.ok) throw new RoutingError("The routing service isn't available right now.", "unavailable");
    try {
      return await res.json();
    } catch {
      throw new RoutingError("Unexpected answer from the routing service.", "unavailable");
    }
  }

  async matrix(start: LatLng, stops: readonly RoutingStop[]): Promise<TravelMatrix> {
    const max = this.profile === "mapbox/driving-traffic" ? 10 : 25;
    if (stops.length === 0) throw new RoutingError("No stores to route.", "bad_request");
    if (stops.length + 1 > max) throw new RoutingError(`At most ${max - 1} stores can be routed at once.`, "bad_request");
    const points = [start, ...stops.map((s) => s.location)];
    if (!points.every(validLatLng)) throw new RoutingError("A location is missing coordinates.", "bad_request");
    const coords = points.map((p) => `${round5(p.lng)},${round5(p.lat)}`).join(";");
    const url = `${this.base}/directions-matrix/v1/${this.profile}/${coords}?annotations=duration,distance&access_token=${encodeURIComponent(this.config.accessToken)}`;
    const parsed = matrixResponse.safeParse(await this.get(url));
    if (!parsed.success) throw new RoutingError("Unexpected answer from the routing service.", "unavailable");
    const { code, durations, distances } = parsed.data;
    if (code === "NoRoute") throw new RoutingError("No drive route was found between those places.", "no_route");
    const n = points.length;
    const square = (m: (number | null)[][] | undefined) => Boolean(m) && m!.length === n && m!.every((r) => r.length === n);
    if (code !== "Ok" || !square(durations) || !square(distances)) throw new RoutingError("Unexpected answer from the routing service.", "unavailable");
    return {
      provider: this.id,
      isSample: false,
      observedAt: (this.config.now ?? (() => new Date()))().toISOString(),
      storeKeys: stops.map((s) => s.key),
      seconds: durations!,
      meters: distances!,
    };
  }

  async geocode(text: string): Promise<LatLng | null> {
    const q = text.replace(/;/g, " ").replace(/\s+/g, " ").trim().split(" ").slice(0, 20).join(" ").slice(0, 256);
    if (q.length < 3) return null;
    // permanent=false (the default): results are used once and not stored.
    const url = `${this.base}/search/geocode/v6/forward?q=${encodeURIComponent(q)}&country=us&types=address,street,postcode,place&limit=1&access_token=${encodeURIComponent(this.config.accessToken)}`;
    const parsed = geocodeResponse.safeParse(await this.get(url));
    if (!parsed.success) throw new RoutingError("Unexpected answer from the routing service.", "unavailable");
    const c = parsed.data.features[0]?.geometry?.coordinates;
    if (!c) return null;
    const p = { lng: c[0], lat: c[1] };
    return validLatLng(p) ? p : null;
  }
}

// ---------------------------------------------------------------------------
// Sample routing — practice mode only, always labelled
// ---------------------------------------------------------------------------
/**
 * SAMPLE drive times between the three sample stores and a sample home.
 * Not real places and not real travel times. It refuses any store that
 * isn't a sample store, so it can never be used with real stores.
 */
export class SampleRoutingProvider implements RoutingProvider {
  readonly id = "sample";
  readonly displayName = "Sample drive times (not real)";
  readonly isSample = true;
  constructor(private readonly now: () => Date = () => new Date()) {}

  /** Index 0 = sample home; then sample stores A, B, C. Minutes and miles. */
  static readonly MINUTES = [
    [0, 8, 12, 10],
    [8, 0, 9, 6],
    [12, 9, 0, 7],
    [10, 6, 7, 0],
  ];
  static readonly MILES = [
    [0, 3.1, 5.0, 4.2],
    [3.1, 0, 3.6, 2.4],
    [5.0, 3.6, 0, 2.9],
    [4.2, 2.4, 2.9, 0],
  ];
  static readonly KEYS = ["sample:store-a", "sample:store-b", "sample:store-c"];

  async matrix(_start: LatLng, stops: readonly RoutingStop[]): Promise<TravelMatrix> {
    const idx = stops.map((s) => SampleRoutingProvider.KEYS.indexOf(s.key) + 1);
    if (idx.some((i) => i === 0)) throw new RoutingError("Sample drive times only cover the sample stores.", "bad_request");
    const all = [0, ...idx];
    return {
      provider: this.id,
      isSample: true,
      observedAt: this.now().toISOString(),
      storeKeys: stops.map((s) => s.key),
      seconds: all.map((i) => all.map((j) => SampleRoutingProvider.MINUTES[i]![j]! * 60)),
      meters: all.map((i) => all.map((j) => Math.round(SampleRoutingProvider.MILES[i]![j]! * 1609.344))),
    };
  }

  async geocode(): Promise<LatLng | null> {
    return { lat: 0, lng: 0 };
  }
}
