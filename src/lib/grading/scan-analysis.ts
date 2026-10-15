export const scanFlagLabels = {
  blur: "Возможна нерезкость",
  dark: "Недостаточно света",
  glare: "Возможны блики",
  cut_edges: "Проверьте края листа",
  low_resolution: "Низкое разрешение",
  possible_duplicate: "Возможный повтор листа",
} as const;
export type ScanFlag = keyof typeof scanFlagLabels;
export type ScanQuality = {
  sharpness: number;
  brightness: number;
  flags: ScanFlag[];
};
export function grayPixels(rgba: Uint8ClampedArray) {
  const gray = new Uint8Array(rgba.length / 4);
  for (let i = 0; i < gray.length; i++)
    gray[i] = Math.round(
      rgba[i * 4] * 0.299 + rgba[i * 4 + 1] * 0.587 + rgba[i * 4 + 2] * 0.114,
    );
  return gray;
}
export function pixelDifference(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length || !a.length) return 255;
  let total = 0;
  for (let i = 0; i < a.length; i++) total += Math.abs(a[i] - b[i]);
  return total / a.length;
}
export function hashDistance(a: string, b: string) {
  if (a.length !== b.length || !/^[0-9a-f]+$/u.test(a + b)) return Infinity;
  let count = 0;
  for (let i = 0; i < a.length; i++) {
    let value = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (value) {
      count += value & 1;
      value >>= 1;
    }
  }
  return count;
}
export function perceptualHash(
  gray: Uint8Array,
  width: number,
  height: number,
) {
  const values: number[] = [];
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 17; x++) {
      let total = 0,
        count = 0;
      for (
        let iy = Math.floor((y * height) / 16);
        iy < Math.floor(((y + 1) * height) / 16);
        iy++
      )
        for (
          let ix = Math.floor((x * width) / 17);
          ix < Math.floor(((x + 1) * width) / 17);
          ix++
        ) {
          total += gray[iy * width + ix];
          count++;
        }
      values.push(total / Math.max(1, count));
    }
  let hash = "",
    digit = 0,
    bits = 0;
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      digit =
        (digit << 1) | (values[y * 17 + x] > values[y * 17 + x + 1] ? 1 : 0);
      if (++bits === 4) {
        hash += digit.toString(16);
        digit = 0;
        bits = 0;
      }
    }
  return hash;
}
export function analyzeScan(
  gray: Uint8Array,
  width: number,
  height: number,
  originalWidth = width,
  originalHeight = height,
): ScanQuality {
  if (width < 3 || height < 3 || gray.length !== width * height)
    throw new Error("Некорректное изображение для анализа.");
  let total = 0,
    sum = 0,
    squares = 0,
    count = 0,
    edgeInk = 0,
    edgeCount = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const at = y * width + x,
        value = gray[at];
      total += value;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        edgeCount++;
        if (value < 100) edgeInk++;
      }
      if (x > 0 && y > 0 && x < width - 1 && y < height - 1) {
        const lap =
          4 * value -
          gray[at - 1] -
          gray[at + 1] -
          gray[at - width] -
          gray[at + width];
        sum += lap;
        squares += lap * lap;
        count++;
      }
    }
  const brightness = total / gray.length,
    sharpness = Math.max(0, squares / count - (sum / count) ** 2),
    flags: ScanFlag[] = [];
  if (sharpness < 18) flags.push("blur");
  if (brightness < 85) flags.push("dark");
  // Clipped bright areas alone also occur on clean paper; only warn if they erase
  // nearly all contrast. This is a heuristic, never a legibility guarantee.
  if (brightness > 248 && sharpness < 30) flags.push("glare");
  if (edgeInk / edgeCount > 0.45) flags.push("cut_edges");
  if (Math.min(originalWidth, originalHeight) < 700)
    flags.push("low_resolution");
  return {
    brightness: Math.round(brightness * 100) / 100,
    sharpness: Math.round(sharpness * 100) / 100,
    flags,
  };
}
export type AutoScanState =
  "background" | "waiting" | "steady" | "captured" | "duplicate";
export class AutoScanGate {
  private background: Uint8Array | null = null;
  private previous: Uint8Array | null = null;
  private lastHash: string | null = null;
  private stableSince = 0;
  private initializedAt = 0;
  private removed = true;
  state: AutoScanState = "background";
  constructor(private readonly stabilityMs = 900) {}
  reset() {
    this.background = null;
    this.previous = null;
    this.lastHash = null;
    this.stableSince = 0;
    this.initializedAt = 0;
    this.removed = true;
    this.state = "background";
  }
  captured(hash: string) {
    this.lastHash = hash;
    this.removed = false;
    this.stableSince = 0;
    this.state = "captured";
  }
  inspect(gray: Uint8Array, width: number, height: number, now: number) {
    const hash = perceptualHash(gray, width, height);
    const motion = this.previous ? pixelDifference(gray, this.previous) : 255;
    this.previous = gray.slice();
    if (!this.background) {
      this.background = gray.slice();
      this.initializedAt = now;
      this.state = "background";
      return { capture: false, hash, state: this.state };
    }
    if (now - this.initializedAt < 600) {
      if (motion > 3) {
        this.background = gray.slice();
        this.initializedAt = now;
      }
      return { capture: false, hash, state: this.state };
    }
    const difference = pixelDifference(gray, this.background);
    let bright = 0;
    for (const v of gray) if (v > 150) bright++;
    const present = difference > 4 && bright / gray.length > 0.2;
    if (!present) {
      this.removed = true;
      this.stableSince = 0;
      this.state = "waiting";
      return { capture: false, hash, state: this.state };
    }
    if (motion > 3) {
      this.stableSince = 0;
      this.state = "steady";
      return { capture: false, hash, state: this.state };
    }
    if (!this.stableSince) this.stableSince = now;
    if (now - this.stableSince < this.stabilityMs) {
      this.state = "steady";
      return { capture: false, hash, state: this.state };
    }
    const distance = this.lastHash
      ? hashDistance(hash, this.lastHash)
      : Infinity;
    if (!this.removed) {
      this.state = distance <= 2 ? "duplicate" : "captured";
      return { capture: false, hash, state: this.state };
    }
    this.state = "steady";
    return { capture: true, hash, state: this.state };
  }
}
