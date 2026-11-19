const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_FILE = path.join(__dirname, 'data.json');

function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

function nowISO() {
  return new Date().toISOString();
}

function uid(prefix) {
  return `${prefix}_${uuidv4().slice(0, 8)}`;
}

const DEFAULT = {
  usuarios: [
    { id: 'u1', usuario: 'gerente', nombre: 'Gerencia General', rol: 'gerente', pin: '1234', activo: true },
    { id: 'u2', usuario: 'ventas', nombre: 'Personal de Ventas', rol: 'ventas', pin: '1234', activo: true },
    { id: 'u3', usuario: 'almacen', nombre: 'Personal de Almacén', rol: 'almacen', pin: '1234', activo: true },
    { id: 'u4', usuario: 'produccion', nombre: 'Personal de Producción', rol: 'produccion', pin: '1234', activo: true }
  ],
  productos: [
    { id: 'p1', nombre: 'Ladrillo hueco 6 agujeros', codigo: 'LH-6', stockPrimera: 12000, stockSegunda: 1800, precioPrimera: 1.2, precioSegunda: 0.85, unidad: 'unidad' },
    { id: 'p2', nombre: 'Ladrillo hueco 9 agujeros', codigo: 'LH-9', stockPrimera: 8500, stockSegunda: 950, precioPrimera: 1.45, precioSegunda: 1.0, unidad: 'unidad' },
    { id: 'p3', nombre: 'Ladrillo macizo', codigo: 'LM-01', stockPrimera: 5000, stockSegunda: 600, precioPrimera: 0.95, precioSegunda: 0.65, unidad: 'unidad' },
    { id: 'p4', nombre: 'Ladrillo refractario', codigo: 'LR-01', stockPrimera: 2200, stockSegunda: 180, precioPrimera: 3.5, precioSegunda: 2.4, unidad: 'unidad' }
  ],
  clientes: [],
  ventas: [],
  produccion: [],
  reclasificaciones: [],
  movimientos: [],
  reportes: [],
  cierres: [],
  metas: {
    semanal: {
      ventas: { monto: 0, unidades: 0 },
      produccion: { unidades: 0 },
      almacen: { despachadas: 0, reclasificadas: 0 }
    },
    mensual: {
      ventas: { monto: 0, unidades: 0 },
      produccion: { unidades: 0 },
      almacen: { despachadas: 0, reclasificadas: 0 }
    }
  },
  metasHistorial: [],
  sesiones: {},
  meta: { version: 2, createdAt: nowISO() }
};

class Store {
  constructor() {
    this.data = this.load();
  }

