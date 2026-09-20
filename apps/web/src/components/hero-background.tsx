// Original atmospheric background for the landing hero — a pastel dawn over
// receding mountain ridges, framed by pine branches leaning in from the top
// corners (no stock photo, no licensing). Depth comes from three things:
// layered ridges that lose contrast and warm up as they recede, a textured
// conifer canopy on the near hills, and needle-level detail on the framing
// branches. Ridge and branch layers parallax gently with the cursor.
import { useRef } from "react";

// Math.cos/sin can differ in their last floating-point digit between the
// Node.js SSR pass and the browser, which trips up React's hydration check
// on interpolated path strings. Round to keep server and client identical.
function r2(n: number) {
  return Math.round(n * 100) / 100;
}

// Deterministic PRNG (mulberry32). The canopy and needle detail need hundreds
// of scattered values; Math.random would produce different markup on the
// server and the client and blow up hydration, so every layer draws from a
// seed instead.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A single conifer silhouette: a stack of drooping boughs that narrows toward
// the tip, which reads as a spruce/fir even at 12px tall.
function conifer(x: number, y: number, height: number, width: number, tiers: number) {
  const parts: string[] = [];
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const tierTop = y - height * (1 - t);
    const tierBottom = tierTop + (height / tiers) * 1.9;
    const half = r2(width * (0.25 + t * 0.75) * 0.5);
    parts.push(
      `M${r2(x)},${r2(tierTop)} L${r2(x + half)},${r2(tierBottom)} L${r2(x - half)},${r2(tierBottom)} Z`,
    );
  }
  // trunk
  parts.push(
    `M${r2(x - width * 0.05)},${r2(y)} L${r2(x + width * 0.05)},${r2(y)} L${r2(x)},${r2(y - height * 0.5)} Z`,
  );
  return parts.join(" ");
}

// A handful of conifers placed by hand. The valley reads as forest from the
// canopy grain alone, so only a few silhouettes are needed for scale — a full
// treeline band turns the ridges into a row of Christmas trees.
function Conifers({
  trees,
  color,
  opacity = 1,
}: {
  trees: ReadonlyArray<{ x: number; y: number; h: number }>;
  color: string;
  opacity?: number;
}) {
  const d = trees.map((t) => conifer(t.x, t.y, t.h, t.h * 0.5, 4)).join(" ");
  return <path d={d} fill={color} opacity={opacity} />;
}

// A bough leaning into frame: a bowed stem carrying needle tufts along its
// length. Each needle is a thin tapered blade, and the tufts alternate sides
// and shorten toward the tip, which gives the density of a real pine bough.
function PineBranch({
  originX,
  originY,
  baseAngle,
  stemLength = 620,
  tuftCount = 26,
  needleLength = 96,
  color,
  highlight,
  seed,
}: {
  originX: number;
  originY: number;
  baseAngle: number;
  stemLength?: number;
  tuftCount?: number;
  needleLength?: number;
  color: string;
  highlight: string;
  seed: number;
}) {
  const next = rng(seed);
  const stemRad = (baseAngle * Math.PI) / 180;
  // The stem bows away from a straight line; needles are placed on the curve,
  // not on the chord, so the whole bough droops as one piece.
  const bow = 60;
  const point = (t: number) => {
    const along = stemLength * t;
    const sag = Math.sin(t * Math.PI) * bow;
    return {
      x: r2(Math.cos(stemRad) * along - Math.sin(stemRad) * sag),
      y: r2(Math.sin(stemRad) * along + Math.cos(stemRad) * sag),
    };
  };

  // Needle tufts ride along the stem in alternating pairs and shorten toward
  // the tip, which is what separates a pine bough from a radial starburst.
  const tufts = Array.from({ length: tuftCount }, (_, i) => {
    const t = 0.06 + (i / (tuftCount - 1)) * 0.94;
    const p = point(t);
    const side = i % 2 === 0 ? 1 : -1;
    const taper = 1 - t * 0.62;
    // Needles sweep back toward the trunk and outward from the stem.
    const sweep = side * (38 + next() * 22);
    return {
      x: p.x,
      y: p.y,
      angle: r2(baseAngle + sweep),
      length: r2(needleLength * taper * (0.75 + next() * 0.5)),
    };
  });

  const mid = point(0.5);
  const end = point(1);

  return (
    <g transform={`translate(${originX},${originY})`}>
      <path
        d={`M0,0 Q${mid.x},${mid.y} ${end.x},${end.y}`}
        stroke={color}
        strokeWidth={9}
        fill="none"
        strokeLinecap="round"
      />
      {tufts.map((tuft, i) => {
        const blades = Array.from({ length: 9 }, (_, j) => {
          const u = j / 8;
          const a = r2(tuft.angle - 30 + u * 60);
          const len = r2(tuft.length * (0.5 + Math.sin(u * Math.PI) * 0.5));
          return { a, len, w: r2(1.1 + (j % 3) * 0.45) };
        });
        return (
          <g key={i} transform={`translate(${tuft.x},${tuft.y})`}>
            {blades.map((b, j) => (
              <g key={j} transform={`rotate(${b.a})`}>
                <path d={`M0,-${b.w} L${b.len},0 L0,${b.w} Z`} fill={color} />
                {/* thin warm edge on some needles catches the dawn light */}
                {j % 3 === 0 && (
                  <path
                    d={`M0,-${b.w} L${b.len},0 L${r2(b.len * 0.55)},${r2(-b.w * 0.4)} Z`}
                    fill={highlight}
                    opacity="0.22"
                  />
                )}
              </g>
            ))}
          </g>
        );
      })}
    </g>
  );
}

