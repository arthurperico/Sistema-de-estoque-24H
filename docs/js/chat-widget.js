(function () {
  var state = {
    history: [],
    isOpen: false,
  };

  var els = {};

  // ── Markup ──────────────────────────────────────────────────────────────────

  function ensureMarkup() {
    if (document.getElementById('eq-chat-launcher')) return;

    var launcher = document.createElement('button');
    launcher.id = 'eq-chat-launcher';
    launcher.className = 'eq-chat-launcher';
    launcher.type = 'button';
    launcher.setAttribute('aria-controls', 'eq-chat-widget');
    launcher.setAttribute('aria-expanded', 'false');
    launcher.setAttribute('aria-label', 'Abrir Skylet');
    launcher.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' +
      '</svg>';

    var widget = document.createElement('section');
    widget.id = 'eq-chat-widget';
    widget.className = 'eq-chat-widget';
    widget.setAttribute('aria-label', 'Skylet');
    widget.setAttribute('aria-hidden', 'true');
    widget.innerHTML = [
      '<header class="eq-chat-header">',
      '  <div class="eq-chat-title">',
      '    <span class="eq-chat-title-icon" aria-hidden="true">',
      '      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
      '        <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
      '      </svg>',
      '    </span>',
      '    <div>',
      '    <strong>Skylet</strong>',
      '      <span>Assistente virtual</span>',
      '    </div>',
      '  </div>',
      '  <button id="eq-chat-close" class="eq-chat-close-btn" type="button" aria-label="Fechar Skylet">',
      '    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
      '      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
      '    </svg>',
      '  </button>',
      '</header>',
      '<div id="eq-chat-log" class="eq-chat-log" aria-live="polite" aria-atomic="false"></div>',
      '<div id="eq-chat-status" class="eq-chat-status" aria-live="polite" aria-atomic="true"></div>',
      '<form id="eq-chat-form" class="eq-chat-form" autocomplete="off">',
      '  <textarea id="eq-chat-input" class="eq-chat-input" placeholder="Pergunte sobre eventos, equipamentos, cabos..." rows="1" aria-label="Mensagem para o assistente"></textarea>',
      '  <button id="eq-chat-send" class="eq-chat-send" type="submit" aria-label="Enviar mensagem">',
      '    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
      '      <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
      '    </svg>',
      '  </button>',
      '</form>',
      '<div class="eq-chat-powered"><a href="https://pklavc.com/" target="_blank" rel="noopener noreferrer">Powered by PkLavc</a></div>',
    ].join('');

    document.body.appendChild(launcher);
    document.body.appendChild(widget);
  }

  function cacheElements() {
    els.launcher = document.getElementById('eq-chat-launcher');
    els.widget = document.getElementById('eq-chat-widget');
    els.closeBtn = document.getElementById('eq-chat-close');
    els.log = document.getElementById('eq-chat-log');
    els.status = document.getElementById('eq-chat-status');
    els.form = document.getElementById('eq-chat-form');
    els.input = document.getElementById('eq-chat-input');
    els.send = document.getElementById('eq-chat-send');
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function parseMarkdown(md) {
    var out = md;
    // Fenced code blocks
    out = out.replace(/```(?:\w*)\n?([\s\S]*?)```/g, function (_, code) {
      return '<pre class="eq-pre"><code>' + code.replace(/^[\n]+|[\n]+$/g, '') + '</code></pre>';
    });
    // Inline code
    out = out.replace(/`([^`\n]+)`/g, '<code class="eq-code">$1</code>');
    // Bold
    out = out.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/__([^_\n]+?)__/g, '<strong>$1</strong>');
    // Italic
    out = out.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');
    // Unordered lists
    out = out.replace(/((?:^[*\-] .+$\n?)+)/gm, function (block) {
      var items = block.trim().split('\n').map(function (line) {
        return '<li>' + line.replace(/^[*\-] /, '') + '</li>';
      });
      return '<ul class="eq-ul">' + items.join('') + '</ul>';
    });
    // Ordered lists
    out = out.replace(/((?:^\d+\.\s+.+$\n?)+)/gm, function (block) {
      var items = block.trim().split('\n').map(function (line) {
        return '<li>' + line.replace(/^\d+\.\s+/, '') + '</li>';
      });
      return '<ol class="eq-ol">' + items.join('') + '</ol>';
    });
    // Newlines to <br>
    out = out.replace(/\n/g, '<br>');
    return out;
  }

  function parseNavMarkers(html) {
    return html.replace(/\[NAVEGAR:([a-z][a-z\-]*?)\|([^\]<>]+?)\]/g, function (_, id, label) {
      var safeId = id.replace(/[^a-z\-]/g, '');
      return '<button class="eq-nav-btn" type="button" onclick="(function(){if(typeof showSection===\'function\'){showSection(\'' + safeId + '\');}})()">' + label + '</button>';
    });
  }

  function renderContent(text) {
    return parseNavMarkers(parseMarkdown(escapeHtml(text)));
  }

  function setStatus(text) {
    if (els.status) els.status.textContent = text;
  }

  function setSendDisabled(disabled) {
    if (els.send) els.send.disabled = disabled;
    if (els.input) els.input.disabled = disabled;
  }

  function autoResizeInput() {
    if (!els.input) return;
    els.input.style.height = 'auto';
    var next = Math.min(els.input.scrollHeight, 140);
    els.input.style.height = next + 'px';
  }

  function focusInput() {
    if (!els.input) return;
    try {
      els.input.focus({ preventScroll: true });
    } catch (_) {
      els.input.focus();
    }
  }

  // ── Messages ─────────────────────────────────────────────────────────────────

  function appendMessage(role, text, isRaw) {
    if (!els.log) return null;
    var node = document.createElement('article');
    node.className = 'eq-chat-message eq-msg-' + role;
    if (isRaw) {
      node.textContent = text;
    } else {
      node.innerHTML = renderContent(text);
    }
    els.log.appendChild(node);
    els.log.scrollTop = els.log.scrollHeight;
    return node;
  }

  // ── Sidebar visibility ──────────────────────────────────────────────────────

  function isSidebarOpen() {
    var container = document.querySelector('.app-container');
    if (!container) return true;
    if (window.innerWidth <= 768) {
      return container.classList.contains('mobile-sidebar-open');
    }
    return !container.classList.contains('sidebar-collapsed');
  }

  function updateWidgetVisibility() {
    if (!els.launcher) return;
    var visible = isSidebarOpen();
    els.launcher.classList.toggle('eq-chat-hidden', !visible);
    document.body.classList.toggle('skylet-visible', visible);
    if (!visible && state.isOpen) {
      closeWidget();
    }
  }

  // ── Open / Close ─────────────────────────────────────────────────────────────

  function openWidget() {
    if (!els.widget || !els.launcher) return;
    state.isOpen = true;
    els.widget.classList.add('is-open');
    els.widget.setAttribute('aria-hidden', 'false');
    els.launcher.setAttribute('aria-expanded', 'true');
    els.launcher.classList.add('is-open');
    focusInput();
  }

  function closeWidget() {
    if (!els.widget || !els.launcher) return;
    state.isOpen = false;
    els.widget.classList.remove('is-open');
    els.widget.setAttribute('aria-hidden', 'true');
    els.launcher.setAttribute('aria-expanded', 'false');
    els.launcher.classList.remove('is-open');
  }

  // ── Send message ─────────────────────────────────────────────────────────────

  async function sendChat() {
    if (!els.input) return;
    var text = (els.input.value || '').trim();
    if (!text) return;

    els.input.value = '';
    autoResizeInput();
    setSendDisabled(true);
    appendMessage('user', text, true);
    setStatus('Digitando...');

    var thinking = appendMessage('assistant', '…', true);

    // Build history payload (exclude the last user message we just appended)
    var historyPayload = state.history.slice();

    try {
      var res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: historyPayload }),
      });

      var data = await res.json().catch(function () { return {}; });

      if (!res.ok) {
        throw new Error(data.error || 'Falha na requisição');
      }

      var reply = data.reply || 'Sem resposta.';

      if (thinking) {
        thinking.innerHTML = renderContent(reply);
      }
      setStatus('');

      // Update history for context in next requests
      state.history.push({ role: 'user', content: text });
      state.history.push({ role: 'assistant', content: reply });
      // Cap history at 20 messages
      if (state.history.length > 20) {
        state.history = state.history.slice(-20);
      }
    } catch (err) {
      if (thinking) {
        thinking.textContent = 'Não foi possível responder agora. Tente novamente.';
        thinking.classList.add('eq-msg-error');
      }
      setStatus('');
      console.error('[Skylet Chat]', err);
    } finally {
      setSendDisabled(false);
      focusInput();
      if (els.log) els.log.scrollTop = els.log.scrollHeight;
    }
  }

  // ── Events ───────────────────────────────────────────────────────────────────

  function bindEvents() {
    if (els.launcher) {
      els.launcher.addEventListener('click', function () {
        state.isOpen ? closeWidget() : openWidget();
      });
    }

    if (els.closeBtn) {
      els.closeBtn.addEventListener('click', closeWidget);
    }

    if (els.form) {
      els.form.addEventListener('submit', function (e) {
        e.preventDefault();
        sendChat();
      });
    }

    if (els.input) {
      els.input.addEventListener('input', autoResizeInput);
      els.input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendChat();
        }
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && state.isOpen) closeWidget();
    });

    var appContainer = document.querySelector('.app-container');
    if (appContainer && window.MutationObserver) {
      var observer = new MutationObserver(updateWidgetVisibility);
      observer.observe(appContainer, { attributes: true, attributeFilter: ['class'] });
    }
    window.addEventListener('resize', updateWidgetVisibility);
  }

  // ── Init ─────────────────────────────────────────────────────────────────────

  function init() {
    ensureMarkup();
    cacheElements();
    if (!els.launcher || !els.widget) return;
    bindEvents();
    autoResizeInput();
    updateWidgetVisibility();

    // Greeting message
    if (els.log && !els.log.children.length) {
      appendMessage(
        'assistant',
        'Olá! Sou a Skylet, sua assistente virtual. Posso te ajudar com dúvidas sobre eventos, equipamentos, cabos, manutenções, usuários e muito mais. Como posso ajudar?',
        false
      );
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
