/**
 * FormgivaWeb - Main Studio Controller
 * Connects Photo/Print Editor, HTML/URL Editor, Left Collapsible Tool Drawer,
 * Optional Font Detector, and Export Pipelines.
 */

const TOOL_TITLES = {
  select: 'Ferramenta: Selecionar',
  move: 'Ferramenta: Mover & Camadas',
  text: 'Ferramenta: Mudar Texto & Cores',
  crop: 'Ferramenta: Cortar / Recortar',
  delete: 'Ferramenta: Excluir / Apagar',
  font: 'Detector de Fonte (Opcional)'
};

// ============================================================================
// CRIPTOGRAFIA PURA JS (SHA-256 + STREAM CIPHER) PARA ACESSO PRIVADO KMKZ
// ============================================================================
function sha256Bytes(asciiStr) {
  const utf8 = unescape(encodeURIComponent(asciiStr));
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  let H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const l = utf8.length * 8;
  const words = [];
  for (let i = 0; i < utf8.length; i++) {
    words[i >> 2] |= (utf8.charCodeAt(i) & 0xff) << (24 - (i % 4) * 8);
  }
  words[l >> 5] |= 0x80 << (24 - (l % 32));
  words[(((l + 64) >> 9) << 4) + 15] = l;

  const W = new Array(64);
  const rotr = (n, x) => (x >>> n) | (x << (32 - n));

  for (let i = 0; i < words.length; i += 16) {
    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      if (t < 16) {
        W[t] = words[i + t] | 0;
      } else {
        const s0 = rotr(7, W[t - 15]) ^ rotr(18, W[t - 15]) ^ (W[t - 15] >>> 3);
        const s1 = rotr(17, W[t - 2]) ^ rotr(19, W[t - 2]) ^ (W[t - 2] >>> 10);
        W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
      }
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[t] + W[t]) | 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      h = g; g = f; f = e; e = (d + temp1) | 0;
      d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }
    H = H.map((v, idx) => (v + [a, b, c, d, e, f, g, h][idx]) | 0);
  }

  const out = [];
  for (let i = 0; i < 8; i++) {
    out.push((H[i] >>> 24) & 0xff, (H[i] >>> 16) & 0xff, (H[i] >>> 8) & 0xff, H[i] & 0xff);
  }
  return out;
}

function sha256Hex(str) {
  return sha256Bytes(str).map(b => b.toString(16).padStart(2, '0')).join('');
}

const EXPECTED_AUTH_HASH = 'e5d468dcfcf89ff44b5a66c27c736f87d9db80d81ae03c1f0c91a1db8233ee99';
const ENCRYPTED_GH_TOKEN_HEX = 'cb3eb787cf4873e26beea22fcaaf27de465f9ef01e0a3c69bbddc3eccd628a8148fd2cc1baf5028f';
const SESSION_STORAGE_KEY = 'formgivaweb_kmkz_session_v1';

function unlockGitHubTokenWithPassword(password) {
  const ks1 = sha256Bytes(`${password}|agendophobia_stream_1`);
  const ks2 = sha256Bytes(`${password}|agendophobia_stream_2`);
  const keyStream = ks1.concat(ks2);
  const encBytes = [];
  for (let i = 0; i < ENCRYPTED_GH_TOKEN_HEX.length; i += 2) {
    encBytes.push(parseInt(ENCRYPTED_GH_TOKEN_HEX.substring(i, i + 2), 16));
  }
  let plain = '';
  for (let i = 0; i < encBytes.length; i++) {
    plain += String.fromCharCode(encBytes[i] ^ keyStream[i % keyStream.length]);
  }
  return plain;
}

class FormgivaStudioApp {
  constructor() {
    this.mode = 'welcome'; // 'welcome' | 'html' | 'image'
    this.activeTool = 'select';
    this.activeGitHubToken = null;

    this.fontDetector = new FontDetectorEngine();

    this.iframeEl = document.getElementById('editorIframe');
    this.photoCanvas = document.getElementById('photoCanvas');
    this.photoOverlay = document.getElementById('photoOverlay');
    this.selectionMarquee = document.getElementById('selectionMarquee');
    this.leftDrawer = document.getElementById('leftDrawer');

    this.htmlEditor = new HtmlEditorEngine(
      this.iframeEl,
      this.fontDetector,
      (el, fontInfo) => this.handleSelectionChange(el, fontInfo),
      (canUndo, canRedo) => this.updateHistoryButtons(canUndo, canRedo)
    );

    this.imageEditor = new ImageEditorEngine(
      this.photoCanvas,
      this.photoOverlay,
      this.selectionMarquee,
      this.fontDetector,
      (layer, fontInfo) => this.handleImageSelectionChange(layer, fontInfo),
      (canUndo, canRedo) => this.updateHistoryButtons(canUndo, canRedo)
    );

    this.populateFontDropdown();
    this.setupPrivateAuthGate();
    this.bindUIEvents();
    this.updateFontDetectorPanel(this.fontDetector.clonedStyle);
  }

