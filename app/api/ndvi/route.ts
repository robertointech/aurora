const TOKEN_URL =
  "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const PROCESS_URL = "https://sh.dataspace.copernicus.eu/api/v1/process";

// PROVISIONAL: zona de Tambogrande, Piura. [minLon, minLat, maxLon, maxLat]
const BBOX = [-80.36, -4.96, -80.32, -4.92];

const EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "SCL", "dataMask"] }],
    output: { bands: 4 }
  };
}

function evaluatePixel(s) {
  // SCL: 0 sin dato, 1 saturado, 3 sombra de nube,
  // 8/9 nube media y alta probabilidad, 10 cirros, 11 nieve
  var descartar = [0, 1, 3, 8, 9, 10, 11];
  if (descartar.indexOf(s.SCL) >= 0 || s.dataMask === 0) {
    return [0, 0, 0, 0];
  }

  var ndvi = (s.B08 - s.B04) / (s.B08 + s.B04);

  if (ndvi < 0.1)  return [0.65, 0.55, 0.45, 1];
  if (ndvi < 0.2)  return [0.85, 0.78, 0.55, 1];
  if (ndvi < 0.3)  return [0.90, 0.85, 0.40, 1];
  if (ndvi < 0.4)  return [0.75, 0.85, 0.35, 1];
  if (ndvi < 0.5)  return [0.55, 0.78, 0.30, 1];
  if (ndvi < 0.6)  return [0.35, 0.68, 0.25, 1];
  if (ndvi < 0.7)  return [0.18, 0.55, 0.20, 1];
  return [0.05, 0.38, 0.13, 1];
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
      const texto = await res.text();
      return Response.json({ error: texto }, { status: res.status });
    }

    const png = await res.arrayBuffer();
    return new Response(png, {
      headers: { "Content-Type": "image/png" },
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
