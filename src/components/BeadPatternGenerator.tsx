"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type MouseEvent,
  type TouchEvent,
  type ReactNode,
} from "react";
import {
  Download,
  Grid3X3,
  ImageIcon,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import {
  getTranslations,
  getUiCategoryLabel,
  readStoredLang,
  storeLang,
  type Lang,
  type Translations,
} from "@/lib/i18n";
import {
  MARD_RGB_CACHE,
  UI_CATEGORY_LABELS,
  getIdsForUiFilter,
  getMardHex,
  getRgbEntry,
  type MardRgbEntry,
  type UiColorFilter,
} from "./mardColors";

type ColorFilterMode = "similar" | "category" | "hue";

type BeadCell = { code: string; hex: string; empty?: boolean };
type PixelMatrix = BeadCell[][];
type BeadCoord = { x: number; y: number };
type PreviewMode = "pattern" | "original" | "side-by-side";
type PanelViewMode = "chart" | "size-preview";

const BEAD_DIAMETER_MM = 5;
const GRID_SIZE_OPTIONS = [16, 29, 32, 50, 64] as const;
const EMPTY_CELL_HEX = "#FFFFFF";
const DEFAULT_BEAD: MardRgbEntry = MARD_RGB_CACHE.find((c) => c.id === "H1") ?? MARD_RGB_CACHE[0];

const BEAD_CELL_INTERACTIVE_CLASS =
  "pointer-events-auto cursor-pointer touch-manipulation [touch-action:manipulation] transition-all duration-150";

let lastBeadTouchAt = 0;

function handleTouchOrClick(
  event: MouseEvent | TouchEvent,
  x: number,
  y: number,
  onBeadClick: (x: number, y: number) => void
): void {
  event.stopPropagation();

  if (event.type === "touchend") {
    event.preventDefault();
    lastBeadTouchAt = Date.now();
    onBeadClick(x, y);
    return;
  }

  // Skip ghost click emulated after touchend on mobile browsers
  if (Date.now() - lastBeadTouchAt < 400) return;

  onBeadClick(x, y);
}

function getBeadCellInteractionProps(
  x: number,
  y: number,
  onBeadClick: (x: number, y: number) => void
) {
  return {
    onClick: (event: MouseEvent) =>
      handleTouchOrClick(event, x, y, onBeadClick),
    onTouchEnd: (event: TouchEvent) =>
      handleTouchOrClick(event, x, y, onBeadClick),
  };
}

const BEAD_CELL_TOUCH_STYLE = { touchAction: "manipulation" as const };

const BEAD_CELL_SELECTED_CLASS =
  "relative z-30 !ring-4 !ring-amber-500 scale-110 shadow-xl";
const BEAD_CELL_SELECTED_SHADOW =
  "0 0 0 4px rgb(245 158 11), 0 10px 15px -3px rgb(245 158 11 / 0.35)";

function getBeadCellSelectionClass(
  isSelected: boolean,
  hasSelection: boolean
): string {
  if (isSelected) return BEAD_CELL_SELECTED_CLASS;
  if (hasSelection) return "opacity-70 hover:opacity-100";
  return "hover:brightness-110";
}

function colorDistanceSq(
  r1: number, g1: number, b1: number,
  r2: number, g2: number, b2: number
): number {
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return dr * dr + dg * dg + db * db;
}

function createEmptyCell(): BeadCell {
  return { code: "", hex: EMPTY_CELL_HEX, empty: true };
}

function normalizeBeadCell(cell: BeadCell | null | undefined): BeadCell {
  if (!cell) return createEmptyCell();
  if (cell.empty || !cell.code) {
    return { code: "", hex: cell.hex || EMPTY_CELL_HEX, empty: true };
  }
  return {
    code: cell.code,
    hex: cell.hex || getMardHex(cell.code) || EMPTY_CELL_HEX,
    empty: false,
  };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function findClosestMardColor(r: number, g: number, b: number): BeadCell {
  let minDist = Infinity;
  let closest: BeadCell = { code: DEFAULT_BEAD.id, hex: DEFAULT_BEAD.hex };
  for (const entry of MARD_RGB_CACHE) {
    const dist = colorDistanceSq(r, g, b, entry.r, entry.g, entry.b);
    if (dist < minDist) {
      minDist = dist;
      closest = { code: entry.id, hex: entry.hex };
    }
  }
  return closest;
}

function mapPixelToBeadCell(r: number, g: number, b: number, a: number): BeadCell {
  if (isEmptyPixel(r, g, b, a)) return createEmptyCell();
  return findClosestMardColor(r, g, b);
}

function isEmptyPixel(r: number, g: number, b: number, a: number): boolean {
  if (a === 0) return true;
  return r === 255 && g === 255 && b === 255;
}

function isLightColor(hex: string): boolean {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55;
}

function hueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b);
  return Math.min(diff, 360 - diff);
}

function sortCodesByDistance(sourceCode: string, codes: string[]): string[] {
  const source = getRgbEntry(sourceCode);
  if (!source) return codes;
  return [...codes].sort((a, b) => {
    const ea = getRgbEntry(a), eb = getRgbEntry(b);
    if (!ea || !eb) return 0;
    return colorDistanceSq(source.r, source.g, source.b, ea.r, ea.g, ea.b)
         - colorDistanceSq(source.r, source.g, source.b, eb.r, eb.g, eb.b);
  });
}

function getSimilarColors(sourceCode: string, limit = 6): string[] {
  const source = getRgbEntry(sourceCode);
  if (!source) return [];
  return MARD_RGB_CACHE
    .filter((e) => e.id !== sourceCode)
    .map((e) => ({
      id: e.id,
      dist: colorDistanceSq(source.r, source.g, source.b, e.r, e.g, e.b),
    }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, limit)
    .map(({ id }) => id);
}

function getColorsByUiCategory(sourceCode: string, uiCategory: UiColorFilter): string[] {
  return sortCodesByDistance(
    sourceCode,
    getIdsForUiFilter(uiCategory).filter((id) => id !== sourceCode)
  );
}

function getColorsByHue(sourceCode: string, hue: number, tolerance = 35): string[] {
  const codes = MARD_RGB_CACHE
    .filter((e) => e.id !== sourceCode && hueDistance(e.hue, hue) <= tolerance)
    .map((e) => e.id);
  return sortCodesByDistance(sourceCode, codes);
}

function swapColorInMatrix(matrix: PixelMatrix, fromCode: string, toCode: string): PixelMatrix {
  const newHex = getMardHex(toCode);
  if (fromCode === toCode || !newHex) return matrix;
  return matrix.map((row) =>
    (row ?? []).map((cell) => {
      const normalized = normalizeBeadCell(cell);
      if (normalized.empty || normalized.code !== fromCode) return normalized;
      return { code: toCode, hex: newHex, empty: false };
    })
  );
}

function countBeads(matrix: PixelMatrix): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of matrix) {
    if (!row) continue;
    for (const rawCell of row) {
      const cell = normalizeBeadCell(rawCell);
      if (cell.empty || !cell.code) continue;
      counts[cell.code] = (counts[cell.code] ?? 0) + 1;
    }
  }
  return counts;
}