// Undergrowth: a spray of long curved blades rising from one point, for the
// grass and fern clumps that crowd the bottom corners of the frame.
function FrondClump({
  originX,
  originY,
  baseAngle,
  spread,
  count,
  length,
  color,
  seed,
}: {
  originX: number;
  originY: number;
  baseAngle: number;
  spread: number;
  count: number;
  length: number;
  color: string;
  seed: number;
}) {
  const next = rng(seed);
  const blades = Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const angle = (baseAngle - spread / 2 + spread * t) * (Math.PI / 180);
    const len = length * (0.55 + Math.sin(t * Math.PI) * 0.45) * (0.8 + next() * 0.4);
    // Each blade arcs: the tip curls further than the midpoint.
    const curl = (next() - 0.5) * 0.9 + (t - 0.5) * 1.3;
    const tipX = r2(Math.cos(angle) * len);
    const tipY = r2(Math.sin(angle) * len);
    const ctrlX = r2(Math.cos(angle) * len * 0.55 - Math.sin(angle) * len * 0.3 * curl);
    const ctrlY = r2(Math.sin(angle) * len * 0.55 + Math.cos(angle) * len * 0.3 * curl);
    const w = r2(4.5 + next() * 4);
    return { tipX, tipY, ctrlX, ctrlY, w };
  });

  return (
    <g transform={`translate(${originX},${originY})`} fill={color}>
      {blades.map((b, i) => (
        <path
          key={i}
          d={`M${-b.w},0 Q${b.ctrlX},${b.ctrlY} ${b.tipX},${b.tipY} Q${b.ctrlX},${b.ctrlY} ${b.w},0 Z`}
        />
      ))}
    </g>
  );
}

// Only a few conifers, kept near the valley floor for a sense of scale.
const VALLEY_TREES = [
  { x: 742, y: 906, h: 34 },
  { x: 786, y: 916, h: 22 },
  { x: 1128, y: 898, h: 30 },
  { x: 1166, y: 906, h: 19 },
] as const;

// A second, closer pair sitting on the darkest near ridge.
const NEAR_TREES = [
  { x: 486, y: 1012, h: 74 },
  { x: 536, y: 1022, h: 46 },
  { x: 1452, y: 1006, h: 66 },
  { x: 1404, y: 1018, h: 40 },
] as const;