  setupPrivateAuthGate() {
    const loginModal = document.getElementById('login-modal');
    const topbar = document.getElementById('app-topbar');
    const workspace = document.getElementById('app-workspace');
    const form = document.getElementById('form-login');
    const eyeBtn = document.getElementById('btn-toggle-eye');
    const passInput = document.getElementById('input-password');
    const logoutBtn = document.getElementById('btnLogoutSession');

    const unlockUI = () => {
      loginModal.classList.add('hidden');
      topbar.classList.remove('app-locked');
      workspace.classList.remove('app-locked');
    };

    const lockUI = () => {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      this.activeGitHubToken = null;
      topbar.classList.add('app-locked');
      workspace.classList.add('app-locked');
      loginModal.classList.remove('hidden');
      if (form) form.reset();
      this.showToast('🔒 Sessão encerrada com segurança.');
    };

    // Check saved session (or shared session from Agendophobia on same browser)
    const saved = localStorage.getItem(SESSION_STORAGE_KEY)
      || sessionStorage.getItem(SESSION_STORAGE_KEY)
      || localStorage.getItem('agendophobia_kmkz_session_v1');

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.authHash === EXPECTED_AUTH_HASH) {
          this.activeGitHubToken = parsed.token || null;
          unlockUI();
        }
      } catch (e) {}
    }

    if (eyeBtn && passInput) {
      eyeBtn.addEventListener('click', () => {
        if (passInput.type === 'password') {
          passInput.type = 'text';
          eyeBtn.textContent = '🙈';
        } else {
          passInput.type = 'password';
          eyeBtn.textContent = '👁️';
        }
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => lockUI());
    }

    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const user = document.getElementById('input-username').value.trim().toLowerCase();
        const pass = passInput.value;
        const remember = document.getElementById('cb-remember-me').checked;
        const errBox = document.getElementById('login-error');

        const candidateHash = sha256Hex(`${user}|${pass}|agendophobia_auth_2026`);
        if (candidateHash === EXPECTED_AUTH_HASH) {
          errBox.style.display = 'none';
          this.activeGitHubToken = unlockGitHubTokenWithPassword(pass);
          const payload = JSON.stringify({
            user: 'Kmkz',
            authHash: candidateHash,
            token: this.activeGitHubToken,
            ts: Date.now()
          });
          if (remember) {
            localStorage.setItem(SESSION_STORAGE_KEY, payload);
          } else {
            sessionStorage.setItem(SESSION_STORAGE_KEY, payload);
          }
          unlockUI();
          this.showToast('🔓 Bem-vindo ao FormgivaWeb, Kmkz!');
        } else {
          errBox.style.display = 'block';
        }
      });
    }
  }

  populateFontDropdown() {
    const sel = document.getElementById('propFontFamily');
    if (!sel) return;
    sel.innerHTML = '';
    WEB_FONTS_CATALOG.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.family;
      opt.textContent = `${f.name} (${f.category})`;
      sel.appendChild(opt);
    });
  }

  bindUIEvents() {
    // 1. Photo / Image File input
    const imageFileInput = document.getElementById('imageFileInput');
    document.getElementById('btnOpenImageFile').addEventListener('click', () => imageFileInput.click());
    document.getElementById('launchPhotoCard').addEventListener('click', () => imageFileInput.click());

    imageFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        this.switchMode('image', file.name);
        this.imageEditor.loadImageFromUrl(ev.target.result, () => {
          this.showToast(`Print "${file.name}" carregado! Selecione uma área e arraste dentro dela para mover.`);
        });
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    });

    // Global Paste (Ctrl+V) support for screenshots
    window.addEventListener('paste', (e) => {
      if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.target && e.target.isContentEditable) return;

      const items = (e.clipboardData || e.originalEvent.clipboardData).items;
      for (const item of items) {
        if (item.type.indexOf('image') === 0) {
          const blob = item.getAsFile();
          const reader = new FileReader();
          reader.onload = (ev) => {
            this.switchMode('image', 'Print Colado (Ctrl+V)');
            this.imageEditor.loadImageFromUrl(ev.target.result, () => {
              this.showToast('Printscreen colado! Selecione qualquer área e arraste para mover.');
            });
          };
          reader.readAsDataURL(blob);
          return;
        }
      }
    });

    // 2. Local HTML File input
    const htmlFileInput = document.getElementById('htmlFileInput');
    document.getElementById('btnOpenHtmlFile').addEventListener('click', () => htmlFileInput.click());
    document.getElementById('launchHtmlCard').addEventListener('click', () => htmlFileInput.click());

    htmlFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        this.switchMode('html', file.name);
        this.htmlEditor.loadHtmlContent(ev.target.result);
        this.showToast(`Arquivo "${file.name}" carregado!`);
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    // 3. Load URL button
    document.getElementById('btnLoadUrl').addEventListener('click', () => {
      const url = document.getElementById('urlInput').value.trim();
      if (!url) {
        this.showToast('Digite um link para abrir.');
        return;
      }
      this.loadFromUrl(url);
    });

    document.getElementById('urlInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('btnLoadUrl').click();
      }
    });

    // 4. Left Toolbar Tool Selection & Expandable Left Column
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        const clickedTool = btn.getAttribute('data-tool');
        // If clicking the already-active tool while drawer is open, toggle drawer closed/open
        if (this.activeTool === clickedTool && !this.leftDrawer.classList.contains('collapsed')) {
          // Still execute instant action if user clicked 'move' with an active selection
          if (clickedTool === 'move' && this.mode === 'image' && this.imageEditor.selectionRect) {
            this.imageEditor.cutSelectionToLayer(this.imageEditor.moveBehavior === 'clone');
            this.showToast('Seleção destacada! Agora arraste a camada para onde quiser.');
            return;
          }
          this.leftDrawer.classList.add('collapsed');
          return;
        }
        this.setTool(clickedTool);
      });
    });

    document.getElementById('btnCloseDrawer').addEventListener('click', () => {
      this.leftDrawer.classList.add('collapsed');
    });

    // 5. Undo / Redo & Keyboard Shortcuts
    document.getElementById('btnUndo').addEventListener('click', () => {
      if (this.mode === 'html') this.htmlEditor.undo();
      else if (this.mode === 'image') this.imageEditor.undo();
    });

    document.getElementById('btnRedo').addEventListener('click', () => {
      if (this.mode === 'html') this.htmlEditor.redo();
      else if (this.mode === 'image') this.imageEditor.redo();
    });

    window.addEventListener('keydown', (e) => {
      if (e.target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable)) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        document.getElementById('btnUndo').click();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        document.getElementById('btnRedo').click();
      } else if (e.key === 'Delete' && this.mode === 'image') {
        e.preventDefault();
        this.imageEditor.deleteSelectedLayer();
      } else if (e.key === 'Escape' && this.mode === 'image') {
        this.imageEditor.clearSelection();
        this.imageEditor.selectLayer(null);
      }
    });

    // 6. Bind Left Column Tool Panes
    this.bindLeftColumnActions();

    // 7. Paste HTML Modal & Export
    document.getElementById('btnPasteHtmlModal').addEventListener('click', () => {
      const modal = document.getElementById('codeModal');
      const textarea = document.getElementById('codeModalTextarea');
      if (this.mode === 'html') {
        textarea.value = this.htmlEditor.exportCleanHtml();
      }
      modal.classList.add('active');
    });

    document.getElementById('btnCloseCodeModal').addEventListener('click', () => {
      document.getElementById('codeModal').classList.remove('active');
    });

    document.getElementById('btnApplyCodeModal').addEventListener('click', () => {
      const code = document.getElementById('codeModalTextarea').value;
      if (!code.trim()) return;
      this.switchMode('html', 'Código HTML');
      this.htmlEditor.loadHtmlContent(code);
      document.getElementById('codeModal').classList.remove('active');
      this.showToast('Código HTML aplicado!');
    });

    document.getElementById('btnExportResult').addEventListener('click', () => {
      this.exportCurrentWork();
    });

    // Keep overlay layers aligned on window resize
    window.addEventListener('resize', () => {
      if (this.mode === 'image') {
        this.imageEditor.syncAllLayers();
      }
    });
  }

  bindLeftColumnActions() {
    // --- PANE 1: SELECIONAR ---
    document.getElementById('btnSelectLiftMove').addEventListener('click', () => {
      if (this.mode === 'image') {
        if (this.imageEditor.cutSelectionToLayer(false)) {
          this.setTool('move');
          this.showToast('Área recortada! Arraste na tela para mover.');
        } else {
          this.showToast('Arraste um retângulo na foto primeiro para selecionar o que deseja mover.');
        }
      }
    });

    document.getElementById('btnSelectCloneMove').addEventListener('click', () => {
      if (this.mode === 'image') {
        if (this.imageEditor.cutSelectionToLayer(true)) {
          this.setTool('move');
          this.showToast('Área clonada em uma nova camada! Arraste para posicionar.');
        } else {
          this.showToast('Selecione uma área na imagem primeiro.');
        }
      }
    });

    document.getElementById('btnSelectReplaceText').addEventListener('click', () => {
      this.setTool('text');
      if (this.mode === 'image' && this.imageEditor.selectionRect) {
        const txt = document.getElementById('propTextContent').value.trim() || 'Novo Texto';
        this.imageEditor.replaceTextInSelection(txt);
        this.showToast('Texto substituído! Digite o texto desejado.');
      }
    });

    document.getElementById('btnSelectCropCanvas').addEventListener('click', () => {
      if (this.mode === 'image' && this.imageEditor.cropCanvasToSelection()) {
        this.showToast('Print cortado para a área selecionada!');
      } else {
        this.showToast('Selecione uma área na foto primeiro para cortar.');
      }
    });

    document.getElementById('btnSelectSmartErase').addEventListener('click', () => {
      if (this.mode === 'image' && this.imageEditor.smartEraseSelection()) {
        this.showToast('Área apagada com preenchimento de fundo!');
      } else if (this.mode === 'html') {
        this.htmlEditor.deleteSelected();
      }
    });

    document.getElementById('btnClearSelection').addEventListener('click', () => {
      this.imageEditor.clearSelection();
      this.imageEditor.selectLayer(null);
    });

    // --- PANE 2: MOVER ---
    const btnMoveCut = document.getElementById('btnMoveModeCut');
    const btnMoveClone = document.getElementById('btnMoveModeClone');

    btnMoveCut.addEventListener('click', () => {
      btnMoveCut.classList.add('active');
      btnMoveClone.classList.remove('active');
      this.imageEditor.moveBehavior = 'cut';
    });

    btnMoveClone.addEventListener('click', () => {
      btnMoveClone.classList.add('active');
      btnMoveCut.classList.remove('active');
      this.imageEditor.moveBehavior = 'clone';
    });

    document.getElementById('btnMoveLiftNow').addEventListener('click', () => {
      if (this.mode === 'image') {
        const cloneOnly = this.imageEditor.moveBehavior === 'clone';
        if (this.imageEditor.cutSelectionToLayer(cloneOnly)) {
          this.showToast('Seleção destacada em camada! Arraste com o mouse para mover.');
        } else {
          this.showToast('Selecione uma área na imagem primeiro ou arraste uma camada existente.');
        }
      }
    });

    document.getElementById('btnDuplicateLayer').addEventListener('click', () => {
      if (this.mode === 'image') {
        if (this.imageEditor.duplicateSelectedLayer()) {
          this.showToast('Camada duplicada!');
        } else {
          this.showToast('Selecione uma camada ou área primeiro para duplicar.');
        }
      } else if (this.mode === 'html') {
        this.htmlEditor.duplicateSelected();
      }
    });

    document.getElementById('btnStampLayer').addEventListener('click', () => {
      if (this.mode === 'image' && this.imageEditor.stampSelectedLayer()) {
        this.showToast('Camada fixada na imagem!');
      }
    });

    document.getElementById('btnMoveDeleteLayer').addEventListener('click', () => {
      if (this.mode === 'image' && this.imageEditor.deleteSelectedLayer()) {
        this.showToast('Camada excluída!');
      } else if (this.mode === 'html') {
        this.htmlEditor.deleteSelected();
      }
    });

    const propMoveX = document.getElementById('propMoveX');
    const propMoveY = document.getElementById('propMoveY');
    const updatePositionFromInputs = () => {
      const tx = parseFloat(propMoveX.value || '0');
      const ty = parseFloat(propMoveY.value || '0');
      if (this.mode === 'html' && this.htmlEditor.selectedEl) {
        this.htmlEditor.setElementTranslation(this.htmlEditor.selectedEl, tx, ty);
        this.htmlEditor.saveSnapshot('Mover posição X/Y');
      } else if (this.mode === 'image' && this.imageEditor.selectedLayer) {
        this.imageEditor.selectedLayer.x = tx;
        this.imageEditor.selectedLayer.y = ty;
        this.imageEditor.syncLayerPosition(this.imageEditor.selectedLayer);
      }
    };
    propMoveX.addEventListener('input', updatePositionFromInputs);
    propMoveY.addEventListener('input', updatePositionFromInputs);

    // --- PANE 3: MUDAR (TEXTO & CORES) ---
    const propText = document.getElementById('propTextContent');
    propText.addEventListener('input', () => {
      if (this.mode === 'html' && this.htmlEditor.selectedEl) {
        this.htmlEditor.selectedEl.innerText = propText.value;
      } else if (this.mode === 'image' && this.imageEditor.selectedLayer && this.imageEditor.selectedLayer.textDiv) {
        this.imageEditor.selectedLayer.textDiv.innerText = propText.value;
      }
    });

    document.getElementById('btnTextReplaceSelection').addEventListener('click', () => {
      if (this.mode === 'image') {
        const txt = propText.value.trim() || 'Texto Editado';
        const styleOverrides = {
          fontFamily: document.getElementById('propFontFamily').value,
          fontSize: `${document.getElementById('propFontSize').value}px`,
          fontWeight: document.getElementById('propFontWeight').value,
          color: document.getElementById('propTextColor').value
        };
        this.imageEditor.replaceTextInSelection(txt, styleOverrides);
        this.showToast('Texto inserido na seleção! Arraste para ajustar a posição.');
      } else if (this.mode === 'html') {
        this.htmlEditor.addTextWithClonedFont();
      }
    });

    document.getElementById('btnAddFreeText').addEventListener('click', () => {
      if (this.mode === 'image') {
        this.imageEditor.clearSelection();
        const txt = propText.value.trim() || 'Novo Texto';
        const styleOverrides = {
          fontFamily: document.getElementById('propFontFamily').value,
          fontSize: `${document.getElementById('propFontSize').value}px`,
          fontWeight: document.getElementById('propFontWeight').value,
          color: document.getElementById('propTextColor').value
        };
        this.imageEditor.replaceTextInSelection(txt, styleOverrides);
        this.showToast('Texto adicionado! Arraste para posicionar onde quiser.');
      } else if (this.mode === 'html') {
        this.htmlEditor.addTextWithClonedFont();
      }
    });

    // Font Family, Size, Weight
    const propFontFamily = document.getElementById('propFontFamily');
    propFontFamily.addEventListener('change', () => {
      this.applyStyleToActiveTarget('fontFamily', propFontFamily.value);
    });

    const propFontSize = document.getElementById('propFontSize');
    propFontSize.addEventListener('input', () => {
      this.applyStyleToActiveTarget('fontSize', `${propFontSize.value}px`);
    });

    const propFontWeight = document.getElementById('propFontWeight');
    propFontWeight.addEventListener('change', () => {
      this.applyStyleToActiveTarget('fontWeight', propFontWeight.value);
    });

    // Colors + Eyedropper
    const propTextColor = document.getElementById('propTextColor');
    const propTextColorHex = document.getElementById('propTextColorHex');
    propTextColor.addEventListener('input', () => {
      propTextColorHex.value = propTextColor.value;
      this.applyStyleToActiveTarget('color', propTextColor.value);
    });
    propTextColorHex.addEventListener('change', () => {
      propTextColor.value = propTextColorHex.value;
      this.applyStyleToActiveTarget('color', propTextColorHex.value);
    });

    const propBgColor = document.getElementById('propBgColor');
    const propBgColorHex = document.getElementById('propBgColorHex');
    propBgColor.addEventListener('input', () => {
      propBgColorHex.value = propBgColor.value;
      this.applyStyleToActiveTarget('backgroundColor', propBgColor.value);
    });
    propBgColorHex.addEventListener('change', () => {
      propBgColor.value = propBgColorHex.value;
      this.applyStyleToActiveTarget('backgroundColor', propBgColorHex.value);
    });

    document.getElementById('btnPickTextColor').addEventListener('click', () => {
      if (this.mode !== 'image') return;
      this.showToast('Clique em cima de uma letra na foto para capturar a cor exata!');
      this.imageEditor.activateEyedropper((hex) => {
        propTextColor.value = hex;
        propTextColorHex.value = hex;
        this.fontDetector.clonedStyle.color = hex;
        this.applyStyleToActiveTarget('color', hex);
        this.showToast(`Cor do texto capturada: ${hex}`);
      });
    });

    document.getElementById('btnPickBgColor').addEventListener('click', () => {
      if (this.mode !== 'image') return;
      this.showToast('Clique no fundo da foto para capturar a cor exata!');
      this.imageEditor.activateEyedropper((hex) => {
        propBgColor.value = hex;
        propBgColorHex.value = hex;
        this.fontDetector.clonedStyle.backgroundColor = hex;
        this.applyStyleToActiveTarget('backgroundColor', hex);
        this.showToast(`Cor do fundo capturada: ${hex}`);
      });
    });

    // --- PANE 4: CORTAR ---
    document.getElementById('btnCropFullImage').addEventListener('click', () => {
      if (this.mode === 'image' && this.imageEditor.cropCanvasToSelection()) {
        this.showToast('Print cortado com sucesso!');
      } else {
        this.showToast('Selecione um retângulo na imagem primeiro para cortar.');
      }
    });

    document.getElementById('btnCropToLayer').addEventListener('click', () => {
      if (this.mode === 'image' && this.imageEditor.cutSelectionToLayer(false)) {
        this.setTool('move');
        this.showToast('Pedaço recortado em camada móvel!');
      } else {
        this.showToast('Selecione uma área na imagem primeiro.');
      }
    });

    ['cropTop', 'cropRight', 'cropBottom', 'cropLeft'].forEach(id => {
      document.getElementById(id).addEventListener('input', () => {
        if (this.mode === 'html') {
          const t = parseInt(document.getElementById('cropTop').value || '0', 10);
          const r = parseInt(document.getElementById('cropRight').value || '0', 10);
          const b = parseInt(document.getElementById('cropBottom').value || '0', 10);
          const l = parseInt(document.getElementById('cropLeft').value || '0', 10);
          this.htmlEditor.applyCropInset(t, r, b, l, 0);
        }
      });
    });

    // --- PANE 5: EXCLUIR ---
    document.getElementById('btnDeleteSmartSelection').addEventListener('click', () => {
      if (this.mode === 'image' && this.imageEditor.smartEraseSelection()) {
        this.showToast('Área apagada com preenchimento automático do fundo!');
      } else if (this.mode === 'html') {
        this.htmlEditor.deleteSelected();
      }
    });

    document.getElementById('btnFillWithPickedBg').addEventListener('click', () => {
      if (this.mode === 'image') {
        const bgHex = document.getElementById('propBgColor').value;
        if (this.imageEditor.smartEraseSelection(false, bgHex)) {
          this.showToast(`Área preenchida com a cor ${bgHex}!`);
        } else {
          this.showToast('Selecione uma área na imagem primeiro.');
        }
      }
    });

    document.getElementById('btnDeleteActiveLayer').addEventListener('click', () => {
      if (this.mode === 'image' && this.imageEditor.deleteSelectedLayer()) {
        this.showToast('Camada removida!');
      } else if (this.mode === 'html') {
        this.htmlEditor.deleteSelected();
      }
    });

    // --- PANE 6: DETECTOR DE FONTE (OPCIONAL) ---
    document.getElementById('fontDetectorSampleInput').addEventListener('input', (e) => {
      const val = e.target.value || 'Texto';
      this.fontDetector.clonedStyle.sampleText = val;
      document.querySelectorAll('.font-match-preview').forEach(el => {
        el.textContent = val;
      });
    });

    // --- RIGHT COLUMN (+tools): SOBREPOR & FERRAMENTAS ESPECÍFICAS ---
    this.bindRightPlusToolsActions();
  }

  bindRightPlusToolsActions() {
    const rightDrawer = document.getElementById('rightToolsDrawer');
    const btnPlusTools = document.getElementById('btnTogglePlusTools');
    const btnCloseRight = document.getElementById('btnCloseRightDrawer');

    if (btnPlusTools && rightDrawer) {
      btnPlusTools.addEventListener('click', () => {
        const isClosed = rightDrawer.classList.toggle('collapsed');
        btnPlusTools.classList.toggle('active', !isClosed);
        if (!isClosed) {
          this.updateRightLayersList();
        }
      });
    }

    if (btnCloseRight && rightDrawer) {
      btnCloseRight.addEventListener('click', () => {
        rightDrawer.classList.add('collapsed');
        if (btnPlusTools) btnPlusTools.classList.remove('active');
      });
    }

    // 1. Botão Principal: Sobrepor Seleção / Recorte
    document.getElementById('btnRightOverlaySelection').addEventListener('click', () => {
      if (this.mode !== 'image') {
        this.showToast('Abra um Print/Foto para sobrepor um recorte.');
        return;
      }
      const layer = this.imageEditor.overlayCurrentOrLastSelection();
      if (layer) {
        this.updateRightLayersList();
        this.showToast('Recorte sobreposto por cima! Arraste-o para onde quiser cobrir.');
      } else {
        this.showToast('Selecione ou corte um pedaço da imagem primeiro para poder sobrepor.');
      }
    });

    // 2. Encaixar Recorte na Seleção Atual
    document.getElementById('btnRightFitOverlayIntoSelection').addEventListener('click', () => {
      if (this.mode !== 'image') return;
      const layer = this.imageEditor.fitClipboardOverlayIntoSelection();
      if (layer) {
        this.updateRightLayersList();
        this.showToast('Recorte encaixado e sobreposto exatamente na seleção!');
      } else {
        this.showToast('Primeiro selecione/corte o item de origem, depois selecione o local de destino e clique aqui.');
      }
    });

    // 3. Modo Carimbo (Clicar na Foto p/ Sobrepor)
    const btnStampMode = document.getElementById('btnRightToggleStampMode');
    btnStampMode.addEventListener('click', () => {
      if (this.mode !== 'image') return;
      if (!this.imageEditor.clipboardPiece && this.imageEditor.selectionRect) {
        this.imageEditor.captureSelectionToClipboard();
        this.imageEditor.clearSelection();
      }
      if (!this.imageEditor.clipboardPiece) {
        this.showToast('Selecione ou corte uma área primeiro para usar como carimbo de sobreposição!');
        return;
      }
      this.imageEditor.stampOverlayMode = !this.imageEditor.stampOverlayMode;
      if (this.imageEditor.stampOverlayMode) {
        btnStampMode.classList.add('btn-primary');
        btnStampMode.textContent = '🎯 Carimbar: ATIVO (Clique na foto p/ Sobrepor)';
        this.showToast('Modo Carimbo ativo! Clique em qualquer lugar do print para sobrepor o recorte.');
      } else {
        btnStampMode.classList.remove('btn-primary');
        btnStampMode.textContent = '🎯 Carimbar: Clicar na Foto p/ Sobrepor (Off)';
        this.showToast('Modo Carimbo desativado.');
      }
    });

    // 4. Trazer p/ Frente & Enviar p/ Trás & Fixar Sobreposição
    document.getElementById('btnRightBringFront').addEventListener('click', () => {
      if (this.mode === 'image' && this.imageEditor.bringLayerToFront()) {
        this.updateRightLayersList();
        this.showToast('Camada trazida para frente de todas!');
      }
    });

    document.getElementById('btnRightSendBack').addEventListener('click', () => {
      if (this.mode === 'image' && this.imageEditor.sendLayerToBack()) {
        this.updateRightLayersList();
        this.showToast('Camada enviada para trás!');
      }
    });

    document.getElementById('btnRightStampOverlay').addEventListener('click', () => {
      if (this.mode === 'image' && this.imageEditor.stampSelectedLayer()) {
        this.updateRightLayersList();
        this.showToast('Sobreposição fixada definitivamente no print!');
      } else {
        this.showToast('Selecione uma camada sobreposta primeiro para fixá-la.');
      }
    });

    // 5. Opacidade da Sobreposição
    const opacitySlider = document.getElementById('rightOverlayOpacity');
    const lblOpacity = document.getElementById('lblOverlayOpacity');
    opacitySlider.addEventListener('input', () => {
      const val = parseInt(opacitySlider.value, 10);
      lblOpacity.textContent = `${val}%`;
      if (this.mode === 'image') {
        this.imageEditor.setLayerOpacity(val);
      }
    });

    // 6. Ajuste Fino 1px (Nudge), Dimensões e Espelhar
    document.getElementById('btnNudgeLeft').addEventListener('click', () => this.imageEditor.nudgeSelectedLayer(-1, 0));
    document.getElementById('btnNudgeRight').addEventListener('click', () => this.imageEditor.nudgeSelectedLayer(1, 0));
    document.getElementById('btnNudgeUp').addEventListener('click', () => this.imageEditor.nudgeSelectedLayer(0, -1));
    document.getElementById('btnNudgeDown').addEventListener('click', () => this.imageEditor.nudgeSelectedLayer(0, 1));

    const inpW = document.getElementById('rightLayerWidth');
    const inpH = document.getElementById('rightLayerHeight');
    const updateLayerDims = () => {
      if (this.mode === 'image' && this.imageEditor.selectedLayer && this.imageEditor.selectedLayer.type === 'image') {
        this.imageEditor.selectedLayer.w = Math.max(8, parseInt(inpW.value || '20', 10));
        this.imageEditor.selectedLayer.h = Math.max(8, parseInt(inpH.value || '20', 10));
        this.imageEditor.syncLayerPosition(this.imageEditor.selectedLayer);
      }
    };
    inpW.addEventListener('input', updateLayerDims);
    inpH.addEventListener('input', updateLayerDims);

    document.getElementById('btnFlipH').addEventListener('click', () => {
      if (this.mode === 'image' && this.imageEditor.flipSelectedLayer('h')) {
        this.showToast('Camada espelhada horizontalmente!');
      }
    });

    document.getElementById('btnFlipV').addEventListener('click', () => {
      if (this.mode === 'image' && this.imageEditor.flipSelectedLayer('v')) {
        this.showToast('Camada espelhada verticalmente!');
      }
    });

    // 7. Efeitos & Retoque na Seleção
    document.getElementById('btnRightPixelateSelection').addEventListener('click', () => {
      if (this.mode === 'image' && this.imageEditor.pixelateSelection(10)) {
        this.showToast('Seleção borrada/pixelizada!');
      } else {
        this.showToast('Selecione uma área na imagem primeiro.');
      }
    });

    document.getElementById('btnRightBorderSelection').addEventListener('click', () => {
      const color = document.getElementById('propTextColor').value || '#6366f1';
      if (this.mode === 'image' && this.imageEditor.drawBorderOnSelection(color, 3)) {
        this.showToast('Borda de destaque aplicada na seleção!');
      } else {
        this.showToast('Selecione uma área na imagem primeiro.');
      }
    });

    document.getElementById('btnRightInvertSelection').addEventListener('click', () => {
      if (this.mode === 'image' && this.imageEditor.invertSelectionColors()) {
        this.showToast('Cores da seleção invertidas!');
      } else {
        this.showToast('Selecione uma área na imagem primeiro.');
      }
    });
  }

  updateRightLayersList() {
    const listBox = document.getElementById('rightLayersList');
    const countBadge = document.getElementById('rightLayersCount');
    if (!listBox || !countBadge) return;

    const layers = this.imageEditor.layers;
    countBadge.textContent = String(layers.length);

    if (layers.length === 0) {
      listBox.innerHTML = `<div style="font-size:11.5px; color:var(--text-dim); text-align:center; padding:8px;">Nenhuma camada sobreposta ativa.</div>`;
      return;
    }

    listBox.innerHTML = '';
    layers.slice().reverse().forEach((layer, idx) => {
      const item = document.createElement('div');
      const isSel = this.imageEditor.selectedLayer === layer;
      item.className = 'layer-list-item' + (isSel ? ' active' : '');
      const label = layer.type === 'text'
        ? `✏️ Texto: "${(layer.textDiv.innerText || '').slice(0, 14)}"`
        : `🖼️ Recorte #${layers.length - idx} (${Math.round(layer.w)}×${Math.round(layer.h)})`;

      item.innerHTML = `
        <span>${label}</span>
        <span style="font-size:10.5px; color:var(--text-muted);">Selecionar</span>
      `;
      item.addEventListener('click', () => {
        this.imageEditor.selectLayer(layer);
        this.updateRightLayersList();
      });
      listBox.appendChild(item);
    });
  }

  applyStyleToActiveTarget(prop, value) {
    if (this.mode === 'html' && this.htmlEditor.selectedEl) {
      this.htmlEditor.selectedEl.style[prop] = value;
      this.htmlEditor.saveSnapshot(`Alterar ${prop}`);
    } else if (this.mode === 'image' && this.imageEditor.selectedLayer) {
      const layer = this.imageEditor.selectedLayer;
      if (layer.type === 'text' && layer.textDiv) {
        layer.style[prop] = value;
        layer.textDiv.style[prop] = value;
        this.imageEditor.syncLayerPosition(layer);
      }
    }
  }

  setTool(toolName) {
    this.activeTool = toolName;
    this.htmlEditor.currentTool = toolName;
    this.imageEditor.currentTool = toolName;

    // Highlight active icon in left rail
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tool') === toolName);
    });

    // Open the left drawer and show the corresponding tool pane
    this.leftDrawer.classList.remove('collapsed');
    document.getElementById('drawerHeaderTitle').textContent = TOOL_TITLES[toolName] || 'Ferramentas';

    document.querySelectorAll('.tool-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === `pane-${toolName}`);
    });

    // If user clicked 'move' while having an active selection on the photo, lift it into a movable layer right away!
    if (toolName === 'move' && this.mode === 'image' && this.imageEditor.selectionRect) {
      const cloneOnly = this.imageEditor.moveBehavior === 'clone';
      this.imageEditor.cutSelectionToLayer(cloneOnly);
      this.showToast('Área destacada! Agora é só arrastar na imagem para onde quiser.');
    }
  }

  switchMode(newMode, titleLabel = '') {
    this.mode = newMode;
    document.getElementById('welcomeCard').style.display = newMode === 'welcome' ? 'block' : 'none';
    document.getElementById('htmlStageWrapper').classList.toggle('active', newMode === 'html');
    document.getElementById('imageStageWrapper').classList.toggle('active', newMode === 'image');

    const modeBadge = document.getElementById('activeModeLabel');
    if (newMode === 'html') {
      modeBadge.textContent = `Modo HTML • ${titleLabel || 'Página Ativa'}`;
    } else if (newMode === 'image') {
      modeBadge.textContent = `Modo Foto/Print • ${titleLabel || 'Imagem Ativa'}`;
    } else {
      modeBadge.textContent = 'Aguardando imagem ou página';
    }
  }

  async loadFromUrl(rawUrl) {
    let targetUrl = rawUrl;
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = 'https://' + targetUrl;
    }

    this.showToast(`Carregando ${targetUrl}...`);

    const proxies = [
      (u) => u,
      (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
      (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`
    ];

    for (const buildUrl of proxies) {
      try {
        const res = await fetch(buildUrl(targetUrl));
        if (res.ok) {
          const html = await res.text();
          if (html && html.length > 30) {
            const urlObj = new URL(targetUrl);
            const baseHref = `${urlObj.origin}/`;
            this.switchMode('html', urlObj.hostname);
            this.htmlEditor.loadHtmlContent(html, baseHref);
            this.showToast(`Página ${urlObj.hostname} carregada!`);
            return;
          }
        }
      } catch (err) {
        // Continue to next proxy
      }
    }

    this.showToast('Site bloqueou acesso externo direto. Use um Print (Ctrl+V) ou abra o HTML!');
  }

  handleSelectionChange(el, fontInfo) {
    if (!el || !fontInfo) return;

    document.getElementById('propTextContent').value = (el.innerText || '').trim();
    document.getElementById('propFontSize').value = parseInt(fontInfo.fontSize, 10) || 16;
    document.getElementById('propFontWeight').value = fontInfo.fontWeight || '600';
    document.getElementById('propTextColor').value = fontInfo.color;
    document.getElementById('propTextColorHex').value = fontInfo.color;
    document.getElementById('propBgColor').value = fontInfo.backgroundColor;
    document.getElementById('propBgColorHex').value = fontInfo.backgroundColor;

    document.getElementById('propMoveX').value = el.getAttribute('data-fg-tx') || '0';
    document.getElementById('propMoveY').value = el.getAttribute('data-fg-ty') || '0';

    this.updateFontDetectorPanel(fontInfo);
  }

  handleImageSelectionChange(layer, fontInfo) {
    if (layer) {
      document.getElementById('propMoveX').value = Math.round(layer.x || 0);
      document.getElementById('propMoveY').value = Math.round(layer.y || 0);
      const inpW = document.getElementById('rightLayerWidth');
      const inpH = document.getElementById('rightLayerHeight');
      if (inpW && layer.w) inpW.value = Math.round(layer.w);
      if (inpH && layer.h) inpH.value = Math.round(layer.h);
      const opSlider = document.getElementById('rightOverlayOpacity');
      const lblOp = document.getElementById('lblOverlayOpacity');
      if (opSlider && lblOp) {
        const pct = Math.round((layer.opacity !== undefined ? layer.opacity : 1) * 100);
        opSlider.value = pct;
        lblOp.textContent = `${pct}%`;
      }
      if (layer.type === 'text' && layer.textDiv) {
        document.getElementById('propTextContent').value = layer.textDiv.innerText || '';
      }
    }
    this.updateRightLayersList();
    if (fontInfo) {
      document.getElementById('propTextColor').value = fontInfo.color || '#111827';
      document.getElementById('propTextColorHex').value = fontInfo.color || '#111827';
      document.getElementById('propBgColor').value = fontInfo.backgroundColor || '#ffffff';
      document.getElementById('propBgColorHex').value = fontInfo.backgroundColor || '#ffffff';
      document.getElementById('propFontSize').value = parseInt(fontInfo.fontSize, 10) || 16;
      if (fontInfo.fontWeight) {
        document.getElementById('propFontWeight').value = fontInfo.fontWeight;
      }
      this.updateFontDetectorPanel(fontInfo);
    }
  }

  updateFontDetectorPanel(info) {
    if (!info) return;
    document.getElementById('detectedFontPrimaryName').textContent = info.fontName || 'Inter';
    document.getElementById('detectedFontModeTag').textContent =
      info.mode === 'dom' ? 'DOM CSS' : 'Análise de Pixels';

    document.getElementById('metaFontSize').textContent = `Tam: ${info.fontSize || '16px'}`;
    document.getElementById('metaFontWeight').textContent = `Peso: ${info.fontWeight || '600'}`;
    document.getElementById('metaFontColor').textContent = `Cor: ${info.color || '#111827'}`;
    document.getElementById('metaBgColor').textContent = `Fundo: ${info.backgroundColor || '#ffffff'}`;

    const sampleInput = document.getElementById('fontDetectorSampleInput');

    const cropWrap = document.getElementById('imageCropPreviewWrap');
    const cropImg = document.getElementById('imageCropPreviewImg');
    if (info.mode === 'image' && info.cropDataUrl) {
      cropWrap.style.display = 'block';
      cropImg.src = info.cropDataUrl;
    } else {
      cropWrap.style.display = 'none';
    }

    const listEl = document.getElementById('fontMatchesContainer');
    listEl.innerHTML = '';

    const candidates = info.rankedFonts || WEB_FONTS_CATALOG.map((f, i) => ({
      ...f,
      score: f.name.toLowerCase() === (info.fontName || '').toLowerCase() ? 100 : 95 - i * 2
    })).sort((a, b) => b.score - a.score);

    candidates.slice(0, 7).forEach((cand, idx) => {
      const item = document.createElement('div');
      item.className = 'font-match-item' + (idx === 0 ? ' selected' : '');
      item.innerHTML = `
        <div class="font-match-header">
          <span><strong>${cand.name}</strong> • ${cand.category}</span>
          <span class="match-score">${cand.score}%</span>
        </div>
        <div class="font-match-preview" style="
          font-family: ${cand.family};
          font-weight: ${info.fontWeight || 600};
          color: ${info.color || '#111827'};
          background: ${info.backgroundColor || '#ffffff'};
          padding: 5px 8px;
          border-radius: 5px;
          border: 1px solid rgba(128,128,128,0.2);
        ">${sampleInput.value || 'Schedule UFL'}</div>
      `;

      item.addEventListener('click', () => {
        document.querySelectorAll('.font-match-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');

        this.fontDetector.clonedStyle.fontFamily = cand.family;
        this.fontDetector.clonedStyle.fontName = cand.name;
        document.getElementById('detectedFontPrimaryName').textContent = cand.name;
        document.getElementById('propFontFamily').value = cand.family;

        this.applyStyleToActiveTarget('fontFamily', cand.family);
        this.showToast(`Fonte "${cand.name}" selecionada!`);
      });

      listEl.appendChild(item);
    });
  }

  updateHistoryButtons(canUndo, canRedo) {
    document.getElementById('btnUndo').disabled = !canUndo;
    document.getElementById('btnRedo').disabled = !canRedo;
  }

  exportCurrentWork() {
    if (this.mode === 'html') {
      const cleanHtml = this.htmlEditor.exportCleanHtml();
      const blob = new Blob([cleanHtml], { type: 'text/html;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'pagina-editada.html';
      a.click();
      this.showToast('Arquivo "pagina-editada.html" salvo!');
    } else if (this.mode === 'image') {
      const dataUrl = this.imageEditor.exportFlattenedPng();
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = 'print-editado.png';
      a.click();
      this.showToast('Imagem "print-editado.png" salva!');
    } else {
      this.showToast('Abra uma Foto/Print primeiro para exportar!');
    }
  }

  showToast(msg) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 3200);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.studioApp = new FormgivaStudioApp();
});