function applyMatrixFlip(
  matrix: PixelMatrix,
  flipH: boolean,
  flipV: boolean
): PixelMatrix {
  if (!matrix?.length || (!flipH && !flipV)) return matrix;

  let result = matrix.map((row) => [...(row ?? [])]);
  if (flipH) {
    result = result.map((row) => [...row].reverse());
  }
  if (flipV) {
    result = [...result].reverse();
  }
  return result;
}

function getAxisLabel(index: number, size: number, flipped: boolean): number {
  return flipped ? size - index : index + 1;
}

function displayToStorageCoords(
  displayX: number,
  displayY: number,
  gridSize: number,
  flipH: boolean,
  flipV: boolean
): BeadCoord {
  let x = displayX;
  let y = displayY;
  if (flipH) x = gridSize - 1 - x;
  if (flipV) y = gridSize - 1 - y;
  return { x, y };
}

function setBeadAtDisplayCoord(
  matrix: PixelMatrix,
  displayX: number,
  displayY: number,
  code: string,
  gridSize: number,
  flipH: boolean,
  flipV: boolean
): PixelMatrix {
  const { x, y } = displayToStorageCoords(
    displayX,
    displayY,
    gridSize,
    flipH,
    flipV
  );
  const hex = getMardHex(code);
  if (!hex) return matrix;

  const newMatrix = matrix.map((row) => [...(row ?? [])]);
  const targetRow = newMatrix[y];
  if (!targetRow) return matrix;

  targetRow[x] = { code, hex, empty: false };
  return newMatrix;
}

function pixelateImage(image: HTMLImageElement, gridSize: number): PixelMatrix {
  if (gridSize <= 0 || !image.naturalWidth || !image.naturalHeight) return [];
  try {
    const canvas = document.createElement("canvas");
    canvas.width = gridSize;
    canvas.height = gridSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) return [];
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, gridSize, gridSize);
    ctx.drawImage(image, 0, 0, gridSize, gridSize);
    const { data } = ctx.getImageData(0, 0, gridSize, gridSize);
    const matrix: PixelMatrix = [];
    for (let y = 0; y < gridSize; y++) {
      const row: BeadCell[] = [];
      for (let x = 0; x < gridSize; x++) {
        const i = (y * gridSize + x) * 4;
        row.push(mapPixelToBeadCell(data[i] ?? 255, data[i + 1] ?? 255, data[i + 2] ?? 255, data[i + 3] ?? 255));
      }
      matrix.push(row);
    }
    return matrix;
  } catch (error) {
    console.error("Failed to pixelate image:", error);
    return [];
  }
}

