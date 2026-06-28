import type { VercelRequest, VercelResponse } from "@vercel/node";

// Lightweight health endpoint. Reports whether the NASA key is configured and
// pings the public NASA endpoints we depend on with HEAD-equivalent calls.
// Intended for uptime monitors and quick "is everything wired up?" checks —
// not a deep healthcheck.

interface ProbeResult {
  ok: boolean;
  status: number | null;
  ms: number;
  error?: string;
}

async function probe(url: string, ms: number = 4000): Promise<ProbeResult> {
  const start = Date.now();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    return { ok: r.ok, status: r.status, ms: Date.now() - start };
  } catch (e) {
    return { ok: false, status: null, ms: Date.now() - start, error: e instanceof Error ? e.name : "error" };
  } finally {
    clearTimeout(t);
  }
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const key = process.env.NASA_API_KEY;
  const haveKey = typeof key === "string" && key.length > 0;
  const usedKey = haveKey ? key : "DEMO_KEY";

  const checks = await Promise.all([
    probe(`https://api.nasa.gov/planetary/apod?api_key=${usedKey}`),
    probe(`https://api.nasa.gov/neo/rest/v1/feed/today?api_key=${usedKey}`),
    probe(`https://api.nasa.gov/EPIC/api/natural?api_key=${usedKey}`),
    probe(`https://images-api.nasa.gov/search?q=earth&media_type=image`),
    probe(`https://api.nasa.gov/mars-photos/api/v1/rovers/curiosity/latest_photos?api_key=${usedKey}`),
  ]);

  const [apod, neows, epic, library, mars] = checks;
  const allOk = checks.every((c) => c.ok);

  res.setHeader("Cache-Control", "no-store");
  res.status(allOk ? 200 : 503).json({
    ok: allOk,
    apiKey: haveKey ? "configured" : "missing (using DEMO_KEY)",
    upstream: { apod, neows, epic, library, mars },
    generatedAt: new Date().toISOString(),
  });
}
