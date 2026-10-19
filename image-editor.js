/**
 * FormgivaWeb - Photo & Screenshot Visual Editor Engine
 * Supports:
 *  - Rectangular Marquee Selection
 *  - Direct Drag-to-Move on any active selection (automatically lifts selection into a floating layer & fills background!)
 *  - Move Mode: 'cut' (fills original spot with background color) or 'clone' (keeps original spot intact)
 *  - Smart Erase / Delete (edge-aware background fill)
 *  - Replace Text in Photo (erases old text & creates editable text layer with matched font/color/size)
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

    // Active drag state when lifting & dragging a selection directly
    this.activeDragLayer = null;
    this.dragLayerStartClient = { x: 0, y: 0 };
    this.dragLayerOrigPos = { x: 0, y: 0 };

    // Eyedropper mode callback
    this.eyedropperCallback = null;

    this.layers = [];
    this.selectedLayer = null;

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

  initEvents() {
    // 1. Direct dragging on the selection marquee lifts the selection into a movable layer immediately!
    this.marquee.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || !this.selectionRect) return;
      e.stopPropagation();
      e.preventDefault();

      // Convert selection into a floating layer and begin dragging it immediately
      const newLayer = this.cutSelectionToLayer(this.moveBehavior === 'clone');
      if (newLayer) {
        this.activeDragLayer = newLayer;
        this.dragLayerStartClient = { x: e.clientX, y: e.clientY };
        this.dragLayerOrigPos = { x: newLayer.x, y: newLayer.y };
      }
    });

    // 2. Canvas mousedown for drawing a new selection (or Eyedropper)
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

      // If clicking inside an existing selection while in 'move' or 'select' tool, lift & drag it!
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
      // Handle immediate drag of a just-lifted selection layer
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

      // Analyze region for colors and font metrics
      const analysis = this.fontDetector.analyzeCanvasRegion(this.canvas, this.selectionRect);
      if (this.onSelect) {
        this.onSelect(null, analysis);
      }

      // Instant tool behaviors on selection release
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
   * Smart Erase: Fills the selected rectangle on the base canvas with its detected perimeter background color
   */
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

  /**
   * Cut (or Clone) Selection to Movable Layer:
   * Copies pixels from selection into a draggable DOM layer, and optionally fills the background behind it.
   */
  cutSelectionToLayer(cloneOnly = false) {
    if (!this.selectionRect || this.selectionRect.w < 6) return null;
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

  /**
   * Replace Text in Photo:
   * Smart-erases the old text in the selection and places an editable text layer in the exact same spot
   */
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

  /**
   * Full Canvas Crop to selection
   */
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
    const el = document.createElement('div');
    el.className = 'floating-layer selected';
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
      h
    };

    this.overlay.appendChild(el);
    this.layers.push(layerObj);
    this.bindLayerInteractions(layerObj, handle);
    this.syncLayerPosition(layerObj);
    this.selectLayer(layerObj);
    return layerObj;
  }

  createFloatingTextLayer(text, x, y, styleObj) {
    const el = document.createElement('div');
    el.className = 'floating-layer selected';

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
      style: { ...styleObj }
    };

    this.overlay.appendChild(el);
    this.layers.push(layerObj);
    this.bindLayerInteractions(layerObj, null);
    this.syncLayerPosition(layerObj);
    this.selectLayer(layerObj);

    setTimeout(() => {
      textDiv.focus();
      // Select all text on creation so user can type immediately
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

  /**
   * Stamp / Merge the currently selected floating layer permanently onto the base canvas
   */
  stampSelectedLayer() {
    if (!this.selectedLayer) return false;
    const layer = this.selectedLayer;
    if (layer.type === 'image' && layer.img) {
      this.ctx.drawImage(layer.img, layer.x, layer.y, layer.w, layer.h);
    } else if (layer.type === 'text' && layer.textDiv) {
      const s = layer.style || {};
      const fontSizePx = parseFloat(s.fontSize || '18');
      const fontWeight = s.fontWeight || '600';
      const fontFamily = s.fontFamily || 'Inter, sans-serif';
      this.ctx.save();
      this.ctx.font = `${fontWeight} ${fontSizePx}px ${fontFamily}`;
      this.ctx.fillStyle = layer.textDiv.style.color || s.color || '#111827';
      this.ctx.textBaseline = 'top';
      const lines = (layer.textDiv.innerText || '').split('\n');
      lines.forEach((line, idx) => {
        this.ctx.fillText(line, layer.x + 3, layer.y + 1 + idx * (fontSizePx * 1.2));
      });
      this.ctx.restore();
    }

    layer.el.remove();
    this.layers = this.layers.filter(item => item !== layer);
    this.selectedLayer = null;
    this.saveSnapshot('Fixar camada na imagem');
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
      if (layer.type === 'image' && layer.img) {
        outCtx.drawImage(layer.img, layer.x, layer.y, layer.w, layer.h);
      } else if (layer.type === 'text' && layer.textDiv) {
        const s = layer.style || {};
        const fontSizePx = parseFloat(s.fontSize || '18');
        const fontWeight = s.fontWeight || '600';
        const fontFamily = s.fontFamily || 'Inter, sans-serif';
        outCtx.save();
        outCtx.font = `${fontWeight} ${fontSizePx}px ${fontFamily}`;
        outCtx.fillStyle = layer.textDiv.style.color || s.color || '#111827';
        outCtx.textBaseline = 'top';

        const lines = (layer.textDiv.innerText || '').split('\n');
        lines.forEach((line, idx) => {
          outCtx.fillText(line, layer.x + 3, layer.y + 1 + idx * (fontSizePx * 1.2));
        });
        outCtx.restore();
      }
    });

    return outCanvas.toDataURL('image/png');
  }
}

window.ImageEditorEngine = ImageEditorEngine;
