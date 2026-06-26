import type { UiColorFilter } from "@/components/mardColors";

export type Lang = "zh" | "en";

export const LANG_STORAGE_KEY = "mard-bean-pocket-lang";

export function readStoredLang(): Lang {
  if (typeof window === "undefined") return "zh";
  const stored = localStorage.getItem(LANG_STORAGE_KEY);
  return stored === "en" ? "en" : "zh";
}

export function storeLang(lang: Lang): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LANG_STORAGE_KEY, lang);
}

const categoryLabels: Record<Lang, Record<UiColorFilter, string>> = {
  zh: {
    reds: "红系",
    blues: "蓝系",
    greens: "绿系",
    yellows: "黄系",
    browns: "棕系",
    grayscale: "黑白灰",
  },
  en: {
    reds: "Reds",
    blues: "Blues",
    greens: "Greens",
    yellows: "Yellows",
    browns: "Browns",
    grayscale: "Grayscale",
  },
};

export const translations = {
  zh: {
    pageTitle: "MARD BEAN POCKET - 拼豆教程生成器",
    appTitle: "MARD BEAN POCKET",
    appSubtitle: "拼豆教程生成器",
    uploadImage: "上传图片",
    dragDropUpload: "拖拽或点击上传",
    fileTypesSupported: "支持 PNG、JPG、GIF",
    removeImage: "移除图片",
    uploadedPreviewAlt: "已上传预览",
    gridSize: "阵列尺寸",
    customGridSize: (size: number) => `自定义：${size} × ${size}`,
    previewMode: "预览模式",
    previewBoth: "全部",
    previewPattern: "教程",
    previewOriginal: "原图",
    matrixFlip: "画布反转",
    flipHorizontal: "↔️ 左右反转",
    flipVertical: "↕️ 上下反转",
    generatePattern: "生成拼豆图",
    downloadPattern: "下载图纸 (PNG)",
    patternPreview: "图纸预览",
    tabPatternChart: "🧵 拼豆图纸",
    tabSizePreview: "📏 实物效果",
    uploadToStart: "上传图片开始使用",
    generateToStart: "点击「生成拼豆图」创建拼豆图纸",
    original: "原图",
    mardPattern: (size: number) => `MARD 拼豆图 (${size}×${size})`,
    estimatedFinishedSize: "预计成品尺寸：",
    finishedSizeWideHigh: (w: string, h: string) => `${w} cm 宽 × ${h} cm 高`,
    basedOnStandardBeads: (mm: number) => `基于标准 ${mm}mm 拼豆计算`,
    requiredBeadsList: "所需豆子清单",
    clickColorForSubstitution: "点击颜色打开替换面板",
    totalBeadsRequired: (total: number) => `所需豆子总数：${total}`,
    colorSubstitutionPanel: "颜色替换面板",
    replacingColor: (code: string) => `正在全局替换颜色 ${code}`,
    similarColors: "相近色推荐",
    resetToSimilar: "恢复相近色",
    noColorsInRange: "该范围内未找到 MARD 颜色，请尝试其他色系或色相。",
    crossPaletteWheel: "跨色域颜色滚轮",
    colorHueSlider: "色相滑块",
    hueAt: (deg: number) => `色相 ${Math.round(deg)}°`,
    hueRed: "红",
    hueYellow: "黄",
    hueGreen: "绿",
    hueCyan: "青",
    hueBlue: "蓝",
    hueMagenta: "品红",
    closePanel: "关闭替换面板",
    swapTo: (code: string) => `替换为 ${code}`,
    mobileClose: "关闭",
    mobileSaveTip: "💡 提示：长按图片选择「保存到相册」即可开始制作！",
    mobileSaveAria: "保存 MARD BEAN POCKET 图纸",
    patternChartAlt: "MARD 拼豆图纸",
    sharePatternTitle: "MARD BEAN POCKET Pattern",
  },
  en: {
    pageTitle: "MARD BEAN POCKET - Perler Bead Tutorial Generator",
    appTitle: "MARD BEAN POCKET",
    appSubtitle: "Perler Bead Tutorial Generator",
    uploadImage: "Upload Image",
    dragDropUpload: "Drag & drop or click to upload",
    fileTypesSupported: "PNG, JPG, GIF supported",
    removeImage: "Remove image",
    uploadedPreviewAlt: "Uploaded preview",
    gridSize: "Grid Size",
    customGridSize: (size: number) => `Custom: ${size} × ${size}`,
    previewMode: "Preview Mode",
    previewBoth: "Both",
    previewPattern: "Pattern",
    previewOriginal: "Original",
    matrixFlip: "Matrix Flip",
    flipHorizontal: "↔️ Flip Horizontal",
    flipVertical: "↕️ Flip Vertical",
    generatePattern: "Generate Pattern",
    downloadPattern: "Download Pattern (PNG)",
    patternPreview: "Pattern Preview",
    tabPatternChart: "🧵 Pattern Chart",
    tabSizePreview: "📏 Size Preview",
    uploadToStart: "Upload an image to get started",
    generateToStart: 'Click "Generate Pattern" to create your bead chart',
    original: "Original",
    mardPattern: (size: number) => `MARD Pattern (${size}×${size})`,
    estimatedFinishedSize: "Estimated Finished Size:",
    finishedSizeWideHigh: (w: string, h: string) => `${w} cm wide × ${h} cm high`,
    basedOnStandardBeads: (mm: number) => `Based on standard ${mm}mm fuse beads`,
    requiredBeadsList: "Required Beads List",
    clickColorForSubstitution: "Click a color to open the substitution panel",
    totalBeadsRequired: (total: number) => `Total Beads Required: ${total}`,
    colorSubstitutionPanel: "Color Substitution Panel",
    replacingColor: (code: string) => `Replacing ${code} across the entire pattern`,
    similarColors: "Similar Colors",
    resetToSimilar: "Reset to similar",
    noColorsInRange: "No MARD colors found in this range. Try another category or hue.",
    crossPaletteWheel: "Cross-palette Color Wheel",
    colorHueSlider: "Color Hue Slider",
    hueAt: (deg: number) => `Hue ${Math.round(deg)}°`,
    hueRed: "Red",
    hueYellow: "Yellow",
    hueGreen: "Green",
    hueCyan: "Cyan",
    hueBlue: "Blue",
    hueMagenta: "Magenta",
    closePanel: "Close substitution panel",
    swapTo: (code: string) => `Swap to ${code}`,
    mobileClose: "Close",
    mobileSaveTip:
      '💡 Tip: Long-press image to select "Save to Photos" to begin crafting!',
    mobileSaveAria: "Save MARD BEAN POCKET pattern",
    patternChartAlt: "MARD bead pattern chart",
    sharePatternTitle: "MARD BEAN POCKET Pattern",
  },
} as const satisfies Record<Lang, Record<string, string | ((...args: never[]) => string)>>;

export type Translations = (typeof translations)[Lang];

export function getTranslations(lang: Lang): Translations {
  return translations[lang] as Translations;
}

export function getUiCategoryLabel(lang: Lang, id: UiColorFilter): string {
  return categoryLabels[lang][id];
}
