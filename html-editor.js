/**
 * FormgivaWeb - Interactive DOM / HTML Page Editor Engine
 * Supports Select, Move (Free Drag), Inline Text Edit, Crop/Clip Element,
 * Delete, Duplicate, Image Swap, Font Detection & Clean HTML Export.
 */

class HtmlEditorEngine {
  constructor(iframeEl, fontDetector, onSelectCallback, onHistoryPush) {
    this.iframe = iframeEl;
    this.fontDetector = fontDetector;
    this.onSelect = onSelectCallback;
    this.onHistoryPush = onHistoryPush;

    this.currentTool = 'select'; // 'select' | 'move' | 'text' | 'crop' | 'delete' | 'font'
    this.selectedEl = null;
    this.hoveredEl = null;

    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.initialTx = 0;
    this.initialTy = 0;

    this.history = [];
    this.historyIndex = -1;
  }

  get doc() {
    return this.iframe.contentDocument || (this.iframe.contentWindow && this.iframe.contentWindow.document);
  }

  get win() {
    return this.iframe.contentWindow;
  }

  /**
   * Load HTML string into the iframe and inject interactive visual editor hooks
   */
  loadHtmlContent(htmlString, baseUrl = '') {
    const doc = this.doc;
    if (!doc) return;

    // Inject Google Fonts & base tag if needed so fonts and relative assets work
    let processedHtml = htmlString;
    const googleFontsLink = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;600&family=Lato:wght@400;700&family=Merriweather:wght@400;700&family=Montserrat:wght@400;600;700;800&family=Nunito:wght@400;600;700&family=Open+Sans:wght@400;600;700&family=Oswald:wght@500;700&family=Outfit:wght@400;600;700&family=Playfair+Display:wght@500;700&family=Plus+Jakarta+Sans:wght@400;600;700&family=Poppins:wght@400;500;600;700&family=Roboto:wght@400;500;700&family=Space+Grotesk:wght@400;600;700&display=swap" rel="stylesheet">`;

    if (baseUrl && !processedHtml.includes('<base ')) {
      processedHtml = processedHtml.replace(/<head([^>]*)>/i, `<head$1><base href="${baseUrl}">`);
    }
    if (!processedHtml.includes('fonts.googleapis.com')) {
      if (processedHtml.match(/<head([^>]*)>/i)) {
        processedHtml = processedHtml.replace(/<head([^>]*)>/i, `<head$1>${googleFontsLink}`);
      } else {
        processedHtml = googleFontsLink + processedHtml;
      }
    }

    doc.open();
    doc.write(processedHtml);
    doc.close();

    // Wait briefly for DOM & styles to settle, then attach editor listeners
    setTimeout(() => {
      this.injectEditorStyles();
      this.attachInteractions();
      this.history = [];
      this.historyIndex = -1;
      this.saveSnapshot('Carregamento inicial');
    }, 120);
  }

  injectEditorStyles() {
    const doc = this.doc;
    if (!doc || !doc.head) return;

    let styleEl = doc.getElementById('__formgiva_editor_styles');
    if (!styleEl) {
      styleEl = doc.createElement('style');
      styleEl.id = '__formgiva_editor_styles';
      doc.head.appendChild(styleEl);
    }

    styleEl.textContent = `
      *[data-fg-hover="true"]:not([data-fg-selected="true"]) {
        outline: 2px dashed rgba(99, 102, 241, 0.75) !important;
        outline-offset: 2px !important;
        cursor: pointer !important;
      }
      *[data-fg-selected="true"] {
        outline: 2px solid #6366f1 !important;
        outline-offset: 2px !important;
        box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.2) !important;
      }
      *[contenteditable="true"] {
        outline: 2px solid #10b981 !important;
        box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.25) !important;
        cursor: text !important;
      }
      .__fg_badge {
        position: fixed;
        z-index: 2147483647;
        background: #6366f1;
        color: #ffffff;
        font-family: 'Inter', sans-serif !important;
        font-size: 11px !important;
        font-weight: 600 !important;
        padding: 3px 8px !important;
        border-radius: 4px !important;
        pointer-events: none !important;
        white-space: nowrap !important;
        box-shadow: 0 4px 10px rgba(0,0,0,0.3) !important;
        display: none;
      }
    `;

    let badge = doc.getElementById('__fg_floating_badge');
    if (!badge && doc.body) {
      badge = doc.createElement('div');
      badge.id = '__fg_floating_badge';
      badge.className = '__fg_badge';
      doc.body.appendChild(badge);
    }
  }

  isIgnoredElement(el) {
    if (!el || el.nodeType !== 1) return true;
    const tag = el.tagName.toLowerCase();
    if (['html', 'head', 'script', 'style', 'link', 'meta'].includes(tag)) return true;
    if (el.id === '__fg_floating_badge' || el.id === '__formgiva_editor_styles') return true;
    return false;
  }

