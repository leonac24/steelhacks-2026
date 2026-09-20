// Original atmospheric background for the landing hero — a warm dusk over a
// nesting treeline, in the NestEgg gold/amber palette (not a stock photo).
// Layered hills, a pine treeline, tucked-in nests, and drifting leaves give
// the same depth as a photo background without licensing a real one. The
// hill/tree layers also parallax gently with the cursor.
import { useRef } from "react";

// Math.cos/sin can differ in their last floating-point digit between the
// Node.js SSR pass and the browser, which trips up React's hydration check
// on interpolated path strings. Round to keep server and client identical.
function r2(n: number) {
  return Math.round(n * 100) / 100;
}

// A stem with pine needles fanning off it, like a branch poking into frame —
// draped from the sides, not standing on the horizon.
function PineBranch({
  originX,
  originY,
  baseAngle,
  spread = 85,
  count = 13,
  minLength = 140,
  maxLength = 320,
  color,
}: {
  originX: number;
  originY: number;
  baseAngle: number;
  spread?: number;
  count?: number;
  minLength?: number;
  maxLength?: number;
  color: string;
}) {
  const needles = Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    const angle = r2(baseAngle - spread / 2 + spread * t);
    const length = r2(minLength + Math.sin(t * Math.PI) * (maxLength - minLength));
    return { angle, length, width: 5 + (i % 3) };
  });

  const stemRad = (baseAngle * Math.PI) / 180;
  const stemLength = maxLength * 0.7;
  const stemEndX = r2(Math.cos(stemRad) * stemLength);
  const stemEndY = r2(Math.sin(stemRad) * stemLength);
  const stemMidX = r2(Math.cos(stemRad) * stemLength * 0.5 - Math.sin(stemRad) * 18);
  const stemMidY = r2(Math.sin(stemRad) * stemLength * 0.5 + Math.cos(stemRad) * 18);

  return (
    <g transform={`translate(${originX},${originY})`} fill={color}>
      <path
        d={`M0,0 Q${stemMidX},${stemMidY} ${stemEndX},${stemEndY}`}
        stroke={color}
        strokeWidth={5}
        fill="none"
        strokeLinecap="round"
      />
      {needles.map((n, i) => (
        <g key={i} transform={`rotate(${n.angle})`}>
          <path d={`M0,-${n.width} L${n.length},0 L0,${n.width} Z`} />
        </g>
      ))}
    </g>
  );
}

function Leaf({
  x,
  y,
  rotate = 0,
  scale = 1,
  color,
  index,
}: {
  x: number;
  y: number;
  rotate?: number;
  scale?: number;
  color: string;
  index: number;
}) {
  // The outer <g> sets static position/rotation/scale via the SVG transform
  // attribute; the animation lives on the inner <g> instead of this one,
  // since a CSS transform animation would otherwise override (not compose
  // with) that attribute and snap the leaf back to the origin.
  return (
    <g transform={`translate(${x},${y}) rotate(${rotate}) scale(${scale})`}>
      <g className="leaf-drift" style={{ animationDelay: `${index * 0.7}s` }}>
        <path d="M0,-14 C8,-10 8,10 0,14 C-8,10 -8,-10 0,-14 Z" fill={color} />
        <line x1="0" y1="-13" x2="0" y2="13" stroke="#00000030" strokeWidth="0.8" />
      </g>
    </g>
  );
}

const LEAVES = [
  { x: 260, y: 260, rotate: -20, scale: 1, color: "#c97b5a" },
  { x: 1620, y: 300, rotate: 30, scale: 0.9, color: "#e0a95f" },
  { x: 880, y: 180, rotate: 10, scale: 0.8, color: "#8a9b5e" },
  { x: 1480, y: 520, rotate: -35, scale: 1.1, color: "#c97b5a" },
  { x: 400, y: 560, rotate: 15, scale: 0.85, color: "#e0a95f" },
  { x: 1780, y: 560, rotate: -10, scale: 0.75, color: "#8a9b5e" },
  { x: 700, y: 420, rotate: 40, scale: 0.7, color: "#e0a95f" },
  { x: 1080, y: 620, rotate: -25, scale: 0.95, color: "#c97b5a" },
] as const;