  load() {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT, null, 2));
      return structuredClone(DEFAULT);
    }
    try {
      const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      const base = structuredClone(DEFAULT);
      const savedGoals = raw.metas || {};
      for (const period of ['semanal', 'mensual']) {
        for (const area of ['ventas', 'produccion', 'almacen']) {
          base.metas[period][area] = { ...base.metas[period][area], ...(savedGoals[period]?.[area] || {}) };
        }
      }
      return {
        ...base,
        ...raw,
        usuarios: raw.usuarios?.length ? raw.usuarios : DEFAULT.usuarios,
        metas: base.metas,
        metasHistorial: Array.isArray(raw.metasHistorial) ? raw.metasHistorial : []
      };
    } catch {
      fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT, null, 2));
      return structuredClone(DEFAULT);
    }
  }

  save() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(this.data, null, 2));
  }

  guardarMetas(metas, user) {
    const numberField = (value, label) => {
      const amount = Number(value);
      if (!Number.isFinite(amount) || amount < 0) throw new Error(`La meta de ${label} debe ser un número igual o mayor que cero`);
      return amount;
    };
    const clean = {};
    for (const period of ['semanal', 'mensual']) {
      clean[period] = {
        ventas: {
          monto: numberField(metas?.[period]?.ventas?.monto, 'monto de ventas'),
          unidades: numberField(metas?.[period]?.ventas?.unidades, 'unidades vendidas')
        },
        produccion: {
          unidades: numberField(metas?.[period]?.produccion?.unidades, 'unidades producidas')
        },
        almacen: {
          despachadas: numberField(metas?.[period]?.almacen?.despachadas, 'unidades despachadas'),
          reclasificadas: numberField(metas?.[period]?.almacen?.reclasificadas, 'unidades reclasificadas')
        }
      };
    }
    const registrado = JSON.stringify(clean) !== JSON.stringify(this.data.metas);
    if (!registrado) return { metas: this.data.metas, registrado: false };
    this.data.metas = clean;
    this.data.metasHistorial.unshift({
      id: uid('meta'),
      creadoEn: nowISO(),
      usuarioId: user.id,
      usuarioNombre: user.nombre,
      metas: structuredClone(clean)
    });
    this.log('metas', `Metas semanales y mensuales actualizadas por ${user.nombre}`, {
      usuarioId: user.id,
      usuarioNombre: user.nombre,
      rol: user.rol
    });
    return { metas: clean, registrado: true };
  }

  log(tipo, detalle, extra = {}) {
    this.data.movimientos.unshift({
      id: uid('mov'),
      tipo,
      detalle,
      fecha: todayISO(),
      hora: nowISO(),
      ...extra
    });
    this.save();
  }

  findUser(usuario, pin) {
    const norm = (s) => String(s || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    const uNorm = norm(usuario);
    const pNorm = String(pin || '').trim();
    return this.data.usuarios.find(u =>
      norm(u.usuario) === uNorm && String(u.pin) === pNorm && u.activo !== false
    );
  }

  getProducto(id) {
    return this.data.productos.find(p => p.id === id);
  }

  upsertCliente({ nombre, telefono, direccion, documento }) {
    const key = (nombre || '').trim().toLowerCase();
    let cliente = this.data.clientes.find(c => c.nombre.toLowerCase() === key);
    if (!cliente) {
      cliente = {
        id: uid('cli'),
        nombre: nombre.trim(),
        telefono: (telefono || '').trim(),
        direccion: (direccion || '').trim(),
        documento: (documento || '').trim(),
        creadoEn: nowISO(),
        totalCompras: 0,
        totalUnidades: 0,
        pedidos: 0
      };
      this.data.clientes.push(cliente);
    } else {
      if (telefono) cliente.telefono = telefono.trim();
      if (direccion) cliente.direccion = direccion.trim();
      if (documento) cliente.documento = documento.trim();
    }
    this.save();
    return cliente;
  }

  crearVenta(payload, user) {
    const prod = this.getProducto(payload.productoId);
    if (!prod) throw new Error('Producto no encontrado');
    const cantidad = Number(payload.cantidad);
    const calidad = payload.calidad;
    const stock = calidad === 'segunda' ? prod.stockSegunda : prod.stockPrimera;
    if (cantidad > stock) throw new Error(`Stock insuficiente. Disponible: ${stock}`);

    const precio = Number(payload.precioUnitario);
    const cliente = this.upsertCliente({
      nombre: payload.cliente,
      telefono: payload.telefono,
      direccion: payload.direccion,
      documento: payload.documento
    });

    const venta = {
      id: uid('v'),
      fecha: todayISO(),
      creadoEn: nowISO(),
      clienteId: cliente.id,
      clienteNombre: cliente.nombre,
      telefono: cliente.telefono,
      direccion: cliente.direccion || '',
      documento: cliente.documento || '',
      vendedorId: user.id,
      vendedorNombre: user.nombre,
      productoId: prod.id,
      productoNombre: prod.nombre,
      productoCodigo: prod.codigo,
      calidad,
      cantidad,
      precioUnitario: precio,
      total: cantidad * precio,
      formaPago: payload.formaPago || 'efectivo',
      notas: (payload.notas || '').trim(),
      estado: 'pendiente',
      despachadoEn: null,
      despachadoPor: null,
      despachadoPorId: null,
      cerradoEn: null
    };

    this.data.ventas.unshift(venta);
    this.log('venta', `Pedido #${venta.id.slice(-6).toUpperCase()} — ${venta.cantidad} ${prod.nombre} (${calidad}) para ${cliente.nombre}`, {
      usuarioId: user.id,
      usuarioNombre: user.nombre,
      rol: user.rol,
      refId: venta.id,
      monto: venta.total,
      cantidad: venta.cantidad
    });
    this.save();
    return venta;
  }

  despacharVenta(ventaId, user) {
    const venta = this.data.ventas.find(v => v.id === ventaId);
    if (!venta) throw new Error('Pedido no encontrado');
    if (venta.estado !== 'pendiente') throw new Error('El pedido ya no está pendiente');

    const prod = this.getProducto(venta.productoId);
    if (!prod) throw new Error('Producto no encontrado');
    const key = venta.calidad === 'segunda' ? 'stockSegunda' : 'stockPrimera';
    if (prod[key] < venta.cantidad) throw new Error(`Stock insuficiente. Disponible: ${prod[key]}`);

    prod[key] -= venta.cantidad;
    venta.estado = 'despachado';
    venta.despachadoEn = nowISO();
    venta.despachadoPor = user.nombre;
    venta.despachadoPorId = user.id;

    const cliente = this.data.clientes.find(c => c.id === venta.clienteId);
    if (cliente) {
      cliente.totalCompras += venta.total;
      cliente.totalUnidades += venta.cantidad;
      cliente.pedidos += 1;
      cliente.ultimaCompra = todayISO();
    }

    this.log('despacho', `Despacho #${venta.id.slice(-6).toUpperCase()} — ${venta.cantidad} ${venta.productoNombre} → ${venta.clienteNombre}`, {
      usuarioId: user.id,
      usuarioNombre: user.nombre,
      rol: user.rol,
      refId: venta.id,
      cantidad: venta.cantidad
    });
    this.save();
    return venta;
  }

  cerrarPedido(ventaId, user) {
    const venta = this.data.ventas.find(v => v.id === ventaId);
    if (!venta) throw new Error('Pedido no encontrado');
    if (venta.estado !== 'despachado') throw new Error('Solo se cierran pedidos despachados');
    venta.estado = 'cerrado';
    venta.cerradoEn = nowISO();
    this.log('despacho', `Cierre de pedido #${venta.id.slice(-6).toUpperCase()}`, {
      usuarioId: user.id,
      usuarioNombre: user.nombre,
      rol: user.rol,
      refId: venta.id
    });
    this.save();
    return venta;
  }

  anularVenta(ventaId, motivo, user) {
    const venta = this.data.ventas.find(v => v.id === ventaId);
    if (!venta) throw new Error('Pedido no encontrado');
    if (venta.estado === 'despachado' || venta.estado === 'cerrado') {
      throw new Error('No se puede anular un pedido ya despachado');
    }
    venta.estado = 'anulado';
    venta.anuladoEn = nowISO();
    venta.motivoAnulacion = motivo || '';
    this.log('venta', `Pedido anulado #${venta.id.slice(-6).toUpperCase()}: ${motivo || 'sin motivo'}`, {
      usuarioId: user.id,
      usuarioNombre: user.nombre,
      rol: user.rol,
      refId: venta.id
    });
    this.save();
    return venta;
  }

  registrarProduccion(payload, user) {
    const prod = this.getProducto(payload.productoId);
    if (!prod) throw new Error('Producto no encontrado');
    const cantidad = Number(payload.cantidad);
    prod.stockPrimera += cantidad;

    const reg = {
      id: uid('pr'),
      fecha: todayISO(),
      creadoEn: nowISO(),
      productoId: prod.id,
      productoNombre: prod.nombre,
      productoCodigo: prod.codigo,
      cantidad,
      horno: (payload.horno || '').trim(),
      turno: payload.turno || 'mañana',
      responsableId: user.id,
      responsableNombre: user.nombre,
      notas: (payload.notas || '').trim()
    };
    this.data.produccion.unshift(reg);
    this.log('produccion', `Producción +${cantidad} ${prod.nombre} · ${reg.turno}${reg.horno ? ` · ${reg.horno}` : ''}`, {
      usuarioId: user.id,
      usuarioNombre: user.nombre,
      rol: user.rol,
      refId: reg.id,
      cantidad
    });
    this.save();
    return reg;
  }

  reclasificar(payload, user) {
    const prod = this.getProducto(payload.productoId);
    if (!prod) throw new Error('Producto no encontrado');
    const cantidad = Number(payload.cantidad);
    if (prod.stockPrimera < cantidad) throw new Error(`Stock de primera insuficiente: ${prod.stockPrimera}`);

    prod.stockPrimera -= cantidad;
    prod.stockSegunda += cantidad;

    const reg = {
      id: uid('rc'),
      fecha: todayISO(),
      creadoEn: nowISO(),
      productoId: prod.id,
      productoNombre: prod.nombre,
      cantidad,
      motivo: payload.motivo.trim(),
      responsableId: user.id,
      responsableNombre: user.nombre
    };
    this.data.reclasificaciones.unshift(reg);
    this.log('calidad', `Reclasificación ${cantidad} ${prod.nombre} (1ª → 2ª): ${reg.motivo}`, {
      usuarioId: user.id,
      usuarioNombre: user.nombre,
      rol: user.rol,
      refId: reg.id,
      cantidad
    });
    this.save();
    return reg;
  }

  addProducto(payload, user) {
    const prod = {
      id: uid('p'),
      nombre: payload.nombre.trim(),
      codigo: (payload.codigo || uid('COD')).toUpperCase(),
      stockPrimera: Number(payload.stockPrimera) || 0,
      stockSegunda: Number(payload.stockSegunda) || 0,
      precioPrimera: Number(payload.precioPrimera) || 0,
      precioSegunda: Number(payload.precioSegunda) || 0,
      unidad: 'unidad'
    };
    this.data.productos.push(prod);
    this.log('stock', `Alta de producto ${prod.nombre}`, {
      usuarioId: user.id,
      usuarioNombre: user.nombre,
      rol: user.rol,
      refId: prod.id
    });
    this.save();
    return prod;
  }

  resumenOperativo(fecha = todayISO()) {
    const ventas = this.data.ventas.filter(v => v.fecha === fecha && v.estado !== 'anulado');
    const produccion = this.data.produccion.filter(p => p.fecha === fecha);
    const reclas = this.data.reclasificaciones.filter(r => r.fecha === fecha);
    const pendientes = ventas.filter(v => v.estado === 'pendiente');
    const despachadas = ventas.filter(v => v.estado === 'despachado' || v.estado === 'cerrado');

    return {
      fecha,
      ventas,
      produccion,
      reclasificaciones: reclas,
      pendientes,
      despachadas,
      totales: {
        pedidos: ventas.length,
        pendientes: pendientes.length,
        despachados: despachadas.length,
        montoVentas: ventas.reduce((s, v) => s + v.total, 0),
        unidadesVendidas: ventas.reduce((s, v) => s + v.cantidad, 0),
        unidadesDespachadas: despachadas.reduce((s, v) => s + v.cantidad, 0),
        unidadesProducidas: produccion.reduce((s, p) => s + p.cantidad, 0),
        unidadesReclasificadas: reclas.reduce((s, r) => s + r.cantidad, 0)
      },
      stock: this.data.productos.map(p => ({ ...p })),
      porProductoVentas: groupByProduct(ventas),
      porProductoProd: groupByProduct(produccion),
      porProductoDesp: groupByProduct(despachadas)
    };
  }

  getReporteArea(area, fecha = todayISO()) {
    return this.data.reportes.find(r => r.area === area && r.fecha === fecha);
  }

  enviarReporte({ area, notas, firmaDataUrl }, user) {
    const fecha = todayISO();
    const resumen = this.resumenOperativo(fecha);
    let snapshot;

    if (area === 'ventas') {
      const propias = resumen.ventas.filter(v => v.vendedorId === user.id || user.rol === 'gerente' || user.rol === 'ventas');
      const lista = user.rol === 'gerente' ? resumen.ventas : resumen.ventas;
      snapshot = {
        pedidos: lista.length,
        unidades: lista.reduce((s, v) => s + v.cantidad, 0),
        monto: lista.reduce((s, v) => s + v.total, 0),
        porProducto: groupByProduct(lista),
        detalle: lista.map(sanitizeVentaForRole('gerente'))
      };
    } else if (area === 'almacen') {
      snapshot = {
        pendientes: resumen.pendientes.length,
        despachados: resumen.despachadas.length,
        unidadesDespachadas: resumen.totales.unidadesDespachadas,
        unidadesReclasificadas: resumen.totales.unidadesReclasificadas,
        porProductoDesp: resumen.porProductoDesp,
        stock: resumen.stock.map(sanitizeStockForRole('almacen')),
        detalleDespachos: resumen.despachadas.map(sanitizeVentaForRole('almacen')),
        reclasificaciones: resumen.reclasificaciones
      };
    } else if (area === 'produccion') {
      snapshot = {
        registros: resumen.produccion.length,
        unidadesProducidas: resumen.totales.unidadesProducidas,
        porProducto: resumen.porProductoProd,
        detalle: resumen.produccion
      };
    } else {
      throw new Error('Área de reporte inválida');
    }

    const existing = this.data.reportes.findIndex(r => r.area === area && r.fecha === fecha);
    const reporte = {
      id: existing >= 0 ? this.data.reportes[existing].id : uid('rep'),
      area,
      fecha,
      enviadoEn: nowISO(),
      usuarioId: user.id,
      usuarioNombre: user.nombre,
      notas: (notas || '').trim(),
      firmaDataUrl: firmaDataUrl || null,
      snapshot,
      estado: 'enviado'
    };

    if (existing >= 0) this.data.reportes[existing] = reporte;
    else this.data.reportes.unshift(reporte);

    this.log('reporte', `Reporte de ${area} enviado por ${user.nombre}`, {
      usuarioId: user.id,
      usuarioNombre: user.nombre,
      rol: user.rol,
      refId: reporte.id
    });
    this.save();
    return reporte;
  }

  cuadrarCierre(fecha = todayISO()) {
    const resumen = this.resumenOperativo(fecha);
    const repVentas = this.getReporteArea('ventas', fecha);
    const repAlmacen = this.getReporteArea('almacen', fecha);
    const repProd = this.getReporteArea('produccion', fecha);

    const checks = [];

    const hasVentas = !!repVentas;
    const hasAlmacen = !!repAlmacen;
    const hasProd = !!repProd;

    checks.push({
      id: 'rep_ventas',
      label: 'Reporte de Ventas enviado',
      ok: hasVentas,
      esperado: 'Enviado',
      actual: hasVentas ? `Enviado por ${repVentas.usuarioNombre}` : 'Pendiente'
    });
    checks.push({
      id: 'rep_almacen',
      label: 'Reporte de Almacén enviado',
      ok: hasAlmacen,
      esperado: 'Enviado',
      actual: hasAlmacen ? `Enviado por ${repAlmacen.usuarioNombre}` : 'Pendiente'
    });
    checks.push({
      id: 'rep_prod',
      label: 'Reporte de Producción enviado',
      ok: hasProd,
      esperado: 'Enviado',
      actual: hasProd ? `Enviado por ${repProd.usuarioNombre}` : 'Pendiente'
    });

    if (hasVentas) {
      const okU = Number(repVentas.snapshot.unidades) === Number(resumen.totales.unidadesVendidas);
      const okM = Math.abs(Number(repVentas.snapshot.monto) - Number(resumen.totales.montoVentas)) < 0.01;
      checks.push({
        id: 'ventas_unidades',
        label: 'Unidades reportadas por Ventas = sistema',
        ok: okU,
        esperado: resumen.totales.unidadesVendidas,
        actual: repVentas.snapshot.unidades
      });
      checks.push({
        id: 'ventas_monto',
        label: 'Monto reportado por Ventas = sistema',
        ok: okM,
        esperado: resumen.totales.montoVentas,
        actual: repVentas.snapshot.monto
      });
    }

    if (hasAlmacen) {
      const okD = Number(repAlmacen.snapshot.unidadesDespachadas) === Number(resumen.totales.unidadesDespachadas);
      checks.push({
        id: 'almacen_desp',
        label: 'Unidades despachadas (Almacén) = sistema',
        ok: okD,
        esperado: resumen.totales.unidadesDespachadas,
        actual: repAlmacen.snapshot.unidadesDespachadas
      });
      checks.push({
        id: 'sin_pendientes',
        label: 'Sin pedidos pendientes de despacho',
        ok: resumen.totales.pendientes === 0,
        esperado: 0,
        actual: resumen.totales.pendientes
      });
    }

    if (hasProd) {
      const okP = Number(repProd.snapshot.unidadesProducidas) === Number(resumen.totales.unidadesProducidas);
      checks.push({
        id: 'prod_unidades',
        label: 'Producción reportada = sistema',
        ok: okP,
        esperado: resumen.totales.unidadesProducidas,
        actual: repProd.snapshot.unidadesProducidas
      });
    }

    if (hasVentas && hasAlmacen) {
      // Las unidades vendidas del día deben poder reconciliarse con despachos + pendientes
      const vendidas = resumen.totales.unidadesVendidas;
      const desp = resumen.totales.unidadesDespachadas;
      const pendUnidades = resumen.pendientes.reduce((s, v) => s + v.cantidad, 0);
      const ok = vendidas === desp + pendUnidades;
      checks.push({
        id: 'cuadratura_ventas_almacen',
        label: 'Ventas = Despachadas + Pendientes',
        ok,
        esperado: vendidas,
        actual: `${desp} + ${pendUnidades} = ${desp + pendUnidades}`
      });
    }

    const ok = checks.every(c => c.ok);
    return { ok, checks, resumen, reportes: { ventas: repVentas, almacen: repAlmacen, produccion: repProd } };
  }

  guardarCierreGerente({ notas, firmaDataUrl, forzar }, user) {
    const fecha = todayISO();
    const cuadre = this.cuadrarCierre(fecha);
    if (!cuadre.ok && !forzar) {
      const err = new Error('El cierre no cuadra. Revise los reportes de cada área.');
      err.code = 'NO_CUADRA';
      err.cuadre = cuadre;
      throw err;
    }

    const cierre = {
      id: uid('c'),
      fecha,
      creadoEn: nowISO(),
      responsableId: user.id,
      responsableNombre: user.nombre,
      firmaDataUrl: firmaDataUrl || null,
      notas: (notas || '').trim(),
      forzado: !!forzar && !cuadre.ok,
      cuadre,
      totales: cuadre.resumen.totales,
      snapshot: {
        ventas: cuadre.resumen.ventas,
        produccion: cuadre.resumen.produccion,
        reclasificaciones: cuadre.resumen.reclasificaciones,
        stock: cuadre.resumen.stock,
        reportes: cuadre.reportes
      }
    };
    this.data.cierres.unshift(cierre);
    this.log('cierre', `Cierre gerencial del ${fecha}${cierre.forzado ? ' (forzado)' : ''} por ${user.nombre}`, {
      usuarioId: user.id,
      usuarioNombre: user.nombre,
      rol: user.rol,
      refId: cierre.id,
      monto: cierre.totales.montoVentas
    });
    this.save();
    return cierre;
  }
}

