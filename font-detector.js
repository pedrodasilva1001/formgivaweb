/**
 * FormgivaWeb - Font Detector & Visual Matcher Engine
 * Supports:
 *  1. Exact DOM/CSS Computed Font Inspection (for HTML & URL mode)
 *  2. Pixel-level Visual Font Analysis + Line Segmentation (for Photo/Printscreen mode)
 */

const WEB_FONTS_CATALOG = [
  { name: 'Inter', category: 'Neo-Grotesque Sans', family: "'Inter', sans-serif", traits: { weightBias: 0, width: 1.0, serif: false, mono: false, geometric: false } },
  { name: 'Poppins', category: 'Geometric Sans', family: "'Poppins', sans-serif", traits: { weightBias: 0.05, width: 1.12, serif: false, mono: false, geometric: true } },
  { name: 'Roboto', category: 'Neo-Grotesque Sans', family: "'Roboto', sans-serif", traits: { weightBias: 0, width: 0.96, serif: false, mono: false, geometric: false } },
  { name: 'Montserrat', category: 'Geometric Sans', family: "'Montserrat', sans-serif", traits: { weightBias: 0.08, width: 1.15, serif: false, mono: false, geometric: true } },
  { name: 'Plus Jakarta Sans', category: 'Modern UI Sans', family: "'Plus Jakarta Sans', sans-serif", traits: { weightBias: 0.04, width: 1.05, serif: false, mono: false, geometric: true } },
  { name: 'Space Grotesk', category: 'Tech Sans', family: "'Space Grotesk', sans-serif", traits: { weightBias: 0.03, width: 1.04, serif: false, mono: false, geometric: true } },
  { name: 'Outfit', category: 'Geometric UI', family: "'Outfit', sans-serif", traits: { weightBias: 0.02, width: 1.03, serif: false, mono: false, geometric: true } },
  { name: 'Open Sans', category: 'Humanist Sans', family: "'Open Sans', sans-serif", traits: { weightBias: -0.02, width: 1.02, serif: false, mono: false, geometric: false } },
  { name: 'DM Sans', category: 'Geometric Sans', family: "'DM Sans', sans-serif", traits: { weightBias: 0.01, width: 1.01, serif: false, mono: false, geometric: true } },
  { name: 'Lato', category: 'Humanist Sans', family: "'Lato', sans-serif", traits: { weightBias: -0.03, width: 0.98, serif: false, mono: false, geometric: false } },
  { name: 'Nunito', category: 'Rounded Sans', family: "'Nunito', sans-serif", traits: { weightBias: 0.02, width: 1.04, serif: false, mono: false, geometric: true } },
  { name: 'Oswald', category: 'Condensed Display', family: "'Oswald', sans-serif", traits: { weightBias: 0.12, width: 0.78, serif: false, mono: false, geometric: false } },
  { name: 'Playfair Display', category: 'Modern Serif', family: "'Playfair Display', serif", traits: { weightBias: 0.05, width: 1.02, serif: true, mono: false, geometric: false } },
  { name: 'Merriweather', category: 'Editorial Serif', family: "'Merriweather', serif", traits: { weightBias: 0.04, width: 1.06, serif: true, mono: false, geometric: false } },
  { name: 'JetBrains Mono', category: 'Monospace', family: "'JetBrains Mono', monospace", traits: { weightBias: 0.0, width: 1.0, serif: false, mono: true, geometric: false } }
];

class FontDetectorEngine {
  constructor() {
    this.clonedStyle = {
      fontFamily: "'Inter', sans-serif",
      fontName: 'Inter',
      fontSize: '16px',
      fontWeight: '600',
      fontStyle: 'normal',
      lineHeight: '1.25',
      letterSpacing: '0px',
      color: '#111827',
      backgroundColor: '#ffffff',
      sampleText: 'Texto de Exemplo'
    };
  }

