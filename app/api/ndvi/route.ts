import { ESCALA, hexARgb } from "@/app/lib/escala-ndvi";

const TOKEN_URL =
  "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const PROCESS_URL = "https://sh.dataspace.copernicus.eu/api/v1/process";

const BBOX = [-80.36, -4.96, -80.32, -4.92];

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
  if (!res.ok) throw new Error("No se pudo obtener el token");
  const data = await res.json();
  return data.access_token as string;
}

export async function GET() {
  try {
    const token = await getToken();

    const body = {
      input: {
        bounds: {
          bbox: BBOX,
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
        width: 512,
        height: 512,
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
      return Response.json({ error: await res.text() }, { status: res.status });
    }

    return new Response(await res.arrayBuffer(), {
      headers: { "Content-Type": "image/png" },
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
