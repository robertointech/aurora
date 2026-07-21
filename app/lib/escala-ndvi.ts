export type Nivel = {
  max: number;
  hex: string;
  rango: string;
  etiqueta: string;
};

// Fuente única de verdad: la usa el evalscript y la leyenda.
export const ESCALA: Nivel[] = [
  { max: 0.1,  hex: "#A68C73", rango: "< 0.1",    etiqueta: "Suelo desnudo o urbano" },
  { max: 0.2,  hex: "#D9C78C", rango: "0.1 – 0.2", etiqueta: "Vegetación muy escasa" },
  { max: 0.3,  hex: "#E6D966", rango: "0.2 – 0.3", etiqueta: "Vegetación escasa" },
  { max: 0.4,  hex: "#BFD959", rango: "0.3 – 0.4", etiqueta: "Cobertura moderada" },
  { max: 0.5,  hex: "#8CC74D", rango: "0.4 – 0.5", etiqueta: "Cultivo en desarrollo" },
  { max: 0.6,  hex: "#59AD40", rango: "0.5 – 0.6", etiqueta: "Cultivo sano" },
  { max: 0.7,  hex: "#2E8C33", rango: "0.6 – 0.7", etiqueta: "Vigor alto" },
  { max: 1.01, hex: "#0D6121", rango: "> 0.7",     etiqueta: "Vigor muy alto" },
];

export function hexARgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
