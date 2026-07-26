"use client";

import { useEffect, useRef, useState } from "react";

function hslToHex(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l / 100 - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(color * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

const WHEEL_SIZE = 108;

export function ColorWheel({
  defaultHue = 30,
  defaultSaturation = 70,
  defaultLightness = 50,
  onChange
}: {
  defaultHue?: number;
  defaultSaturation?: number;
  defaultLightness?: number;
  onChange: (hex: string, hsl: { h: number; s: number; l: number }) => void;
}) {
  const [hue, setHue] = useState(defaultHue);
  const [saturation, setSaturation] = useState(defaultSaturation);
  const [lightness, setLightness] = useState(defaultLightness);
  const [dragging, setDragging] = useState(false);
  const wheelRef = useRef<HTMLDivElement>(null);

  const pickFromEvent = (clientX: number, clientY: number) => {
    const rect = wheelRef.current?.getBoundingClientRect();
    if (!rect) return;
    const radius = rect.width / 2;
    const dx = clientX - rect.left - radius;
    const dy = clientY - rect.top - radius;
    const distance = Math.min(Math.sqrt(dx * dx + dy * dy), radius);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    setHue(Math.round((angle + 360) % 360));
    setSaturation(Math.round((distance / radius) * 100));
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (event: PointerEvent) => pickFromEvent(event.clientX, event.clientY);
    const onUp = () => setDragging(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging]);

  useEffect(() => {
    onChange(hslToHex(hue, saturation, lightness), { h: hue, s: saturation, l: lightness });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hue, saturation, lightness]);

  const radius = WHEEL_SIZE / 2;
  const angleRad = (hue * Math.PI) / 180;
  const pointerRadius = (saturation / 100) * radius;
  const dotX = radius + pointerRadius * Math.cos(angleRad);
  const dotY = radius + pointerRadius * Math.sin(angleRad);
  const hex = hslToHex(hue, saturation, lightness);

  return (
    <div className="colorWheelPicker">
      <div
        ref={wheelRef}
        className="colorWheel"
        style={{
          width: WHEEL_SIZE,
          height: WHEEL_SIZE,
          background: `radial-gradient(circle, #fff 0%, transparent 70%), conic-gradient(from 90deg, red, yellow, lime, cyan, blue, magenta, red)`
        }}
        onPointerDown={(event) => {
          setDragging(true);
          pickFromEvent(event.clientX, event.clientY);
        }}
      >
        <span className="colorWheelDot" style={{ left: dotX, top: dotY, background: hex }} />
      </div>
      <div className="colorWheelControls">
        <label>
          Lightness
          <input
            type="range"
            min={5}
            max={95}
            value={lightness}
            onChange={(event) => setLightness(Number(event.target.value))}
          />
        </label>
        <div className="colorWheelSwatch">
          <span style={{ background: hex }} />
          <code>{hex}</code>
        </div>
      </div>
    </div>
  );
}