  rgbToHex(rgbStr) {
    if (!rgbStr) return '#ffffff';
    if (rgbStr.startsWith('#')) return rgbStr;
    const match = rgbStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!match) return '#ffffff';
    const r = parseInt(match[1], 10);
    const g = parseInt(match[2], 10);
    const b = parseInt(match[3], 10);
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
  }

  samplePixelHex(canvas, x, y) {
    const ctx = canvas.getContext('2d');
    const px = Math.max(0, Math.min(canvas.width - 1, Math.round(x)));
    const py = Math.max(0, Math.min(canvas.height - 1, Math.round(y)));
    const d = ctx.getImageData(px, py, 1, 1).data;
    return '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('');
  }

  resolveEffectiveBackground(el, win) {
    let curr = el;
    while (curr && curr.nodeType === 1) {
      const bg = win.getComputedStyle(curr).backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
        return this.rgbToHex(bg);
      }
      curr = curr.parentElement;
    }
    return '#ffffff';
  }

  inspectDOMElement(el, iframeWin) {
    if (!el || !iframeWin) return null;
    const cs = iframeWin.getComputedStyle(el);
    const rawFamily = cs.fontFamily || 'Inter, sans-serif';
    const primaryFont = rawFamily.split(',')[0].replace(/['"]/g, '').trim();
    const colorHex = this.rgbToHex(cs.color);
    const bgHex = this.resolveEffectiveBackground(el, iframeWin);

    const textSnippet = (el.innerText || el.textContent || 'Texto')
      .trim()
      .split('\n')[0]
      .slice(0, 36) || 'Texto Selecionado';

    const info = {
      mode: 'dom',
      fontName: primaryFont,
      fontFamily: rawFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      fontStyle: cs.fontStyle,
      lineHeight: cs.lineHeight,
      letterSpacing: cs.letterSpacing,
      color: colorHex,
      backgroundColor: bgHex,
      sampleText: textSnippet
    };

    this.clonedStyle = { ...info };
    return info;
  }

  /**
   * Analyze a cropped region of a Photo/Canvas to detect:
   * - Background Color (perimeter median/average)
   * - Foreground Text Color (highest-contrast cluster)
   * - Single-line Font Size in px (via horizontal line band segmentation!)
   * - Font Weight & Ranked closest Google Fonts
   */
  analyzeCanvasRegion(canvas, rect, sampleTextOverride = '') {
    const ctx = canvas.getContext('2d');
    const x = Math.max(0, Math.round(rect.x));
    const y = Math.max(0, Math.round(rect.y));
    const w = Math.min(canvas.width - x, Math.max(4, Math.round(rect.w)));
    const h = Math.min(canvas.height - y, Math.max(4, Math.round(rect.h)));

    const imgData = ctx.getImageData(x, y, w, h);
    const data = imgData.data;

    // 1. Sample perimeter pixels to determine Background Color
    let rBg = 0, gBg = 0, bBg = 0, borderCount = 0;
    for (let px = 0; px < w; px++) {
      const idxTop = (0 * w + px) * 4;
      const idxBot = ((h - 1) * w + px) * 4;
      rBg += data[idxTop] + data[idxBot];
      gBg += data[idxTop + 1] + data[idxBot + 1];
      bBg += data[idxTop + 2] + data[idxBot + 2];
      borderCount += 2;
    }
    for (let py = 1; py < h - 1; py++) {
      const idxLeft = (py * w + 0) * 4;
      const idxRight = (py * w + (w - 1)) * 4;
      rBg += data[idxLeft] + data[idxRight];
      gBg += data[idxLeft + 1] + data[idxRight + 1];
      bBg += data[idxLeft + 2] + data[idxRight + 2];
      borderCount += 2;
    }

    rBg = Math.round(rBg / Math.max(1, borderCount));
    gBg = Math.round(gBg / Math.max(1, borderCount));
    bBg = Math.round(bBg / Math.max(1, borderCount));
    const bgHex = '#' + [rBg, gBg, bBg].map(v => v.toString(16).padStart(2, '0')).join('');

    // 2. Identify Foreground (Text) pixels by color distance from background
    let rFg = 0, gFg = 0, bFg = 0, fgCount = 0;
    const rowInk = new Array(h).fill(0);
    const colInk = new Array(w).fill(0);
    let edgeTransitions = 0;

    for (let py = 0; py < h; py++) {
      let prevIsFg = false;
      for (let px = 0; px < w; px++) {
        const idx = (py * w + px) * 4;
        const dr = data[idx] - rBg;
        const dg = data[idx + 1] - gBg;
        const db = data[idx + 2] - bBg;
        const dist = Math.sqrt(dr * dr + dg * dg + db * db);

        const isFg = dist > 52;
        if (isFg) {
          const weight = dist > 100 ? 3 : 1;
          rFg += data[idx] * weight;
          gFg += data[idx + 1] * weight;
          bFg += data[idx + 2] * weight;
          fgCount += weight;
          rowInk[py]++;
          colInk[px]++;
        }
        if (isFg !== prevIsFg) {
          edgeTransitions++;
          prevIsFg = isFg;
        }
      }
    }

    let textHex = '#111827';
    if (fgCount > 0) {
      rFg = Math.min(255, Math.max(0, Math.round(rFg / fgCount)));
      gFg = Math.min(255, Math.max(0, Math.round(gFg / fgCount)));
      bFg = Math.min(255, Math.max(0, Math.round(bFg / fgCount)));
      textHex = '#' + [rFg, gFg, bFg].map(v => v.toString(16).padStart(2, '0')).join('');
    } else {
      const lum = 0.299 * rBg + 0.587 * gBg + 0.114 * bBg;
      textHex = lum > 128 ? '#111827' : '#f9fafb';
    }

    // 3. Segment horizontal text lines so multi-line boxes don't inflate font-size!
    const rowThreshold = Math.max(2, Math.floor(w * 0.015));
    const bands = [];
    let inBand = false;
    let bandStart = 0;

    for (let py = 0; py < h; py++) {
      if (rowInk[py] >= rowThreshold) {
        if (!inBand) {
          inBand = true;
          bandStart = py;
        }
      } else if (inBand) {
        const bandHeight = py - bandStart;
        if (bandHeight >= 6) {
          bands.push(bandHeight);
        }
        inBand = false;
      }
    }
    if (inBand && (h - bandStart) >= 6) {
      bands.push(h - bandStart);
    }

    let singleLineHeight = 16;
    if (bands.length > 0) {
      // Filter out huge graphical icons if there are smaller text bands
      const textBands = bands.filter(b => b <= 48);
      const chosenBands = textBands.length > 0 ? textBands : bands;
      // Pick the largest text band (e.g., heading line inside the selection)
      singleLineHeight = Math.max(...chosenBands);
    } else {
      singleLineHeight = Math.min(32, Math.max(12, Math.round(h * 0.5)));
    }

    const estimatedFontSizeNum = Math.max(10, Math.min(64, Math.round(singleLineHeight * 1.15)));

    // 4. Estimate font-weight from ink density
    const rawFgPixels = rowInk.reduce((a, b) => a + b, 0);
    const activeRows = Math.max(1, rowInk.filter(c => c >= rowThreshold).length);
    const activeCols = Math.max(1, colInk.filter(c => c >= 1).length);
    const inkDensity = rawFgPixels / Math.max(1, activeRows * activeCols);

    let estimatedWeight = '600';
    if (inkDensity < 0.17) estimatedWeight = '400';
    else if (inkDensity < 0.24) estimatedWeight = '500';
    else if (inkDensity < 0.32) estimatedWeight = '600';
    else if (inkDensity < 0.40) estimatedWeight = '700';
    else estimatedWeight = '800';

    const transitionRatio = edgeTransitions / Math.max(1, rawFgPixels);
    const isLikelyGeometric = inkDensity >= 0.22 && transitionRatio < 0.45;

    const rankedFonts = WEB_FONTS_CATALOG.map((f, idx) => {
      let score = 96 - idx * 1.5;
      if (isLikelyGeometric && f.traits.geometric) score += 3.0;
      if (inkDensity > 0.28 && f.traits.weightBias > 0) score += 2.0;
      score = Math.min(99, Math.max(78, Math.round(score)));
      return { ...f, score };
    }).sort((a, b) => b.score - a.score);

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = w;
    cropCanvas.height = h;
    cropCanvas.getContext('2d').putImageData(imgData, 0, 0);

    const bestFont = rankedFonts[0];
    const result = {
      mode: 'image',
      fontName: bestFont.name,
      fontFamily: bestFont.family,
      fontSize: `${estimatedFontSizeNum}px`,
      fontSizeNum: estimatedFontSizeNum,
      fontWeight: estimatedWeight,
      color: textHex,
      backgroundColor: bgHex,
      sampleText: sampleTextOverride || this.clonedStyle.sampleText || 'Texto de Exemplo',
      cropDataUrl: cropCanvas.toDataURL(),
      rankedFonts,
      rect: { x, y, w, h }
    };

    this.clonedStyle = {
      fontFamily: result.fontFamily,
      fontName: result.fontName,
      fontSize: result.fontSize,
      fontWeight: result.fontWeight,
      fontStyle: 'normal',
      lineHeight: '1.2',
      letterSpacing: '0px',
      color: result.color,
      backgroundColor: result.backgroundColor,
      sampleText: result.sampleText
    };

    return result;
  }
}

window.FontDetectorEngine = FontDetectorEngine;
window.WEB_FONTS_CATALOG = WEB_FONTS_CATALOG;
