import type { VercelRequest, VercelResponse } from "@vercel/node";

interface NeoObject {
  name: string;
  is_potentially_hazardous_asteroid: boolean;
  estimated_diameter: {
    kilometers: { estimated_diameter_min: number; estimated_diameter_max: number };
  };
  close_approach_data: Array<{
    close_approach_date: string;
    relative_velocity: { kilometers_per_second: string };
    miss_distance: { astronomical: string; lunar: string; kilometers: string };
  }>;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const key = process.env.NASA_API_KEY;
  if (!key) {
    res.status(503).json({ error: "NASA_API_KEY is not configured on the server." });
    return;
  }

  const start = typeof req.query.start_date === "string" ? req.query.start_date : undefined;
  const end = typeof req.query.end_date === "string" ? req.query.end_date : undefined;

  const u = new URL("https://api.nasa.gov/neo/rest/v1/feed");
  u.searchParams.set("api_key", key);
  if (start) u.searchParams.set("start_date", start);
  if (end) u.searchParams.set("end_date", end);

  try {
    const r = await fetch(u.toString());
    if (!r.ok) {
      res.status(r.status).json({ error: `NASA NeoWs API returned ${r.status}` });
      return;
    }
    const data = (await r.json()) as {
      element_count: number;
      near_earth_objects: Record<string, NeoObject[]>;
    };

    const allNeos: NeoObject[] = Object.values(data.near_earth_objects).flat();
    const total: number = data.element_count ?? allNeos.length;
    const hazardous = allNeos.filter((n) => n.is_potentially_hazardous_asteroid).length;

    let closestNeo: NeoObject | null = null;
    let closestKm = Infinity;
    let fastestNeo: NeoObject | null = null;
    let fastestKps = 0;
    let largestNeo: NeoObject | null = null;
    let largestDiam = 0;

    for (const neo of allNeos) {
      const approach = neo.close_approach_data[0];
      if (!approach) continue;
      const km = parseFloat(approach.miss_distance.kilometers);
      const kps = parseFloat(approach.relative_velocity.kilometers_per_second);
      const diam = neo.estimated_diameter.kilometers.estimated_diameter_max;
      if (km < closestKm) { closestKm = km; closestNeo = neo; }
      if (kps > fastestKps) { fastestKps = kps; fastestNeo = neo; }
      if (diam > largestDiam) { largestDiam = diam; largestNeo = neo; }
    }

    const closestApproach = closestNeo?.close_approach_data[0];
    const closestLunar = closestApproach ? parseFloat(closestApproach.miss_distance.lunar) : null;

    let status: "NOMINAL" | "CLOSE APPROACH" | "POTENTIALLY HAZARDOUS" = "NOMINAL";
    if (hazardous > 0) status = "POTENTIALLY HAZARDOUS";
    else if (closestLunar !== null && closestLunar < 5) status = "CLOSE APPROACH";

    res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=1800");
    res.status(200).json({
      total,
      hazardous,
      status,
      closest: closestNeo
        ? {
            name: closestNeo.name,
            km: Math.round(closestKm),
            lunar: closestLunar !== null ? Math.round(closestLunar * 100) / 100 : null,
            date: closestApproach?.close_approach_date ?? null,
          }
        : null,
      fastest: fastestNeo
        ? { name: fastestNeo.name, km_s: Math.round(fastestKps * 10) / 10 }
        : null,
      largest: largestNeo
        ? { name: largestNeo.name, diameter_km_max: Math.round(largestDiam * 1000) / 1000 }
        : null,
    });
  } catch {
    res.status(502).json({ error: "Failed to reach NASA NeoWs API." });
  }
}
