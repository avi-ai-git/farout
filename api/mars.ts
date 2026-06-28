import type { VercelRequest, VercelResponse } from "@vercel/node";

interface MarsPhoto {
  id: number;
  sol: number;
  img_src: string;
  earth_date: string;
  camera: { name: string; full_name: string };
  rover: { name: string; status: string; max_date: string; max_sol: number; landing_date: string };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// Order matters: most-active first. Curiosity has shot daily since 2012; Perseverance since 2021.
const ROVERS = ["curiosity", "perseverance"] as const;

function pickRepresentative(photos: MarsPhoto[], max: number): MarsPhoto[] {
  if (photos.length <= max) return photos;
  // Diversify across cameras when possible.
  const byCamera = new Map<string, MarsPhoto[]>();
  for (const p of photos) {
    const k = p.camera?.name || "_";
    if (!byCamera.has(k)) byCamera.set(k, []);
    byCamera.get(k)!.push(p);
  }
  const out: MarsPhoto[] = [];
  const cameras = Array.from(byCamera.values());
  let i = 0;
  while (out.length < max && cameras.some((c) => c.length > 0)) {
    const c = cameras[i % cameras.length];
    if (c.length > 0) out.push(c.shift()!);
    i++;
  }
  return out;
}

function shape(photos: MarsPhoto[], rover: string, requestedDate: string | undefined, isFallback: boolean) {
  const picked = pickRepresentative(photos, 9);
  const first = picked[0];
  return {
    rover,
    count: photos.length,
    earthDate: first?.earth_date ?? null,
    sol: first?.sol ?? null,
    requestedDate: requestedDate ?? null,
    isFallback,
    photos: picked.map((p) => ({
      id: p.id,
      // EPIC and Mars Rovers API return http:// URLs for some images; force https.
      url: p.img_src.replace(/^http:\/\//, "https://"),
      sol: p.sol,
      earthDate: p.earth_date,
      cameraName: p.camera?.name ?? null,
      cameraFullName: p.camera?.full_name ?? null,
    })),
  };
}

async function fetchPhotos(rover: string, earthDate: string | undefined, key: string): Promise<MarsPhoto[]> {
  const url = earthDate
    ? new URL(`https://api.nasa.gov/mars-photos/api/v1/rovers/${rover}/photos`)
    : new URL(`https://api.nasa.gov/mars-photos/api/v1/rovers/${rover}/latest_photos`);
  url.searchParams.set("api_key", key);
  if (earthDate) url.searchParams.set("earth_date", earthDate);
  const r = await fetch(url.toString());
  if (!r.ok) return [];
  const data = (await r.json()) as { photos?: MarsPhoto[]; latest_photos?: MarsPhoto[] };
  return data.photos ?? data.latest_photos ?? [];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const key = process.env.NASA_API_KEY;
  if (!key) {
    res.status(503).json({ error: "NASA_API_KEY is not configured on the server." });
    return;
  }

  const requestedDate =
    typeof req.query.date === "string" && ISO_DATE.test(req.query.date)
      ? req.query.date
      : undefined;

  try {
    if (requestedDate) {
      for (const rover of ROVERS) {
        const photos = await fetchPhotos(rover, requestedDate, key);
        if (photos.length > 0) {
          res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
          res.status(200).json(shape(photos, rover, requestedDate, false));
          return;
        }
      }
    }

    // Fallback: latest_photos from the first rover that returns any.
    for (const rover of ROVERS) {
      const photos = await fetchPhotos(rover, undefined, key);
      if (photos.length > 0) {
        res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=7200");
        res.status(200).json(shape(photos, rover, requestedDate, requestedDate !== undefined));
        return;
      }
    }

    res.status(404).json({ error: "No Mars rover imagery available." });
  } catch {
    res.status(502).json({ error: "Failed to reach NASA Mars Rovers API." });
  }
}