// Undergrowth clumps hugging the left and right edges.
const FRONDS = [
  {
    originX: -30,
    originY: 940,
    baseAngle: -58,
    spread: 130,
    count: 22,
    length: 400,
    color: "#0b100e",
    seed: 71,
  },
  {
    originX: 90,
    originY: 1030,
    baseAngle: -72,
    spread: 110,
    count: 18,
    length: 320,
    color: "#0e1512",
    seed: 83,
  },
  {
    originX: 300,
    originY: 1080,
    baseAngle: -84,
    spread: 92,
    count: 14,
    length: 240,
    color: "#111a16",
    seed: 89,
  },
  {
    originX: 520,
    originY: 1110,
    baseAngle: -88,
    spread: 80,
    count: 11,
    length: 180,
    color: "#131d18",
    seed: 93,
  },
  {
    originX: 1950,
    originY: 940,
    baseAngle: -122,
    spread: 130,
    count: 22,
    length: 400,
    color: "#0b100e",
    seed: 97,
  },
  {
    originX: 1830,
    originY: 1030,
    baseAngle: -108,
    spread: 110,
    count: 18,
    length: 320,
    color: "#0e1512",
    seed: 103,
  },
  {
    originX: 1620,
    originY: 1080,
    baseAngle: -96,
    spread: 92,
    count: 14,
    length: 240,
    color: "#111a16",
    seed: 109,
  },
  {
    originX: 1400,
    originY: 1110,
    baseAngle: -92,
    spread: 80,
    count: 11,
    length: 180,
    color: "#131d18",
    seed: 111,
  },
] as const;

