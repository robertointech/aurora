const TOKEN_URL =
  "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";

export async function GET() {
  const id = process.env.CDSE_CLIENT_ID;
  const secret = process.env.CDSE_CLIENT_SECRET;

  if (!id || !secret) {
    return Response.json({ error: "Faltan credenciales CDSE" }, { status: 500 });
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: id,
      client_secret: secret,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    return Response.json({ error: data }, { status: res.status });
  }

  return Response.json({
    ok: true,
    tokenPreview: String(data.access_token).slice(0, 12) + "…",
    expiresIn: data.expires_in,
  });
}