function drawPatternToCanvas(
  matrix: PixelMatrix,
  cellSize: number,
  labelSize: number,
  isFlippedH = false,
  isFlippedV = false
): HTMLCanvasElement {
  const gridSize = matrix.length;
  const patternSize = gridSize * cellSize;
  const canvas = document.createElement("canvas");
  canvas.width = patternSize + labelSize * 2;
  canvas.height = patternSize + labelSize * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const offset = labelSize;
  ctx.fillStyle = "#374151";
  ctx.font = `bold ${Math.max(10, cellSize * 0.35)}px monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let col = 0; col < gridSize; col++) {
    const x = offset + col * cellSize + cellSize / 2;
    const colLabel = getAxisLabel(col, gridSize, isFlippedH);
    ctx.fillText(String(colLabel), x, labelSize / 2);
    ctx.fillText(String(colLabel), x, canvas.height - labelSize / 2);
  }
  for (let row = 0; row < gridSize; row++) {
    const y = offset + row * cellSize + cellSize / 2;
    const rowLabel = getAxisLabel(row, gridSize, isFlippedV);
    ctx.fillText(String(rowLabel), labelSize / 2, y);
    ctx.fillText(String(rowLabel), canvas.width - labelSize / 2, y);
  }
  ctx.font = `bold ${Math.max(6, cellSize * 0.28)}px monospace`;
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const cell = normalizeBeadCell(matrix[row]?.[col]);
      const x = offset + col * cellSize, y = offset + row * cellSize;
      ctx.fillStyle = cell.hex;
      ctx.fillRect(x, y, cellSize, cellSize);
      if (!cell.empty && cell.code) {
        ctx.fillStyle = isLightColor(cell.hex) ? "#1a1a1a" : "#ffffff";
        ctx.fillText(cell.code, x + cellSize / 2, y + cellSize / 2);
      }
    }
  }
  ctx.strokeStyle = "#d1d5db";
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= gridSize; i++) {
    const pos = offset + i * cellSize;
    ctx.beginPath(); ctx.moveTo(offset, pos); ctx.lineTo(offset + patternSize, pos); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pos, offset); ctx.lineTo(pos, offset + patternSize); ctx.stroke();
  }
  ctx.strokeStyle = "#374151";
  ctx.lineWidth = 2;
  for (let i = 0; i <= gridSize; i += 5) {
    const pos = offset + i * cellSize;
    ctx.beginPath(); ctx.moveTo(offset, pos); ctx.lineTo(offset + patternSize, pos); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pos, offset); ctx.lineTo(pos, offset + patternSize); ctx.stroke();
  }
  ctx.strokeStyle = "#1f2937";
  ctx.lineWidth = 3;
  ctx.strokeRect(offset, offset, patternSize, patternSize);
  return canvas;
}

function downloadCanvas(canvas: HTMLCanvasElement, filename: string): void {
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";
  const mobileUa =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const hasTouch =
    "ontouchstart" in window || (navigator.maxTouchPoints ?? 0) > 0;
  const narrowViewport = window.matchMedia("(max-width: 768px)").matches;
  return mobileUa || (hasTouch && narrowViewport);
}

function canvasToPngFile(
  canvas: HTMLCanvasElement,
  filename: string
): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to export PNG"));
          return;
        }
        resolve(new File([blob], filename, { type: "image/png" }));
      },
      "image/png",
      1
    );
  });
}

async function sharePatternImage(
  file: File,
  title: string
): Promise<"shared" | "unsupported" | "cancelled"> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return "unsupported";
  }

  const shareData: ShareData = {
    files: [file],
    title,
  };

  try {
    if (typeof navigator.canShare === "function" && !navigator.canShare(shareData)) {
      return "unsupported";
    }
    await navigator.share(shareData);
    return "shared";
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return "cancelled";
    }
    return "unsupported";
  }
}

function LanguageSwitcher({
  lang,
  onChange,
}: {
  lang: Lang;
  onChange: (lang: Lang) => void;
}) {
  return (
    <div
      className="flex shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-1 shadow-sm"
      role="group"
      aria-label="Language"
    >
      {(
        [
          ["zh", "中文"],
          ["en", "EN"],
        ] as const
      ).map(([code, label]) => (
        <button
          key={code}
          type="button"
          onClick={() => onChange(code)}
          className={`rounded-md px-3 py-1.5 text-xs font-bold tracking-wide transition-all ${
            lang === code
              ? "bg-white text-amber-600 shadow-sm ring-1 ring-amber-200/80"
              : "text-slate-500 hover:bg-white/60 hover:text-amber-600"
          }`}
          aria-pressed={lang === code}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function MobileSavePatternModal({
  imageSrc,
  onClose,
  t,
}: {
  imageSrc: string;
  onClose: () => void;
  t: Translations;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t.mobileSaveAria}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-lg px-2 py-1 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700"
        >
          {t.mobileClose}
        </button>

        <div className="border-b border-slate-100 px-4 pb-3 pt-5">
          <p className="text-center text-sm font-bold tracking-wide text-slate-800">
            {t.appTitle}
          </p>
          <p className="mt-0.5 text-center text-xs text-slate-500">
            {t.appSubtitle}
          </p>
        </div>

        <div className="overflow-auto bg-slate-50 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageSrc}
            alt={t.patternChartAlt}
            className="mx-auto block max-w-full rounded-lg border border-slate-200 bg-white shadow-sm"
            style={{ imageRendering: "pixelated" }}
          />
        </div>

        <p className="border-t border-slate-100 px-4 py-4 text-center text-sm leading-relaxed text-slate-600">
          {t.mobileSaveTip}
        </p>
      </div>
    </div>
  );
}

function ChartScrollViewport({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`w-full min-w-0 max-w-full overflow-x-auto overflow-y-auto overscroll-x-contain overscroll-y-contain scroll-smooth px-4 py-4 [touch-action:pan-x_pan-y] [-webkit-overflow-scrolling:touch] ${className}`}
    >
      <div className="w-max min-w-min">{children}</div>
    </div>
  );
}

// ─── Sub-components (defined before default export for stable bundling) ───────

function ColorSwatchButton({
  code,
  onClick,
  swapLabel,
  size = "md",
  showLabel = true,
}: {
  code: string;
  onClick: () => void;
  swapLabel: (code: string) => string;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}) {
  const hex = getMardHex(code);
  if (!hex) return null;

  const dim =
    size === "lg" ? "h-11 w-11" : size === "md" ? "h-9 w-9" : "h-7 w-7";

  return (
    <button
      type="button"
      onClick={onClick}
      title={swapLabel(code)}
      className="group flex flex-col items-center gap-1 rounded-lg p-1 transition-transform hover:scale-105"
    >
      <span
        className={`${dim} rounded-full border-2 border-white shadow-md ring-1 ring-stone-300 transition-shadow group-hover:ring-amber-400`}
        style={{ backgroundColor: hex }}
      />
      {showLabel && (
        <span className="text-[10px] font-bold text-stone-600">{code}</span>
      )}
    </button>
  );
}

function ColorSubstitutionPanel({
  activeCode,
  options,
  filterMode,
  activeCategory,
  hueValue,
  lang,
  t,
  onSwap,
  onCategorySelect,
  onHueChange,
  onResetFilter,
  onClose,
}: {
  activeCode: string;
  options: string[];
  filterMode: ColorFilterMode;
  activeCategory: UiColorFilter | null;
  hueValue: number;
  lang: Lang;
  t: Translations;
  onSwap: (from: string, to: string) => void;
  onCategorySelect: (category: UiColorFilter) => void;
  onHueChange: (hue: number) => void;
  onResetFilter: () => void;
  onClose: () => void;
}) {
  const activeHex = getMardHex(activeCode) ?? "#FFFFFF";

  return (
    <div className="mt-5 overflow-hidden rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50/80 to-white shadow-inner">
      <div className="flex items-center justify-between border-b border-amber-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <span
            className="h-8 w-8 rounded-lg border border-stone-300 shadow-sm"
            style={{ backgroundColor: activeHex }}
          />
          <div>
            <p className="text-sm font-bold text-stone-800">
              {t.colorSubstitutionPanel}
            </p>
            <p className="text-xs text-stone-500">
              {t.replacingColor(activeCode)}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-lg leading-none text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
          aria-label={t.closePanel}
        >
          ×
        </button>
      </div>

      <div className="space-y-5 p-4">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-stone-600">
              {t.similarColors}
              {filterMode === "category" && activeCategory && (
                <span className="ml-2 normal-case text-amber-600">
                  — {getUiCategoryLabel(lang, activeCategory)}
                </span>
              )}
              {filterMode === "hue" && (
                <span className="ml-2 normal-case text-amber-600">
                  — {t.hueAt(hueValue)}
                </span>
              )}
            </p>
            {filterMode !== "similar" && (
              <button
                type="button"
                onClick={onResetFilter}
                className="text-xs font-medium text-amber-600 hover:text-amber-700"
              >
                {t.resetToSimilar}
              </button>
            )}
          </div>

          {options.length > 0 ? (
            <div className="flex flex-wrap gap-3">
              {options.map((code) => (
                <ColorSwatchButton
                  key={code}
                  code={code}
                  size="lg"
                  swapLabel={t.swapTo}
                  onClick={() => onSwap(activeCode, code)}
                />
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-stone-200 bg-white/60 px-4 py-6 text-center text-sm text-stone-400">
              {t.noColorsInRange}
            </p>
          )}
        </div>

        <div className="rounded-lg border border-stone-200 bg-white/70 p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-stone-600">
            {t.crossPaletteWheel}
          </p>

          <div className="mb-4 flex flex-wrap gap-2">
            {UI_CATEGORY_LABELS.map(({ id }) => (
              <button
                key={id}
                type="button"
                onClick={() => onCategorySelect(id)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                  filterMode === "category" && activeCategory === id
                    ? "bg-amber-500 text-white shadow-sm"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
              >
                {getUiCategoryLabel(lang, id)}
              </button>
            ))}
          </div>

          <div>
            <label
              htmlFor="hue-slider"
              className="mb-2 block text-xs font-medium text-stone-500"
            >
              {t.colorHueSlider}
            </label>
            <input
              id="hue-slider"
              type="range"
              min={0}
              max={360}
              value={hueValue}
              onChange={(e) => onHueChange(Number(e.target.value))}
              className="h-3 w-full cursor-pointer appearance-none rounded-full accent-amber-500"
              style={{
                background: `linear-gradient(to right,
                  hsl(0,80%,55%), hsl(60,80%,55%), hsl(120,80%,45%),
                  hsl(180,80%,45%), hsl(240,80%,55%), hsl(300,80%,55%), hsl(360,80%,55%))`,
              }}
            />
            <div className="mt-1 flex justify-between text-[10px] text-stone-400">
              <span>{t.hueRed}</span>
              <span>{t.hueYellow}</span>
              <span>{t.hueGreen}</span>
              <span>{t.hueCyan}</span>
              <span>{t.hueBlue}</span>
              <span>{t.hueMagenta}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OriginalPreviewCard({
  imageSrc,
  t,
}: {
  imageSrc: string;
  t: Translations;
}) {
  return (
    <div className="mx-auto w-full max-w-[220px]">
      <p className="mb-2 text-center text-xs font-medium uppercase tracking-wide text-slate-400">
        {t.original}
      </p>
      <div className="w-full overflow-hidden rounded-lg border border-slate-200 bg-[repeating-conic-gradient(#e2e8f0_0%_25%,#fff_0%_50%)] bg-[length:12px_12px] p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageSrc}
          alt={t.original}
          className="mx-auto block w-full max-w-full object-contain"
          style={{ imageRendering: "pixelated" }}
        />
      </div>
    </div>
  );
}

function formatPhysicalCm(gridSize: number): string {
  return (gridSize * (BEAD_DIAMETER_MM / 10)).toFixed(1);
}

/** Bead cells must exceed 2× radius or 6px corners render as circles. */
const SIZE_PREVIEW_MIN_CELL_PX = 14;

function sizePreviewCellSize(gridSize: number): number {
  if (gridSize <= 16) return 22;
  if (gridSize <= 29) return 16;
  return SIZE_PREVIEW_MIN_CELL_PX;
}

function DimensionBracketVertical({
  height,
  label,
}: {
  height: number;
  label: string;
}) {
  return (
    <div
      className="flex shrink-0 items-center justify-center pr-3"
      style={{ height }}
      aria-hidden
    >
      <div className="relative flex h-full w-5 items-center justify-center">
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-slate-300" />
        <div className="absolute top-0 left-0 h-px w-2 bg-slate-300" />
        <div className="absolute top-0 right-0 h-px w-2 bg-slate-300" />
        <div className="absolute bottom-0 left-0 h-px w-2 bg-slate-300" />
        <div className="absolute bottom-0 right-0 h-px w-2 bg-slate-300" />
        <span className="relative z-10 bg-white px-0.5 text-[11px] font-semibold tracking-wide text-slate-500 [writing-mode:vertical-rl]">
          {label}
        </span>
      </div>
    </div>
  );
}

function DimensionBracketHorizontal({
  width,
  label,
}: {
  width: number;
  label: string;
}) {
  return (
    <div
      className="flex shrink-0 flex-col items-center justify-center pt-3"
      style={{ width }}
      aria-hidden
    >
      <div className="relative flex h-5 w-full items-center justify-center">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-slate-300" />
        <div className="absolute top-0 left-0 w-px h-2 bg-slate-300" />
        <div className="absolute bottom-0 left-0 w-px h-2 bg-slate-300" />
        <div className="absolute top-0 right-0 w-px h-2 bg-slate-300" />
        <div className="absolute bottom-0 right-0 w-px h-2 bg-slate-300" />
        <span className="relative z-10 bg-white px-2 text-[11px] font-semibold tracking-wide text-slate-500">
          {label}
        </span>
      </div>
    </div>
  );
}

function SizePreviewBeadCell({
  cell,
  cellSize,
  col,
  row,
  isSelected,
  hasSelection,
  onBeadClick,
}: {
  cell: BeadCell;
  cellSize: number;
  col: number;
  row: number;
  isSelected: boolean;
  hasSelection: boolean;
  onBeadClick: (x: number, y: number) => void;
}) {
  const beadStyle = {
    width: cellSize,
    height: cellSize,
    minWidth: cellSize,
    minHeight: cellSize,
    zIndex: isSelected ? 30 : 1,
    boxShadow: isSelected ? BEAD_CELL_SELECTED_SHADOW : undefined,
    ...BEAD_CELL_TOUCH_STYLE,
  };

  const selectionClass = getBeadCellSelectionClass(isSelected, hasSelection);
  const sharedClass = `${BEAD_CELL_INTERACTIVE_CLASS} ${selectionClass}`;
  const interactionProps = getBeadCellInteractionProps(col, row, onBeadClick);

  if (cell.empty || !cell.code) {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-pressed={isSelected}
        {...interactionProps}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onBeadClick(col, row);
          }
        }}
        className={`block aspect-square shrink-0 rounded-[6px] ${sharedClass}`}
        style={beadStyle}
      />
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      {...interactionProps}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onBeadClick(col, row);
        }
      }}
      className={`block aspect-square shrink-0 rounded-[6px] shadow-[inset_0_-1px_2px_rgba(0,0,0,0.12),0_0.5px_1px_rgba(255,255,255,0.35)] ${sharedClass}`}
      style={{
        ...beadStyle,
        backgroundColor: cell.hex,
      }}
    />
  );
}

function PhysicalSizePreview({
  matrix,
  gridSize,
  t,
  selectedBead,
  onBeadClick,
}: {
  matrix: PixelMatrix;
  gridSize: number;
  t: Translations;
  selectedBead: BeadCoord | null;
  onBeadClick: (x: number, y: number) => void;
}) {
  if (!matrix?.length) return null;

  const cellSize = sizePreviewCellSize(gridSize);
  const plateSize = gridSize * cellSize;
  const cmLabel = `${formatPhysicalCm(gridSize)} cm`;
  const cmWide = formatPhysicalCm(gridSize);
  const cmHigh = formatPhysicalCm(gridSize);
  const hasSelection = selectedBead !== null;

  return (
    <div className="w-max min-w-min">
      <p className="mb-5 text-center text-sm font-bold text-slate-800">
        {t.estimatedFinishedSize}{" "}
        <span className="text-amber-700">
          {t.finishedSizeWideHigh(cmWide, cmHigh)}
        </span>
        <span className="mt-0.5 block text-xs font-normal text-slate-500">
          {t.basedOnStandardBeads(BEAD_DIAMETER_MM)}
        </span>
      </p>

      <div className="inline-flex items-start">
        <DimensionBracketVertical height={plateSize} label={cmLabel} />

        <div className="flex flex-col items-center">
          <div
            className="relative overflow-visible rounded-sm shadow-md ring-1 ring-slate-200/80"
            style={{
              width: plateSize,
              height: plateSize,
              background:
                "linear-gradient(145deg, #f8fafc 0%, #e2e8f0 50%, #f1f5f9 100%)",
            }}
          >
            <div
              className="relative grid gap-0 overflow-visible"
              style={{
                gridTemplateColumns: `repeat(${gridSize}, ${cellSize}px)`,
                gridTemplateRows: `repeat(${gridSize}, ${cellSize}px)`,
                width: plateSize,
                height: plateSize,
              }}
            >
              {matrix.map((row, rowIdx) =>
                (row ?? []).map((rawCell, colIdx) => (
                  <SizePreviewBeadCell
                    key={`${rowIdx}-${colIdx}`}
                    cell={normalizeBeadCell(rawCell)}
                    cellSize={cellSize}
                    col={colIdx}
                    row={rowIdx}
                    isSelected={
                      selectedBead?.x === colIdx && selectedBead?.y === rowIdx
                    }
                    hasSelection={hasSelection}
                    onBeadClick={onBeadClick}
                  />
                ))
              )}
            </div>
          </div>

          <DimensionBracketHorizontal width={plateSize} label={cmLabel} />
        </div>
      </div>
    </div>
  );
}

function PatternGrid({
  matrix,
  cellSize,
  isFlippedH = false,
  isFlippedV = false,
  selectedBead,
  onBeadClick,
}: {
  matrix: PixelMatrix;
  cellSize: number;
  isFlippedH?: boolean;
  isFlippedV?: boolean;
  selectedBead: BeadCoord | null;
  onBeadClick: (x: number, y: number) => void;
}) {
  if (!matrix?.length) return null;

  const gridSize = matrix.length;
  const labelWidth = 24;
  const patternWidth = gridSize * cellSize;
  const totalWidth = patternWidth + labelWidth * 2;
  const hasSelection = selectedBead !== null;

  return (
    <div className="inline-block w-max min-w-min" style={{ width: totalWidth }}>
      <div className="flex" style={{ marginLeft: labelWidth }}>
        {Array.from({ length: gridSize }, (_, col) => (
          <div
            key={`col-top-${col}`}
            className="flex items-center justify-center text-[10px] font-bold text-stone-500"
            style={{ width: cellSize, height: labelWidth }}
          >
            {getAxisLabel(col, gridSize, isFlippedH)}
          </div>
        ))}
      </div>

      <div className="flex">
        <div className="flex flex-col" style={{ width: labelWidth }}>
          {Array.from({ length: gridSize }, (_, row) => (
            <div
              key={`row-left-${row}`}
              className="flex items-center justify-center text-[10px] font-bold text-stone-500"
              style={{ height: cellSize }}
            >
              {getAxisLabel(row, gridSize, isFlippedV)}
            </div>
          ))}
        </div>

        <div
          className="relative overflow-visible border-[3px] border-stone-700"
          style={{ width: patternWidth, height: patternWidth }}
        >
          {matrix.map((row, rowIdx) =>
            (row ?? []).map((rawCell, colIdx) => {
              const cell = normalizeBeadCell(rawCell);
              const isThickRight = (colIdx + 1) % 5 === 0;
              const isThickBottom = (rowIdx + 1) % 5 === 0;
              const isLastCol = colIdx === gridSize - 1;
              const isLastRow = rowIdx === gridSize - 1;
              const isSelected =
                selectedBead?.x === colIdx && selectedBead?.y === rowIdx;
              const selectionClass = getBeadCellSelectionClass(
                isSelected,
                hasSelection
              );
              const interactionProps = getBeadCellInteractionProps(
                colIdx,
                rowIdx,
                onBeadClick
              );

              return (
                <div
                  role="button"
                  tabIndex={0}
                  key={`${rowIdx}-${colIdx}`}
                  aria-pressed={isSelected}
                  {...interactionProps}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onBeadClick(colIdx, rowIdx);
                    }
                  }}
                  className={`absolute flex items-center justify-center ${BEAD_CELL_INTERACTIVE_CLASS} ${selectionClass}`}
                  style={{
                    left: colIdx * cellSize,
                    top: rowIdx * cellSize,
                    width: cellSize,
                    height: cellSize,
                    backgroundColor: cell.hex,
                    borderRight: isLastCol
                      ? "none"
                      : isThickRight
                        ? "2px solid #374151"
                        : "0.5px solid #d1d5db",
                    borderBottom: isLastRow
                      ? "none"
                      : isThickBottom
                        ? "2px solid #374151"
                        : "0.5px solid #d1d5db",
                    color: isLightColor(cell.hex) ? "#1a1a1a" : "#ffffff",
                    fontWeight: 700,
                    fontFamily: "monospace",
                    lineHeight: 1,
                    zIndex: isSelected ? 30 : 1,
                    boxShadow: isSelected ? BEAD_CELL_SELECTED_SHADOW : undefined,
                    ...BEAD_CELL_TOUCH_STYLE,
                  }}
                >
                  <span
                    className="pointer-events-none"
                    style={{
                      fontSize: Math.max(4, cellSize * 0.32),
                      overflow: "hidden",
                      textOverflow: "clip",
                      whiteSpace: "nowrap",
                      maxWidth: "100%",
                      padding: "0 1px",
                    }}
                  >
                    {!cell.empty && cell.code ? cell.code : ""}
                  </span>
                </div>
              );
            })
          )}
        </div>

        <div className="flex flex-col" style={{ width: labelWidth }}>
          {Array.from({ length: gridSize }, (_, row) => (
            <div
              key={`row-right-${row}`}
              className="flex items-center justify-center text-[10px] font-bold text-stone-500"
              style={{ height: cellSize }}
            >
              {getAxisLabel(row, gridSize, isFlippedV)}
            </div>
          ))}
        </div>
      </div>

      <div className="flex" style={{ marginLeft: labelWidth }}>
        {Array.from({ length: gridSize }, (_, col) => (
          <div
            key={`col-bottom-${col}`}
            className="flex items-center justify-center text-[10px] font-bold text-stone-500"
            style={{ width: cellSize, height: labelWidth }}
          >
            {getAxisLabel(col, gridSize, isFlippedH)}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function BeadPatternGenerator() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(
    null
  );
  const [gridSize, setGridSize] = useState<number>(16);
  const [pixelMatrix, setPixelMatrix] = useState<PixelMatrix | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("side-by-side");
  const [panelViewMode, setPanelViewMode] = useState<PanelViewMode>("chart");
  const [isDragging, setIsDragging] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [activeColorId, setActiveColorId] = useState<string | null>(null);
  const [colorFilterMode, setColorFilterMode] =
    useState<ColorFilterMode>("similar");
  const [activeCategory, setActiveCategory] = useState<UiColorFilter | null>(
    null
  );
  const [hueValue, setHueValue] = useState(30);
  const [isFlippedH, setIsFlippedH] = useState(false);
  const [isFlippedV, setIsFlippedV] = useState(false);
  const [mobileSaveModalSrc, setMobileSaveModalSrc] = useState<string | null>(
    null
  );
  const [lang, setLang] = useState<Lang>("zh");
  const [selectedBead, setSelectedBead] = useState<BeadCoord | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const t = useMemo(() => getTranslations(lang), [lang]);

  useEffect(() => {
    setLang(readStoredLang());
  }, []);

  useEffect(() => {
    storeLang(lang);
    document.title = getTranslations(lang).pageTitle;
  }, [lang]);

  const displayMatrix = useMemo(
    () =>
      pixelMatrix
        ? applyMatrixFlip(pixelMatrix, isFlippedH, isFlippedV)
        : null,
    [pixelMatrix, isFlippedH, isFlippedV]
  );

  const beadCounts = useMemo(
    () => (pixelMatrix ? countBeads(pixelMatrix) : {}),
    [pixelMatrix]
  );

  const totalBeads = useMemo(
    () => Object.values(beadCounts).reduce((sum, n) => sum + n, 0),
    [beadCounts]
  );

  const sortedBeadCounts = useMemo(
    () =>
      Object.entries(beadCounts)
        .filter(([code]) => Boolean(code) && Boolean(getMardHex(code)))
        .sort(
          ([a], [b]) => (beadCounts[b] ?? 0) - (beadCounts[a] ?? 0)
        ),
    [beadCounts]
  );

  const substitutionOptions = useMemo(() => {
    if (!activeColorId) return [];

    if (colorFilterMode === "category" && activeCategory) {
      return getColorsByUiCategory(activeColorId, activeCategory);
    }

    if (colorFilterMode === "hue") {
      return getColorsByHue(activeColorId, hueValue);
    }

    return getSimilarColors(activeColorId, 6);
  }, [activeColorId, colorFilterMode, activeCategory, hueValue]);

  const handleBeadClick = useCallback((x: number, y: number) => {
    setSelectedBead((prev) =>
      prev && prev.x === x && prev.y === y ? null : { x, y }
    );
  }, []);

  const injectColorAtSelectedBead = useCallback(
    (code: string) => {
      if (!pixelMatrix || !selectedBead || !getMardHex(code)) return;
      setPixelMatrix(
        setBeadAtDisplayCoord(
          pixelMatrix,
          selectedBead.x,
          selectedBead.y,
          code,
          gridSize,
          isFlippedH,
          isFlippedV
        )
      );
      setSelectedBead(null);
    },
    [pixelMatrix, selectedBead, gridSize, isFlippedH, isFlippedV]
  );

  const handleBadgeClick = useCallback(
    (code: string) => {
      if (selectedBead) {
        injectColorAtSelectedBead(code);
        return;
      }
      setActiveColorId((prev) => (prev === code ? null : code));
      setColorFilterMode("similar");
      setActiveCategory(null);
    },
    [selectedBead, injectColorAtSelectedBead]
  );

  const handleColorSwap = useCallback(
    (fromCode: string, toCode: string) => {
      if (selectedBead) {
        injectColorAtSelectedBead(toCode);
        return;
      }
      if (!pixelMatrix || fromCode === toCode) return;
      setPixelMatrix(swapColorInMatrix(pixelMatrix, fromCode, toCode));
      setActiveColorId(toCode);
      setColorFilterMode("similar");
      setActiveCategory(null);
    },
    [selectedBead, injectColorAtSelectedBead, pixelMatrix]
  );

  const handleCategorySelect = useCallback((category: UiColorFilter) => {
    setColorFilterMode("category");
    setActiveCategory(category);
  }, []);

  const handleHueChange = useCallback((hue: number) => {
    setHueValue(hue);
    setColorFilterMode("hue");
    setActiveCategory(null);
  }, []);

  const resetFlipState = useCallback(() => {
    setIsFlippedH(false);
    setIsFlippedV(false);
  }, []);

  const resetSwapState = useCallback(() => {
    setActiveColorId(null);
    setColorFilterMode("similar");
    setActiveCategory(null);
    setSelectedBead(null);
  }, []);

  const loadImage = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const src = e.target?.result as string;
        setImageSrc(src);
        const img = new Image();
        img.onload = () => {
          setImageElement(img);
          setPixelMatrix(null);
          setHasGenerated(false);
          resetSwapState();
          resetFlipState();
        };
        img.src = src;
      };
      reader.readAsDataURL(file);
    },
    [resetSwapState, resetFlipState]
  );

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadImage(file);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) loadImage(file);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const generatePattern = useCallback(() => {
    if (!imageElement) return;
    try {
      const matrix = pixelateImage(imageElement, gridSize);
      if (matrix.length === 0) return;
      setPixelMatrix(matrix);
      setHasGenerated(true);
      resetSwapState();
    } catch (error) {
      console.error("Failed to generate pattern:", error);
    }
  }, [imageElement, gridSize, resetSwapState]);

  const handleDownload = useCallback(async () => {
    if (!displayMatrix) return;

    const cellSize = gridSize <= 16 ? 32 : gridSize <= 29 ? 24 : 16;
    const labelSize = 28;
    const filename = `mard-bead-pattern-${gridSize}x${gridSize}.png`;
    const canvas = drawPatternToCanvas(
      displayMatrix,
      cellSize,
      labelSize,
      isFlippedH,
      isFlippedV
    );

    if (!isMobileDevice()) {
      downloadCanvas(canvas, filename);
      return;
    }

    try {
      const file = await canvasToPngFile(canvas, filename);
      const shareResult = await sharePatternImage(file, t.sharePatternTitle);
      if (shareResult === "shared" || shareResult === "cancelled") return;
    } catch (error) {
      console.warn("Mobile share unavailable, opening save modal:", error);
    }

    setMobileSaveModalSrc(canvas.toDataURL("image/png"));
  }, [displayMatrix, gridSize, isFlippedH, isFlippedV, t.sharePatternTitle]);

  useEffect(() => {
    if (hasGenerated && imageElement) {
      try {
        const matrix = pixelateImage(imageElement, gridSize);
        if (matrix.length > 0) {
          setPixelMatrix(matrix);
          resetSwapState();
        }
      } catch (error) {
        console.error("Failed to regenerate pattern:", error);
      }
    }
  }, [gridSize, hasGenerated, imageElement, resetSwapState]);

  useEffect(() => {
    setSelectedBead(null);
  }, [isFlippedH, isFlippedV]);

  useEffect(() => {
    if (activeColorId && !beadCounts[activeColorId]) {
      setActiveColorId(null);
    }
  }, [activeColorId, beadCounts]);

  const clearImage = () => {
    setImageSrc(null);
    setImageElement(null);
    setPixelMatrix(null);
    setHasGenerated(false);
    resetSwapState();
    resetFlipState();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const cellDisplaySize =
    gridSize <= 16 ? 28 : gridSize <= 29 ? 20 : gridSize <= 50 ? 14 : 10;

  return (
    <div className="dashboard-bg min-h-screen">
      <header className="pixel-bg border-b border-slate-200 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 shadow-sm">
              <Grid3X3 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                {t.appTitle}
              </h1>
              <p className="text-sm text-slate-500">{t.appSubtitle}</p>
            </div>
          </div>
          <LanguageSwitcher lang={lang} onChange={setLang} />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-6 lg:flex-row">
          <aside className="w-full shrink-0 lg:w-80">
            <div className="sticky top-6 space-y-5 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div>
                <label className="mb-2 block text-sm font-semibold text-stone-700">
                  {t.uploadImage}
                </label>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) =>
                    e.key === "Enter" && fileInputRef.current?.click()
                  }
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  className={`relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 transition-colors ${
                    isDragging
                      ? "border-amber-400 bg-amber-50"
                      : "border-stone-300 bg-stone-50 hover:border-amber-300 hover:bg-amber-50/50"
                  }`}
                >
                  {imageSrc ? (
                    <div className="relative w-full">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imageSrc}
                        alt={t.uploadedPreviewAlt}
                        className="mx-auto max-h-36 rounded-lg object-contain"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          clearImage();
                        }}
                        className="absolute -right-2 -top-2 rounded-full bg-stone-800 p-1 text-white shadow hover:bg-stone-700"
                        aria-label={t.removeImage}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <Upload className="mb-2 h-8 w-8 text-stone-400" />
                      <p className="text-sm font-medium text-stone-600">
                        {t.dragDropUpload}
                      </p>
                      <p className="mt-1 text-xs text-stone-400">
                        {t.fileTypesSupported}
                      </p>
                    </>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="grid-size"
                  className="mb-2 block text-sm font-semibold text-stone-700"
                >
                  {t.gridSize}
                </label>
                <select
                  id="grid-size"
                  value={gridSize}
                  onChange={(e) => setGridSize(Number(e.target.value))}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm font-medium text-stone-800 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
                >
                  {GRID_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size} × {size}
                    </option>
                  ))}
                </select>
                <input
                  type="range"
                  min={8}
                  max={64}
                  step={1}
                  value={gridSize}
                  onChange={(e) => setGridSize(Number(e.target.value))}
                  className="mt-3 w-full accent-amber-500"
                />
                <p className="mt-1 text-center text-xs text-stone-400">
                  {t.customGridSize(gridSize)}
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-stone-700">
                  {t.previewMode}
                </label>
                <div className="flex rounded-lg border border-stone-200 bg-stone-50 p-1">
                  {(
                    [
                      ["side-by-side", t.previewBoth],
                      ["pattern", t.previewPattern],
                      ["original", t.previewOriginal],
                    ] as const
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setPreviewMode(mode)}
                      className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                        previewMode === mode
                          ? "bg-white text-amber-700 shadow-sm"
                          : "text-stone-500 hover:text-stone-700"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-stone-700">
                  {t.matrixFlip}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={!pixelMatrix}
                    onClick={() => setIsFlippedH((prev) => !prev)}
                    className={`rounded-lg border px-2 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      isFlippedH
                        ? "border-amber-500 bg-amber-50 text-amber-700 shadow-sm"
                        : "border-stone-200 bg-stone-50 text-stone-600 hover:border-amber-300 hover:bg-amber-50/60"
                    }`}
                  >
                    {t.flipHorizontal}
                  </button>
                  <button
                    type="button"
                    disabled={!pixelMatrix}
                    onClick={() => setIsFlippedV((prev) => !prev)}
                    className={`rounded-lg border px-2 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      isFlippedV
                        ? "border-amber-500 bg-amber-50 text-amber-700 shadow-sm"
                        : "border-stone-200 bg-stone-50 text-stone-600 hover:border-amber-300 hover:bg-amber-50/60"
                    }`}
                  >
                    {t.flipVertical}
                  </button>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={generatePattern}
                  disabled={!imageElement}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Sparkles className="h-4 w-4" />
                  {t.generatePattern}
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={!pixelMatrix}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-semibold text-stone-700 shadow-sm transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Download className="h-4 w-4" />
                  {t.downloadPattern}
                </button>
              </div>
            </div>
          </aside>

          <section className="min-w-0 flex-1">
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <ImageIcon className="h-4 w-4" />
                  {t.patternPreview}
                </h2>
                {pixelMatrix && (
                  <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
                    {(
                      [
                        ["chart", t.tabPatternChart],
                        ["size-preview", t.tabSizePreview],
                      ] as const
                    ).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setPanelViewMode(mode)}
                        className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                          panelViewMode === mode
                            ? "bg-white text-amber-700 shadow-sm"
                            : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {!imageElement ? (
                <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50">
                  <p className="text-sm text-slate-400">
                    {t.uploadToStart}
                  </p>
                </div>
              ) : !pixelMatrix ? (
                <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50">
                  <p className="text-sm text-slate-400">
                    {t.generateToStart}
                  </p>
                </div>
              ) : panelViewMode === "size-preview" ? (
                <div
                  className={
                    previewMode === "original" ||
                    previewMode === "side-by-side"
                      ? "grid grid-cols-1 items-start gap-6 md:grid-cols-[1fr_2fr]"
                      : "flex flex-col items-center"
                  }
                >
                  {(previewMode === "original" ||
                    previewMode === "side-by-side") && (
                    <OriginalPreviewCard imageSrc={imageSrc!} t={t} />
                  )}

                  {(previewMode === "pattern" ||
                    previewMode === "side-by-side" ||
                    previewMode === "original") && (
                    <ChartScrollViewport className="flex-1 rounded-xl border border-slate-100 bg-slate-50/60">
                      <PhysicalSizePreview
                        matrix={displayMatrix!}
                        gridSize={gridSize}
                        t={t}
                        selectedBead={selectedBead}
                        onBeadClick={handleBeadClick}
                      />
                    </ChartScrollViewport>
                  )}
                </div>
              ) : (
                <div
                  className={
                    previewMode === "side-by-side"
                      ? "grid grid-cols-1 items-start gap-6 md:grid-cols-[1fr_2fr]"
                      : "flex flex-col items-center"
                  }
                >
                  {(previewMode === "original" ||
                    previewMode === "side-by-side") && (
                    <OriginalPreviewCard imageSrc={imageSrc!} t={t} />
                  )}

                  {(previewMode === "pattern" ||
                    previewMode === "side-by-side") && (
                    <ChartScrollViewport className="flex-1">
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-400">
                        {t.mardPattern(gridSize)}
                      </p>
                      <PatternGrid
                        matrix={displayMatrix!}
                        cellSize={cellDisplaySize}
                        isFlippedH={isFlippedH}
                        isFlippedV={isFlippedV}
                        selectedBead={selectedBead}
                        onBeadClick={handleBeadClick}
                      />
                    </ChartScrollViewport>
                  )}
                </div>
              )}
            </div>

            {pixelMatrix && sortedBeadCounts.length > 0 && (
              <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-slate-800">
                  <span
                    className="inline-flex h-4 w-4 shrink-0 rounded-full border border-stone-300"
                    style={{
                      background:
                        "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
                    }}
                    aria-hidden
                  />
                  {t.requiredBeadsList}
                </h2>
                <p className="mb-4 text-xs text-stone-500">
                  {t.clickColorForSubstitution}
                </p>
                <div className="flex flex-wrap gap-3">
                  {sortedBeadCounts.map(([code, count]) => {
                    const isActive = activeColorId === code;
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => handleBadgeClick(code)}
                        className={`flex items-center gap-2 rounded-lg px-3 py-2 transition-all ${
                          isActive
                            ? "border-2 border-amber-500 bg-amber-50 shadow-md ring-2 ring-amber-200"
                            : "border border-stone-200 bg-stone-50 hover:border-amber-300 hover:bg-amber-50/60"
                        }`}
                      >
                        <span
                          className="inline-block h-5 w-5 shrink-0 rounded border border-stone-300"
                          style={{ backgroundColor: getMardHex(code) ?? "#FFFFFF" }}
                        />
                        <span className="text-sm font-semibold text-stone-700">
                          {code}
                        </span>
                        <span className="text-sm text-stone-500">({count})</span>
                      </button>
                    );
                  })}
                </div>

                {activeColorId && getMardHex(activeColorId) && (
                  <ColorSubstitutionPanel
                    activeCode={activeColorId}
                    options={substitutionOptions}
                    filterMode={colorFilterMode}
                    activeCategory={activeCategory}
                    hueValue={hueValue}
                    lang={lang}
                    t={t}
                    onSwap={handleColorSwap}
                    onCategorySelect={handleCategorySelect}
                    onHueChange={handleHueChange}
                    onResetFilter={() => {
                      setColorFilterMode("similar");
                      setActiveCategory(null);
                    }}
                    onClose={() => setActiveColorId(null)}
                  />
                )}

                <p className="mt-5 border-t border-stone-200 pt-4 text-base font-bold text-stone-900">
                  {t.totalBeadsRequired(totalBeads)}
                </p>
              </div>
            )}
          </section>
        </div>
      </main>

      {mobileSaveModalSrc && (
        <MobileSavePatternModal
          imageSrc={mobileSaveModalSrc}
          onClose={() => setMobileSaveModalSrc(null)}
          t={t}
        />
      )}
    </div>
  );
}
