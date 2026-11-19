(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const ROLE_META = {
    gerente: {
      label: 'Gerencia',
      subtitle: 'Visión completa de la fábrica',
      nav: [
        ['dashboard', 'Panel gerencial'],
        ['ventas', 'Ventas'],
        ['almacen', 'Almacén / Despacho'],
        ['produccion', 'Producción'],
        ['stock', 'Inventario'],
        ['calidad', '1ª → 2ª'],
        ['clientes', 'Clientes'],
        ['historial', 'Historial completo'],
        ['metas', 'Metas semanales y mensuales'],
        ['cierre', 'Cierre & cuadre']
      ]
    },
    ventas: {
      label: 'Ventas',
      subtitle: 'Pedidos y reporte de área',
      nav: [
        ['dashboard', 'Mi panel'],
        ['ventas', 'Registrar venta'],
        ['historial', 'Mi historial'],
        ['reporte', 'Mi reporte del día']
      ]
    },
    almacen: {
      label: 'Almacén',
      subtitle: 'Despacho y control de stock',
      nav: [
        ['dashboard', 'Despacho'],
        ['almacen', 'Pedidos a despachar'],
        ['stock', 'Stock disponible'],
        ['calidad', '1ª → 2ª'],
        ['historial', 'Historial de despacho'],
        ['reporte', 'Mi reporte del día']
      ]
    },
    produccion: {
      label: 'Producción',
      subtitle: 'Registro diario de hornos',
      nav: [
        ['dashboard', 'Mi panel'],
        ['produccion', 'Registrar producción'],
        ['stock', 'Stock de primera'],
        ['historial', 'Mi historial'],
        ['reporte', 'Mi reporte del día']
      ]
    }
  };

  let state = {
    user: null,
    view: 'dashboard',
    productos: [],
    almacenTab: 'pendientes',
    pollTimer: null
  };

  function money(n) {
    return new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB', minimumFractionDigits: 2 }).format(Number(n) || 0);
  }
  function num(n) {
    return new Intl.NumberFormat('es-BO').format(Number(n) || 0);
  }
  function dt(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('es-BO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  function esc(s) {
    return String(s ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }
  function toast(msg, type = 'ok') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), 3400);
  }
  function pill(estado) {
    return `<span class="pill ${estado}">${esc(estado)}</span>`;
  }
  function isGerente() { return state.user?.rol === 'gerente'; }
  function canSeeMoney() { return state.user?.rol === 'gerente' || state.user?.rol === 'ventas'; }

  function openModal(title, body, foot = '') {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = body;
    $('#modalFoot').innerHTML = foot;
    $('#modal').showModal();
  }
  function closeModal() { $('#modal').close(); }

  /* ---------- AUTH / SHELL ---------- */
  async function boot() {
    // Si abrieron el HTML como archivo, redirigir al servidor local
    if (location.protocol === 'file:') {
      document.body.innerHTML = `
        <div style="min-height:100vh;display:grid;place-items:center;padding:1.5rem;font-family:Manrope,sans-serif;background:#1f272c;color:#fff;text-align:center">
          <div style="max-width:420px">
            <h1 style="font-family:Barlow Condensed,sans-serif">Abrir desde el servidor</h1>
            <p style="opacity:.85;line-height:1.5">No abra el archivo index.html directamente.<br/>Ejecute <strong>INICIAR.bat</strong> y entre por:</p>
            <p style="margin:1rem 0"><a href="http://localhost:3780/" style="color:#ffb199;font-size:1.2rem">http://localhost:3780</a></p>
            <p style="opacity:.7;font-size:.9rem">Redirigiendo automáticamente…</p>
          </div>
        </div>`;
      setTimeout(() => { location.href = 'http://localhost:3780/'; }, 1200);
      return;
    }

    bindLogin();
    $('#modalClose').onclick = closeModal;
    $('#modal').addEventListener('click', (e) => {
      if (e.target === $('#modal')) closeModal();
    });

    const saved = API.user();
    if (saved && API.token()) {
      try {
        await API.me();
        enterApp(saved);
        return;
      } catch {
        API.clearSession();
      }
    }
    showLogin();
  }

  function showLogin() {
    $('#loginScreen').hidden = false;
    $('#appShell').hidden = true;
    stopPoll();
  }

  function bindLogin() {
    $('#loginForm').onsubmit = async (e) => {
      e.preventDefault();
      const errBox = $('#loginError');
      errBox.hidden = true;
      const btn = e.target.querySelector('button[type="submit"]');
      const prev = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Ingresando…';
      try {
        const usuario = $('#loginUser').value.trim().toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const pin = $('#loginPin').value.trim();
        const data = await API.login(usuario, pin);
        API.setSession(data.token, data.user);
        enterApp(data.user);
      } catch (err) {
        errBox.hidden = false;
        errBox.textContent = err.offline
          ? 'No hay conexión con el servidor. Ejecute INICIAR.bat y abra http://localhost:3780'
          : (err.message || 'No se pudo ingresar');
      } finally {
        btn.disabled = false;
        btn.textContent = prev;
      }
    };
    $$('.chip').forEach(c => {
      c.onclick = () => {
        $('#loginUser').value = c.dataset.u;
        $('#loginPin').value = '1234';
        $('#loginForm').requestSubmit();
      };
    });
  }

  function enterApp(user) {
    state.user = user;
    $('#loginScreen').hidden = true;
    $('#appShell').hidden = false;
    $('#roleLabel').textContent = ROLE_META[user.rol]?.label || user.rol;
    $('#userName').textContent = user.nombre;
    $('#userHandle').textContent = `@${user.usuario}`;
    $('#userAvatar').textContent = user.nombre.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    buildNav();
    $('#menuBtn').onclick = () => {
      $('#sidebar').classList.toggle('open');
      $('#navOverlay').hidden = !$('#sidebar').classList.contains('open');
    };
    $('#navOverlay').onclick = () => {
      $('#sidebar').classList.remove('open');
      $('#navOverlay').hidden = true;
    };
    $('#btnLogout').onclick = async () => {
      try { await API.logout(); } catch {}
      API.clearSession();
      showLogin();
    };
    tickClock();
    setInterval(tickClock, 30000);
    showView(ROLE_META[user.rol].nav[0][0]);
    startPoll();
  }

  function tickClock() {
    $('#clockNow').textContent = new Date().toLocaleString('es-BO', {
      weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    });
  }

  function buildNav() {
    const meta = ROLE_META[state.user.rol];
    $('#mainNav').innerHTML = meta.nav.map(([id, label]) => `
      <button class="nav-item" type="button" data-view="${id}">
        <span>${label}</span>
        ${id === 'almacen' || id === 'dashboard' ? '<span class="badge" data-badge hidden>0</span>' : ''}
      </button>`).join('');
    $$('#mainNav .nav-item').forEach(btn => {
      btn.onclick = () => showView(btn.dataset.view);
    });
  }

  function showView(name) {
    state.view = name;
    $$('#mainNav .nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    $('#sidebar').classList.remove('open');
    $('#navOverlay').hidden = true;
    const titles = {
      dashboard: ['Panel', ROLE_META[state.user.rol].subtitle],
      ventas: ['Ventas', 'Registro de pedidos hacia almacén'],
      almacen: ['Almacén / Despacho', 'Cantidades a entregar y seguimiento'],
      produccion: ['Producción', 'Registro por turno y horno'],
      stock: ['Inventario', 'Disponible en primera y segunda'],
      calidad: ['Reclasificación', 'Mover de primera a segunda'],
      reporte: ['Reporte de mi área', 'Envío obligatorio para el cierre del día'],
      clientes: ['Clientes', 'Historial comercial detallado'],
      historial: ['Historial completo', 'Día · semana · mes · año'],
      metas: ['Metas de Gerencia', 'Objetivos semanales y mensuales por área'],
      cierre: ['Cierre gerencial', 'Cuadre de reportes de todas las áreas']
    };
    if (name === 'historial') {
      if (state.user.rol === 'ventas') titles[name] = ['Historial de ventas', 'Día · semana · mes · año'];
      if (state.user.rol === 'almacen') titles[name] = ['Historial de almacén', 'Despachos y reclasificaciones'];
      if (state.user.rol === 'produccion') titles[name] = ['Historial de producción', 'Día · semana · mes · año'];
    }
    const [t, s] = titles[name] || ['', ''];
    $('#viewTitle').textContent = t;
    $('#viewSubtitle').textContent = s;
    render();
  }

  function startPoll() {
    stopPoll();
    state.pollTimer = setInterval(() => {
      if (document.visibilityState === 'visible') refreshBadges().catch(() => {});
    }, 8000);
  }
  function stopPoll() {
    if (state.pollTimer) clearInterval(state.pollTimer);
  }

  async function refreshBadges() {
    try {
      const dash = await API.dashboard();
      const n = dash.pendientes || 0;
      $$('[data-badge]').forEach(b => {
        if (n > 0 && (state.user.rol === 'almacen' || state.user.rol === 'gerente')) {
          b.hidden = false;
          b.textContent = String(n);
        } else b.hidden = true;
      });
      $('#livePill').classList.remove('off');
      $('#livePill').textContent = 'En línea';
    } catch {
      $('#livePill').classList.add('off');
      $('#livePill').textContent = 'Sin conexión';
    }
  }

  async function loadProductos() {
    const { productos } = await API.productos();
    state.productos = productos;
    return productos;
  }

  async function render() {
    const root = $('#content');
    root.innerHTML = `<div class="panel"><p class="muted">Cargando…</p></div>`;
    try {
      await refreshBadges();
      switch (state.view) {
        case 'dashboard': await renderDashboard(root); break;
        case 'ventas': await renderVentas(root); break;
        case 'almacen': await renderAlmacen(root); break;
        case 'produccion': await renderProduccion(root); break;
        case 'stock': await renderStock(root); break;
        case 'calidad': await renderCalidad(root); break;
        case 'reporte': await renderReporte(root); break;
        case 'clientes': await renderClientes(root); break;
        case 'historial': await renderHistorial(root); break;
        case 'metas': await renderMetas(root); break;
        case 'cierre': await renderCierre(root); break;
        default: root.innerHTML = `<div class="empty">Vista no disponible</div>`;
      }
    } catch (e) {
      root.innerHTML = `<div class="alert danger"><strong>Error:</strong> ${esc(e.message)}</div>`;
      if (e.status === 401) {
        API.clearSession();
        showLogin();
      }
    }
  }

  /* ---------- DASHBOARD ---------- */
  function metasColaboradorHtml(data) {
    const metrics = {
      ventas: [
        ['monto', 'Monto de ventas', money],
        ['unidades', 'Unidades vendidas', num]
      ],
      produccion: [['unidades', 'Unidades producidas', num]],
      almacen: [
        ['despachadas', 'Unidades despachadas', num],
        ['reclasificadas', 'Unidades reclasificadas (1ª → 2ª)', num]
      ]
    }[data.area] || [];
    if (!metrics.length) return '';

    return `
      <article class="panel employee-goals">
        <div class="panel-head"><h2>Mis metas</h2><p class="muted">Objetivos asignados por Gerencia para tu área.</p></div>
        <div class="goal-summary-grid">
          ${['semanal', 'mensual'].map(periodo => `
            <section class="goal-summary-card">
              <h3>Meta ${periodo}</h3>
              <p class="muted">${esc(data.periodos[periodo].label)}</p>
              ${metrics.map(([key, label, format]) => {
                const target = Number(data.metas[periodo][key]) || 0;
                const actual = Number(data.progreso[periodo][key]) || 0;
                const percent = target > 0 ? Math.round(actual / target * 100) : 0;
                const status = target <= 0 ? 'Meta pendiente de Gerencia'
                  : percent >= 100 ? 'Meta alcanzada'
                  : percent >= 80 ? 'Cerca de la meta'
                  : 'En progreso';
                return `
                  <div class="goal-summary-metric">
                    <div class="row-between"><span>${label}</span><strong>${target > 0 ? `${percent}%` : '—'}</strong></div>
                    <div class="goal-track"><span style="width:${Math.min(percent, 100)}%"></span></div>
                    <p class="muted">${format(actual)} de ${target > 0 ? format(target) : 'meta no definida'} · ${status}</p>
                  </div>`;
              }).join('')}
            </section>`).join('')}
        </div>
      </article>`;
  }

  async function renderDashboard(root) {
    const d = await API.dashboard();
    const k = d.kpis || {};
    const metas = d.rol === 'gerente' ? null : await API.metasProgreso();
    const metasHtml = metas ? metasColaboradorHtml(metas) : '';

    if (d.rol === 'gerente') {
      root.innerHTML = `
        <div class="stats">
          <div class="stat"><div class="label">Ventas hoy</div><div class="value">${money(k.montoVentas)}</div><div class="sub">${num(k.unidadesVendidas)} unidades</div></div>
          <div class="stat"><div class="label">Despachadas</div><div class="value">${num(k.unidadesDespachadas)}</div><div class="sub">${k.pendientes} pendientes</div></div>
          <div class="stat"><div class="label">Producción</div><div class="value">${num(k.unidadesProducidas)}</div><div class="sub">unidades del día</div></div>
          <div class="stat"><div class="label">Stock total</div><div class="value">${num(d.stockTotal)}</div><div class="sub">${num(k.reclasificadas)} reclasificadas</div></div>
        </div>
        <div class="grid-2">
          <article class="panel">
            <div class="panel-head"><h2>Estado de reportes del día</h2><p class="muted">El cierre solo cuadra si las tres áreas enviaron su reporte.</p></div>
            ${reportStatusHtml(d.reportesHoy)}
            <div class="form-actions"><button class="btn primary" type="button" id="goCierre">Ir a cierre & cuadre</button></div>
          </article>
          <article class="panel">
            <div class="panel-head"><h2>Actividad en vivo</h2></div>
            <div class="feed">${feedHtml(d.actividad)}</div>
          </article>
        </div>
        <article class="panel">
          <div class="panel-head"><h2>Inventario actual</h2></div>
          ${stockCards(d.stock, true)}
        </article>`;
      $('#goCierre').onclick = () => showView('cierre');
      return;
    }

    if (d.rol === 'ventas') {
      root.innerHTML = `
        ${metasHtml}
        <div class="stats s3">
          <div class="stat"><div class="label">Mis pedidos hoy</div><div class="value">${num(k.misPedidos)}</div></div>
          <div class="stat"><div class="label">Monto generado</div><div class="value">${money(k.montoHoy)}</div></div>
          <div class="stat"><div class="label">En almacén</div><div class="value">${num(k.pendientesDespacho)}</div><div class="sub">pendientes de despacho</div></div>
        </div>
        <article class="panel">
          <div class="panel-head">
            <h2>Ventas detalladas por modelo</h2>
            <p class="muted">Distribución del día por producto, calidad y unidades globales.</p>
          </div>
          ${ventaPorModeloHtml(d.porModelo || [])}
        </article>
        <div class="grid-2">
          <article class="panel">
            <div class="panel-head"><h2>Últimos pedidos</h2><p class="muted">Almacén recibe cantidad y cliente, sin confundir con liquidación.</p></div>
            ${ventaCards(d.misVentas || [], true)}
          </article>
          <article class="panel">
            <div class="panel-head"><h2>Actividad</h2></div>
            <div class="feed">${feedHtml(d.actividad)}</div>
            <div class="form-actions" style="margin-top:1rem">
              <button class="btn secondary" type="button" id="goRep">Preparar mi reporte</button>
            </div>
          </article>
        </div>`;
      $('#goRep')?.addEventListener('click', () => showView('reporte'));
      return;
    }

    if (d.rol === 'almacen') {
      root.innerHTML = `
        ${metasHtml}
        ${k.pendientes ? `<div class="alert"><strong>${k.pendientes} pedido(s) por despachar.</strong> Revise cantidades y stock antes de confirmar.</div>` : `<div class="alert ok"><strong>Sin pendientes.</strong> Puede preparar el reporte de almacén.</div>`}
        <div class="stats s3">
          <div class="stat"><div class="label">Por despachar</div><div class="value">${num(k.pendientes)}</div></div>
          <div class="stat"><div class="label">Despachados hoy</div><div class="value">${num(k.despachados)}</div><div class="sub">${num(k.unidadesDespachadas)} und.</div></div>
          <div class="stat"><div class="label">Stock total</div><div class="value">${num(d.stockTotal)}</div></div>
        </div>
        <div class="grid-2">
          <article class="panel">
            <div class="panel-head"><h2>Cola de despacho</h2><p class="muted">Solo cantidades · sin precios ni totales de venta.</p></div>
            ${despachoCards(d.pendientesDetalle || [])}
          </article>
          <article class="panel">
            <div class="panel-head"><h2>Stock rápido</h2></div>
            ${stockCards(d.stock, false)}
          </article>
        </div>`;
      bindDespachoActions(root);
      return;
    }

    // produccion
    root.innerHTML = `
      ${metasHtml}
      <div class="stats s3">
        <div class="stat"><div class="label">Producido hoy</div><div class="value">${num(k.unidadesProducidas)}</div></div>
        <div class="stat"><div class="label">Registros</div><div class="value">${num(k.registros)}</div></div>
        <div class="stat"><div class="label">Stock 1ª</div><div class="value">${num(k.stockPrimera)}</div></div>
      </div>
      <div class="grid-2">
        <article class="panel">
          <div class="panel-head"><h2>Producción del día</h2></div>
          ${prodList(d.produccionHoy || [])}
        </article>
        <article class="panel">
          <div class="panel-head"><h2>Disponible en primera</h2></div>
          ${stockCards(d.stock, false)}
        </article>
      </div>`;
  }

  function reportStatusHtml(r = {}) {
    const items = [
      ['Ventas', r.ventas],
      ['Almacén', r.almacen],
      ['Producción', r.produccion]
    ];
    return items.map(([name, ok]) => `
      <div class="check-card">
        <div class="check-dot ${ok ? 'ok' : 'fail'}">${ok ? '✓' : '!'}</div>
        <div><strong>${name}</strong><p class="muted">${ok ? 'Reporte recibido' : 'Aún no envía reporte'}</p></div>
        <span class="pill ${ok ? 'ok' : 'fail'}">${ok ? 'OK' : 'Pendiente'}</span>
      </div>`).join('');
  }

  function feedHtml(items = []) {
    if (!items.length) return `<div class="empty">Sin actividad registrada.</div>`;
    return items.map(m => `
      <div class="feed-item">
        <div class="time">${dt(m.hora)} · ${esc(m.tipo)}${m.usuarioNombre ? ` · ${esc(m.usuarioNombre)}` : ''}</div>
        <div>${esc(m.detalle)}</div>
        ${canSeeMoney() && m.monto != null ? `<div class="muted">${money(m.monto)}</div>` : ''}
      </div>`).join('');
  }

  function stockCards(stock = [], withPrice = false) {
    if (!stock.length) return `<div class="empty">Sin productos</div>`;
    const max = Math.max(...stock.map(p => Math.max(p.stockPrimera, p.stockSegunda, 1)));
    return `<div class="stock-grid">${stock.map(p => `
      <div class="stock-card">
        <div class="code">${esc(p.codigo || '')}</div>
        <h3 style="margin-top:.25rem">${esc(p.nombre)}</h3>
        <div class="bars">
          <div class="bar-row"><span>Primera</span><div class="bar primera"><i style="width:${(p.stockPrimera / max) * 100}%"></i></div><strong>${num(p.stockPrimera)}</strong></div>
          <div class="bar-row"><span>Segunda</span><div class="bar segunda"><i style="width:${(p.stockSegunda / max) * 100}%"></i></div><strong>${num(p.stockSegunda)}</strong></div>
        </div>
        <p class="muted" style="margin-top:.55rem">Total ${num(p.total ?? p.stockPrimera + p.stockSegunda)} und.
          ${withPrice && p.precioPrimera != null ? ` · ${money(p.precioPrimera)} / ${money(p.precioSegunda || 0)}` : ''}
        </p>
      </div>`).join('')}</div>`;
  }

  function ventaCards(ventas, withMoney) {
    if (!ventas.length) return `<div class="empty">Sin pedidos hoy.</div>`;
    return ventas.slice(0, 8).map(v => `
      <div class="order-card">
        <div class="head">
          <div>
            <strong>${esc(v.clienteNombre)}</strong>
            <p class="muted">#${esc(v.id.slice(-6).toUpperCase())} · ${dt(v.creadoEn)}</p>
          </div>
          ${pill(v.estado)}
        </div>
        <div class="meta-grid">
          <div class="meta"><span>Producto</span><strong>${esc(v.productoNombre)}</strong></div>
          <div class="meta"><span>Cantidad</span><strong>${num(v.cantidad)} · ${esc(v.calidad)}</strong></div>
          ${withMoney ? `<div class="meta"><span>Total</span><strong>${money(v.total)}</strong></div>
          <div class="meta"><span>Pago</span><strong>${esc(v.formaPago || '—')}</strong></div>` : ''}
        </div>
      </div>`).join('');
  }

  function ventaPorModeloHtml(porModelo) {
    if (!porModelo.length) return `<div class="empty">Sin ventas registradas hoy.</div>`;
    const totalPedidos = porModelo.reduce((sum, p) => sum + Number(p.pedidos || 0), 0);
    const totalPrimera = porModelo.reduce((sum, p) => sum + Number(p.primera || 0), 0);
    const totalSegunda = porModelo.reduce((sum, p) => sum + Number(p.segunda || 0), 0);
    const totalUnidades = porModelo.reduce((sum, p) => sum + Number(p.unidades || 0), 0);
    const totalMonto = porModelo.reduce((sum, p) => sum + Number(p.monto || 0), 0);
    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Modelo</th>
              <th>Pedidos</th>
              <th>Primera</th>
              <th>Segunda</th>
              <th>Total unidades</th>
              <th>Monto</th>
            </tr>
          </thead>
          <tbody>
            ${porModelo.map(p => `
              <tr>
                <td><strong>${esc(p.nombre)}</strong><br><span class="muted">${esc(p.codigo || 'Sin código')}</span></td>
                <td>${num(p.pedidos)}</td>
                <td>${num(p.primera)}</td>
                <td>${num(p.segunda)}</td>
                <td><strong>${num(p.unidades)}</strong></td>
                <td><strong>${money(p.monto)}</strong></td>
              </tr>`).join('')}
            <tr>
              <td><strong>TOTAL GLOBAL</strong></td>
              <td><strong>${num(totalPedidos)}</strong></td>
              <td><strong>${num(totalPrimera)}</strong></td>
              <td><strong>${num(totalSegunda)}</strong></td>
              <td><strong>${num(totalUnidades)}</strong></td>
              <td><strong>${money(totalMonto)}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>`;
  }

  function agruparVentasPorModelo(ventas) {
    const map = {};
    ventas.forEach(v => {
      const key = v.productoId || v.productoNombre;
      if (!map[key]) {
        map[key] = {
          codigo: v.productoCodigo,
          nombre: v.productoNombre,
          pedidos: 0,
          primera: 0,
          segunda: 0,
          unidades: 0,
          monto: 0
        };
      }
      map[key].pedidos += 1;
      map[key].unidades += Number(v.cantidad) || 0;
      map[key][v.calidad === 'segunda' ? 'segunda' : 'primera'] += Number(v.cantidad) || 0;
      map[key].monto += Number(v.total) || 0;
    });
    return Object.values(map).sort((a, b) => b.unidades - a.unidades);
  }

  function despachoCards(list) {
    if (!list.length) return `<div class="empty">No hay pedidos pendientes.</div>`;
    return list.map(v => `
      <div class="order-card">
        <div class="head">
          <div>
            <strong>${esc(v.clienteNombre)}</strong>
            <p class="muted">${esc(v.telefono || 'Sin teléfono')} · Vende: ${esc(v.vendedorNombre || '—')}</p>
          </div>
          ${pill(v.estado)}
        </div>
        <div class="meta-grid">
          <div class="meta"><span>A despachar</span><strong>${num(v.cantidad)} und.</strong></div>
          <div class="meta"><span>Calidad</span><strong>${esc(v.calidad)}</strong></div>
          <div class="meta full"><span>Producto</span><strong>${esc(v.productoCodigo || '')} — ${esc(v.productoNombre)}</strong></div>
          ${v.direccion ? `<div class="meta full"><span>Dirección / entrega</span><strong>${esc(v.direccion)}</strong></div>` : ''}
          ${v.notas ? `<div class="meta full"><span>Observaciones</span><strong>${esc(v.notas)}</strong></div>` : ''}
        </div>
        <div class="form-actions">
          <button class="btn sm ghost" type="button" data-ver="${v.id}">Detalle</button>
          <button class="btn sm ok" type="button" data-desp="${v.id}">Confirmar despacho</button>
        </div>
      </div>`).join('');
  }

  function prodList(lista) {
    if (!lista.length) return `<div class="empty">Sin producción registrada.</div>`;
    return lista.map(p => `
      <div class="order-card">
        <div class="head">
          <div><strong>${esc(p.productoNombre)}</strong><p class="muted">${dt(p.creadoEn)}</p></div>
          <strong>${num(p.cantidad)}</strong>
        </div>
        <div class="meta-grid">
          <div class="meta"><span>Turno</span><strong>${esc(p.turno)}</strong></div>
          <div class="meta"><span>Horno</span><strong>${esc(p.horno || '—')}</strong></div>
        </div>
      </div>`).join('');
  }

  function bindDespachoActions(root) {
    root.querySelectorAll('[data-desp]').forEach(btn => {
      btn.onclick = async () => {
        try {
          await API.despachar(btn.dataset.desp);
          toast('Despacho confirmado · stock actualizado');
          render();
        } catch (e) { toast(e.message, 'danger'); }
      };
    });
    root.querySelectorAll('[data-ver]').forEach(btn => {
      btn.onclick = async () => {
        const { ventas } = await API.ventas();
        const v = ventas.find(x => x.id === btn.dataset.ver);
        if (!v) return;
        openModal(`Pedido ${v.id.slice(-6).toUpperCase()}`, detallePedidoHtml(v),
          v.estado === 'pendiente'
            ? `<button class="btn ok" type="button" id="mDesp">Despachar</button>`
            : `<button class="btn ghost" type="button" id="mClose">Cerrar</button>`);
        $('#mDesp')?.addEventListener('click', async () => {
          try {
            await API.despachar(v.id);
            closeModal();
            toast('Despachado');
            render();
          } catch (e) { toast(e.message, 'danger'); }
        });
        $('#mClose')?.addEventListener('click', closeModal);
      };
    });
  }

  function detallePedidoHtml(v) {
    const moneyBits = canSeeMoney() ? `
      <div class="meta"><span>Precio unitario</span><strong>${money(v.precioUnitario)}</strong></div>
      <div class="meta"><span>Total</span><strong>${money(v.total)}</strong></div>
      <div class="meta"><span>Forma de pago</span><strong>${esc(v.formaPago || '—')}</strong></div>` : `
      <div class="meta full"><span>Nota</span><strong>Los montos de venta no se muestran en almacén.</strong></div>`;
    return `
      <div class="meta-grid">
        <div class="meta"><span>Estado</span><strong>${esc(v.estado)}</strong></div>
        <div class="meta"><span>Registrado</span><strong>${dt(v.creadoEn)}</strong></div>
        <div class="meta"><span>Cliente</span><strong>${esc(v.clienteNombre)}</strong></div>
        <div class="meta"><span>Teléfono</span><strong>${esc(v.telefono || '—')}</strong></div>
        <div class="meta full"><span>Producto</span><strong>${esc(v.productoNombre)} · ${esc(v.calidad)}</strong></div>
        <div class="meta"><span>Cantidad a despachar</span><strong>${num(v.cantidad)}</strong></div>
        <div class="meta"><span>Vendedor</span><strong>${esc(v.vendedorNombre || '—')}</strong></div>
        ${moneyBits}
        <div class="meta full"><span>Observaciones</span><strong>${esc(v.notas || 'Sin observaciones')}</strong></div>
        ${v.despachadoEn ? `<div class="meta full"><span>Despachado</span><strong>${dt(v.despachadoEn)} · ${esc(v.despachadoPor || '')}</strong></div>` : ''}
      </div>`;
  }

  /* ---------- VENTAS ---------- */
  async function renderVentas(root) {
    await loadProductos();
    const { ventas } = await API.ventas();
    root.innerHTML = `
      <article class="panel">
        <div class="panel-head">
          <h2>Resumen detallado de ventas de hoy</h2>
          <p class="muted">Totales globales, distribución por modelo y calidad.</p>
        </div>
        ${ventaPorModeloHtml(agruparVentasPorModelo(ventas))}
      </article>
      <div class="grid-2">
        <article class="panel">
          <div class="panel-head">
            <h2>Nuevo pedido</h2>
            <p class="muted">Al enviar, almacén recibe cantidades y datos de entrega. Los precios quedan en Ventas/Gerencia.</p>
          </div>
          <form id="formVenta">
            <div class="field"><label>Cliente</label><input name="cliente" required placeholder="Nombre completo / empresa" /></div>
            <div class="row">
              <div class="field"><label>Teléfono</label><input name="telefono" placeholder="Celular" /></div>
              <div class="field"><label>Documento</label><input name="documento" placeholder="CI / NIT" /></div>
            </div>
            <div class="field"><label>Dirección de entrega</label><input name="direccion" placeholder="Opcional" /></div>
            <div class="field"><label>Producto</label>
              <select name="productoId" id="ventaProd" required>
                ${state.productos.map(p => `<option value="${p.id}" data-p1="${p.precioPrimera || 0}" data-p2="${p.precioSegunda || 0}">${esc(p.nombre)} · 1ª ${num(p.stockPrimera)} / 2ª ${num(p.stockSegunda)}</option>`).join('')}
              </select>
            </div>
            <div class="row r3">
              <div class="field"><label>Calidad</label>
                <select name="calidad" id="ventaCal"><option value="primera">Primera</option><option value="segunda">Segunda</option></select>
              </div>
              <div class="field"><label>Cantidad</label><input name="cantidad" type="number" min="1" required /></div>
              <div class="field"><label>Precio unitario</label><input name="precioUnitario" id="ventaPrecio" type="number" min="0" step="0.01" required /></div>
            </div>
            <div class="row">
              <div class="field"><label>Forma de pago</label>
                <select name="formaPago">
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="credito">Crédito</option>
                  <option value="qr">QR</option>
                </select>
              </div>
              <div class="field"><label>Notas para almacén</label><input name="notas" placeholder="Horario, referencia…" /></div>
            </div>
            <div class="form-actions"><button class="btn primary" type="submit">Enviar a almacén</button></div>
          </form>
        </article>
        <article class="panel">
          <div class="panel-head"><h2>Pedidos de hoy</h2></div>
          ${ventaCards(ventas, true)}
        </article>
      </div>`;

    const syncPrice = () => {
      const opt = $('#ventaProd').selectedOptions[0];
      const cal = $('#ventaCal').value;
      $('#ventaPrecio').value = cal === 'segunda' ? opt.dataset.p2 : opt.dataset.p1;
    };
    $('#ventaProd').onchange = syncPrice;
    $('#ventaCal').onchange = syncPrice;
    syncPrice();

    $('#formVenta').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await API.crearVenta(Object.fromEntries(fd.entries()));
        toast('Pedido enviado a almacén');
        render();
      } catch (err) { toast(err.message, 'danger'); }
    };
  }

  /* ---------- ALMACÉN ---------- */
  async function renderAlmacen(root) {
    const { ventas } = await API.ventas();
    const pendientes = ventas.filter(v => v.estado === 'pendiente');
    const despachados = ventas.filter(v => v.estado === 'despachado' || v.estado === 'cerrado');
    const list = state.almacenTab === 'pendientes' ? pendientes
      : state.almacenTab === 'despachados' ? despachados : ventas;

    root.innerHTML = `
      ${pendientes.length ? `<div class="alert"><strong>${pendientes.length} en cola.</strong> Confirme stock antes de despachar.</div>` : ''}
      <div class="tabs">
        <button class="tab ${state.almacenTab === 'pendientes' ? 'active' : ''}" data-tab="pendientes" type="button">Pendientes (${pendientes.length})</button>
        <button class="tab ${state.almacenTab === 'despachados' ? 'active' : ''}" data-tab="despachados" type="button">Despachados (${despachados.length})</button>
        <button class="tab ${state.almacenTab === 'todos' ? 'active' : ''}" data-tab="todos" type="button">Todos</button>
      </div>
      <article class="panel">
        <div class="panel-head">
          <h2>Detalle operativo</h2>
          <p class="muted">Vista de almacén: cantidades, calidad, cliente y observaciones. Sin importes.</p>
        </div>
        ${state.almacenTab === 'pendientes' ? despachoCards(list) : list.map(v => `
          <div class="order-card">
            <div class="head">
              <div><strong>${esc(v.clienteNombre)}</strong><p class="muted">${esc(v.productoNombre)} · ${num(v.cantidad)} · ${esc(v.calidad)}</p></div>
              ${pill(v.estado)}
            </div>
            <div class="form-actions">
              <button class="btn sm ghost" type="button" data-ver="${v.id}">Ver</button>
              ${v.estado === 'despachado' ? `<button class="btn sm secondary" type="button" data-cerrar="${v.id}">Marcar cerrado</button>` : ''}
            </div>
          </div>`).join('') || `<div class="empty">Sin pedidos en esta vista.</div>`}
      </article>`;

    $$('.tab', root).forEach(t => {
      t.onclick = () => { state.almacenTab = t.dataset.tab; render(); };
    });
    bindDespachoActions(root);
    root.querySelectorAll('[data-cerrar]').forEach(btn => {
      btn.onclick = async () => {
        try {
          await API.cerrarPedido(btn.dataset.cerrar);
          toast('Pedido cerrado');
          render();
        } catch (e) { toast(e.message, 'danger'); }
      };
    });
  }

  /* ---------- PRODUCCIÓN ---------- */
  async function renderProduccion(root) {
    await loadProductos();
    const { produccion } = await API.produccion();
    const total = produccion.reduce((s, p) => s + p.cantidad, 0);
    root.innerHTML = `
      <div class="grid-2">
        <article class="panel">
          <div class="panel-head"><h2>Registrar producción</h2><p class="muted">Se suma automáticamente al stock de primera.</p></div>
          <form id="formProd">
            <div class="field"><label>Producto</label>
              <select name="productoId" required>${state.productos.map(p => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('')}</select>
            </div>
            <div class="row">
              <div class="field"><label>Cantidad</label><input name="cantidad" type="number" min="1" required /></div>
              <div class="field"><label>Horno / línea</label><input name="horno" placeholder="Horno 1" /></div>
            </div>
            <div class="field"><label>Turno</label>
              <select name="turno"><option>mañana</option><option>tarde</option><option>noche</option></select>
            </div>
            <div class="field"><label>Notas</label><textarea name="notas" rows="2"></textarea></div>
            <div class="form-actions"><button class="btn primary" type="submit">Guardar producción</button></div>
          </form>
        </article>
        <article class="panel">
          <div class="panel-head"><h2>Hoy · ${num(total)} unidades</h2></div>
          ${prodList(produccion)}
        </article>
      </div>`;
    $('#formProd').onsubmit = async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target).entries());
      try {
        await API.registrarProduccion(body);
        toast('Producción registrada');
        render();
      } catch (err) { toast(err.message, 'danger'); }
    };
  }

  /* ---------- STOCK ---------- */
  async function renderStock(root) {
    const productos = await loadProductos();
    const canAdd = isGerente() || state.user.rol === 'almacen';
    root.innerHTML = `
      <div class="row-between">
        <div><h2>Inventario</h2><p class="muted">${canSeeMoney() ? 'Cantidades y precios de referencia.' : 'Solo cantidades disponibles para operar.'}</p></div>
        ${canAdd ? `<button class="btn secondary" type="button" id="btnAddProd">+ Producto</button>` : ''}
      </div>
      <article class="panel">${stockCards(productos, canSeeMoney())}</article>`;
    $('#btnAddProd')?.addEventListener('click', () => {
      openModal('Nuevo producto', `
        <form id="formNewProd">
          <div class="field"><label>Nombre</label><input name="nombre" required /></div>
          <div class="field"><label>Código</label><input name="codigo" placeholder="LH-12" /></div>
          <div class="row">
            <div class="field"><label>Stock 1ª</label><input name="stockPrimera" type="number" min="0" value="0" /></div>
            <div class="field"><label>Stock 2ª</label><input name="stockSegunda" type="number" min="0" value="0" /></div>
          </div>
          ${isGerente() ? `<div class="row">
            <div class="field"><label>Precio 1ª</label><input name="precioPrimera" type="number" min="0" step="0.01" value="0" /></div>
            <div class="field"><label>Precio 2ª</label><input name="precioSegunda" type="number" min="0" step="0.01" value="0" /></div>
          </div>` : ''}
        </form>`, `<button class="btn primary" type="button" id="saveProd">Guardar</button>`);
      $('#saveProd').onclick = async () => {
        const form = $('#formNewProd');
        const body = Object.fromEntries(new FormData(form).entries());
        try {
          await API.addProducto(body);
          closeModal();
          toast('Producto creado');
          render();
        } catch (e) { toast(e.message, 'danger'); }
      };
    });
  }

  /* ---------- CALIDAD ---------- */
  async function renderCalidad(root) {
    await loadProductos();
    const { reclasificaciones } = await API.reclasificaciones();
    root.innerHTML = `
      <div class="grid-2">
        <article class="panel">
          <div class="panel-head"><h2>Mover primera → segunda</h2></div>
          <form id="formCal">
            <div class="field"><label>Producto</label>
              <select name="productoId" id="calProd">${state.productos.map(p => `<option value="${p.id}" data-d="${p.stockPrimera}">${esc(p.nombre)} (1ª: ${num(p.stockPrimera)})</option>`).join('')}</select>
            </div>
            <div class="field"><label>Cantidad</label><input name="cantidad" type="number" min="1" required /></div>
            <p class="hint" id="calHint"></p>
            <div class="field"><label>Motivo</label><textarea name="motivo" rows="2" required placeholder="Defectos, color, cocción…"></textarea></div>
            <div class="form-actions"><button class="btn primary" type="submit">Aplicar</button></div>
          </form>
        </article>
        <article class="panel">
          <div class="panel-head"><h2>Movimientos de hoy</h2></div>
          ${reclasificaciones.length ? reclasificaciones.map(r => `
            <div class="order-card">
              <div class="head"><div><strong>${esc(r.productoNombre)}</strong><p class="muted">${dt(r.creadoEn)}</p></div><strong>${num(r.cantidad)}</strong></div>
              <p class="muted">${esc(r.motivo)} · ${esc(r.responsableNombre)}</p>
            </div>`).join('') : `<div class="empty">Sin reclasificaciones.</div>`}
        </article>
      </div>`;
    const hint = () => {
      const opt = $('#calProd').selectedOptions[0];
      $('#calHint').textContent = `Disponible en primera: ${num(opt.dataset.d)}`;
    };
    $('#calProd').onchange = hint; hint();
    $('#formCal').onsubmit = async (e) => {
      e.preventDefault();
      try {
        await API.reclasificar(Object.fromEntries(new FormData(e.target).entries()));
        toast('Reclasificación aplicada');
        render();
      } catch (err) { toast(err.message, 'danger'); }
    };
  }

  /* ---------- REPORTE POR ÁREA ---------- */
  async function renderReporte(root) {
    const area = state.user.rol === 'ventas' ? 'ventas'
      : state.user.rol === 'almacen' ? 'almacen' : 'produccion';
    const reps = await API.reportesHoy();
    const propio = reps.propio || reps[area];
    const dash = await API.dashboard();
    const operacionesAlmacen = area === 'almacen' ? await API.ventas() : null;
    const reclasificacionesAlmacen = area === 'almacen' ? await API.reclasificaciones() : null;

    let preview = '';
    if (area === 'ventas') {
      preview = `
        <div class="stats s3">
          <div class="stat"><div class="label">Pedidos</div><div class="value">${num(dash.kpis.misPedidos)}</div></div>
          <div class="stat"><div class="label">Unidades</div><div class="value">${num(dash.kpis.unidadesHoy)}</div></div>
          <div class="stat"><div class="label">Monto</div><div class="value">${money(dash.kpis.montoHoy)}</div></div>
        </div>`;
    } else if (area === 'almacen') {
      preview = `
        <div class="stats s3">
          <div class="stat"><div class="label">Pendientes</div><div class="value">${num(dash.kpis.pendientes)}</div></div>
          <div class="stat"><div class="label">Despachados</div><div class="value">${num(dash.kpis.despachados)}</div></div>
          <div class="stat"><div class="label">Und. despachadas</div><div class="value">${num(dash.kpis.unidadesDespachadas)}</div></div>
        </div>
        <p class="hint">Su reporte incluye stock y despachos. No incluye montos de clientes.</p>`;
    } else {
      preview = `
        <div class="stats s2">
          <div class="stat"><div class="label">Unidades producidas</div><div class="value">${num(dash.kpis.unidadesProducidas)}</div></div>
          <div class="stat"><div class="label">Registros</div><div class="value">${num(dash.kpis.registros)}</div></div>
        </div>`;
    }

    root.innerHTML = `
      ${propio ? `<div class="alert ok"><strong>Reporte ya enviado</strong> a las ${dt(propio.enviadoEn)} por ${esc(propio.usuarioNombre)}. Puede reenviarlo si corrige datos.</div>`
        : `<div class="alert"><strong>Pendiente de envío.</strong> El gerente no podrá cuadrar el cierre hasta recibir este reporte.</div>`}
      <div class="grid-2">
        <article class="panel">
          <div class="panel-head"><h2>Resumen que se enviará</h2><p class="muted">Área: ${area}</p></div>
          ${preview}
          <form id="formRep">
            <div class="field"><label>Observaciones del turno</label><textarea name="notas" rows="3" placeholder="Incidencias, faltantes, comentarios…">${esc(propio?.notas || '')}</textarea></div>
            <div class="field"><label>Firma del responsable</label>
              <div class="sign-box"><canvas id="firmaCanvas" width="520" height="140"></canvas></div>
            </div>
            <div class="form-actions">
              <button class="btn ghost" type="button" id="clrFirma">Limpiar firma</button>
              <button class="btn secondary" type="button" id="printRep">Imprimir para Gerencia</button>
              <button class="btn primary" type="submit">Enviar reporte de ${area}</button>
            </div>
          </form>
        </article>
        <article class="panel">
          <div class="panel-head"><h2>¿Para qué sirve?</h2></div>
          <div class="order-card">
            <p>Cada área cierra su operación con cifras propias. En el <strong>cierre gerencial</strong> el sistema verifica que:</p>
            <ul>
              <li>Ventas reportadas = ventas del sistema</li>
              <li>Despachos de almacén = despachos reales</li>
              <li>Producción reportada = producción registrada</li>
              <li>Ventas = despachadas + pendientes</li>
            </ul>
            <p class="muted">Si algo no cuadra, el gerente ve exactamente qué ítem falla.</p>
          </div>
        </article>
      </div>`;

    const canvas = $('#firmaCanvas');
    setupFirma(canvas);
    if (propio?.firmaDataUrl) {
      const img = new Image();
      img.onload = () => canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = propio.firmaDataUrl;
    }
    $('#clrFirma').onclick = () => clearFirma(canvas);
    $('#printRep').onclick = () => {
      if (firmaVacia(canvas)) return toast('Firme el reporte antes de imprimirlo', 'warn');
      const notas = $('#formRep').elements.notas.value.trim();
      const firma = canvas.toDataURL('image/png');
      const hoy = new Date().toLocaleDateString('es-BO', { year: 'numeric', month: 'long', day: 'numeric' });
      const resumen = area === 'ventas'
        ? [
          ['Pedidos registrados', num(dash.kpis.misPedidos)],
          ['Unidades vendidas', num(dash.kpis.unidadesHoy)],
          ['Monto vendido', money(dash.kpis.montoHoy)]
        ]
        : area === 'almacen'
        ? [
          ['Pedidos pendientes', num(dash.kpis.pendientes)],
          ['Pedidos despachados', num(dash.kpis.despachados)],
          ['Unidades despachadas', num(dash.kpis.unidadesDespachadas)]
        ]
        : [
          ['Registros de producción', num(dash.kpis.registros)],
          ['Unidades producidas', num(dash.kpis.unidadesProducidas)]
        ];
      const tabla = (headers, rows) => `
        <h2>Detalle de operaciones</h2>
        <table><thead><tr>${headers.map(header => `<th>${esc(header)}</th>`).join('')}</tr></thead>
        <tbody>${rows.length ? rows.map(row => `<tr>${row.map(value => `<td>${esc(value)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}">Sin operaciones registradas hoy.</td></tr>`}</tbody></table>`;
      const detalles = area === 'ventas'
        ? tabla(['Cliente', 'Producto', 'Calidad', 'Unidades', 'Estado', 'Monto'],
          (dash.misVentas || []).map(v => [v.clienteNombre, v.productoNombre, v.calidad, num(v.cantidad), v.estado, money(v.total)]))
        : area === 'almacen'
        ? `${tabla(['Pedido', 'Cliente', 'Producto', 'Calidad', 'Unidades', 'Estado'],
          (operacionesAlmacen?.ventas || []).filter(v => v.estado === 'despachado' || v.estado === 'cerrado')
            .map(v => [`#${v.id.slice(-6).toUpperCase()}`, v.clienteNombre, v.productoNombre, v.calidad, num(v.cantidad), v.estado]))}
          <h2>Reclasificaciones primera → segunda</h2>
          <table><thead><tr><th>Producto</th><th>Unidades</th><th>Motivo</th></tr></thead>
          <tbody>${(reclasificacionesAlmacen?.reclasificaciones || []).map(r => `<tr><td>${esc(r.productoNombre)}</td><td>${num(r.cantidad)}</td><td>${esc(r.motivo)}</td></tr>`).join('') || '<tr><td colspan="3">Sin reclasificaciones registradas hoy.</td></tr>'}</tbody></table>`
        : tabla(['Producto', 'Unidades', 'Horno', 'Turno'],
          (dash.produccionHoy || []).map(p => [p.productoNombre, num(p.cantidad), p.horno || '—', p.turno]));
      const printWindow = window.open('', '_blank');
      if (!printWindow) return toast('Permita las ventanas emergentes para imprimir el reporte', 'warn');
      printWindow.document.write(`<!doctype html>
        <html lang="es"><head><meta charset="utf-8"><title>Reporte ${esc(area)} - Cerámica EL LAPACHO</title>
        <style>
          *{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#172033;margin:0;padding:36px}
          header{border-bottom:4px solid #0759a8;padding-bottom:16px;margin-bottom:24px}
          h1{color:#0759a8;font-size:24px;margin:0 0 6px}h2{font-size:18px;margin:0 0 16px}
          .sub{color:#596579;font-size:13px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:20px 0}
          .metric{border:1px solid #cbd8e6;border-top:3px solid #0759a8;padding:14px;border-radius:6px}
          .metric span{display:block;color:#596579;font-size:11px;text-transform:uppercase;margin-bottom:8px}
          .metric strong{font-size:18px}.notes{border:1px solid #cbd8e6;padding:14px;min-height:80px;white-space:pre-wrap}
          table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:24px}th,td{border:1px solid #cbd8e6;padding:8px;text-align:left}th{background:#edf4fb;color:#0759a8}
          .signature{margin-top:42px;width:260px;text-align:center}.signature img{display:block;width:240px;height:90px;object-fit:contain;border-bottom:1px solid #172033}
          .signature span{display:block;margin-top:8px;font-size:12px}.foot{margin-top:36px;color:#596579;font-size:11px;border-top:1px solid #cbd8e6;padding-top:10px}
          @media print{body{padding:18mm}button{display:none}}
        </style></head><body>
        <header><h1>Cerámica EL LAPACHO</h1><div class="sub">Reporte diario de ${esc(area.toUpperCase())} · ${esc(hoy)}</div></header>
        <h2>Resumen de actividades</h2>
        <div class="grid">${resumen.map(([label, value]) => `<div class="metric"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')}</div>
        ${detalles}
        <h2>Observaciones del turno</h2><div class="notes">${esc(notas || 'Sin observaciones.')}</div>
        <div class="signature"><img src="${firma}" alt="Firma del responsable"><span>${esc(state.user.nombre)} · Responsable de ${esc(area)}</span></div>
        <div class="foot">Documento generado por Cerámica EL LAPACHO para entrega a Gerencia.</div>
        <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));</script>
        </body></html>`);
      printWindow.document.close();
    };
    $('#formRep').onsubmit = async (e) => {
      e.preventDefault();
      if (firmaVacia(canvas)) return toast('Firme el reporte antes de enviar', 'warn');
      const notas = new FormData(e.target).get('notas');
      try {
        await API.enviarReporte({ area, notas, firmaDataUrl: canvas.toDataURL('image/png') });
        toast('Reporte enviado a gerencia');
        render();
      } catch (err) { toast(err.message, 'danger'); }
    };
  }

  /* ---------- CLIENTES (gerente) ---------- */
  async function renderClientes(root) {
    const { clientes } = await API.clientes();
    root.innerHTML = `
      <div class="stats s3">
        <div class="stat"><div class="label">Clientes</div><div class="value">${num(clientes.length)}</div></div>
        <div class="stat"><div class="label">Facturación acumulada</div><div class="value">${money(clientes.reduce((s, c) => s + (c.totalCompras || 0), 0))}</div></div>
        <div class="stat"><div class="label">Unidades históricas</div><div class="value">${num(clientes.reduce((s, c) => s + (c.totalUnidades || 0), 0))}</div></div>
      </div>
      <article class="panel">
        <div class="panel-head"><h2>Cartera de clientes</h2><p class="muted">Historial comercial completo · solo gerencia</p></div>
        ${clientes.length ? clientes.map(c => `
          <div class="client-card">
            <div class="head">
              <div>
                <strong>${esc(c.nombre)}</strong>
                <p class="muted">${esc(c.telefono || 'Sin teléfono')} · ${esc(c.documento || 'Sin documento')}</p>
              </div>
              <button class="btn sm secondary" type="button" data-cli="${c.id}">Ver historial</button>
            </div>
            <div class="meta-grid">
              <div class="meta"><span>Pedidos</span><strong>${num(c.pedidos || 0)}</strong></div>
              <div class="meta"><span>Unidades</span><strong>${num(c.totalUnidades || 0)}</strong></div>
              <div class="meta"><span>Total comprado</span><strong>${money(c.totalCompras || 0)}</strong></div>
              <div class="meta"><span>Última compra</span><strong>${c.ultimaCompra || '—'}</strong></div>
              ${c.direccion ? `<div class="meta full"><span>Dirección</span><strong>${esc(c.direccion)}</strong></div>` : ''}
            </div>
          </div>`).join('') : `<div class="empty">Aún no hay clientes registrados.</div>`}
      </article>`;

    root.querySelectorAll('[data-cli]').forEach(btn => {
      btn.onclick = async () => {
        const data = await API.cliente(btn.dataset.cli);
        openModal(data.cliente.nombre, `
          <div class="meta-grid" style="margin-bottom:1rem">
            <div class="meta"><span>Teléfono</span><strong>${esc(data.cliente.telefono || '—')}</strong></div>
            <div class="meta"><span>Documento</span><strong>${esc(data.cliente.documento || '—')}</strong></div>
            <div class="meta"><span>Total</span><strong>${money(data.cliente.totalCompras || 0)}</strong></div>
            <div class="meta"><span>Pedidos</span><strong>${num(data.pedidos.length)}</strong></div>
          </div>
          <div class="table-wrap"><table>
            <thead><tr><th>Fecha</th><th>Producto</th><th>Cant.</th><th>Total</th><th>Estado</th></tr></thead>
            <tbody>
              ${data.pedidos.map(p => `<tr>
                <td>${esc(p.fecha)}<br><span class="muted">${dt(p.creadoEn)}</span></td>
                <td>${esc(p.productoNombre)} · ${esc(p.calidad)}</td>
                <td>${num(p.cantidad)}</td>
                <td>${money(p.total)}</td>
                <td>${pill(p.estado)}</td>
              </tr>`).join('') || '<tr><td colspan="5">Sin pedidos</td></tr>'}
            </tbody>
          </table></div>`, `<button class="btn ghost" type="button" id="mClose">Cerrar</button>`);
        $('#mClose').onclick = closeModal;
      };
    });
  }

  /* ---------- HISTORIAL ---------- */
  async function renderHistorial(root) {
    const rol = state.user.rol;
    const titulo = rol === 'ventas' ? 'Historial de ventas'
      : rol === 'almacen' ? 'Historial de despacho y calidad'
      : rol === 'produccion' ? 'Historial de producción'
      : 'Historial general';
    const tipoOptions = rol === 'ventas'
      ? `<option value="todos">Todas las operaciones</option><option value="venta">Ventas</option>`
      : rol === 'almacen'
      ? `<option value="todos">Todas las operaciones</option><option value="despacho">Despachos</option><option value="calidad">Primera → segunda</option>`
      : rol === 'produccion'
      ? `<option value="todos">Todas las operaciones</option><option value="produccion">Producción</option>`
      : `<option value="todos">Todos</option><option value="venta">Ventas</option><option value="despacho">Despachos</option><option value="produccion">Producción</option><option value="calidad">Calidad</option><option value="reporte">Reportes</option><option value="cierre">Cierres</option>`;
    root.innerHTML = `
      <article class="panel">
        <div class="panel-head"><h2>${titulo}</h2><p class="muted">Consulta por día, semana, mes o año.</p></div>
        <div class="filters">
          <div class="field"><label>Periodo</label>
            <select id="hPeriodo"><option value="dia">Día</option><option value="semana">Semana</option><option value="mes" selected>Mes</option><option value="anio">Año</option></select>
          </div>
          <div class="field"><label>Fecha</label><input type="date" id="hFecha" /></div>
          <div class="field"><label>Tipo</label><select id="hTipo">${tipoOptions}</select></div>
          <button class="btn primary" type="button" id="hGo">Consultar</button>
        </div>
        <div id="hBody"><p class="muted">Cargando…</p></div>
      </article>`;
    const fechaInput = $('#hFecha');
    const d = new Date();
    fechaInput.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const load = async () => {
      const data = await API.historial({
        periodo: $('#hPeriodo').value,
        fecha: $('#hFecha').value,
        tipo: $('#hTipo').value
      });
      let stats;
      if (rol === 'ventas') {
        stats = `
          <div class="stat"><div class="label">Periodo</div><div class="value" style="font-size:1.1rem">${esc(data.range.label)}</div></div>
          <div class="stat"><div class="label">Pedidos</div><div class="value">${num(data.resumen.pedidos)}</div></div>
          <div class="stat"><div class="label">Unidades vendidas</div><div class="value">${num(data.resumen.unidadesVendidas)}</div></div>
          <div class="stat"><div class="label">Monto vendido</div><div class="value">${money(data.resumen.montoVentas)}</div></div>`;
      } else if (rol === 'almacen') {
        stats = `
          <div class="stat"><div class="label">Periodo</div><div class="value" style="font-size:1.1rem">${esc(data.range.label)}</div></div>
          <div class="stat"><div class="label">Despachos realizados</div><div class="value">${num(data.ventas.length)}</div></div>
          <div class="stat"><div class="label">Unidades despachadas</div><div class="value">${num(data.ventas.reduce((s, v) => s + (v.cantidad || 0), 0))}</div></div>
          <div class="stat"><div class="label">Reclasificaciones</div><div class="value">${num(data.reclasificaciones.reduce((s, r) => s + (r.cantidad || 0), 0))}</div><div class="sub">1ª → 2ª</div></div>`;
      } else if (rol === 'produccion') {
        stats = `
          <div class="stat"><div class="label">Periodo</div><div class="value" style="font-size:1.1rem">${esc(data.range.label)}</div></div>
          <div class="stat"><div class="label">Registros</div><div class="value">${num(data.produccion.length)}</div></div>
          <div class="stat"><div class="label">Unidades producidas</div><div class="value">${num(data.resumen.produccion)}</div></div>
          <div class="stat"><div class="label">Promedio por registro</div><div class="value">${data.produccion.length ? num(Math.round(data.resumen.produccion / data.produccion.length)) : 0}</div></div>`;
      } else {
        stats = `
          <div class="stat"><div class="label">Periodo</div><div class="value" style="font-size:1.1rem">${esc(data.range.label)}</div></div>
          <div class="stat"><div class="label">Ventas</div><div class="value">${money(data.resumen.montoVentas)}</div></div>
          <div class="stat"><div class="label">Unidades vendidas</div><div class="value">${num(data.resumen.unidadesVendidas)}</div></div>
          <div class="stat"><div class="label">Producción</div><div class="value">${num(data.resumen.produccion)}</div></div>`;
      }
      const maxBar = Math.max(...(data.porDia || []).map(x =>
        rol === 'ventas' ? (x.vendidas || 0)
        : rol === 'produccion' ? (x.producidas || 0)
        : Math.max(x.vendidas || 0, x.producidas || 0)), 1);
      let detalleOperativo = '';
      if (rol === 'ventas') {
        detalleOperativo = `
          <h3 style="margin:1rem 0 .6rem">Detalle de ventas</h3>
          <div class="table-wrap"><table>
            <thead><tr><th>Fecha</th><th>Cliente</th><th>Modelo</th><th>Calidad</th><th>Cantidad</th><th>Estado</th><th>Monto</th></tr></thead>
            <tbody>${data.ventas.map(v => `<tr>
              <td>${esc(v.fecha)}</td><td>${esc(v.clienteNombre)}</td><td>${esc(v.productoNombre)}</td>
              <td>${esc(v.calidad)}</td><td><strong>${num(v.cantidad)}</strong></td>
              <td>${pill(v.estado)}</td><td><strong>${money(v.total)}</strong></td>
            </tr>`).join('') || '<tr><td colspan="7">Sin ventas en el periodo</td></tr>'}</tbody>
          </table></div>`;
      } else if (rol === 'almacen') {
        detalleOperativo = `
          <h3 style="margin:1rem 0 .6rem">Despachos realizados</h3>
          <div class="table-wrap"><table>
            <thead><tr><th>Fecha</th><th>Pedido</th><th>Cliente</th><th>Modelo</th><th>Calidad</th><th>Cantidad</th></tr></thead>
            <tbody>${data.ventas.map(v => `<tr>
              <td>${esc(v.fecha)}</td><td>#${esc(v.id.slice(-6).toUpperCase())}</td><td>${esc(v.clienteNombre)}</td>
              <td>${esc(v.productoNombre)}</td><td>${esc(v.calidad)}</td><td><strong>${num(v.cantidad)}</strong></td>
            </tr>`).join('') || '<tr><td colspan="6">Sin despachos en el periodo</td></tr>'}</tbody>
          </table></div>
          <h3 style="margin:1rem 0 .6rem">Reclasificaciones primera → segunda</h3>
          <div class="table-wrap"><table>
            <thead><tr><th>Fecha</th><th>Modelo</th><th>Cantidad</th><th>Motivo</th></tr></thead>
            <tbody>${data.reclasificaciones.map(r => `<tr>
              <td>${esc(r.fecha)}</td><td>${esc(r.productoNombre)}</td><td><strong>${num(r.cantidad)}</strong></td><td>${esc(r.motivo)}</td>
            </tr>`).join('') || '<tr><td colspan="4">Sin reclasificaciones en el periodo</td></tr>'}</tbody>
          </table></div>`;
      } else if (rol === 'produccion') {
        detalleOperativo = `
          <h3 style="margin:1rem 0 .6rem">Detalle de producción</h3>
          <div class="table-wrap"><table>
            <thead><tr><th>Fecha</th><th>Modelo</th><th>Cantidad</th><th>Horno</th><th>Turno</th></tr></thead>
            <tbody>${data.produccion.map(p => `<tr>
              <td>${esc(p.fecha)}<br><span class="muted">${dt(p.creadoEn)}</span></td><td>${esc(p.productoNombre)}</td>
              <td><strong>${num(p.cantidad)}</strong></td><td>${esc(p.horno || '—')}</td><td>${esc(p.turno)}</td>
            </tr>`).join('') || '<tr><td colspan="5">Sin producción registrada en el periodo</td></tr>'}</tbody>
          </table></div>`;
      }
      $('#hBody').innerHTML = `
        <div class="stats">${stats}</div>
        <div class="grid-2">
          <div>
            <h3 style="margin-bottom:.6rem">Tendencia del periodo</h3>
            <div class="chart-bars">
              ${(data.porDia || []).slice(0, 14).reverse().map(x => `
                <div class="col"><b style="height:${Math.max(6, ((rol === 'ventas' ? x.vendidas : rol === 'produccion' ? x.producidas : Math.max(x.vendidas, x.producidas)) / maxBar) * 120)}px"></b><span>${esc(x.fecha.slice(5))}</span></div>`).join('') || '<p class="muted">Sin datos</p>'}
            </div>
          </div>
          <div>
            ${rol === 'ventas' || rol === 'gerente' ? `
            <h3 style="margin-bottom:.6rem">Top clientes</h3>
            ${(data.topClientes || []).map((c, i) => `
              <div class="check-card">
                <div class="check-dot ok">${i + 1}</div>
                <div><strong>${esc(c.nombre)}</strong><p class="muted">${num(c.pedidos)} pedidos · ${num(c.unidades)} und.</p></div>
                <strong>${money(c.monto)}</strong>
              </div>`).join('') || '<div class="empty">Sin clientes en el periodo</div>'}
            ` : `
            <h3 style="margin-bottom:.6rem">Resumen operativo</h3>
            <div class="check-card"><div><strong>${esc(data.range.label)}</strong><p class="muted">${num(data.resumen.movimientos)} movimientos registrados</p></div></div>
            `}
          </div>
        </div>
        ${detalleOperativo}
        <h3 style="margin:1rem 0 .6rem">Movimientos detallados</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Detalle</th><th>Usuario</th><th>Monto</th></tr></thead>
          <tbody>
            ${data.movimientos.map(m => `<tr>
              <td>${esc(m.fecha)}<br><span class="muted">${dt(m.hora)}</span></td>
              <td><span class="pill cerrado">${esc(m.tipo)}</span></td>
              <td>${esc(m.detalle)}</td>
              <td>${esc(m.usuarioNombre || '—')}</td>
              <td>${m.monto != null ? money(m.monto) : '—'}</td>
            </tr>`).join('') || '<tr><td colspan="5">Sin movimientos</td></tr>'}
          </tbody>
        </table></div>`;
    };
    $('#hGo').onclick = () => load().catch(e => toast(e.message, 'danger'));
    await load();
  }

  /* ---------- METAS GERENCIALES ---------- */
  async function renderMetas(root) {
    const data = await API.metas();
    const fields = [
      { area: 'ventas', key: 'monto', label: 'Monto de ventas', format: money, step: '0.01' },
      { area: 'ventas', key: 'unidades', label: 'Unidades vendidas', format: num, step: '1' },
      { area: 'produccion', key: 'unidades', label: 'Unidades producidas', format: num, step: '1' },
      { area: 'almacen', key: 'despachadas', label: 'Unidades despachadas', format: num, step: '1' },
      { area: 'almacen', key: 'reclasificadas', label: 'Unidades reclasificadas (1ª → 2ª)', format: num, step: '1' }
    ];
    const periodHtml = (periodo, label) => `
      <article class="panel">
        <div class="panel-head">
          <h2>Meta ${label}</h2>
          <p class="muted">${esc(data.periodos[periodo].label)} · ${esc(data.periodos[periodo].from)} al ${esc(data.periodos[periodo].to)}</p>
        </div>
        ${['ventas', 'produccion', 'almacen'].map(area => `
          <section class="goal-group">
            <h3>${area === 'ventas' ? 'Ventas' : area === 'produccion' ? 'Producción' : 'Almacén'}</h3>
            ${fields.filter(field => field.area === area).map(field => {
              const goal = Number(data.metas[periodo][area][field.key]) || 0;
              const actual = Number(data.progreso[periodo][area][field.key]) || 0;
              const percent = goal > 0 ? Math.round(actual / goal * 100) : 0;
              const width = Math.min(percent, 100);
              const name = `${periodo}.${area}.${field.key}`;
              return `
                <div class="goal-row">
                  <div class="field">
                    <label for="${name}">${field.label}</label>
                    <input id="${name}" name="${name}" type="number" min="0" step="${field.step}" value="${goal}" required />
                  </div>
                  <div class="goal-progress">
                    <div class="row-between"><span>Avance: <strong>${field.format(actual)}</strong></span><strong>${goal > 0 ? `${percent}%` : 'Sin meta'}</strong></div>
                    <div class="goal-track"><span style="width:${width}%"></span></div>
                    <p class="muted">Objetivo: ${field.format(goal)}</p>
                  </div>
                </div>`;
            }).join('')}
          </section>`).join('')}
      </article>`;
    const resumenHistorial = (metas, periodo) => {
      const m = metas[periodo];
      return `Ventas: ${money(m.ventas.monto)} · ${num(m.ventas.unidades)} und. | Producción: ${num(m.produccion.unidades)} und. | Almacén: ${num(m.almacen.despachadas)} despachadas · ${num(m.almacen.reclasificadas)} reclasificadas`;
    };

    root.innerHTML = `
      <div class="alert"><strong>Administración de metas.</strong> Defina objetivos por área. El avance se calcula automáticamente con la operación registrada.</div>
      <form id="formMetas">
        <div class="grid-2">${periodHtml('semanal', 'semanal')}${periodHtml('mensual', 'mensual')}</div>
        <div class="form-actions"><button class="btn primary" type="submit">Guardar metas</button></div>
      </form>
      <article class="panel">
        <div class="panel-head"><h2>Historial de metas asignadas</h2><p class="muted">Versiones anteriores y responsable de cada cambio.</p></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Fecha de cambio</th><th>Gerencia</th><th>Metas semanales</th><th>Metas mensuales</th></tr></thead>
          <tbody>${data.historial.map(item => `<tr>
            <td>${dt(item.creadoEn)}</td><td>${esc(item.usuarioNombre)}</td>
            <td>${resumenHistorial(item.metas, 'semanal')}</td>
            <td>${resumenHistorial(item.metas, 'mensual')}</td>
          </tr>`).join('') || '<tr><td colspan="4">Aún no hay cambios de metas registrados.</td></tr>'}</tbody>
        </table></div>
      </article>`;

    $('#formMetas').onsubmit = async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const read = name => Number(form.querySelector(`[name="${name}"]`).value);
      const metas = {};
      for (const periodo of ['semanal', 'mensual']) {
        metas[periodo] = {
          ventas: { monto: read(`${periodo}.ventas.monto`), unidades: read(`${periodo}.ventas.unidades`) },
          produccion: { unidades: read(`${periodo}.produccion.unidades`) },
          almacen: {
            despachadas: read(`${periodo}.almacen.despachadas`),
            reclasificadas: read(`${periodo}.almacen.reclasificadas`)
          }
        };
      }
      try {
        const result = await API.guardarMetas(metas);
        toast(result.registrado ? 'Metas guardadas y añadidas al historial' : 'No hubo cambios en las metas');
        await renderMetas(root);
      } catch (error) {
        toast(error.message, 'danger');
      }
    };
  }

  /* ---------- CIERRE GERENTE ---------- */
  async function renderCierre(root) {
    const cuadre = await API.cuadre();
    const { cierres } = await API.cierres();
    root.innerHTML = `
      <div class="alert ${cuadre.ok ? 'ok' : 'danger'}">
        <strong>${cuadre.ok ? 'Listo para cerrar: todo cuadra.' : 'Aún no cuadra.'}</strong>
        ${cuadre.ok ? 'Puede firmar e imprimir el cierre gerencial.' : 'Revise los ítems en rojo y pida a cada área reenviar su reporte.'}
      </div>
      <div class="grid-2">
        <article class="panel">
          <div class="panel-head"><h2>Checklist de cuadre</h2></div>
          ${cuadre.checks.map(c => `
            <div class="check-card">
              <div class="check-dot ${c.ok ? 'ok' : 'fail'}">${c.ok ? '✓' : '!'}</div>
              <div>
                <strong>${esc(c.label)}</strong>
                <p class="muted">Esperado: ${esc(String(c.esperado))} · Actual: ${esc(String(c.actual))}</p>
              </div>
              <span class="pill ${c.ok ? 'ok' : 'fail'}">${c.ok ? 'Cuadra' : 'No cuadra'}</span>
            </div>`).join('')}
        </article>
        <article class="panel">
          <div class="panel-head"><h2>Totales del día</h2></div>
          <div class="meta-grid">
            <div class="meta"><span>Monto ventas</span><strong>${money(cuadre.resumen.totales.montoVentas)}</strong></div>
            <div class="meta"><span>Unidades vendidas</span><strong>${num(cuadre.resumen.totales.unidadesVendidas)}</strong></div>
            <div class="meta"><span>Despachadas</span><strong>${num(cuadre.resumen.totales.unidadesDespachadas)}</strong></div>
            <div class="meta"><span>Producción</span><strong>${num(cuadre.resumen.totales.unidadesProducidas)}</strong></div>
            <div class="meta"><span>Pendientes</span><strong>${num(cuadre.resumen.totales.pendientes)}</strong></div>
            <div class="meta"><span>1ª → 2ª</span><strong>${num(cuadre.resumen.totales.unidadesReclasificadas)}</strong></div>
          </div>
          <div class="field" style="margin-top:1rem"><label>Notas del cierre</label><textarea id="cierreNotas" rows="2"></textarea></div>
          <div class="field"><label>Firma gerencial</label><div class="sign-box"><canvas id="firmaCierre" width="520" height="140"></canvas></div></div>
          <div class="form-actions">
            <button class="btn ghost" type="button" id="clrCierre">Limpiar firma</button>
            <button class="btn secondary" type="button" id="btnPrintCierre">Imprimir vista</button>
            <button class="btn primary" type="button" id="btnSaveCierre">Guardar cierre firmado</button>
          </div>
          ${!cuadre.ok ? `<p class="hint">Si hay causa justificada, puede forzar el cierre (queda registrado).</p>
            <button class="btn warn block" type="button" id="btnForce">Forzar cierre (no cuadra)</button>` : ''}
        </article>
      </div>
      <article class="panel" style="margin-top:1rem">
        <div class="panel-head"><h2>Cierres anteriores</h2></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Fecha</th><th>Responsable</th><th>Ventas</th><th>Estado</th><th>Guardado</th></tr></thead>
          <tbody>
            ${cierres.map(c => `<tr>
              <td>${esc(c.fecha)}</td>
              <td>${esc(c.responsableNombre)}</td>
              <td>${money(c.totales.montoVentas)}</td>
              <td>${c.forzado ? '<span class="pill fail">Forzado</span>' : '<span class="pill ok">Cuadrado</span>'}</td>
              <td>${dt(c.creadoEn)}</td>
            </tr>`).join('') || '<tr><td colspan="5">Sin cierres aún</td></tr>'}
          </tbody>
        </table></div>
      </article>
      <div id="printCierre" hidden></div>`;

    const canvas = $('#firmaCierre');
    setupFirma(canvas);
    $('#clrCierre').onclick = () => clearFirma(canvas);

    const save = async (forzar = false) => {
      if (firmaVacia(canvas)) return toast('Firme el cierre', 'warn');
      try {
        await API.guardarCierre({
          notas: $('#cierreNotas').value,
          firmaDataUrl: canvas.toDataURL('image/png'),
          forzar
        });
        toast(forzar ? 'Cierre forzado guardado' : 'Cierre cuadrado guardado');
        render();
      } catch (e) {
        if (e.status === 409) toast(e.message, 'warn');
        else toast(e.message, 'danger');
      }
    };
    $('#btnSaveCierre').onclick = () => save(false);
    $('#btnForce')?.addEventListener('click', () => {
      if (confirm('¿Forzar cierre aunque no cuadre? Quedará auditado.')) save(true);
    });
    $('#btnPrintCierre').onclick = () => {
      const html = `
        <html><head><title>Cierre ${cuadre.resumen.fecha}</title>
        <style>body{font-family:Arial,sans-serif;padding:24px} table{width:100%;border-collapse:collapse} td,th{border:1px solid #ccc;padding:8px;text-align:left} h1{margin:0 0 8px}</style></head>
        <body>
          <h1>Cierre gerencial — Cerámica EL LAPACHO</h1>
          <p>Fecha: ${cuadre.resumen.fecha}</p>
          <h3>Cuadre</h3>
          <table><tr><th>Control</th><th>Esperado</th><th>Actual</th><th>OK</th></tr>
          ${cuadre.checks.map(c => `<tr><td>${c.label}</td><td>${c.esperado}</td><td>${c.actual}</td><td>${c.ok ? 'Sí' : 'No'}</td></tr>`).join('')}
          </table>
          <h3>Totales</h3>
          <p>Ventas: ${money(cuadre.resumen.totales.montoVentas)} · Vendidas: ${num(cuadre.resumen.totales.unidadesVendidas)} · Despachadas: ${num(cuadre.resumen.totales.unidadesDespachadas)} · Producción: ${num(cuadre.resumen.totales.unidadesProducidas)}</p>
          <br/><br/><p>_________________________<br/>Firma gerencia</p>
          <script>window.print()<\/script>
        </body></html>`;
      const w = window.open('', '_blank');
      w.document.write(html);
      w.document.close();
    };
  }

  /* ---------- FIRMA ---------- */
  function setupFirma(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#171512';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    let drawing = false;
    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      const src = e.touches ? e.touches[0] : e;
      return {
        x: (src.clientX - r.left) * (canvas.width / r.width),
        y: (src.clientY - r.top) * (canvas.height / r.height)
      };
    };
    const start = (e) => { drawing = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); };
    const move = (e) => { if (!drawing) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); e.preventDefault(); };
    const end = () => { drawing = false; };
    canvas.onmousedown = start;
    canvas.onmousemove = move;
    window.addEventListener('mouseup', end);
    canvas.ontouchstart = start;
    canvas.ontouchmove = move;
    canvas.ontouchend = end;
  }
  function clearFirma(canvas) {
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  }
  function firmaVacia(canvas) {
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 3; i < data.length; i += 4) if (data[i]) return false;
    return true;
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