// Corner clusters only — a big bough plus smaller layered ones underneath,
// draped in from the top-left and top-right.
const BRANCHES = [
  { originX: -120, originY: -80, baseAngle: 34, color: "#10161a", highlight: "#e9c9ae", seed: 11 },
  {
    originX: -90,
    originY: 40,
    baseAngle: 12,
    stemLength: 430,
    tuftCount: 18,
    needleLength: 72,
    color: "#19222a",
    highlight: "#e9c9ae",
    seed: 23,
  },
  {
    originX: -60,
    originY: 250,
    baseAngle: -14,
    stemLength: 330,
    tuftCount: 14,
    needleLength: 58,
    color: "#1e2830",
    highlight: "#e9c9ae",
    seed: 29,
  },
  { originX: 2040, originY: -80, baseAngle: 146, color: "#10161a", highlight: "#e9c9ae", seed: 37 },
  {
    originX: 2010,
    originY: 40,
    baseAngle: 168,
    stemLength: 430,
    tuftCount: 18,
    needleLength: 72,
    color: "#19222a",
    highlight: "#e9c9ae",
    seed: 51,
  },
  {
    originX: 1980,
    originY: 250,
    baseAngle: 194,
    stemLength: 330,
    tuftCount: 14,
    needleLength: 58,
    color: "#1e2830",
    highlight: "#e9c9ae",
    seed: 61,
  },
  // Lower boughs running down both edges, so the frame is foliage all the way
  // to the bottom rather than only in the top corners.
  {
    originX: -80,
    originY: 470,
    baseAngle: 6,
    stemLength: 380,
    tuftCount: 16,
    needleLength: 66,
    color: "#141c22",
    highlight: "#e9c9ae",
    seed: 67,
  },
  {
    originX: -70,
    originY: 700,
    baseAngle: -16,
    stemLength: 300,
    tuftCount: 13,
    needleLength: 60,
    color: "#111820",
    highlight: "#e9c9ae",
    seed: 73,
  },
  {
    originX: -60,
    originY: 900,
    baseAngle: -34,
    stemLength: 260,
    tuftCount: 11,
    needleLength: 52,
    color: "#0e1418",
    highlight: "#e9c9ae",
    seed: 79,
  },
  {
    originX: 2000,
    originY: 470,
    baseAngle: 174,
    stemLength: 380,
    tuftCount: 16,
    needleLength: 66,
    color: "#141c22",
    highlight: "#e9c9ae",
    seed: 113,
  },
  {
    originX: 1990,
    originY: 700,
    baseAngle: 196,
    stemLength: 300,
    tuftCount: 13,
    needleLength: 60,
    color: "#111820",
    highlight: "#e9c9ae",
    seed: 127,
  },
  {
    originX: 1980,
    originY: 900,
    baseAngle: 214,
    stemLength: 260,
    tuftCount: 11,
    needleLength: 52,
    color: "#0e1418",
    highlight: "#e9c9ae",
    seed: 131,
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
        {/* dusty blue overhead, cooling into a pale pastel green band at the
            horizon — the app's blue/green palette. */}
        {/* The headline sits over the 30–60% band, so those stops stay a touch
            deeper and more saturated than a literal dawn would be — enough to
            hold white type without losing the pastel feel. */}
        <linearGradient id="hero-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3f7a95" />
          <stop offset="34%" stopColor="#5c93a3" />
          <stop offset="55%" stopColor="#7ea69f" />
          <stop offset="68%" stopColor="#8ec3a8" />
          <stop offset="78%" stopColor="#a8d6ba" />
          <stop offset="100%" stopColor="#c3e6c9" />
        </linearGradient>
        <radialGradient id="hero-glow" cx="50%" cy="70%" r="42%">
          <stop offset="0%" stopColor="#cdf0d9" stopOpacity="0.36" />
          <stop offset="55%" stopColor="#bfe8d4" stopOpacity="0.11" />
          <stop offset="100%" stopColor="#bfe8d4" stopOpacity="0" />
        </radialGradient>

        {/* Ridge fills. Each is lighter and hazier than the one in front of it,
            which is what sells distance in a flat vector scene. */}
        <linearGradient id="ridge-1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#adb9c8" />
          <stop offset="100%" stopColor="#bcc2cb" />
        </linearGradient>
        <linearGradient id="ridge-2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#97a7b9" />
          <stop offset="100%" stopColor="#a8b2bf" />
        </linearGradient>
        <linearGradient id="ridge-3" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8b9cae" />
          <stop offset="100%" stopColor="#9aa7b4" />
        </linearGradient>
        <linearGradient id="ridge-4" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6f8395" />
          <stop offset="100%" stopColor="#7d8c9a" />
        </linearGradient>
        <linearGradient id="ridge-5" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#526675" />
          <stop offset="100%" stopColor="#5d6b76" />
        </linearGradient>
        <linearGradient id="ridge-6" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3a4a52" />
          <stop offset="100%" stopColor="#313f46" />
        </linearGradient>
        <linearGradient id="ridge-7" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#26322f" />
          <stop offset="100%" stopColor="#1b2422" />
        </linearGradient>
        <linearGradient id="ridge-8" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#141b19" />
          <stop offset="100%" stopColor="#0d1211" />
        </linearGradient>

        {/* Haze wash laid over each distant ridge so the ridge below reads as
            closer without having to hand-pick a dozen more fill colors. */}
        <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c9e6d2" stopOpacity="0.44" />
          <stop offset="100%" stopColor="#cfe9d8" stopOpacity="0" />
        </linearGradient>

        {/* Canopy grain. Turbulence over the near hills breaks up the flat fill
            into something that reads as a forest at a distance. */}
        <filter id="canopy-grain" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.012 0.05"
            numOctaves="4"
            seed="7"
            result="noise"
          />
          <feColorMatrix in="noise" type="saturate" values="0" result="mono" />
          <feComponentTransfer in="mono" result="grain">
            <feFuncA type="linear" slope="0.5" intercept="0" />
          </feComponentTransfer>
          <feComposite in="grain" in2="SourceGraphic" operator="in" />
        </filter>
        {/* Softens the farthest ridges so they sit behind the atmosphere. */}
        <filter id="soft-far" x="-3%" y="-10%" width="106%" height="130%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
        <clipPath id="near-hill-clip">
          <path d="M0,742 C260,700 430,760 640,806 C900,862 1120,842 1380,792 C1600,750 1780,772 1920,752 L1920,1080 L0,1080 Z" />
        </clipPath>
      </defs>

      <rect width="1920" height="1080" fill="url(#hero-sky)" />
      <rect width="1920" height="1080" fill="url(#hero-glow)" />

      {/* soft floating light particles */}
      <g fill="#fff6ea">
        <circle cx="240" cy="180" r="2.5" opacity="0.35" />
        <circle cx="1680" cy="220" r="3" opacity="0.3" />
        <circle cx="960" cy="120" r="2" opacity="0.32" />
        <circle cx="1400" cy="340" r="2.5" opacity="0.26" />
        <circle cx="480" cy="300" r="2" opacity="0.3" />
        <circle cx="1750" cy="420" r="2" opacity="0.22" />
        <circle cx="150" cy="400" r="2.5" opacity="0.22" />
        <circle cx="1100" cy="200" r="1.5" opacity="0.3" />
      </g>

      {/* ── distant ranges: pale, blurred, barely separated from the sky ── */}
      <g className="parallax-far" filter="url(#soft-far)">
        <path
          d="M0,620 C180,586 300,612 430,588 C560,564 660,596 790,576 C930,554 1040,592 1180,572 C1320,552 1460,588 1600,568 C1730,550 1840,586 1920,570 L1920,1080 L0,1080 Z"
          fill="url(#ridge-1)"
          opacity="0.9"
        />
        <path
          d="M0,664 C150,630 280,672 420,644 C580,612 700,662 860,636 C1010,612 1120,660 1290,634 C1450,610 1580,656 1740,632 C1830,618 1880,640 1920,630 L1920,1080 L0,1080 Z"
          fill="url(#ridge-2)"
          opacity="0.94"
        />
      </g>

      <g className="parallax-far">
        <path
          d="M0,716 C140,684 240,700 360,668 C500,630 600,692 740,672 C880,652 980,616 1120,650 C1260,684 1380,660 1520,684 C1660,708 1790,676 1920,692 L1920,1080 L0,1080 Z"
          fill="url(#ridge-3)"
        />
        <rect y="660" width="1920" height="180" fill="url(#haze)" opacity="0.7" />
      </g>

      {/* ── mid ranges: the valley walls that funnel toward the centre ── */}
      <g className="parallax-mid">
        <path
          d="M0,760 C120,724 220,748 340,710 C470,668 570,742 700,776 C820,808 900,800 960,806 C1030,800 1120,806 1240,772 C1380,732 1500,700 1630,724 C1760,748 1860,726 1920,736 L1920,1080 L0,1080 Z"
          fill="url(#ridge-4)"
        />
        <rect y="700" width="1920" height="200" fill="url(#haze)" opacity="0.45" />
        <path
          d="M0,812 C130,776 250,806 380,772 C520,734 640,800 780,840 C880,868 920,872 960,876 C1010,872 1100,860 1220,824 C1360,782 1490,744 1620,768 C1760,794 1860,778 1920,788 L1920,1080 L0,1080 Z"
          fill="url(#ridge-5)"
        />
        <rect y="760" width="1920" height="190" fill="url(#haze)" opacity="0.28" />
      </g>

      {/* ── near forested hills: darkest, textured, hold the CTA copy ── */}
      <g className="parallax-near">
        <path
          d="M0,742 C260,700 430,760 640,806 C900,862 1120,842 1380,792 C1600,750 1780,772 1920,752 L1920,1080 L0,1080 Z"
          fill="url(#ridge-6)"
        />
        <g clipPath="url(#near-hill-clip)">
          <rect
            y="700"
            width="1920"
            height="380"
            fill="#0e1513"
            filter="url(#canopy-grain)"
            opacity={0.55}
          />
        </g>
        <Conifers trees={VALLEY_TREES} color="#1f2b28" opacity={0.75} />
        <path
          d="M0,900 C220,868 420,930 660,952 C900,974 1120,948 1360,910 C1560,878 1760,902 1920,884 L1920,1080 L0,1080 Z"
          fill="url(#ridge-7)"
        />
        <path
          d="M0,1002 C260,976 520,1024 820,1040 C1120,1056 1420,1020 1700,998 C1800,990 1870,996 1920,990 L1920,1080 L0,1080 Z"
          fill="url(#ridge-8)"
        />
        <Conifers trees={NEAR_TREES} color="#0a0f0d" opacity={0.9} />
      </g>

      {/* pine branches draping in from both sides, like looking out from
          under the trees — not a horizon treeline */}
      <g className="parallax-mid">
        {BRANCHES.map((branch, i) => (
          <PineBranch key={i} {...branch} />
        ))}
      </g>

      {/* undergrowth crowding in at the bottom corners */}
      <g className="parallax-near">
        {FRONDS.map((frond, i) => (
          <FrondClump key={i} {...frond} />
        ))}
      </g>
    </svg>
  );
}
