/* ============================================================
   PANEL DE GESTIÓN · datos
   ------------------------------------------------------------
   Las pantallas solo llaman a DATOS.algo(...) y reciben una
   promesa. Hay dos versiones con las MISMAS funciones:
     · demostración (?demo): datos inventados en memoria
     · real: Supabase, con las tablas de replica/schema.sql
   Cambiar de una a otra no toca ninguna pantalla.

   Si las tablas nuevas aún no existen en la base, la versión real
   falla con error.sinTablas = true y la pantalla lo explica.
   ============================================================ */
(function () {
  'use strict';

  /* Plazos que cuentan como deuda y si ya ha vencido */
  function cuentaPlazos(plazos, hoy) {
    var r = { debe: 0, vencidos: 0, devueltos: 0, pendientes: 0 };
    plazos.forEach(function (p) {
      if (p.estado === 'pendiente') {
        r.pendientes++; r.debe += p.importe_centimos;
        if (p.vence < hoy) r.vencidos++;
      } else if (p.estado === 'devuelto') {
        r.devueltos++; r.debe += p.importe_centimos;
      }
    });
    return r;
  }

  function filtrar(lista, f) {
    f = f || {};
    var q = (f.buscar || '').trim().toLowerCase();
    return lista.filter(function (c) {
      if (f.tipo === 'familia' && c.tipo !== 'familia') return false;
      if (f.tipo === 'institucion' && c.tipo === 'familia') return false;
      if (f.tipo === 'deuda' && !c.debe_centimos) return false;
      if (!q) return true;
      var texto = [c.nombre, c.email, c.telefono].concat(c.personas.map(function (p) { return p.nombre; }))
        .join(' ').toLowerCase();
      return texto.indexOf(q) >= 0;
    });
  }

  /* ================= versión de demostración ================== */

  function demo() {
    var hoy = window.PANEL.hoy();
    function dia(n) { var d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

    var actividades = {
      a1: { id: 'a1', tipo: 'campamento', nombre: 'Campamento de verano · Riópar', empieza: '2027-07-01', termina: '2027-07-10' },
      a2: { id: 'a2', tipo: 'extraescolar', nombre: 'Multideporte · martes y jueves', empieza: '2026-10-01', termina: '2027-06-20' },
      a3: { id: 'a3', tipo: 'extraescolar', nombre: 'Patinaje · CEIP Los Almendros', empieza: '2026-10-01', termina: '2027-06-20' },
      a4: { id: 'a4', tipo: 'evento', nombre: 'Fiesta de fin de curso', empieza: '2027-06-18', termina: '2027-06-18' }
    };

    var clientes = [
      { id: 'c1', tipo: 'familia', nombre: 'Familia Ortega Ruiz', email: 'carmen.ruiz@example.com', telefono: '600 111 222',
        direccion: 'C/ Mayor 12, Alicante', etiquetas: ['hermanos'], notas: 'Prefiere WhatsApp. Recoge la abuela los jueves.',
        sepa: true, mandato_fecha: '2026-09-20', creado: '2026-09-12' },
      { id: 'c2', tipo: 'familia', nombre: 'Familia Navarro', email: 'hugo.navarro@example.com', telefono: '600 333 444',
        direccion: '', etiquetas: [], notas: '', sepa: false, creado: '2026-10-02' },
      { id: 'c3', tipo: 'familia', nombre: 'Familia Ibáñez', email: 'p.ibanez@example.com', telefono: '600 555 666',
        direccion: 'Av. de la Estación 4, Elda', etiquetas: [], notas: 'Recibo de octubre devuelto: llamar.', sepa: true, mandato_fecha: '2026-09-28', creado: '2026-09-25' },
      { id: 'c4', tipo: 'ampa', nombre: 'AMPA CEIP Los Almendros', email: 'ampa.almendros@example.com', telefono: '965 000 111',
        nif: 'G00000000', direccion: 'C/ de los Almendros s/n', etiquetas: ['extraescolares'], notas: 'Factura trimestral la hace la contable.', sepa: false, creado: '2026-06-15' },
      { id: 'c5', tipo: 'ayuntamiento', nombre: 'Ayuntamiento de Villanueva del Río (Concejalía de Deportes)', email: 'deportes@example.com',
        telefono: '965 222 333', nif: 'P0000000A', direccion: 'Plaza Mayor 1', etiquetas: ['programa municipal'], notas: '', sepa: false, creado: '2026-03-01' },
      { id: 'c6', tipo: 'familia', nombre: 'Familia Benavente-Santamaría de los Llanos y Castellanos', email: 'larguisimo.correo.de.familia@example.com',
        telefono: '600 777 888', direccion: '', etiquetas: [], notas: '', sepa: false, creado: hoy },
      { id: 'c7', tipo: 'familia', nombre: 'Familia Ortega', email: 'carmen.trabajo@example.com', telefono: '600 111 222',
        direccion: '', etiquetas: [], notas: 'Reservó la fiesta con el email del trabajo.', sepa: false, creado: '2026-10-20' }
    ];

    var personas = [
      { id: 'p1', cliente_id: 'c1', rol: 'tutor', nombre: 'Carmen Ruiz', telefono: '600 111 222', email: 'carmen.ruiz@example.com', dni: '00000000T' },
      { id: 'p2', cliente_id: 'c1', rol: 'participante', nombre: 'Lucía Ortega Ruiz', nacimiento: '2017-03-14', salud: { alergias: 'Frutos secos', sip: '0000000' }, autorizaciones: { fotos: 'sí' } },
      { id: 'p3', cliente_id: 'c1', rol: 'participante', nombre: 'Mario Ortega Ruiz', nacimiento: '2019-11-02', salud: {}, autorizaciones: { fotos: 'no' } },
      { id: 'p4', cliente_id: 'c2', rol: 'tutor', nombre: 'Hugo Navarro', telefono: '600 333 444' },
      { id: 'p5', cliente_id: 'c2', rol: 'participante', nombre: 'Marta Navarro', anyo_nacimiento: 2016, salud: { observaciones: 'Lleva gafas' }, autorizaciones: { fotos: 'sí' } },
      { id: 'p6', cliente_id: 'c3', rol: 'tutor', nombre: 'Pablo Ibáñez', telefono: '600 555 666' },
      { id: 'p7', cliente_id: 'c3', rol: 'participante', nombre: 'Daniel Ibáñez', nacimiento: '2015-01-21', salud: { alergias: 'Penicilina' }, autorizaciones: { fotos: 'sí' } },
      { id: 'p8', cliente_id: 'c4', rol: 'contacto', nombre: 'Rosa (presidenta)', telefono: '600 999 000' },
      { id: 'p9', cliente_id: 'c5', rol: 'contacto', nombre: 'Técnico de deportes', telefono: '965 222 334' },
      { id: 'p10', cliente_id: 'c7', rol: 'participante', nombre: 'Lucía Ortega', anyo_nacimiento: 2017, salud: { observaciones: 'Gafas' }, autorizaciones: {} }
    ];

    var inscripciones = [
      { id: 'i1', cliente_id: 'c1', persona_id: 'p2', actividad_id: 'a1', estado: 'activa', importe_centimos: 39000, alta: '2026-09-12' },
      { id: 'i2', cliente_id: 'c1', persona_id: 'p2', actividad_id: 'a2', estado: 'activa', importe_centimos: 3500, alta: '2026-10-01' },
      { id: 'i3', cliente_id: 'c1', persona_id: 'p3', actividad_id: 'a2', estado: 'activa', importe_centimos: 3000, alta: '2026-10-01' },
      { id: 'i4', cliente_id: 'c2', persona_id: 'p5', actividad_id: 'a2', estado: 'activa', importe_centimos: 3500, alta: '2026-10-02' },
      { id: 'i5', cliente_id: 'c3', persona_id: 'p7', actividad_id: 'a2', estado: 'activa', importe_centimos: 3500, alta: '2026-09-25' },
      { id: 'i6', cliente_id: 'c3', persona_id: 'p7', actividad_id: 'a1', estado: 'espera', importe_centimos: 0, alta: '2026-10-20' },
      { id: 'i7', cliente_id: 'c4', persona_id: null, actividad_id: 'a3', estado: 'activa', importe_centimos: 0, alta: '2026-09-01' },
      { id: 'i8', cliente_id: 'c7', persona_id: 'p10', actividad_id: 'a4', estado: 'activa', importe_centimos: 1500, alta: '2026-10-20' }
    ];

    var plazos = [
      { id: 'z1', inscripcion_id: 'i1', concepto: 'Señal', importe_centimos: 9000, vence: '2026-09-12', estado: 'cobrado', metodo: 'tarjeta' },
      { id: 'z2', inscripcion_id: 'i1', concepto: 'Segundo plazo', importe_centimos: 15000, vence: dia(40), estado: 'pendiente', metodo: 'sepa' },
      { id: 'z3', inscripcion_id: 'i1', concepto: 'Último plazo', importe_centimos: 15000, vence: dia(150), estado: 'pendiente', metodo: 'sepa' },
      { id: 'z4', inscripcion_id: 'i2', concepto: 'Cuota de octubre', importe_centimos: 3500, vence: '2026-10-05', estado: 'cobrado', metodo: 'sepa' },
      { id: 'z5', inscripcion_id: 'i2', concepto: 'Cuota de noviembre', importe_centimos: 3500, vence: dia(3), estado: 'pendiente', metodo: 'sepa' },
      { id: 'z6', inscripcion_id: 'i3', concepto: 'Cuota de noviembre', importe_centimos: 3000, vence: dia(3), estado: 'pendiente', metodo: 'sepa' },
      { id: 'z7', inscripcion_id: 'i4', concepto: 'Cuota de octubre', importe_centimos: 3500, vence: '2026-10-05', estado: 'pendiente', metodo: 'efectivo' },
      { id: 'z8', inscripcion_id: 'i4', concepto: 'Cuota de noviembre', importe_centimos: 3500, vence: dia(3), estado: 'pendiente', metodo: 'efectivo' },
      { id: 'z9', inscripcion_id: 'i5', concepto: 'Cuota de octubre', importe_centimos: 3500, vence: '2026-10-05', estado: 'devuelto', metodo: 'sepa', devuelto_motivo: 'Fondos insuficientes' },
      { id: 'z10', inscripcion_id: 'i5', concepto: 'Cuota de noviembre', importe_centimos: 3500, vence: dia(3), estado: 'pendiente', metodo: 'sepa' }
    ];

    var cobros = [
      { id: 'k1', cliente_id: 'c1', plazo_id: 'z1', fecha: '2026-09-12', importe_centimos: 9000, metodo: 'tarjeta' },
      { id: 'k2', cliente_id: 'c1', plazo_id: 'z4', fecha: '2026-10-07', importe_centimos: 3500, metodo: 'sepa' },
      { id: 'k3', cliente_id: 'c3', plazo_id: 'z9', fecha: '2026-10-07', importe_centimos: 3500, metodo: 'sepa' },
      { id: 'k4', cliente_id: 'c3', plazo_id: 'z9', fecha: '2026-10-14', importe_centimos: -3500, metodo: 'sepa', notas: 'Devolución del banco' },
      { id: 'k5', cliente_id: 'c4', plazo_id: null, fecha: dia(-1), importe_centimos: 48000, metodo: 'transferencia', referencia: 'AMPA-OCT', notas: 'Octubre, patinaje' }
    ];

    function plazosDe(clienteId) {
      var ids = inscripciones.filter(function (i) { return i.cliente_id === clienteId; }).map(function (i) { return i.id; });
      return plazos.filter(function (p) { return ids.indexOf(p.inscripcion_id) >= 0; });
    }
    function resumen(c) {
      var n = cuentaPlazos(plazosDe(c.id), hoy);
      return {
        id: c.id, tipo: c.tipo, nombre: c.nombre, email: c.email, telefono: c.telefono, etiquetas: c.etiquetas,
        domiciliado: !!c.sepa,
        personas: personas.filter(function (p) { return p.cliente_id === c.id; }),
        inscripciones_activas: inscripciones.filter(function (i) { return i.cliente_id === c.id && i.estado === 'activa'; }).length,
        debe_centimos: n.debe, plazos_vencidos: n.vencidos, plazos_devueltos: n.devueltos, creado: c.creado
      };
    }
    function espera(v) {
      /* un poco de espera para ver los estados de carga */
      return new Promise(function (ok) { setTimeout(function () { ok(JSON.parse(JSON.stringify(v))); }, 350); });
    }
    /* ?demo=vacio y ?demo=error para ver esos estados */
    var modo = (location.search.match(/demo=(\w+)/) || [])[1];
    function fallo() { return new Promise(function (_, mal) { setTimeout(function () { mal(new Error('Sin conexión (prueba)')); }, 350); }); }

    return {
      listarClientes: function (f) {
        if (modo === 'error') return fallo();
        if (modo === 'vacio') return espera([]);
        return espera(filtrar(clientes.map(resumen), f));
      },
      obtenerCliente: function (id) {
        if (modo === 'error') return fallo();
        var c = clientes.filter(function (x) { return x.id === id; })[0];
        if (!c) return espera(null);
        var ins = inscripciones.filter(function (i) { return i.cliente_id === id; }).map(function (i) {
          var r = Object.assign({}, i);
          r.actividad = actividades[i.actividad_id];
          r.persona = personas.filter(function (p) { return p.id === i.persona_id; })[0] || null;
          return r;
        });
        var pz = plazosDe(id).map(function (p) {
          var r = Object.assign({}, p);
          var i = ins.filter(function (x) { return x.id === p.inscripcion_id; })[0];
          r.actividad = i && i.actividad; r.persona = i && i.persona;
          return r;
        });
        return espera({
          cliente: { id: c.id, tipo: c.tipo, nombre: c.nombre, nif: c.nif || '', email: c.email, telefono: c.telefono,
            direccion: c.direccion, etiquetas: c.etiquetas, notas: c.notas, domiciliado: !!c.sepa,
            mandato_fecha: c.mandato_fecha || null, creado: c.creado },
          personas: personas.filter(function (p) { return p.cliente_id === id; }),
          inscripciones: ins,
          plazos: pz,
          cobros: cobros.filter(function (k) { return k.cliente_id === id; })
        });
      },
      guardarNotas: function (id, notas) {
        clientes.forEach(function (c) { if (c.id === id) c.notas = notas; });
        return espera(true);
      },

      /* ---- cobros ---- */
      listarPlazos: function () {
        if (modo === 'error') return fallo();
        if (modo === 'vacio') return espera([]);
        return espera(plazos.map(function (p) {
          var i = inscripciones.filter(function (x) { return x.id === p.inscripcion_id; })[0] || {};
          var c = clientes.filter(function (x) { return x.id === i.cliente_id; })[0] || {};
          var per = personas.filter(function (x) { return x.id === i.persona_id; })[0];
          return Object.assign({}, p, {
            cliente: { id: c.id, nombre: c.nombre, nif: c.nif || '' },
            actividad: actividades[i.actividad_id] || null,
            persona: per ? { nombre: per.nombre } : null,
            sepa_posible: !!c.sepa
          });
        }));
      },
      listarCobros: function (desde, hasta) {
        if (modo === 'error') return fallo();
        if (modo === 'vacio') return espera([]);
        return espera(cobros.filter(function (k) { return k.fecha >= desde && k.fecha <= hasta; }).map(function (k) {
          var c = clientes.filter(function (x) { return x.id === k.cliente_id; })[0] || {};
          var p = plazos.filter(function (x) { return x.id === k.plazo_id; })[0] || {};
          return Object.assign({}, k, { cliente: { nombre: c.nombre, nif: c.nif || '' }, concepto: p.concepto || '' });
        }));
      },
      apuntarCobro: function (plazoId, d) {
        var p = plazos.filter(function (x) { return x.id === plazoId; })[0];
        if (!p || (p.estado !== 'pendiente' && p.estado !== 'devuelto')) return Promise.reject(new Error('Ese plazo ya no está pendiente'));
        if (!(d.importe_centimos > 0 && d.importe_centimos <= p.importe_centimos)) return Promise.reject(new Error('Importe no válido'));
        if (d.importe_centimos < p.importe_centimos) {
          plazos.push(Object.assign({}, p, { id: 'z' + (plazos.length + 100), concepto: p.concepto + ' (resto)',
            importe_centimos: p.importe_centimos - d.importe_centimos, estado: 'pendiente' }));
          p.importe_centimos = d.importe_centimos;
        }
        p.estado = 'cobrado'; p.metodo = d.metodo;
        var i = inscripciones.filter(function (x) { return x.id === p.inscripcion_id; })[0] || {};
        cobros.push({ id: 'k' + (cobros.length + 100), cliente_id: i.cliente_id, plazo_id: p.id, fecha: d.fecha,
          importe_centimos: d.importe_centimos, metodo: d.metodo, referencia: d.referencia || null, notas: d.notas || null });
        return espera(plazoId);
      },
      cobrarSepa: function (plazoId) {
        var p = plazos.filter(function (x) { return x.id === plazoId; })[0];
        if (p && (p.estado === 'pendiente' || p.estado === 'devuelto')) { p.estado = 'procesando'; return espera({ lanzados: 1, saltados: [], errores: [] }); }
        return espera({ lanzados: 0, saltados: [(p && p.concepto) + ': ya no está pendiente'], errores: [] });
      },

      /* ---- alta, edición y unión ---- */
      guardarCliente: function (d) {
        var email = (d.email || '').trim().toLowerCase();
        var otro = email && clientes.filter(function (c) { return (c.email || '').toLowerCase() === email && c.id !== d.id; })[0];
        if (otro) {
          var e = new Error('Ya hay otro cliente con el email ' + email);
          e.duplicado = true; e.otroId = otro.id;
          return new Promise(function (_, mal) { setTimeout(function () { mal(e); }, 300); });
        }
        var c = d.id && clientes.filter(function (x) { return x.id === d.id; })[0];
        if (!c) { c = { id: 'c' + (clientes.length + 100), creado: hoy, sepa: false }; clientes.push(c); }
        ['tipo', 'nombre', 'nif', 'telefono', 'direccion', 'notas'].forEach(function (k) { c[k] = d[k] || ''; });
        c.email = email; c.etiquetas = d.etiquetas || [];
        for (var b = 0; b < (d.borrar_personas || []).length; b++) {
          var id = d.borrar_personas[b];
          if (inscripciones.some(function (i) { return i.persona_id === id && i.estado !== 'baja'; })) {
            var nombre = (personas.filter(function (p) { return p.id === id; })[0] || {}).nombre;
            return Promise.reject(new Error('No se puede quitar a ' + nombre + ' porque está inscrito en una actividad'));
          }
        }
        personas = personas.filter(function (p) { return (d.borrar_personas || []).indexOf(p.id) < 0; });
        (d.personas || []).forEach(function (p) {
          if (!p.nombre) return;
          var x = p.id && personas.filter(function (y) { return y.id === p.id; })[0];
          if (!x) { x = { id: 'p' + (personas.length + 100), cliente_id: c.id }; personas.push(x); }
          Object.assign(x, p, { id: x.id, cliente_id: c.id });
        });
        return espera(c.id);
      },
      unirPersonas: function (queda, seVa) {
        var q = personas.filter(function (p) { return p.id === queda; })[0];
        var s = personas.filter(function (p) { return p.id === seVa; })[0];
        if (!q || !s) return Promise.reject(new Error('Alguna de las dos personas no existe'));
        inscripciones.forEach(function (i) {
          if (i.persona_id !== seVa) return;
          var choca = inscripciones.some(function (x) { return x.persona_id === queda && x.actividad_id === i.actividad_id && x.estado !== 'baja'; });
          if (choca && i.estado !== 'baja') { i.estado = 'baja'; i.notas = 'Duplicada: se unió con otra ficha del mismo niño'; }
          i.persona_id = queda;
        });
        q.salud = Object.assign({}, s.salud || {}, q.salud || {});
        q.nacimiento = q.nacimiento || s.nacimiento; q.anyo_nacimiento = q.anyo_nacimiento || s.anyo_nacimiento;
        personas = personas.filter(function (p) { return p.id !== seVa; });
        return espera(queda);
      },
      unirClientes: function (queda, seVa) {
        var q = clientes.filter(function (c) { return c.id === queda; })[0];
        var s = clientes.filter(function (c) { return c.id === seVa; })[0];
        if (!q || !s) return Promise.reject(new Error('Alguna de las dos fichas no existe'));
        personas.forEach(function (p) { if (p.cliente_id === seVa) p.cliente_id = queda; });
        inscripciones.forEach(function (i) { if (i.cliente_id === seVa) i.cliente_id = queda; });
        cobros.forEach(function (k) { if (k.cliente_id === seVa) k.cliente_id = queda; });
        ['nif', 'email', 'telefono', 'direccion'].forEach(function (k) { q[k] = q[k] || s[k]; });
        q.sepa = q.sepa || s.sepa;
        q.notas = [q.notas, s.notas, s.email && q.email !== s.email ? 'Otro email: ' + s.email : ''].filter(Boolean).join('\n');
        clientes = clientes.filter(function (c) { return c.id !== seVa; });
        return espera(queda);
      }
    };
  }

  /* ================= versión real (Supabase) ================== */

  function real(sb) {
    var hoy = window.PANEL.hoy();

    function ok(r) {
      if (r.error) {
        var e = new Error(r.error.message);
        /* tabla que aún no existe: PGRST205 (caché de esquema) o 42P01 */
        e.sinTablas = r.error.code === 'PGRST205' || r.error.code === '42P01';
        throw e;
      }
      return r.data;
    }

    return {
      listarClientes: function (f) {
        return Promise.all([
          sb.from('clientes').select('id,tipo,nombre,email,telefono,etiquetas,sepa_pm,created_at,personas(id,nombre,rol),inscripciones(id,estado)')
            .order('nombre').then(ok),
          sb.from('v_deuda_clientes').select('*').then(ok)
        ]).then(function (r) {
          var deuda = {};
          r[1].forEach(function (d) { deuda[d.cliente_id] = d; });
          var lista = r[0].map(function (c) {
            var d = deuda[c.id] || {};
            return {
              id: c.id, tipo: c.tipo, nombre: c.nombre, email: c.email, telefono: c.telefono, etiquetas: c.etiquetas || [],
              domiciliado: !!c.sepa_pm, personas: c.personas || [],
              inscripciones_activas: (c.inscripciones || []).filter(function (i) { return i.estado === 'activa'; }).length,
              debe_centimos: d.debe_centimos || 0, plazos_vencidos: d.plazos_vencidos || 0, plazos_devueltos: d.plazos_devueltos || 0,
              creado: c.created_at
            };
          });
          return filtrar(lista, f);
        });
      },
      obtenerCliente: function (id) {
        return Promise.all([
          sb.from('clientes').select('*').eq('id', id).maybeSingle().then(ok),
          sb.from('personas').select('*').eq('cliente_id', id).order('rol').order('nombre').then(ok),
          sb.from('inscripciones').select('*, actividad:actividades(id,tipo,nombre,empieza,termina), persona:personas(id,nombre)')
            .eq('cliente_id', id).order('alta', { ascending: false }).then(ok),
          sb.from('cobros').select('*').eq('cliente_id', id).order('fecha', { ascending: false }).then(ok)
        ]).then(function (r) {
          var c = r[0];
          if (!c) return null;
          var ins = r[2];
          var idsIns = ins.map(function (i) { return i.id; });
          var idsRes = ins.map(function (i) { return i.reserva_id; }).filter(Boolean);
          var consultas = [];
          if (idsIns.length) consultas.push(sb.from('plazos').select('*').in('inscripcion_id', idsIns).then(ok));
          if (idsRes.length) consultas.push(sb.from('plazos').select('*').in('reserva_id', idsRes).then(ok));
          return Promise.all(consultas).then(function (listas) {
            var vistos = {}, pz = [];
            listas.forEach(function (l) { l.forEach(function (p) { if (!vistos[p.id]) { vistos[p.id] = 1; pz.push(p); } }); });
            pz.forEach(function (p) {
              var i = ins.filter(function (x) { return x.id === p.inscripcion_id || (p.reserva_id && x.reserva_id === p.reserva_id); })[0];
              p.actividad = i && i.actividad; p.persona = i && i.persona;
            });
            pz.sort(function (a, b) { return a.vence < b.vence ? -1 : 1; });
            return {
              cliente: { id: c.id, tipo: c.tipo, nombre: c.nombre, nif: c.nif || '', email: c.email, telefono: c.telefono,
                direccion: c.direccion, etiquetas: c.etiquetas || [], notas: c.notas || '', domiciliado: !!c.sepa_pm,
                mandato_fecha: c.mandato_fecha, creado: c.created_at },
              personas: r[1], inscripciones: ins, plazos: pz, cobros: r[3]
            };
          });
        });
      },
      guardarNotas: function (id, notas) {
        return sb.from('clientes').update({ notas: notas }).eq('id', id).then(ok).then(function () { return true; });
      },

      /* ---- cobros ---- */
      listarPlazos: function () {
        return Promise.all([
          sb.from('plazos').select('*').order('vence').then(ok),
          sb.from('inscripciones').select('id,reserva_id,cliente_id, actividad:actividades(nombre,tipo), persona:personas(nombre), cliente:clientes(id,nombre,nif)').then(ok),
          /* plazos-cobrar cobra contra el mandato de la RESERVA */
          sb.from('reservas').select('id,sepa_pm').not('sepa_pm', 'is', null).then(ok)
        ]).then(function (r) {
          var porId = {}, porReserva = {}, conSepa = {};
          r[1].forEach(function (i) { porId[i.id] = i; if (i.reserva_id) porReserva[i.reserva_id] = i; });
          r[2].forEach(function (x) { conSepa[x.id] = true; });
          return r[0].map(function (p) {
            var i = porId[p.inscripcion_id] || porReserva[p.reserva_id] || {};
            return Object.assign({}, p, {
              cliente: i.cliente || { id: null, nombre: 'Sin cliente', nif: '' },
              actividad: i.actividad || null,
              persona: i.persona || null,
              sepa_posible: !!(p.reserva_id && conSepa[p.reserva_id])
            });
          });
        });
      },
      listarCobros: function (desde, hasta) {
        return sb.from('cobros').select('*, cliente:clientes(nombre,nif), plazo:plazos(concepto)')
          .gte('fecha', desde).lte('fecha', hasta).order('fecha').then(ok).then(function (l) {
            return l.map(function (k) { k.concepto = k.plazo ? k.plazo.concepto : ''; return k; });
          });
      },
      apuntarCobro: function (plazoId, d) {
        return sb.rpc('apuntar_cobro', {
          p_plazo: plazoId, p_importe_centimos: d.importe_centimos, p_metodo: d.metodo,
          p_fecha: d.fecha, p_referencia: d.referencia || null, p_notas: d.notas || null
        }).then(ok);
      },
      cobrarSepa: function (plazoId) {
        return sb.functions.invoke('plazos-cobrar', { body: { plazo: plazoId } }).then(function (r) {
          if (r.error) {
            /* la función contesta con un mensaje propio cuando dice que no */
            return (r.error.context && r.error.context.json ? r.error.context.json() : Promise.resolve({}))
              .catch(function () { return {}; })
              .then(function (j) { throw new Error(j.mensaje || j.error || r.error.message); });
          }
          return r.data;
        });
      },

      /* ---- alta, edición y unión ---- */
      guardarCliente: function (d) {
        return sb.rpc('guardar_cliente', { datos: d }).then(function (r) {
          if (r.error && r.error.code === '23505') {
            var e = new Error(r.error.message);
            e.duplicado = true; e.otroId = r.error.hint || null;
            throw e;
          }
          return ok(r);
        });
      },
      unirPersonas: function (queda, seVa) {
        return sb.rpc('unir_personas', { p_queda: queda, p_se_va: seVa }).then(ok);
      },
      unirClientes: function (queda, seVa) {
        return sb.rpc('unir_clientes', { p_queda: queda, p_se_va: seVa }).then(ok);
      }
    };
  }

  window.DATOS_PANEL = {
    crear: function (sesion) { return sesion.demo ? demo() : real(sesion.cliente); },
    cuentaPlazos: cuentaPlazos
  };
})();
