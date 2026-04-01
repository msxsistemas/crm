import { useState, useRef, useEffect, useCallback } from "react";

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h * 360, s * 100, l * 100];
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * Math.max(0, Math.min(1, color))).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function hsvToHex(h: number, s: number, v: number): string {
  s /= 100; v /= 100;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToHsv(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : (d / max) * 100;
  const v = max * 100;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return [h, s, v];
}

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
}

const ColorPicker = ({ color, onChange }: ColorPickerProps) => {
  const validHex = /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#2196f3";
  const [hsv, setHsv] = useState<[number, number, number]>(() => hexToHsv(validHex));
  const [draggingArea, setDraggingArea] = useState(false);
  const [draggingHue, setDraggingHue] = useState(false);
  const areaRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);

  // Sync from external color changes
  useEffect(() => {
    if (/^#[0-9a-fA-F]{6}$/.test(color)) {
      const newHsv = hexToHsv(color);
      const currentHex = hsvToHex(hsv[0], hsv[1], hsv[2]);
      if (currentHex.toLowerCase() !== color.toLowerCase()) {
        setHsv(newHsv);
      }
    }
  }, [color]);

  const currentHex = hsvToHex(hsv[0], hsv[1], hsv[2]);
  const [r, g, b] = hexToRgb(currentHex);

  const updateFromArea = useCallback((e: MouseEvent | React.MouseEvent) => {
    const rect = areaRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const newHsv: [number, number, number] = [hsv[0], x * 100, (1 - y) * 100];
    setHsv(newHsv);
    onChange(hsvToHex(newHsv[0], newHsv[1], newHsv[2]));
  }, [hsv[0], onChange]);

  const updateFromHue = useCallback((e: MouseEvent | React.MouseEvent) => {
    const rect = hueRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newHsv: [number, number, number] = [x * 360, hsv[1], hsv[2]];
    setHsv(newHsv);
    onChange(hsvToHex(newHsv[0], newHsv[1], newHsv[2]));
  }, [hsv[1], hsv[2], onChange]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (draggingArea) updateFromArea(e);
      if (draggingHue) updateFromHue(e);
    };
    const onUp = () => { setDraggingArea(false); setDraggingHue(false); };
    if (draggingArea || draggingHue) {
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    }
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [draggingArea, draggingHue, updateFromArea, updateFromHue]);

  const hueColor = hsvToHex(hsv[0], 100, 100);

  return (
    <div className="mt-2 space-y-3">
      {/* Saturation/Brightness area */}
      <div
        ref={areaRef}
        className="relative w-full h-40 rounded-md cursor-crosshair select-none"
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})`,
        }}
        onMouseDown={(e) => { setDraggingArea(true); updateFromArea(e); }}
      >
        <div
          className="absolute w-4 h-4 rounded-full border-2 border-white shadow-md -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{
            left: `${hsv[1]}%`,
            top: `${100 - hsv[2]}%`,
            backgroundColor: currentHex,
          }}
        />
      </div>

      {/* Hue slider */}
      <div
        ref={hueRef}
        className="relative w-full h-3 rounded-full cursor-pointer select-none"
        style={{
          background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
        }}
        onMouseDown={(e) => { setDraggingHue(true); updateFromHue(e); }}
      >
        <div
          className="absolute w-4 h-4 rounded-full border-2 border-white shadow-md -translate-x-1/2 -translate-y-1/2 top-1/2 pointer-events-none"
          style={{
            left: `${(hsv[0] / 360) * 100}%`,
            backgroundColor: hueColor,
          }}
        />
      </div>

      {/* Color preview + editable values */}
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded border border-border shrink-0" style={{ backgroundColor: currentHex }} />
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="text-center">
            <span className="font-medium">HEX</span>
            <input
              className="block w-16 text-center text-foreground font-mono bg-transparent border-b border-border outline-none focus:border-primary text-xs py-0.5"
              value={currentHex.replace("#", "")}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6);
                if (v.length === 6) onChange(`#${v}`);
              }}
              maxLength={6}
            />
          </div>
          {(["R", "G", "B"] as const).map((label, i) => (
            <div key={label} className="text-center">
              <span className="font-medium">{label}</span>
              <input
                className="block w-10 text-center text-foreground bg-transparent border-b border-border outline-none focus:border-primary text-xs py-0.5"
                type="number"
                min={0}
                max={255}
                value={[r, g, b][i]}
                onChange={(e) => {
                  const rgb: [number, number, number] = [r, g, b];
                  rgb[i] = Math.max(0, Math.min(255, parseInt(e.target.value) || 0));
                  const hex = `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
                  onChange(hex);
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ColorPicker;
