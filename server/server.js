const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const {
  Store,
  todayISO,
  sanitizeStockForRole,
  sanitizeVentaForRole
} = require('./store');

const app = express();
const store = new Store();
const PORT = process.env.PORT || 3780;
const ROOT = path.join(__dirname, '..');

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  next();
});
app.use(express.static(ROOT));

const sessions = new Map();

function auth(req, res, next) {
  const token = req.headers['x-session-token'];
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'Sesión no válida. Inicie sesión.' });
  }
  req.user = sessions.get(token);
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.rol)) {
      return res.status(403).json({ error: 'No tiene permiso para esta acción.' });
    }
    next();
  };
}

function periodRange(periodo, fecha) {
  const f = fecha || todayISO();
  if (periodo === 'dia') return { from: f, to: f, label: `Día ${f}` };
  if (periodo === 'semana') {
    const d = new Date(f + 'T12:00:00');
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    const from = d.toISOString().slice(0, 10);
    const end = new Date(d);
    end.setDate(end.getDate() + 6);
    return { from, to: end.toISOString().slice(0, 10), label: `Semana ${from} – ${end.toISOString().slice(0, 10)}` };
  }
  if (periodo === 'mes') {
    const from = f.slice(0, 7) + '-01';
    const last = new Date(Number(f.slice(0, 4)), Number(f.slice(5, 7)), 0);
    return { from, to: last.toISOString().slice(0, 10), label: `Mes ${f.slice(5, 7)}/${f.slice(0, 4)}` };
  }
  const y = f.slice(0, 4);
  return { from: `${y}-01-01`, to: `${y}-12-31`, label: `Año ${y}` };
}

/* -------- AUTH -------- */
app.post('/api/login', (req, res) => {
  const { usuario, pin } = req.body || {};
  const user = store.findUser(String(usuario || '').trim().toLowerCase(), String(pin || '').trim());
  if (!user) return res.status(401).json({ error: 'Usuario o PIN incorrecto' });

  const token = uuidv4();
  const sessionUser = {
    id: user.id,
    usuario: user.usuario,
    nombre: user.nombre,
    rol: user.rol
  };
  sessions.set(token, sessionUser);
  res.json({ token, user: sessionUser });
});

app.post('/api/logout', auth, (req, res) => {
  const token = req.headers['x-session-token'];
  sessions.delete(token);
  res.json({ ok: true });
});

app.get('/api/me', auth, (req, res) => {
  res.json({ user: req.user });
});

/* -------- DASHBOARD -------- */
app.get('/api/dashboard', auth, (req, res) => {
  const rol = req.user.rol;
  const resumen = store.resumenOperativo();
  const stock = resumen.stock.map(sanitizeStockForRole(rol === 'produccion' ? 'almacen' : rol));

  const base = {
    fecha: resumen.fecha,
    pendientes: resumen.totales.pendientes,
    stockTotal: stock.reduce((s, p) => s + p.total, 0),
    stock,
    actividad: store.data.movimientos
      .filter(m => m.fecha === resumen.fecha)
      .slice(0, 15)
      .map(m => sanitizeMovimiento(m, rol))
  };

  if (rol === 'gerente') {
    return res.json({
      ...base,
      rol,
      kpis: {
        montoVentas: resumen.totales.montoVentas,
        unidadesVendidas: resumen.totales.unidadesVendidas,
        unidadesProducidas: resumen.totales.unidadesProducidas,
        unidadesDespachadas: resumen.totales.unidadesDespachadas,
        pendientes: resumen.totales.pendientes,
        reclasificadas: resumen.totales.unidadesReclasificadas
      },
      pendientesDetalle: resumen.pendientes.map(sanitizeVentaForRole('gerente')),
      reportesHoy: {
        ventas: !!store.getReporteArea('ventas'),
        almacen: !!store.getReporteArea('almacen'),
        produccion: !!store.getReporteArea('produccion')
      }
    });
  }

  if (rol === 'ventas') {
    const propias = resumen.ventas.filter(v => v.vendedorId === req.user.id);
    const porModelo = {};
    propias.forEach(v => {
      const key = v.productoId || v.id;
      if (!porModelo[key]) {
        porModelo[key] = {
          productoId: v.productoId,
          codigo: v.productoCodigo,
          nombre: v.productoNombre,
          pedidos: 0,
          unidades: 0,
          primera: 0,
          segunda: 0,
          monto: 0
        };
      }
      porModelo[key].pedidos += 1;
      porModelo[key].unidades += Number(v.cantidad) || 0;
      porModelo[key][v.calidad === 'segunda' ? 'segunda' : 'primera'] += Number(v.cantidad) || 0;
      porModelo[key].monto += Number(v.total) || 0;
    });
    return res.json({
      ...base,
      rol,
      kpis: {
        misPedidos: propias.length,
        montoHoy: propias.reduce((s, v) => s + v.total, 0),
        unidadesHoy: propias.reduce((s, v) => s + v.cantidad, 0),
        pendientesDespacho: resumen.totales.pendientes
      },
      porModelo: Object.values(porModelo).sort((a, b) => b.unidades - a.unidades),
      misVentas: propias.map(sanitizeVentaForRole('ventas'))
    });
  }

  if (rol === 'almacen') {
    return res.json({
      ...base,
      rol,
      kpis: {
        pendientes: resumen.totales.pendientes,
        despachados: resumen.totales.despachados,
        unidadesDespachadas: resumen.totales.unidadesDespachadas,
        reclasificadas: resumen.totales.unidadesReclasificadas
      },
      pendientesDetalle: resumen.pendientes.map(sanitizeVentaForRole('almacen'))
    });
  }

  // produccion
  return res.json({
    ...base,
    rol,
    kpis: {
      unidadesProducidas: resumen.totales.unidadesProducidas,
      registros: resumen.produccion.length,
      stockPrimera: stock.reduce((s, p) => s + p.stockPrimera, 0)
    },
    produccionHoy: resumen.produccion
  });
});