function groupByProduct(items) {
  const map = {};
  items.forEach(it => {
    const key = it.productoId || it.id;
    if (!map[key]) {
      map[key] = {
        productoId: it.productoId,
        productoNombre: it.productoNombre,
        cantidad: 0,
        monto: 0
      };
    }
    map[key].cantidad += it.cantidad || 0;
    map[key].monto += it.total || 0;
  });
  return Object.values(map);
}

function sanitizeStockForRole(rol) {
  return (p) => {
    const base = {
      id: p.id,
      nombre: p.nombre,
      codigo: p.codigo,
      stockPrimera: p.stockPrimera,
      stockSegunda: p.stockSegunda,
      total: p.stockPrimera + p.stockSegunda,
      unidad: p.unidad
    };
    if (rol === 'gerente' || rol === 'ventas') {
      base.precioPrimera = p.precioPrimera;
      base.precioSegunda = p.precioSegunda;
    }
    return base;
  };
}

function sanitizeVentaForRole(rol) {
  return (v) => {
    if (rol === 'gerente') return { ...v };
    if (rol === 'ventas') {
      return {
        id: v.id,
        fecha: v.fecha,
        creadoEn: v.creadoEn,
        clienteNombre: v.clienteNombre,
        telefono: v.telefono,
        productoNombre: v.productoNombre,
        productoCodigo: v.productoCodigo,
        calidad: v.calidad,
        cantidad: v.cantidad,
        precioUnitario: v.precioUnitario,
        total: v.total,
        formaPago: v.formaPago,
        estado: v.estado,
        notas: v.notas,
        vendedorNombre: v.vendedorNombre
      };
    }
    // almacen / produccion: sin montos ni forma de pago
    return {
      id: v.id,
      fecha: v.fecha,
      creadoEn: v.creadoEn,
      clienteNombre: v.clienteNombre,
      telefono: v.telefono,
      direccion: v.direccion,
      productoNombre: v.productoNombre,
      productoCodigo: v.productoCodigo,
      calidad: v.calidad,
      cantidad: v.cantidad,
      estado: v.estado,
      notas: v.notas,
      vendedorNombre: v.vendedorNombre,
      despachadoEn: v.despachadoEn,
      despachadoPor: v.despachadoPor
    };
  };
}

module.exports = {
  Store,
  todayISO,
  nowISO,
  sanitizeStockForRole,
  sanitizeVentaForRole
};
