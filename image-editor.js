/**
 * FormgivaWeb - Photo & Screenshot Visual Editor Engine
 * Supports:
 *  - Rectangular Marquee Selection
 *  - Direct Drag-to-Move on any active selection
 *  - Overlay (Sobrepor) System: Overlay current selection/cut piece, Stamp-on-Click mode, Fit-into-Selection, Z-index Bring to Front / Send to Back, Opacity
 *  - Specific Retouch Tools (+tools): Blur, Pixelate, Border Highlight, Invert, Flip, 1px Nudge
 *  - Smart Erase / Delete (edge-aware background fill)
 *  - Replace Text in Photo
 *  - Eyedropper pixel color picker
 *  - Full Canvas Crop, Layer Duplicate, Undo / Redo & Flatten to PNG
 */

class ImageEditorEngine {
  constructor(canvasEl, overlayEl, marqueeEl, fontDetector, onSelectCallback, onHistoryPush) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.overlay = overlayEl;
    this.marquee = marqueeEl;
    this.fontDetector = fontDetector;
    this.onSelect = onSelectCallback;
    this.onHistoryPush = onHistoryPush;

    this.currentTool = 'select';
    this.moveBehavior = 'cut'; // 'cut' (apagar origem) | 'clone' (manter origem)
    this.selectionRect = null; // { x, y, w, h } in canvas pixel coordinates
    this.isSelecting = false;
    this.startPt = { x: 0, y: 0 };

    // Clipboard memory for the last selected or cut region (for Sobrepor / Overlay)
    this.clipboardPiece = null; // { dataUrl, w, h, x, y }
    this.stampOverlayMode = false; // When true, clicking on canvas stamps/overlays clipboardPiece

    // Active drag state when lifting & dragging a selection directly
    this.activeDragLayer = null;
    this.dragLayerStartClient = { x: 0, y: 0 };
    this.dragLayerOrigPos = { x: 0, y: 0 };

    // Eyedropper mode callback
    this.eyedropperCallback = null;

    this.layers = [];
    this.selectedLayer = null;
    this.topZIndex = 40;

    this.history = [];
    this.historyIndex = -1;

