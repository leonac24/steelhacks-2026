const ONES = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES: [number, string][] = [
  [1_000_000_000, "billion"],
  [1_000_000, "million"],
  [1_000, "thousand"],
];

function under1000(n: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds > 0) parts.push(`${ONES[hundreds]} hundred`);
  if (rest >= 20) {
    const ones = rest % 10;
    parts.push(
      ones ? `${TENS[Math.floor(rest / 10)]}-${ONES[ones]}` : TENS[Math.floor(rest / 10)]!,
    );
  } else if (rest > 0) {
    parts.push(ONES[rest]!);
  }
  return parts.join(" ");
}

// 1234 → "one thousand two hundred thirty-four" (American style, no "and").
export function numberToWords(n: number): string {
  if (!Number.isInteger(n) || n < 0) throw new Error(`Expected a non-negative integer, got ${n}`);
  if (n === 0) return "zero";
  const parts: string[] = [];
  let rest = n;
  for (const [size, word] of SCALES) {
    if (rest >= size) {
      parts.push(`${under1000(Math.floor(rest / size))} ${word}`);
      rest %= size;
    }
  }
  if (rest > 0) parts.push(under1000(rest));
  return parts.join(" ");
}

// Rounds to whole dollars for listening, and says "about" when it rounded.
// 8417 → "about eighty-four dollars", 5000 → "fifty dollars", 45 → "forty-five cents".
export function formatCentsForSpeech(cents: number): string {
  if (!Number.isInteger(cents)) throw new Error(`Expected integer cents, got ${cents}`);
  if (cents < 0) return `negative ${formatCentsForSpeech(-cents)}`;

  if (cents < 100) {
    return cents === 1 ? "one cent" : `${numberToWords(cents)} cents`;
  }

  const dollars = Math.round(cents / 100);
  const approx = cents % 100 !== 0 ? "about " : "";
  const unit = dollars === 1 ? "dollar" : "dollars";
  return `${approx}${numberToWords(dollars)} ${unit}`;
}