  updateFloatingBadge(el) {
    const doc = this.doc;
    if (!doc) return;
    const badge = doc.getElementById('__fg_floating_badge');
    if (!badge) return;

    if (!el || this.isIgnoredElement(el)) {
      badge.style.display = 'none';
      return;
    }

    const rect = el.getBoundingClientRect();
    const tag = el.tagName.toLowerCase();
    const cls = el.className && typeof el.className === 'string'
      ? '.' + el.className.trim().split(/\s+/)[0]
      : '';
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);

    badge.textContent = `${tag}${cls} (${w}×${h}px)`;
    badge.style.display = 'block';
    badge.style.left = `${Math.max(4, Math.min(rect.left, this.win.innerWidth - 160))}px`;
    badge.style.top = `${Math.max(4, rect.top - 26)}px`;
  }

  attachInteractions() {
    const doc = this.doc;
    if (!doc) return;

    // Prevent links and forms from navigating away while editing
    doc.addEventListener('click', (e) => {
      const link = e.target.closest('a, button, input[type="submit"]');
      if (link) {
        e.preventDefault();
      }
    }, true);

    doc.addEventListener('mouseover', (e) => {
      if (this.isDragging) return;
      const target = e.target;
      if (this.isIgnoredElement(target)) return;

      if (this.hoveredEl && this.hoveredEl !== target) {
        this.hoveredEl.removeAttribute('data-fg-hover');
      }
      this.hoveredEl = target;
      target.setAttribute('data-fg-hover', 'true');
      if (!this.selectedEl) {
        this.updateFloatingBadge(target);
      }
    });

    doc.addEventListener('mouseout', (e) => {
      if (e.target && e.target.removeAttribute) {
        e.target.removeAttribute('data-fg-hover');
      }
      if (!this.selectedEl) {
        this.updateFloatingBadge(null);
      }
    });

    doc.addEventListener('mousedown', (e) => {
      const target = e.target;
      if (this.isIgnoredElement(target)) return;

      // Select element
      this.selectElement(target);

      // Tool-specific instant actions
      if (this.currentTool === 'delete') {
        e.preventDefault();
        e.stopPropagation();
        this.deleteSelected();
        return;
      }

      if (this.currentTool === 'text') {
        this.enableInlineTextEdit(target);
        return;
      }

      if (this.currentTool === 'move' && target !== doc.body) {
        e.preventDefault();
        this.isDragging = true;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.initialTx = parseFloat(target.getAttribute('data-fg-tx') || '0');
        this.initialTy = parseFloat(target.getAttribute('data-fg-ty') || '0');
      }
    });

    doc.addEventListener('mousemove', (e) => {
      if (!this.isDragging || !this.selectedEl) return;
      const dx = e.clientX - this.dragStartX;
      const dy = e.clientY - this.dragStartY;
      const newTx = Math.round(this.initialTx + dx);
      const newTy = Math.round(this.initialTy + dy);
      this.setElementTranslation(this.selectedEl, newTx, newTy);
      this.updateFloatingBadge(this.selectedEl);
    });

    doc.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.saveSnapshot('Mover elemento');
        if (this.onSelect && this.selectedEl) {
          this.onSelect(this.selectedEl, this.fontDetector.inspectDOMElement(this.selectedEl, this.win));
        }
      }
    });

    // Double click anywhere enables quick inline text editing
    doc.addEventListener('dblclick', (e) => {
      const target = e.target;
      if (this.isIgnoredElement(target) || target === doc.body) return;
      e.preventDefault();
      this.selectElement(target);
      this.enableInlineTextEdit(target);
    });

    // Forward Ctrl+Z / Ctrl+Y / Delete shortcuts from inside iframe
    doc.addEventListener('keydown', (e) => {
      const isEditingText = doc.activeElement && doc.activeElement.getAttribute('contenteditable') === 'true';
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !isEditingText) {
        e.preventDefault();
        this.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !isEditingText) {
        e.preventDefault();
        this.redo();
      } else if (e.key === 'Delete' && !isEditingText && this.selectedEl && this.selectedEl !== doc.body) {
        e.preventDefault();
        this.deleteSelected();
      }
    });
  }

  enableInlineTextEdit(el) {
    if (!el || el.tagName === 'IMG') return;
    el.setAttribute('contenteditable', 'true');
    el.focus();

    const onBlur = () => {
      el.removeAttribute('contenteditable');
      el.removeEventListener('blur', onBlur);
      this.saveSnapshot('Editar texto');
      if (this.onSelect) {
        this.onSelect(el, this.fontDetector.inspectDOMElement(el, this.win));
      }
    };
    el.addEventListener('blur', onBlur);
  }

  selectElement(el) {
    const doc = this.doc;
    if (!doc) return;

    if (this.selectedEl && this.selectedEl !== el) {
      this.selectedEl.removeAttribute('data-fg-selected');
      this.selectedEl.removeAttribute('contenteditable');
    }

    this.selectedEl = el;
    if (el) {
      el.setAttribute('data-fg-selected', 'true');
      this.updateFloatingBadge(el);
      const fontInfo = this.fontDetector.inspectDOMElement(el, this.win);
      if (this.onSelect) {
        this.onSelect(el, fontInfo);
      }
    } else {
      this.updateFloatingBadge(null);
      if (this.onSelect) this.onSelect(null, null);
    }
  }

  setElementTranslation(el, tx, ty) {
    if (!el) return;
    el.setAttribute('data-fg-tx', tx);
    el.setAttribute('data-fg-ty', ty);
    const scale = el.getAttribute('data-fg-scale') || '1';
    el.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }

  applyCropInset(topPx, rightPx, bottomPx, leftPx, radiusPx = 0) {
    if (!this.selectedEl) return;
    if (topPx === 0 && rightPx === 0 && bottomPx === 0 && leftPx === 0) {
      this.selectedEl.style.clipPath = '';
    } else {
      this.selectedEl.style.clipPath = `inset(${topPx}px ${rightPx}px ${bottomPx}px ${leftPx}px round ${radiusPx}px)`;
    }
    this.saveSnapshot('Cortar elemento');
  }

  deleteSelected() {
    if (!this.selectedEl || this.selectedEl === this.doc.body) return;
    const toRemove = this.selectedEl;
    this.selectElement(null);
    toRemove.remove();
    this.saveSnapshot('Excluir elemento');
  }

  duplicateSelected() {
    if (!this.selectedEl || this.selectedEl === this.doc.body) return;
    const clone = this.selectedEl.cloneNode(true);
    clone.removeAttribute('data-fg-selected');
    clone.removeAttribute('data-fg-hover');
    this.selectedEl.parentNode.insertBefore(clone, this.selectedEl.nextSibling);
    this.selectElement(clone);
    this.saveSnapshot('Duplicar elemento');
  }

  addTextWithClonedFont() {
    const doc = this.doc;
    if (!doc || !doc.body) return;
    const s = this.fontDetector.clonedStyle;
    const span = doc.createElement('div');
    span.textContent = s.sampleText || 'Novo Texto Editável';
    span.style.fontFamily = s.fontFamily || "'Inter', sans-serif";
    span.style.fontSize = s.fontSize || '18px';
    span.style.fontWeight = s.fontWeight || '600';
    span.style.color = s.color || '#ffffff';
    span.style.padding = '8px 12px';
    span.style.display = 'inline-block';
    span.style.position = 'relative';
    span.style.zIndex = '50';

    const container = (this.selectedEl && this.selectedEl !== doc.body)
      ? this.selectedEl.parentElement || doc.body
      : doc.body;

    if (this.selectedEl && this.selectedEl !== doc.body) {
      container.insertBefore(span, this.selectedEl.nextSibling);
    } else {
      container.appendChild(span);
    }

    this.selectElement(span);
    this.enableInlineTextEdit(span);
    this.saveSnapshot('Adicionar texto com mesma fonte');
  }

  saveSnapshot(label = 'Edição') {
    const doc = this.doc;
    if (!doc || !doc.body) return;

    const cleanBody = doc.body.innerHTML;
    if (this.historyIndex >= 0 && this.history[this.historyIndex].bodyHtml === cleanBody) {
      return;
    }

    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push({ label, bodyHtml: cleanBody });
    if (this.history.length > 40) this.history.shift();
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
    const doc = this.doc;
    if (!doc || !doc.body || !snap) return;
    this.selectedEl = null;
    doc.body.innerHTML = snap.bodyHtml;
    this.injectEditorStyles();
    if (this.onHistoryPush) {
      this.onHistoryPush(this.historyIndex > 0, this.historyIndex < this.history.length - 1);
    }
  }

  /**
   * Return clean, production-ready HTML string without editor artifacts
   */
  exportCleanHtml() {
    const doc = this.doc;
    if (!doc) return '';
    const cloneDoc = doc.documentElement.cloneNode(true);

    // Remove editor helper elements & attributes
    const styleEl = cloneDoc.querySelector('#__formgiva_editor_styles');
    if (styleEl) styleEl.remove();
    const badgeEl = cloneDoc.querySelector('#__fg_floating_badge');
    if (badgeEl) badgeEl.remove();

    cloneDoc.querySelectorAll('[data-fg-selected], [data-fg-hover], [contenteditable]').forEach(el => {
      el.removeAttribute('data-fg-selected');
      el.removeAttribute('data-fg-hover');
      el.removeAttribute('contenteditable');
    });

    return '<!DOCTYPE html>\n' + cloneDoc.outerHTML;
  }
}

window.HtmlEditorEngine = HtmlEditorEngine;