    this.initEvents();
  }

  loadImageFromUrl(srcUrl, callback) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.clearLayers();
      this.canvas.width = img.naturalWidth || img.width;
      this.canvas.height = img.naturalHeight || img.height;
      this.ctx.drawImage(img, 0, 0);
      this.clearSelection();
      this.history = [];
      this.historyIndex = -1;
      this.saveSnapshot('Abrir imagem');
      if (callback) callback();
    };
    img.src = srcUrl;
  }

  getCanvasCoords(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / Math.max(1, rect.width);
    const scaleY = this.canvas.height / Math.max(1, rect.height);
    return {
      x: Math.max(0, Math.min(this.canvas.width, (clientX - rect.left) * scaleX)),
      y: Math.max(0, Math.min(this.canvas.height, (clientY - rect.top) * scaleY)),
      cssScaleX: rect.width / Math.max(1, this.canvas.width),
      cssScaleY: rect.height / Math.max(1, this.canvas.height)
    };
  }

  activateEyedropper(callback) {
    this.eyedropperCallback = callback;
    this.canvas.style.cursor = 'copy';
  }

  /**
   * Captures the currently selected rectangle into this.clipboardPiece so it can be overlaid anytime
   */
  captureSelectionToClipboard() {
    if (!this.selectionRect || this.selectionRect.w < 4 || this.selectionRect.h < 4) return null;
    const x = Math.max(0, Math.round(this.selectionRect.x));
    const y = Math.max(0, Math.round(this.selectionRect.y));
    const w = Math.min(this.canvas.width - x, Math.max(4, Math.round(this.selectionRect.w)));
    const h = Math.min(this.canvas.height - y, Math.max(4, Math.round(this.selectionRect.h)));

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = w;
    tempCanvas.height = h;
    tempCanvas.getContext('2d').drawImage(this.canvas, x, y, w, h, 0, 0, w, h);

    this.clipboardPiece = {
      dataUrl: tempCanvas.toDataURL('image/png'),
      w,
      h,
      x,
      y
    };
    return this.clipboardPiece;
  }

  initEvents() {
    // 1. Direct dragging on the selection marquee lifts the selection into a movable layer immediately!
    this.marquee.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || !this.selectionRect) return;
      e.stopPropagation();
      e.preventDefault();

      const newLayer = this.cutSelectionToLayer(this.moveBehavior === 'clone');
      if (newLayer) {
        this.activeDragLayer = newLayer;
        this.dragLayerStartClient = { x: e.clientX, y: e.clientY };
        this.dragLayerOrigPos = { x: newLayer.x, y: newLayer.y };
      }
    });

    // 2. Canvas mousedown
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;

      const pt = this.getCanvasCoords(e.clientX, e.clientY);

      // Check if Eyedropper is waiting for a pixel click
      if (this.eyedropperCallback) {
        const hex = this.fontDetector.samplePixelHex(this.canvas, pt.x, pt.y);
        const cb = this.eyedropperCallback;
        this.eyedropperCallback = null;
        this.canvas.style.cursor = 'crosshair';
        cb(hex);
        return;
      }

      // Check if Stamp Overlay Mode is active (click to overlay clipboard piece!)
      if (this.stampOverlayMode && this.clipboardPiece) {
        const piece = this.clipboardPiece;
        const targetX = Math.round(pt.x - piece.w / 2);
        const targetY = Math.round(pt.y - piece.h / 2);
        const layer = this.createFloatingImageLayer(piece.dataUrl, targetX, targetY, piece.w, piece.h);
        this.bringLayerToFront(layer);
        return;
      }

      // If clicking inside an existing selection, lift & drag it!
      if (
        this.selectionRect &&
        pt.x >= this.selectionRect.x &&
        pt.x <= this.selectionRect.x + this.selectionRect.w &&
        pt.y >= this.selectionRect.y &&
        pt.y <= this.selectionRect.y + this.selectionRect.h
      ) {
        const newLayer = this.cutSelectionToLayer(this.moveBehavior === 'clone');
        if (newLayer) {
          this.activeDragLayer = newLayer;
          this.dragLayerStartClient = { x: e.clientX, y: e.clientY };
          this.dragLayerOrigPos = { x: newLayer.x, y: newLayer.y };
        }
        return;
      }

      this.selectLayer(null);
      this.isSelecting = true;
      this.startPt = pt;
      this.selectionRect = { x: pt.x, y: pt.y, w: 0, h: 0 };
      this.updateMarqueeUI();
    });

    window.addEventListener('mousemove', (e) => {
      if (this.activeDragLayer) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / Math.max(1, rect.width);
        const scaleY = this.canvas.height / Math.max(1, rect.height);
        const dx = (e.clientX - this.dragLayerStartClient.x) * scaleX;
        const dy = (e.clientY - this.dragLayerStartClient.y) * scaleY;

        this.activeDragLayer.x = Math.round(this.dragLayerOrigPos.x + dx);
        this.activeDragLayer.y = Math.round(this.dragLayerOrigPos.y + dy);
        this.syncLayerPosition(this.activeDragLayer);
        if (this.onSelect) {
          this.onSelect(this.activeDragLayer, this.activeDragLayer.style || null);
        }
        return;
      }

      if (!this.isSelecting) return;
      const pt = this.getCanvasCoords(e.clientX, e.clientY);
      const x = Math.min(this.startPt.x, pt.x);
      const y = Math.min(this.startPt.y, pt.y);
      const w = Math.abs(pt.x - this.startPt.x);
      const h = Math.abs(pt.y - this.startPt.y);

      this.selectionRect = { x, y, w, h };
      this.updateMarqueeUI();
    });

    window.addEventListener('mouseup', () => {
      if (this.activeDragLayer) {
        this.activeDragLayer = null;
        return;
      }

      if (!this.isSelecting) return;
      this.isSelecting = false;

      if (!this.selectionRect || this.selectionRect.w < 6 || this.selectionRect.h < 6) {
        this.clearSelection();
        return;
      }

      // Automatically store the selected region in clipboardPiece so "Sobrepor" always has it ready!
      this.captureSelectionToClipboard();

      // Analyze region for colors and font metrics
      const analysis = this.fontDetector.analyzeCanvasRegion(this.canvas, this.selectionRect);
      if (this.onSelect) {
        this.onSelect(null, analysis);
      }

      if (this.currentTool === 'delete') {
        this.smartEraseSelection();
      }
    });
  }

  updateMarqueeUI() {
    if (!this.selectionRect || this.selectionRect.w < 2 || this.selectionRect.h < 2) {
      this.marquee.style.display = 'none';
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = rect.width / Math.max(1, this.canvas.width);
    const scaleY = rect.height / Math.max(1, this.canvas.height);

    this.marquee.style.display = 'block';
    this.marquee.style.left = `${this.selectionRect.x * scaleX}px`;
    this.marquee.style.top = `${this.selectionRect.y * scaleY}px`;
    this.marquee.style.width = `${this.selectionRect.w * scaleX}px`;
    this.marquee.style.height = `${this.selectionRect.h * scaleY}px`;

    const badge = this.marquee.querySelector('.selection-marquee-badge');
    if (badge) {
      badge.textContent = `${Math.round(this.selectionRect.w)}×${Math.round(this.selectionRect.h)}px (Arraste para mover)`;
    }
  }

  clearSelection() {
    this.selectionRect = null;
    this.marquee.style.display = 'none';
  }

  /**
   * SOBREPOR (Overlay Selection / Cut Piece):
   * Takes the active selection (or the last cut/selected piece in clipboardPiece)
   * and creates a floating overlay layer at the very top (highest z-index) so it covers anything underneath!
   */
  overlayCurrentOrLastSelection() {
    if (this.selectionRect && this.selectionRect.w >= 6 && this.selectionRect.h >= 6) {
      this.captureSelectionToClipboard();
      this.clearSelection();
    }

    if (!this.clipboardPiece && this.selectedLayer && this.selectedLayer.type === 'image') {
      this.clipboardPiece = {
        dataUrl: this.selectedLayer.dataUrl,
        w: this.selectedLayer.w,
        h: this.selectedLayer.h,
        x: this.selectedLayer.x,
        y: this.selectedLayer.y
      };
    }

    if (!this.clipboardPiece) return null;

    const p = this.clipboardPiece;
    const layer = this.createFloatingImageLayer(p.dataUrl, p.x + 14, p.y + 14, p.w, p.h);
    this.bringLayerToFront(layer);
    return layer;
  }

  /**
   * SOBREPOR DENTRO DA SELEÇÃO (Fit Clipboard Overlay into Current Selection Box):
   * Places the previously copied/cut piece directly over the newly selected box, matching its width & height!
   */
  fitClipboardOverlayIntoSelection() {
    if (!this.clipboardPiece || !this.selectionRect || this.selectionRect.w < 6) return null;
    const { x, y, w, h } = this.selectionRect;
    const p = this.clipboardPiece;
    this.clearSelection();
    const layer = this.createFloatingImageLayer(p.dataUrl, Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    this.bringLayerToFront(layer);
    return layer;
  }

  bringLayerToFront(layer = this.selectedLayer) {
    if (!layer) return false;
    this.topZIndex++;
    layer.zIndex = this.topZIndex;
    layer.el.style.zIndex = String(this.topZIndex);
    // Move to end of layers array so it renders on top when exporting PNG too!
    this.layers = this.layers.filter(l => l !== layer);
    this.layers.push(layer);
    return true;
  }

  sendLayerToBack(layer = this.selectedLayer) {
    if (!layer) return false;
    layer.zIndex = 25;
    layer.el.style.zIndex = '25';
    this.layers = this.layers.filter(l => l !== layer);
    this.layers.unshift(layer);
    return true;
  }

  setLayerOpacity(opacityPct) {
    if (!this.selectedLayer) return false;
    const val = Math.max(0.05, Math.min(1, opacityPct / 100));
    this.selectedLayer.opacity = val;
    this.selectedLayer.el.style.opacity = String(val);
    return true;
  }

  nudgeSelectedLayer(dx, dy) {
    if (!this.selectedLayer) return false;
    this.selectedLayer.x = Math.round(this.selectedLayer.x + dx);
    this.selectedLayer.y = Math.round(this.selectedLayer.y + dy);
    this.syncLayerPosition(this.selectedLayer);
    if (this.onSelect) this.onSelect(this.selectedLayer, this.selectedLayer.style || null);
    return true;
  }

  flipSelectedLayer(axis = 'h') {
    if (!this.selectedLayer || this.selectedLayer.type !== 'image') return false;
    const layer = this.selectedLayer;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = layer.w;
    tempCanvas.height = layer.h;
    const tCtx = tempCanvas.getContext('2d');
    tCtx.save();
    if (axis === 'h') {
      tCtx.translate(layer.w, 0);
      tCtx.scale(-1, 1);
    } else {
      tCtx.translate(0, layer.h);
      tCtx.scale(1, -1);
    }
    tCtx.drawImage(layer.img, 0, 0, layer.w, layer.h);
    tCtx.restore();

    const newDataUrl = tempCanvas.toDataURL('image/png');
    layer.dataUrl = newDataUrl;
    layer.img.src = newDataUrl;
    return true;
  }

  /**
   * Specific Retouch Tool: Blur / Pixelate selected region on base canvas
   */
  pixelateSelection(blockSize = 10) {
    if (!this.selectionRect || this.selectionRect.w < 6) return false;
    const x = Math.round(this.selectionRect.x);
    const y = Math.round(this.selectionRect.y);
    const w = Math.round(this.selectionRect.w);
    const h = Math.round(this.selectionRect.h);

    const imgData = this.ctx.getImageData(x, y, w, h);
    const d = imgData.data;

    for (let py = 0; py < h; py += blockSize) {
      for (let px = 0; px < w; px += blockSize) {
        const i = (py * w + px) * 4;
        const r = d[i], g = d[i + 1], b = d[i + 2];
        this.ctx.fillStyle = `rgb(${r},${g},${b})`;
        this.ctx.fillRect(x + px, y + py, Math.min(blockSize, w - px), Math.min(blockSize, h - py));
      }
    }
    this.clearSelection();
    this.saveSnapshot('Pixelizar / Borrar seleção');
    return true;
  }

  /**
   * Specific Retouch Tool: Draw Highlight Border Box around current selection
   */
  drawBorderOnSelection(colorHex = '#6366f1', lineWidth = 3) {
    if (!this.selectionRect || this.selectionRect.w < 6) return false;
    const { x, y, w, h } = this.selectionRect;
    this.ctx.save();
    this.ctx.strokeStyle = colorHex;
    this.ctx.lineWidth = lineWidth;
    this.ctx.strokeRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    this.ctx.restore();
    this.clearSelection();
    this.saveSnapshot('Destacar borda na seleção');
    return true;
  }

  /**
   * Specific Retouch Tool: Invert colors in current selection
   */
  invertSelectionColors() {
    if (!this.selectionRect || this.selectionRect.w < 6) return false;
    const x = Math.round(this.selectionRect.x);
    const y = Math.round(this.selectionRect.y);
    const w = Math.round(this.selectionRect.w);
    const h = Math.round(this.selectionRect.h);

    const imgData = this.ctx.getImageData(x, y, w, h);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 255 - d[i];
      d[i + 1] = 255 - d[i + 1];
      d[i + 2] = 255 - d[i + 2];
    }
    this.ctx.putImageData(imgData, x, y);
    this.clearSelection();
    this.saveSnapshot('Inverter cores da seleção');
    return true;
  }

  smartEraseSelection(keepSelection = false, customFillHex = null) {
    if (!this.selectionRect || this.selectionRect.w < 4) return null;
    const analysis = this.fontDetector.analyzeCanvasRegion(this.canvas, this.selectionRect);
    const { x, y, w, h } = analysis.rect;

    this.ctx.fillStyle = customFillHex || analysis.backgroundColor;
    this.ctx.fillRect(x, y, w, h);

    if (!keepSelection) {
      this.clearSelection();
    }
    this.saveSnapshot('Excluir área (Smart Fill)');
    return analysis;
  }

  cutSelectionToLayer(cloneOnly = false) {
    if (!this.selectionRect || this.selectionRect.w < 6) return null;
    this.captureSelectionToClipboard();
    const analysis = this.fontDetector.analyzeCanvasRegion(this.canvas, this.selectionRect);
    const { x, y, w, h } = analysis.rect;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = w;
    tempCanvas.height = h;
    tempCanvas.getContext('2d').drawImage(this.canvas, x, y, w, h, 0, 0, w, h);
    const dataUrl = tempCanvas.toDataURL('image/png');

    if (!cloneOnly) {
      this.ctx.fillStyle = analysis.backgroundColor;
      this.ctx.fillRect(x, y, w, h);
    }
    this.clearSelection();

    const layer = this.createFloatingImageLayer(dataUrl, x, y, w, h);
    this.saveSnapshot(cloneOnly ? 'Clonar área em camada' : 'Recortar e mover área');
    return layer;
  }

  replaceTextInSelection(customText, styleOverrides = {}) {
    if (!this.selectionRect || this.selectionRect.w < 6) {
      const s = { ...this.fontDetector.clonedStyle, ...styleOverrides };
      return this.createFloatingTextLayer(
        customText || s.sampleText || 'Novo Texto',
        Math.round(this.canvas.width / 2 - 70),
        Math.round(this.canvas.height / 2 - 15),
        s
      );
    }

    const analysis = this.smartEraseSelection(false);
    if (!analysis) return null;

    const mergedStyle = {
      fontFamily: styleOverrides.fontFamily || analysis.fontFamily,
      fontName: styleOverrides.fontName || analysis.fontName,
      fontSize: styleOverrides.fontSize || analysis.fontSize,
      fontWeight: styleOverrides.fontWeight || analysis.fontWeight,
      color: styleOverrides.color || analysis.color,
      backgroundColor: 'transparent'
    };

    const textToUse = customText || 'Novo Texto';
    return this.createFloatingTextLayer(textToUse, analysis.rect.x, analysis.rect.y, mergedStyle);
  }

  cropCanvasToSelection() {
    if (!this.selectionRect || this.selectionRect.w < 16 || this.selectionRect.h < 16) return false;
    const x = Math.round(this.selectionRect.x);
    const y = Math.round(this.selectionRect.y);
    const w = Math.round(this.selectionRect.w);
    const h = Math.round(this.selectionRect.h);

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = w;
    tempCanvas.height = h;
    tempCanvas.getContext('2d').drawImage(this.canvas, x, y, w, h, 0, 0, w, h);

    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx.drawImage(tempCanvas, 0, 0);

    this.layers.forEach(l => {
      l.x -= x;
      l.y -= y;
      this.syncLayerPosition(l);
    });

    this.clearSelection();
    this.saveSnapshot('Cortar imagem');
    return true;
  }

  createFloatingImageLayer(dataUrl, x, y, w, h) {
    this.topZIndex++;
    const el = document.createElement('div');
    el.className = 'floating-layer selected';
    el.style.zIndex = String(this.topZIndex);

    const img = document.createElement('img');
    img.src = dataUrl;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.display = 'block';
    img.style.pointerEvents = 'none';
    el.appendChild(img);

    const handle = document.createElement('div');
    handle.className = 'layer-resize-handle';
    el.appendChild(handle);

    const layerObj = {
      id: 'layer_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      type: 'image',
      el,
      img,
      dataUrl,
      x,
      y,
      w,
      h,
      opacity: 1,
      zIndex: this.topZIndex
    };

    this.overlay.appendChild(el);
    this.layers.push(layerObj);
    this.bindLayerInteractions(layerObj, handle);
    this.syncLayerPosition(layerObj);
    this.selectLayer(layerObj);
    return layerObj;
  }

  createFloatingTextLayer(text, x, y, styleObj) {
    this.topZIndex++;
    const el = document.createElement('div');
    el.className = 'floating-layer selected';
    el.style.zIndex = String(this.topZIndex);

    const textDiv = document.createElement('div');
    textDiv.className = 'floating-layer-text';
    textDiv.contentEditable = 'true';
    textDiv.innerText = text;
    textDiv.style.fontFamily = styleObj.fontFamily || "'Inter', sans-serif";
    textDiv.style.fontSize = styleObj.fontSize || '18px';
    textDiv.style.fontWeight = styleObj.fontWeight || '600';
    textDiv.style.color = styleObj.color || '#111827';
    textDiv.style.backgroundColor = styleObj.backgroundColor || 'transparent';
    textDiv.style.lineHeight = '1.2';

    el.appendChild(textDiv);

    const layerObj = {
      id: 'layer_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      type: 'text',
      el,
      textDiv,
      x,
      y,
      w: null,
      h: null,
      opacity: 1,
      zIndex: this.topZIndex,
      style: { ...styleObj }
    };

    this.overlay.appendChild(el);
    this.layers.push(layerObj);
    this.bindLayerInteractions(layerObj, null);
    this.syncLayerPosition(layerObj);
    this.selectLayer(layerObj);

    setTimeout(() => {
      textDiv.focus();
      const range = document.createRange();
      range.selectNodeContents(textDiv);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }, 40);

    return layerObj;
  }

  duplicateSelectedLayer() {
    if (!this.selectedLayer) {
      if (this.selectionRect) {
        return this.cutSelectionToLayer(true);
      }
      return null;
    }
    const l = this.selectedLayer;
    if (l.type === 'image') {
      return this.createFloatingImageLayer(l.dataUrl || l.img.src, l.x + 16, l.y + 16, l.w, l.h);
    } else if (l.type === 'text') {
      return this.createFloatingTextLayer(l.textDiv.innerText, l.x + 16, l.y + 16, { ...l.style });
    }
    return null;
  }

  stampSelectedLayer() {
    if (!this.selectedLayer) return false;
    const layer = this.selectedLayer;
    this.ctx.save();
    this.ctx.globalAlpha = layer.opacity !== undefined ? layer.opacity : 1;

    if (layer.type === 'image' && layer.img) {
      this.ctx.drawImage(layer.img, layer.x, layer.y, layer.w, layer.h);
    } else if (layer.type === 'text' && layer.textDiv) {
      const s = layer.style || {};
      const fontSizePx = parseFloat(s.fontSize || '18');
      const fontWeight = s.fontWeight || '600';
      const fontFamily = s.fontFamily || 'Inter, sans-serif';
      this.ctx.font = `${fontWeight} ${fontSizePx}px ${fontFamily}`;
      this.ctx.fillStyle = layer.textDiv.style.color || s.color || '#111827';
      this.ctx.textBaseline = 'top';
      const lines = (layer.textDiv.innerText || '').split('\n');
      lines.forEach((line, idx) => {
        this.ctx.fillText(line, layer.x + 3, layer.y + 1 + idx * (fontSizePx * 1.2));
      });
    }
    this.ctx.restore();

    layer.el.remove();
    this.layers = this.layers.filter(item => item !== layer);
    this.selectedLayer = null;
    this.saveSnapshot('Fixar sobreposição na imagem');
    if (this.onSelect) this.onSelect(null, null);
    return true;
  }

  syncLayerPosition(layer) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = rect.width / Math.max(1, this.canvas.width);
    const scaleY = rect.height / Math.max(1, this.canvas.height);

    layer.el.style.left = `${layer.x * scaleX}px`;
    layer.el.style.top = `${layer.y * scaleY}px`;
    if (layer.type === 'image' && layer.w && layer.h) {
      layer.el.style.width = `${layer.w * scaleX}px`;
      layer.el.style.height = `${layer.h * scaleY}px`;
    } else if (layer.type === 'text' && layer.textDiv) {
      const baseFontPx = parseFloat(layer.style.fontSize || '18');
      layer.textDiv.style.fontSize = `${Math.max(8, baseFontPx * scaleY)}px`;
    }
  }

  syncAllLayers() {
    this.layers.forEach(l => this.syncLayerPosition(l));
    this.updateMarqueeUI();
  }

  bindLayerInteractions(layer, resizeHandle) {
    let dragging = false;
    let resizing = false;
    let startClientX = 0;
    let startClientY = 0;
    let origX = 0;
    let origY = 0;
    let origW = 0;
    let origH = 0;

    if (resizeHandle) {
      resizeHandle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        resizing = true;
        startClientX = e.clientX;
        startClientY = e.clientY;
        origW = layer.w;
        origH = layer.h;
      });
    }

    layer.el.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.selectLayer(layer);
      if (e.target === resizeHandle) return;

      dragging = true;
      startClientX = e.clientX;
      startClientY = e.clientY;
      origX = layer.x;
      origY = layer.y;
    });

    window.addEventListener('mousemove', (e) => {
      if (!dragging && !resizing) return;
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / Math.max(1, rect.width);
      const scaleY = this.canvas.height / Math.max(1, rect.height);

      const dx = (e.clientX - startClientX) * scaleX;
      const dy = (e.clientY - startClientY) * scaleY;

      if (dragging) {
        layer.x = Math.round(origX + dx);
        layer.y = Math.round(origY + dy);
        this.syncLayerPosition(layer);
        if (this.onSelect) this.onSelect(layer, layer.style || null);
      } else if (resizing) {
        layer.w = Math.max(12, Math.round(origW + dx));
        layer.h = Math.max(12, Math.round(origH + dy));
        this.syncLayerPosition(layer);
        if (this.onSelect) this.onSelect(layer, layer.style || null);
      }
    });

    window.addEventListener('mouseup', () => {
      dragging = false;
      resizing = false;
    });
  }

  selectLayer(layer) {
    this.layers.forEach(l => l.el.classList.remove('selected'));
    this.selectedLayer = layer;
    if (layer) {
      layer.el.classList.add('selected');
      if (this.onSelect) {
        this.onSelect(layer, layer.style || null);
      }
    }
  }

  deleteSelectedLayer() {
    if (this.selectedLayer) {
      this.selectedLayer.el.remove();
      this.layers = this.layers.filter(l => l !== this.selectedLayer);
      this.selectedLayer = null;
      if (this.onSelect) this.onSelect(null, null);
      return true;
    }
    if (this.selectionRect) {
      this.smartEraseSelection();
      return true;
    }
    return false;
  }

  clearLayers() {
    this.layers.forEach(l => l.el.remove());
    this.layers = [];
    this.selectedLayer = null;
  }

  saveSnapshot(label = 'Edição de Imagem') {
    const dataUrl = this.canvas.toDataURL('image/png');
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push({ label, dataUrl });
    if (this.history.length > 25) this.history.shift();
    this.historyIndex = this.history.length - 1;

    if (this.onHistoryPush) {
      this.onHistoryPush(this.historyIndex > 0, this.historyIndex < this.history.length - 1);
    }
  }

  undo() {
    if (this.historyIndex <= 0) return false;
    this.historyIndex--;
    this.restoreSnapshot(this.history[this.historyIndex]);
    return true;
  }

  redo() {
    if (this.historyIndex >= this.history.length - 1) return false;
    this.historyIndex++;
    this.restoreSnapshot(this.history[this.historyIndex]);
    return true;
  }

  restoreSnapshot(snap) {
    if (!snap) return;
    const img = new Image();
    img.onload = () => {
      this.canvas.width = img.width;
      this.canvas.height = img.height;
      this.ctx.drawImage(img, 0, 0);
      this.syncAllLayers();
      if (this.onHistoryPush) {
        this.onHistoryPush(this.historyIndex > 0, this.historyIndex < this.history.length - 1);
      }
    };
    img.src = snap.dataUrl;
  }

  exportFlattenedPng() {
    const outCanvas = document.createElement('canvas');
    outCanvas.width = this.canvas.width;
    outCanvas.height = this.canvas.height;
    const outCtx = outCanvas.getContext('2d');

    outCtx.drawImage(this.canvas, 0, 0);

    this.layers.forEach(layer => {
      outCtx.save();
      outCtx.globalAlpha = layer.opacity !== undefined ? layer.opacity : 1;
      if (layer.type === 'image' && layer.img) {
        outCtx.drawImage(layer.img, layer.x, layer.y, layer.w, layer.h);
      } else if (layer.type === 'text' && layer.textDiv) {
        const s = layer.style || {};
        const fontSizePx = parseFloat(s.fontSize || '18');
        const fontWeight = s.fontWeight || '600';
        const fontFamily = s.fontFamily || 'Inter, sans-serif';
        outCtx.font = `${fontWeight} ${fontSizePx}px ${fontFamily}`;
        outCtx.fillStyle = layer.textDiv.style.color || s.color || '#111827';
        outCtx.textBaseline = 'top';

        const lines = (layer.textDiv.innerText || '').split('\n');
        lines.forEach((line, idx) => {
          outCtx.fillText(line, layer.x + 3, layer.y + 1 + idx * (fontSizePx * 1.2));
        });
      }
      outCtx.restore();
    });

    return outCanvas.toDataURL('image/png');
  }
}

window.ImageEditorEngine = ImageEditorEngine;
