"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const BBOX = { minLon: -80.36, minLat: -4.96, maxLon: -80.32, maxLat: -4.92 };

export default function MapaNDVI() {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<maplibregl.Map | null>(null);
  const [opacidad, setOpacidad] = useState(0.85);

  useEffect(() => {
    if (mapa.current || !contenedor.current) return;

    mapa.current = new maplibregl.Map({
      container: contenedor.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      center: [
        (BBOX.minLon + BBOX.maxLon) / 2,
        (BBOX.minLat + BBOX.maxLat) / 2,
      ],
      zoom: 12,
    });

    mapa.current.on("load", () => {
      const m = mapa.current!;
      m.addSource("ndvi", {
        type: "image",
        url: "/api/ndvi",
        // orden obligatorio: sup-izq, sup-der, inf-der, inf-izq
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
        paint: { "raster-opacity": 0.85 },
      });
    });
  }, []);

  useEffect(() => {
    const m = mapa.current;
    if (m?.getLayer("ndvi")) {
      m.setPaintProperty("ndvi", "raster-opacity", opacidad);
    }
  }, [opacidad]);

  return (
    <div className="relative h-screen w-full">
      <div ref={contenedor} className="h-full w-full" />
      <div className="absolute bottom-8 left-8 rounded-xl bg-white/95 p-4 shadow-xl">
        <div className="text-sm font-semibold text-gray-900">
          NDVI — Tambogrande, Piura
        </div>
        <label className="mt-2 block text-xs text-gray-600">
          Opacidad: {Math.round(opacidad * 100)}%
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={opacidad}
          onChange={(e) => setOpacidad(Number(e.target.value))}
          className="mt-1 w-56"
        />
      </div>
    </div>
  );
}
