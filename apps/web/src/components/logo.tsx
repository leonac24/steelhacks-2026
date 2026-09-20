import { cn } from "@steelhacks-2026/ui/lib/utils";

// Static frame for repeated UI (header, sidebar) — the full source emoji is an
// animated APNG (~3MB, 72 frames), too heavy to embed on every page. We play
// it once for the landing-page hero instead; everywhere else gets a CSS
// wiggle on hover so the brand still feels alive without the network cost.
const STATIC_SRC = "/brand/nestegg-static.png";
const ANIMATED_SRC = "/brand/nestegg-logo.png";

export function Logo({
  size = 28,
  animated = false,
  hoverWiggle = true,
  loadAnimation = true,
  className,
}: {
  size?: number;
  /** Use the full animated APNG (landing hero) instead of the static frame. */
  animated?: boolean;
  hoverWiggle?: boolean;
  loadAnimation?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("group/logo inline-flex shrink-0", className)}>
      <img
        src={animated ? ANIMATED_SRC : STATIC_SRC}
        alt="NestEgg"
        width={size}
        height={size}
        className={cn(
          "select-none",
          loadAnimation && "animate-logo-hatch-in",
          hoverWiggle && !animated && "animate-logo-hover",
        )}
        style={{ width: size, height: size }}
        draggable={false}
      />
    </span>
  );
}
