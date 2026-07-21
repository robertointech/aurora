import { ESCALA, hexARgb } from "@/app/lib/escala-ndvi";

const TOKEN_URL =
  "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const PROCESS_URL = "https://sh.dataspace.copernicus.eu/api/v1/process";

const BBOX_POR_DEFECTO = [-80.36, -4.96, -80.32, -4.92];

// Sentinel-2 entrega B04/B08 a 10 m. Pedimos ~1 px por cada 10 m
// para no inventar detalle ni desperdiciar el que existe.
const METROS_POR_PIXEL = 10;
const PX_MIN = 256;
const PX_MAX = 1024;
const LADO_MAX_M = PX_MAX * METROS_POR_PIXEL; // 10.24 km por lado

const RAMPA = ESCALA.map((n) => {
  const [r, g, b] = hexARgb(n.hex);
  return `  if (ndvi < ${n.max}) return [${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)}, 1];`;
}).join("\n");

const EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "SCL", "dataMask"] }],
    output: { bands: 4 }
  };
}

function evaluatePixel(s) {
  var descartar = [0, 1, 3, 8, 9, 10, 11];
  if (descartar.indexOf(s.SCL) >= 0 || s.dataMask === 0) {
    return [0, 0, 0, 0];
  }

  var ndvi = (s.B08 - s.B04) / (s.B08 + s.B04);

${RAMPA}
  return [0, 0, 0, 0];
}`;

function metrosDelBbox(b: number[]) {
  const [minLon, minLat, maxLon, maxLat] = b;
  const latCentro = (((minLat + maxLat) / 2) * Math.PI) / 180;
  return {
    ancho: (maxLon - minLon) * 111320 * Math.cos(latCentro),
    alto: (maxLat - minLat) * 110574,
  };
}

function validarBbox(texto: string | null) {
  if (!texto) return { bbox: BBOX_POR_DEFECTO };

  const p = texto.split(",").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isFinite(n))) {
    return { error: "El bbox debe ser 4 números separados por coma." };
  }

  const [minLon, minLat, maxLon, maxLat] = p;
  if (minLon >= maxLon || minLat >= maxLat) {
    return { error: "Orden esperado: minLon,minLat,maxLon,maxLat." };
  }
  if (minLon < -180 || maxLon > 180 || minLat < -85 || maxLat > 85) {
    return { error: "El bbox está fuera del rango válido." };
  }

  const { ancho, alto } = metrosDelBbox(p);
  if (ancho > LADO_MAX_M || alto > LADO_MAX_M) {
    return {
      error: `Área demasiado grande. Máximo ${(LADO_MAX_M / 1000).toFixed(
        1
      )} km por lado — acércate más al terreno.`,
    };
  }

  return { bbox: p };
}

async function getToken() {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.CDSE_CLIENT_ID!,
      client_secret: process.env.CDSE_CLIENT_SECRET!,
    }),
  });
  if (!res.ok) throw new Error("No se pudo obtener el token de Copernicus");
  return (await res.json()).access_token as string;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const v = validarBbox(searchParams.get("bbox"));
    if ("error" in v) return Response.json({ error: v.error }, { status: 400 });

    const bbox = v.bbox!;
    const { ancho, alto } = metrosDelBbox(bbox);
    const w = Math.min(PX_MAX, Math.max(PX_MIN, Math.round(ancho / METROS_POR_PIXEL)));
    const h = Math.min(PX_MAX, Math.max(PX_MIN, Math.round(alto / METROS_POR_PIXEL)));

    const token = await getToken();

    const body = {
      input: {
        bounds: {
          bbox,
          properties: { crs: "http://www.opengis.net/def/crs/OGC/1.3/CRS84" },
        },
        data: [
          {
            type: "sentinel-2-l2a",
            dataFilter: {
              timeRange: {
                from: "2026-06-01T00:00:00Z",
                to: "2026-07-15T23:59:59Z",
              },
              maxCloudCoverage: 30,
              mosaickingOrder: "leastCC",
            },
          },
        ],
      },
      output: {
        width: w,
        height: h,
        responses: [{ identifier: "default", format: { type: "image/png" } }],
      },
      evalscript: EVALSCRIPT,
    };

    const res = await fetch(PROCESS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "image/png",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      return Response.json(
        { error: "Copernicus rechazó la petición.", detalle: await res.text() },
        { status: res.status }
      );
    }

    return new Response(await res.arrayBuffer(), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
