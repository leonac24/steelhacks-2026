// Original atmospheric background for the landing hero — a warm dusk over
// rolling hills, in the NestEgg gold/amber palette (not a stock photo).
// Layered hill silhouettes + a soft glow give the same depth as a photo
// background without licensing a real one.
export function HeroBackground() {
  return (
    <svg
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

      <path
        d="M0,700 C300,640 600,720 960,670 C1300,630 1600,700 1920,650 L1920,1080 L0,1080 Z"
        fill="url(#hill-far)"
        opacity="0.75"
      />
      <path
        d="M0,800 C350,740 700,820 960,780 C1250,750 1550,810 1920,760 L1920,1080 L0,1080 Z"
        fill="url(#hill-mid)"
        opacity="0.88"
      />
      <path
        d="M0,920 C400,870 800,940 960,900 C1300,870 1600,930 1920,890 L1920,1080 L0,1080 Z"
        fill="url(#hill-near)"
      />
    </svg>
  );
}
