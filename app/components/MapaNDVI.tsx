"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { ESCALA } from "@/app/lib/escala-ndvi";

const BBOX_INICIAL = { minLon: -80.36, minLat: -4.96, maxLon: -80.32, maxLat: -4.92 };
const KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

const BASES = {
  satelite: {
    tiles: [`https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${KEY}`],
    attribution: "© MapTiler © OpenStreetMap contributors",
  },
  calles: {
    tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    attribution: "© OpenStreetMap contributors",
  },
};

type Esquinas = [[number, number], [number, number], [number, number], [number, number]];

function esquinas(b: number[]): Esquinas {
  const [minLon, minLat, maxLon, maxLat] = b;
  return [
    [minLon, maxLat],
    [maxLon, maxLat],
    [maxLon, minLat],
    [minLon, minLat],
  ];
}

export default function MapaNDVI() {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<maplibregl.Map | null>(null);
  const urlObjeto = useRef<string | null>(null);

  const ladoRef = useRef(0);
  const [lado, setLado] = useState(0);
  const [etiquetaTam, setEtiquetaTam] = useState("");
  const [limiteExcedido, setLimiteExcedido] = useState(false);

  const [opacidad, setOpacidad] = useState(0.75);
  const [base, setBase] = useState<keyof typeof BASES>("satelite");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function actualizarEtiqueta() {
    const m = mapa.current;
    if (!m || !contenedor.current) return;
    const { clientWidth, clientHeight } = contenedor.current;
    const cx = clientWidth / 2;
    const cy = clientHeight / 2;
    const l = ladoRef.current;
    if (l === 0) return;
    const tl = m.unproject([cx - l / 2, cy - l / 2]);
    const br = m.unproject([cx + l / 2, cy + l / 2]);
    const minLon = Math.min(tl.lng, br.lng);
    const maxLon = Math.max(tl.lng, br.lng);
    const minLat = Math.min(tl.lat, br.lat);
    const maxLat = Math.max(tl.lat, br.lat);
    const latC = ((minLat + maxLat) / 2) * (Math.PI / 180);
    const ancho = (maxLon - minLon) * 111320 * Math.cos(latC);
    const alto = (maxLat - minLat) * 110574;
    const ha = (ancho * alto) / 10000;
    setEtiquetaTam(
      `${(ancho / 1000).toFixed(2)} × ${(alto / 1000).toFixed(2)} km · ${Math.round(ha)} ha`
    );
    setLimiteExcedido(Math.max(ancho, alto) > 10240);
  }

  useEffect(() => {
    if (mapa.current || !contenedor.current) return;

    mapa.current = new maplibregl.Map({
      container: contenedor.current,
      style: {
        version: 8,
        sources: { base: { type: "raster", tileSize: 256, ...BASES.satelite } },
        layers: [{ id: "base", type: "raster", source: "base" }],
      },
      center: [
        (BBOX_INICIAL.minLon + BBOX_INICIAL.maxLon) / 2,
        (BBOX_INICIAL.minLat + BBOX_INICIAL.maxLat) / 2,
      ],
      zoom: 13,
    });

    mapa.current.addControl(new maplibregl.NavigationControl(), "top-right");
    mapa.current.on("move", actualizarEtiqueta);

    mapa.current.on("load", () => {
      const m = mapa.current!;
      m.addSource("ndvi", {
        type: "image",
        url: "/api/ndvi",
        coordinates: esquinas([
          BBOX_INICIAL.minLon,
          BBOX_INICIAL.minLat,
          BBOX_INICIAL.maxLon,
          BBOX_INICIAL.maxLat,
        ]),
      });
      m.addLayer({
        id: "ndvi",
        type: "raster",
        source: "ndvi",
        paint: { "raster-opacity": 0.75 },
      });
      actualizarEtiqueta();
    });

    return () => {
      if (urlObjeto.current) URL.revokeObjectURL(urlObjeto.current);
    };
  }, []);

  useEffect(() => {
    function calcLado() {
      if (!contenedor.current) return;
      const { clientWidth, clientHeight } = contenedor.current;
      const s = Math.min(480, Math.min(clientWidth, clientHeight) * 0.62);
      ladoRef.current = s;
      setLado(s);
      actualizarEtiqueta();
    }
    calcLado();
    window.addEventListener("resize", calcLado);
    return () => window.removeEventListener("resize", calcLado);
  }, []);

  useEffect(() => {
    const m = mapa.current;
    if (m?.getLayer("ndvi")) m.setPaintProperty("ndvi", "raster-opacity", opacidad);
  }, [opacidad]);

  useEffect(() => {
    const src = mapa.current?.getSource("base") as maplibregl.RasterTileSource | undefined;
    if (src?.setTiles) src.setTiles(BASES[base].tiles);
  }, [base]);

  async function analizarZona() {
    const m = mapa.current;
    if (!m || !contenedor.current) return;

    setCargando(true);
    setError(null);

    const { clientWidth, clientHeight } = contenedor.current;
    const cx = clientWidth / 2;
    const cy = clientHeight / 2;
    const l = ladoRef.current;

    const tl = m.unproject([cx - l / 2, cy - l / 2]);
    const br = m.unproject([cx + l / 2, cy + l / 2]);
    const bbox = [
      Math.min(tl.lng, br.lng),
      Math.min(tl.lat, br.lat),
      Math.max(tl.lng, br.lng),
      Math.max(tl.lat, br.lat),
    ].map((n) => Number(n.toFixed(5)));

    try {
      const res = await fetch(`/api/ndvi?bbox=${bbox.join(",")}`);

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "No se pudo generar el análisis.");
        return;
      }

      const blob = await res.blob();
      if (urlObjeto.current) URL.revokeObjectURL(urlObjeto.current);
      urlObjeto.current = URL.createObjectURL(blob);

      const src = m.getSource("ndvi") as maplibregl.ImageSource;
      src.updateImage({ url: urlObjeto.current, coordinates: esquinas(bbox) });
    } catch {
      setError("Error de red al consultar Copernicus.");
    } finally {
      setCargando(false);
    }
  }

  const niveles = [...ESCALA].reverse();

  return (
    <div className="relative h-screen w-full overflow-hidden">
      <div ref={contenedor} className="h-full w-full" />

      {lado > 0 && (
        <>
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{
              width: lado,
              height: lado,
              border: `2px solid ${limiteExcedido ? "#ef4444" : "white"}`,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.28)",
            }}
          >
            <span
              className="absolute -left-px -top-px h-4 w-4"
              style={{
                borderTop: `4px solid ${limiteExcedido ? "#ef4444" : "white"}`,
                borderLeft: `4px solid ${limiteExcedido ? "#ef4444" : "white"}`,
              }}
            />
            <span
              className="absolute -right-px -top-px h-4 w-4"
              style={{
                borderTop: `4px solid ${limiteExcedido ? "#ef4444" : "white"}`,
                borderRight: `4px solid ${limiteExcedido ? "#ef4444" : "white"}`,
              }}
            />
            <span
              className="absolute -bottom-px -right-px h-4 w-4"
              style={{
                borderBottom: `4px solid ${limiteExcedido ? "#ef4444" : "white"}`,
                borderRight: `4px solid ${limiteExcedido ? "#ef4444" : "white"}`,
              }}
            />
            <span
              className="absolute -bottom-px -left-px h-4 w-4"
              style={{
                borderBottom: `4px solid ${limiteExcedido ? "#ef4444" : "white"}`,
                borderLeft: `4px solid ${limiteExcedido ? "#ef4444" : "white"}`,
              }}
            />
          </div>

          {etiquetaTam && (
            <div
              className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-xs font-medium text-white drop-shadow"
              style={{ top: `calc(50% + ${lado / 2}px + 8px)` }}
            >
              {etiquetaTam}
            </div>
          )}
        </>
      )}

      <div className="absolute left-6 top-6 max-h-[calc(100vh-3rem)] w-80 overflow-y-auto rounded-2xl bg-white/95 p-5 shadow-2xl ring-1 ring-black/5 backdrop-blur">
        <div className="text-base font-semibold text-gray-900">Salud del cultivo</div>
        <div className="mt-0.5 text-xs text-gray-500">
          Sentinel-2 · índice NDVI · norte del Perú
        </div>

        <button
          onClick={analizarZona}
          disabled={cargando || limiteExcedido}
          className="mt-4 w-full rounded-lg bg-emerald-700 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {cargando
            ? "Consultando al satélite…"
            : limiteExcedido
              ? "Acércate más"
              : "Analizar esta zona"}
        </button>

        <p className="mt-1.5 text-[10px] leading-snug text-gray-400">
          Enmarca tu chacra con el selector y presiona el botón. Máximo 10 km por lado.
        </p>

        {error && (
          <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</p>
        )}

        <div className="mt-4 flex rounded-lg bg-gray-100 p-0.5 text-xs">
          {(["satelite", "calles"] as const).map((b) => (
            <button
              key={b}
              onClick={() => setBase(b)}
              className={`flex-1 rounded-md px-2 py-1.5 font-medium transition ${
                base === b
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {b === "satelite" ? "Satélite" : "Calles"}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-1.5">
          {niveles.map((n) => (
            <div key={n.hex} className="flex items-center gap-2.5">
              <span
                className="h-4 w-6 shrink-0 rounded-sm ring-1 ring-black/10"
                style={{ backgroundColor: n.hex }}
              />
              <span className="flex-1 text-xs text-gray-800">{n.etiqueta}</span>
              <span className="font-mono text-[10px] tabular-nums text-gray-400">
                {n.rango}
              </span>
            </div>
          ))}
          <div className="flex items-center gap-2.5 pt-1">
            <span className="h-4 w-6 shrink-0 rounded-sm bg-gray-100 ring-1 ring-dashed ring-gray-400" />
            <span className="flex-1 text-xs text-gray-500">Nube o sin dato</span>
          </div>
        </div>

        <div className="mt-4 border-t border-gray-200 pt-3">
          <label className="block text-xs text-gray-600">
            Opacidad de la capa: {Math.round(opacidad * 100)}%
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={opacidad}
            onChange={(e) => setOpacidad(Number(e.target.value))}
            className="mt-2 w-full"
          />
        </div>

        <p className="mt-3 text-[10px] leading-snug text-gray-400">
          Valores orientativos. Los umbrales de NDVI varían según cultivo y etapa;
          requieren calibración con observación en campo.
        </p>
      </div>
    </div>
  );
}