// Corner clusters only — a big branch plus a smaller layered one underneath,
// draped in from the top-left and top-right.
const BRANCHES = [
  { originX: -50, originY: -60, baseAngle: 62, color: "#241811" },
  {
    originX: -30,
    originY: -20,
    baseAngle: 58,
    spread: 70,
    count: 9,
    minLength: 100,
    maxLength: 230,
    color: "#3a271e",
  },
  { originX: 1970, originY: -60, baseAngle: 118, color: "#241811" },
  {
    originX: 1950,
    originY: -20,
    baseAngle: 122,
    spread: 70,
    count: 9,
    minLength: 100,
    maxLength: 230,
    color: "#3a271e",
  },
] as const;

export function HeroBackground() {
  const svgRef = useRef<SVGSVGElement>(null);

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width - 0.5;
    const my = (e.clientY - rect.top) / rect.height - 0.5;
    svg.style.setProperty("--mx", mx.toFixed(3));
    svg.style.setProperty("--my", my.toFixed(3));
  }

  return (
    <svg
      ref={svgRef}
      onMouseMove={handleMouseMove}
      viewBox="0 0 1920 1080"
      preserveAspectRatio="xMidYMax slice"
      className="absolute inset-0 z-0 size-full"
      aria-hidden
    >
      <defs>
        <linearGradient id="hero-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3d2a3a" />
          <stop offset="38%" stopColor="#8a5a5e" />
          <stop offset="65%" stopColor="#d99368" />
          <stop offset="100%" stopColor="#f6cd94" />
        </linearGradient>
        <radialGradient id="hero-glow" cx="50%" cy="48%" r="42%">
          <stop offset="0%" stopColor="#ffe3ad" stopOpacity="0.55" />
          <stop offset="60%" stopColor="#ffcf8a" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#ffcf8a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hill-far" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a97a68" />
          <stop offset="100%" stopColor="#8f6353" />
        </linearGradient>
        <linearGradient id="hill-mid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6f4a3a" />
          <stop offset="100%" stopColor="#5c3c2e" />
        </linearGradient>
        <linearGradient id="hill-near" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3a271e" />
          <stop offset="100%" stopColor="#2a1c16" />
        </linearGradient>
      </defs>

      <rect width="1920" height="1080" fill="url(#hero-sky)" />
      <rect width="1920" height="1080" fill="url(#hero-glow)" />

      {/* soft floating light particles */}
      <g fill="#fff3dc">
        <circle cx="240" cy="180" r="2.5" opacity="0.5" />
        <circle cx="1680" cy="220" r="3" opacity="0.4" />
        <circle cx="960" cy="120" r="2" opacity="0.45" />
        <circle cx="1400" cy="340" r="2.5" opacity="0.35" />
        <circle cx="480" cy="300" r="2" opacity="0.4" />
        <circle cx="1750" cy="420" r="2" opacity="0.3" />
        <circle cx="150" cy="400" r="2.5" opacity="0.3" />
        <circle cx="1100" cy="200" r="1.5" opacity="0.4" />
      </g>

      {LEAVES.map((leaf, i) => (
        <Leaf key={i} index={i} {...leaf} />
      ))}

      <g className="parallax-far">
        <path
          d="M0,700 C300,640 600,720 960,670 C1300,630 1600,700 1920,650 L1920,1080 L0,1080 Z"
          fill="url(#hill-far)"
          opacity="0.75"
        />
      </g>
      <g className="parallax-mid">
        <path
          d="M0,800 C350,740 700,820 960,780 C1250,750 1550,810 1920,760 L1920,1080 L0,1080 Z"
          fill="url(#hill-mid)"
          opacity="0.88"
        />
      </g>
      <g className="parallax-near">
        <path
          d="M0,920 C400,870 800,940 960,900 C1300,870 1600,930 1920,890 L1920,1080 L0,1080 Z"
          fill="url(#hill-near)"
        />
      </g>

      {/* pine branches draping in from both sides, like looking out from
          under the trees — not a horizon treeline */}
      <g className="parallax-mid">
        {BRANCHES.map((branch, i) => (
          <PineBranch key={i} {...branch} />
        ))}
      </g>
    </svg>
  );
}
