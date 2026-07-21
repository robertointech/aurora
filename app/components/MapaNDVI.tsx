"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { ESCALA } from "@/app/lib/escala-ndvi";

const BBOX = { minLon: -80.36, minLat: -4.96, maxLon: -80.32, maxLat: -4.92 };
const KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

const BASES = {
  satelite: {
    tiles: [`https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${KEY}`],
    attribution: "© MapTiler © OpenStreetMap contributors",
  },
  calles: {
    tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    attribution: "© OpenStreetMap",
  },
};

export default function MapaNDVI() {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<maplibregl.Map | null>(null);
  const [opacidad, setOpacidad] = useState(0.75);
  const [base, setBase] = useState<keyof typeof BASES>("satelite");

  useEffect(() => {
    if (mapa.current || !contenedor.current) return;

    mapa.current = new maplibregl.Map({
      container: contenedor.current,
      style: {
        version: 8,
        sources: {
          base: { type: "raster", tileSize: 256, ...BASES.satelite },
        },
        layers: [{ id: "base", type: "raster", source: "base" }],
      },
      center: [
        (BBOX.minLon + BBOX.maxLon) / 2,
        (BBOX.minLat + BBOX.maxLat) / 2,
      ],
      zoom: 13,
    });

    mapa.current.addControl(new maplibregl.NavigationControl(), "top-right");

    mapa.current.on("load", () => {
      const m = mapa.current!;
      m.addSource("ndvi", {
        type: "image",
        url: "/api/ndvi",
        coordinates: [
          [BBOX.minLon, BBOX.maxLat],
          [BBOX.maxLon, BBOX.maxLat],
          [BBOX.maxLon, BBOX.minLat],
          [BBOX.minLon, BBOX.minLat],
        ],
      });
      m.addLayer({
        id: "ndvi",
        type: "raster",
        source: "ndvi",
        paint: { "raster-opacity": 0.75 },
      });
    });
  }, []);

  useEffect(() => {
    const m = mapa.current;
    if (m?.getLayer("ndvi")) {
      m.setPaintProperty("ndvi", "raster-opacity", opacidad);
    }
  }, [opacidad]);

  useEffect(() => {
    const m = mapa.current;
    const src = m?.getSource("base") as maplibregl.RasterTileSource | undefined;
    if (src?.setTiles) src.setTiles(BASES[base].tiles);
  }, [base]);

  const niveles = [...ESCALA].reverse();

  return (
    <div className="relative h-screen w-full overflow-hidden">
      <div ref={contenedor} className="h-full w-full" />

      <div className="absolute left-6 top-6 max-h-[calc(100vh-3rem)] w-80 overflow-y-auto rounded-2xl bg-white/95 p-5 shadow-2xl ring-1 ring-black/5 backdrop-blur">
        <div className="text-base font-semibold text-gray-900">
          Salud del cultivo
        </div>
        <div className="mt-0.5 text-xs text-gray-500">
          Tambogrande, Piura · Sentinel-2 · índice NDVI
        </div>

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
          Valores orientativos. Los umbrales de NDVI varían según cultivo y
          etapa; requieren calibración con observación en campo.
        </p>
      </div>
    </div>
  );
}
