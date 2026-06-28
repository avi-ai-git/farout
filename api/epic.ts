import type { VercelRequest, VercelResponse } from "@vercel/node";

interface EpicImage {
  identifier: string;
  caption: string;
  image: string;
  date: string;
  centroid_coordinates?: { lat: number; lon: number };
}

interface EpicAvailableDate {
  date: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function imageUrlFor(image: EpicImage): string {
  const dateParts = image.date.split(" ")[0].split("-");
  const [yyyy, mm, dd] = dateParts;
  return `https://epic.gsfc.nasa.gov/archive/natural/${yyyy}/${mm}/${dd}/png/${image.image}.png`;
}

function buildResponse(latest: EpicImage, requestedDate: string | undefined, isFallback: boolean, requestedDateHadNoImagery: boolean) {
  const dateParts = latest.date.split(" ")[0].split("-");
  const [yyyy, mm, dd] = dateParts;
  return {
    imageUrl: imageUrlFor(latest),
    identifier: latest.identifier,
    imageName: latest.image,
    date: latest.date,
    caption: latest.caption || null,
    centroid: latest.centroid_coordinates
      ? {
          lat: Math.round(latest.centroid_coordinates.lat * 10) / 10,
          lon: Math.round(latest.centroid_coordinates.lon * 10) / 10,
        }
      : null,
    source: "NASA EPIC / DSCOVR",
    archiveDate: `${yyyy}/${mm}/${dd}`,
    requestedDate: requestedDate ?? null,
    isFallback,
    fallbackReason: isFallback
      ? requestedDateHadNoImagery
        ? "no_imagery_for_requested_date"
        : "epic_processing_delay"
      : null,
  };
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
      const dateUrl = new URL(`https://api.nasa.gov/EPIC/api/natural/date/${requestedDate}`);
      dateUrl.searchParams.set("api_key", key);
      const dateRes = await fetch(dateUrl.toString());
      if (dateRes.ok) {
        const images = (await dateRes.json()) as EpicImage[];
        if (Array.isArray(images) && images.length > 0) {
          res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
          res.status(200).json(buildResponse(images[Math.floor(images.length / 2)], requestedDate, false, false));
          return;
        }
      }

      // No imagery for requested date — find the nearest available date on or before it.
      const allUrl = new URL("https://api.nasa.gov/EPIC/api/natural/all");
      allUrl.searchParams.set("api_key", key);
      const allRes = await fetch(allUrl.toString());
      if (allRes.ok) {
        const dates = (await allRes.json()) as EpicAvailableDate[];
        if (Array.isArray(dates) && dates.length > 0) {
          // dates are returned newest first as { date: "YYYY-MM-DD" }
          const onOrBefore = dates
            .map((d) => d.date)
            .filter((d) => typeof d === "string" && d <= requestedDate)
            .sort()
            .reverse();
          const nearest = onOrBefore[0] ?? dates[0].date;
          const nearestUrl = new URL(`https://api.nasa.gov/EPIC/api/natural/date/${nearest}`);
          nearestUrl.searchParams.set("api_key", key);
          const nearestRes = await fetch(nearestUrl.toString());
          if (nearestRes.ok) {
            const images = (await nearestRes.json()) as EpicImage[];
            if (Array.isArray(images) && images.length > 0) {
              res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
              res.status(200).json(buildResponse(images[Math.floor(images.length / 2)], requestedDate, true, true));
              return;
            }
          }
        }
      }
    }

    // No requested date or fallbacks exhausted — return latest available.
    const metaUrl = new URL("https://api.nasa.gov/EPIC/api/natural");
    metaUrl.searchParams.set("api_key", key);

    const metaRes = await fetch(metaUrl.toString());
    if (!metaRes.ok) {
      res.status(metaRes.status).json({ error: `NASA EPIC API returned ${metaRes.status}` });
      return;
    }

    const images = (await metaRes.json()) as EpicImage[];
    if (!Array.isArray(images) || images.length === 0) {
      res.status(404).json({ error: "No EPIC imagery available." });
      return;
    }

    const latest = images[images.length - 1];
    res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=1800");
    res.status(200).json(buildResponse(latest, requestedDate, requestedDate !== undefined, false));
  } catch {
    res.status(502).json({ error: "Failed to reach NASA EPIC API." });
  }
}
