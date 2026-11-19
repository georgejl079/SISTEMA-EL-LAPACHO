const API = (() => {
  const TOKEN_KEY = 'ladrillera_token';
  const USER_KEY = 'ladrillera_user';

  function base() {
    return '';
  }

  function token() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function user() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); }
    catch { return null; }
  }

  function setSession(tokenValue, userValue) {
    localStorage.setItem(TOKEN_KEY, tokenValue);
    localStorage.setItem(USER_KEY, JSON.stringify(userValue));
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  async function request(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const t = token();
    if (t) headers['x-session-token'] = t;

    let res;
    try {
      res = await fetch(base() + path, { ...options, headers });
    } catch {
      const err = new Error('No se pudo conectar al servidor. ¿Está iniciado?');
      err.offline = true;
      throw err;
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Error ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  return {
    token,
    user,
    setSession,
    clearSession,
    login: (usuario, pin) => request('/api/login', { method: 'POST', body: JSON.stringify({ usuario, pin }) }),
    logout: () => request('/api/logout', { method: 'POST' }),
    me: () => request('/api/me'),
    dashboard: () => request('/api/dashboard'),
    productos: () => request('/api/productos'),
    addProducto: (body) => request('/api/productos', { method: 'POST', body: JSON.stringify(body) }),
    ventas: (q = '') => request('/api/ventas' + (q ? `?${q}` : '')),
    crearVenta: (body) => request('/api/ventas', { method: 'POST', body: JSON.stringify(body) }),
    despachar: (id) => request(`/api/ventas/${id}/despachar`, { method: 'POST', body: '{}' }),
    cerrarPedido: (id) => request(`/api/ventas/${id}/cerrar`, { method: 'POST', body: '{}' }),
    anularVenta: (id, motivo) => request(`/api/ventas/${id}/anular`, { method: 'POST', body: JSON.stringify({ motivo }) }),
    produccion: () => request('/api/produccion'),
    registrarProduccion: (body) => request('/api/produccion', { method: 'POST', body: JSON.stringify(body) }),
    reclasificaciones: () => request('/api/reclasificaciones'),
    reclasificar: (body) => request('/api/reclasificaciones', { method: 'POST', body: JSON.stringify(body) }),
    reportesHoy: () => request('/api/reportes/hoy'),
    enviarReporte: (body) => request('/api/reportes', { method: 'POST', body: JSON.stringify(body) }),
    cuadre: () => request('/api/cierre/cuadre'),
    guardarCierre: (body) => request('/api/cierre', { method: 'POST', body: JSON.stringify(body) }),
    cierres: () => request('/api/cierres'),
    clientes: () => request('/api/clientes'),
    cliente: (id) => request(`/api/clientes/${id}`),
    metas: () => request('/api/metas'),
    metasProgreso: () => request('/api/metas/progreso'),
    guardarMetas: (metas) => request('/api/metas', { method: 'PUT', body: JSON.stringify(metas) }),
    historial: (params) => {
      const q = new URLSearchParams(params).toString();
      return request('/api/historial?' + q);
    }
  };
})();