function sanitizeMovimiento(m, rol) {
  const out = {
    id: m.id,
    tipo: m.tipo,
    detalle: m.detalle,
    fecha: m.fecha,
    hora: m.hora,
    usuarioNombre: m.usuarioNombre,
    cantidad: m.cantidad
  };
  if (rol === 'gerente' || rol === 'ventas') out.monto = m.monto;
  if (rol === 'almacen' && m.tipo === 'venta' && m.monto != null) {
    out.detalle = m.detalle.replace(/Bs\.?\s*[\d.,]+/gi, '').replace(/BOB\s*[\d.,]+/gi, '');
  }
  return out;
}

/* -------- PRODUCTOS / STOCK -------- */
app.get('/api/productos', auth, (req, res) => {
  const rol = req.user.rol;
  const list = store.data.productos.map(sanitizeStockForRole(rol === 'produccion' ? 'almacen' : rol));
  res.json({ productos: list });
});

app.post('/api/productos', auth, requireRole('gerente', 'almacen'), (req, res) => {
  try {
    const prod = store.addProducto(req.body, req.user);
    res.json({ producto: sanitizeStockForRole(req.user.rol)(prod) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* -------- VENTAS -------- */
app.get('/api/ventas', auth, requireRole('gerente', 'ventas', 'almacen'), (req, res) => {
  const fecha = req.query.fecha || todayISO();
  const rol = req.user.rol;
  let ventas = store.data.ventas.filter(v => v.fecha === fecha);
  if (req.query.estado) ventas = ventas.filter(v => v.estado === req.query.estado);
  res.json({ ventas: ventas.map(sanitizeVentaForRole(rol)) });
});

app.post('/api/ventas', auth, requireRole('gerente', 'ventas'), (req, res) => {
  try {
    const venta = store.crearVenta(req.body, req.user);
    res.json({ venta: sanitizeVentaForRole(req.user.rol)(venta) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/ventas/:id/despachar', auth, requireRole('gerente', 'almacen'), (req, res) => {
  try {
    const venta = store.despacharVenta(req.params.id, req.user);
    res.json({ venta: sanitizeVentaForRole(req.user.rol)(venta) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/ventas/:id/cerrar', auth, requireRole('gerente', 'almacen'), (req, res) => {
  try {
    const venta = store.cerrarPedido(req.params.id, req.user);
    res.json({ venta: sanitizeVentaForRole(req.user.rol)(venta) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/ventas/:id/anular', auth, requireRole('gerente', 'ventas'), (req, res) => {
  try {
    const venta = store.anularVenta(req.params.id, req.body?.motivo, req.user);
    res.json({ venta: sanitizeVentaForRole(req.user.rol)(venta) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* -------- PRODUCCIÓN -------- */
app.get('/api/produccion', auth, requireRole('gerente', 'produccion'), (req, res) => {
  const fecha = req.query.fecha || todayISO();
  const lista = store.data.produccion.filter(p => p.fecha === fecha);
  res.json({ produccion: lista });
});

app.post('/api/produccion', auth, requireRole('gerente', 'produccion'), (req, res) => {
  try {
    const reg = store.registrarProduccion(req.body, req.user);
    res.json({ produccion: reg });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* -------- CALIDAD -------- */
app.get('/api/reclasificaciones', auth, requireRole('gerente', 'almacen'), (req, res) => {
  const fecha = req.query.fecha || todayISO();
  res.json({ reclasificaciones: store.data.reclasificaciones.filter(r => r.fecha === fecha) });
});

app.post('/api/reclasificaciones', auth, requireRole('gerente', 'almacen'), (req, res) => {
  try {
    const reg = store.reclasificar(req.body, req.user);
    res.json({ reclasificacion: reg });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* -------- REPORTES DE ÁREA -------- */
app.get('/api/reportes/hoy', auth, (req, res) => {
  const fecha = todayISO();
  const rol = req.user.rol;
  if (rol === 'gerente') {
    return res.json({
      ventas: store.getReporteArea('ventas', fecha),
      almacen: store.getReporteArea('almacen', fecha),
      produccion: store.getReporteArea('produccion', fecha)
    });
  }
  const area = rol === 'ventas' ? 'ventas' : rol === 'almacen' ? 'almacen' : 'produccion';
  res.json({ propio: store.getReporteArea(area, fecha) });
});

app.post('/api/reportes', auth, requireRole('ventas', 'almacen', 'produccion', 'gerente'), (req, res) => {
  try {
    let area = req.body.area;
    if (req.user.rol !== 'gerente') {
      area = req.user.rol === 'ventas' ? 'ventas' : req.user.rol === 'almacen' ? 'almacen' : 'produccion';
    }
    const reporte = store.enviarReporte({
      area,
      notas: req.body.notas,
      firmaDataUrl: req.body.firmaDataUrl
    }, req.user);
    res.json({ reporte });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* -------- CIERRE GERENTE -------- */
app.get('/api/cierre/cuadre', auth, requireRole('gerente'), (req, res) => {
  res.json(store.cuadrarCierre(req.query.fecha || todayISO()));
});

app.post('/api/cierre', auth, requireRole('gerente'), (req, res) => {
  try {
    const cierre = store.guardarCierreGerente(req.body, req.user);
    res.json({ cierre });
  } catch (e) {
    if (e.code === 'NO_CUADRA') {
      return res.status(409).json({ error: e.message, cuadre: e.cuadre });
    }
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/cierres', auth, requireRole('gerente'), (req, res) => {
  res.json({ cierres: store.data.cierres });
});

/* -------- CLIENTES E HISTORIAL (solo gerente) -------- */
app.get('/api/clientes', auth, requireRole('gerente'), (req, res) => {
  const clientes = [...store.data.clientes].sort((a, b) => (b.totalCompras || 0) - (a.totalCompras || 0));
  res.json({ clientes });
});

app.get('/api/clientes/:id', auth, requireRole('gerente'), (req, res) => {
  const cliente = store.data.clientes.find(c => c.id === req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  const pedidos = store.data.ventas.filter(v => v.clienteId === cliente.id);
  res.json({ cliente, pedidos });
});

function metasSeguimiento() {
  const periodos = {
    semanal: periodRange('semana', todayISO()),
    mensual: periodRange('mes', todayISO())
  };
  const progreso = {};
  for (const [periodo, range] of Object.entries(periodos)) {
    const ventas = store.data.ventas.filter(v =>
      v.fecha >= range.from && v.fecha <= range.to && v.estado !== 'anulado'
    );
    const produccion = store.data.produccion.filter(p => p.fecha >= range.from && p.fecha <= range.to);
    const despachadas = ventas.filter(v => v.estado === 'despachado' || v.estado === 'cerrado');
    const reclasificaciones = store.data.reclasificaciones.filter(r => r.fecha >= range.from && r.fecha <= range.to);
    progreso[periodo] = {
      ventas: {
        monto: ventas.reduce((sum, v) => sum + v.total, 0),
        unidades: ventas.reduce((sum, v) => sum + v.cantidad, 0)
      },
      produccion: {
        unidades: produccion.reduce((sum, p) => sum + p.cantidad, 0)
      },
      almacen: {
        despachadas: despachadas.reduce((sum, v) => sum + v.cantidad, 0),
        reclasificadas: reclasificaciones.reduce((sum, r) => sum + r.cantidad, 0)
      }
    };
  }
  return { progreso, periodos };
}

app.get('/api/metas', auth, requireRole('gerente'), (_req, res) => {
  const { progreso, periodos } = metasSeguimiento();
  res.json({
    metas: store.data.metas,
    historial: store.data.metasHistorial,
    progreso,
    periodos
  });
});

app.get('/api/metas/progreso', auth, requireRole('ventas', 'almacen', 'produccion'), (req, res) => {
  const area = req.user.rol;
  const { progreso, periodos } = metasSeguimiento();
  res.json({
    area,
    metas: {
      semanal: store.data.metas.semanal[area],
      mensual: store.data.metas.mensual[area]
    },
    progreso: {
      semanal: progreso.semanal[area],
      mensual: progreso.mensual[area]
    },
    periodos
  });
});

app.put('/api/metas', auth, requireRole('gerente'), (req, res) => {
  try {
    const saved = store.guardarMetas(req.body, req.user);
    res.json(saved);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/historial', auth, requireRole('gerente', 'ventas', 'almacen', 'produccion'), (req, res) => {
  const periodo = req.query.periodo || 'dia';
  const fecha = req.query.fecha || todayISO();
  const tipo = req.query.tipo || 'todos';
  const range = periodRange(periodo, fecha);

  let movs = store.data.movimientos.filter(m => m.fecha >= range.from && m.fecha <= range.to);
  let ventas = store.data.ventas.filter(v => v.fecha >= range.from && v.fecha <= range.to && v.estado !== 'anulado');
  let produccion = store.data.produccion.filter(p => p.fecha >= range.from && p.fecha <= range.to);
  let reclas = store.data.reclasificaciones.filter(r => r.fecha >= range.from && r.fecha <= range.to);

  if (req.user.rol === 'ventas') {
    movs = movs.filter(m => m.usuarioId === req.user.id);
    ventas = ventas.filter(v => v.vendedorId === req.user.id);
    produccion = [];
    reclas = [];
  } else if (req.user.rol === 'almacen') {
    movs = movs.filter(m => m.usuarioId === req.user.id && (m.tipo === 'despacho' || m.tipo === 'calidad'));
    ventas = ventas.filter(v => v.despachadoPorId === req.user.id);
    reclas = reclas.filter(r => r.responsableId === req.user.id);
    produccion = [];
  } else if (req.user.rol === 'produccion') {
    movs = movs.filter(m => m.usuarioId === req.user.id && m.tipo === 'produccion');
    produccion = produccion.filter(p => p.responsableId === req.user.id);
    ventas = [];
    reclas = [];
  }

  if (tipo !== 'todos') {
    movs = movs.filter(m => m.tipo === tipo);
    if (req.user.rol === 'ventas' && tipo !== 'venta') ventas = [];
    if (req.user.rol === 'almacen') {
      if (tipo === 'despacho') reclas = [];
      if (tipo === 'calidad') ventas = [];
    }
    if (req.user.rol === 'produccion' && tipo !== 'produccion') produccion = [];
  }

  res.json({
    range,
    resumen: {
      montoVentas: ventas.reduce((s, v) => s + v.total, 0),
      unidadesVendidas: ventas.reduce((s, v) => s + v.cantidad, 0),
      pedidos: ventas.length,
      produccion: produccion.reduce((s, p) => s + p.cantidad, 0),
      reclasificaciones: reclas.reduce((s, r) => s + r.cantidad, 0),
      clientesUnicos: new Set(ventas.map(v => v.clienteId)).size,
      movimientos: movs.length
    },
    movimientos: movs,
    ventas,
    produccion,
    reclasificaciones: reclas,
    topClientes: topClients(ventas),
    porDia: groupByDay(ventas, produccion)
  });
});

function topClients(ventas) {
  const map = {};
  ventas.forEach(v => {
    if (!map[v.clienteId]) {
      map[v.clienteId] = { clienteId: v.clienteId, nombre: v.clienteNombre, monto: 0, unidades: 0, pedidos: 0 };
    }
    map[v.clienteId].monto += v.total;
    map[v.clienteId].unidades += v.cantidad;
    map[v.clienteId].pedidos += 1;
  });
  return Object.values(map).sort((a, b) => b.monto - a.monto).slice(0, 10);
}

function groupByDay(ventas, produccion) {
  const map = {};
  ventas.forEach(v => {
    if (!map[v.fecha]) map[v.fecha] = { fecha: v.fecha, monto: 0, vendidas: 0, producidas: 0 };
    map[v.fecha].monto += v.total;
    map[v.fecha].vendidas += v.cantidad;
  });
  produccion.forEach(p => {
    if (!map[p.fecha]) map[p.fecha] = { fecha: p.fecha, monto: 0, vendidas: 0, producidas: 0 };
    map[p.fecha].producidas += p.cantidad;
  });
  return Object.values(map).sort((a, b) => b.fecha.localeCompare(a.fecha));
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

function getLanIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

app.listen(PORT, '0.0.0.0', () => {
  const ip = getLanIP();
  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║      CERÁMICA EL LAPACHO — Servidor          ║');
  console.log('  ╠══════════════════════════════════════════════╣');
  console.log(`  ║  Local:   http://localhost:${PORT}              ║`);
  console.log(`  ║  Red:     http://${ip}:${PORT}${' '.repeat(Math.max(1, 22 - ip.length))}║`);
  console.log('  ╠══════════════════════════════════════════════╣');
  console.log('  ║  Usuarios (PIN 1234):                        ║');
  console.log('  ║   gerente | ventas | almacen | produccion    ║');
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log('');
});
