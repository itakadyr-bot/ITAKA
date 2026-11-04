/* ============================================================
   INICIO · portada del panel · /admin/inicio/
   ------------------------------------------------------------
   Lo primero que se ve al entrar: saludo, cifras del dinero, la
   agenda de cobros de los próximos 7 días, «Cobrar ya» (lo vencido
   y devuelto por cliente) y las novedades de la semana.
   Todo sale de las mismas funciones que Clientes y Cobros.
   ============================================================ */
(function () {
  'use strict';

  var P = window.PANEL;
  var esc = P.esc;
  var hoy = P.hoy();

  ['a-nuevo', 'a-cobros', 'a-importar', 'ver-cobros'].forEach(function (id) {
    var a = document.getElementById(id);
    var ruta = { 'a-nuevo': 'admin/clientes/editar/', 'a-cobros': 'admin/cobros/', 'a-importar': 'admin/clientes/importar/', 'ver-cobros': 'admin/cobros/' }[id];
    a.href = P.enlace(ruta);
  });

  var hora = new Date().getHours();
  var saludo = hora < 14 ? 'Buenos días' : hora < 21 ? 'Buenas tardes' : 'Buenas noches';
  var dia = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  document.getElementById('fecha').textContent = 'Gestión / ' + dia;

  P.entrar().then(function (sesion) {
    /* el nombre solo si el correo parece un nombre (ana@…, pablo.gil@…) */
    var local = (sesion.email || '').split('@')[0].split(/[._-]/)[0];
    var nombre = /^[a-záéíóúñ]{3,12}$/i.test(local) && !/^(info|admin|itaka|itakadyr|hola|contacto|gestion)/i.test(local)
      ? local[0].toUpperCase() + local.slice(1).toLowerCase() : '';
    document.getElementById('saludo').textContent = saludo + (nombre ? ', ' + nombre : '') + '.';
    var DATOS = window.DATOS_PANEL.crear(sesion);
    return Promise.all([DATOS.listarClientes({}), DATOS.listarPlazos(), DATOS.listarCobros(hoy.slice(0, 8) + '01', hoy)]);
  }).then(function (r) {
    pintar(r[0], r[1], r[2]);
  }).catch(function (e) {
    document.getElementById('resumen').textContent = 'No se ha podido cargar: ' + e.message + '.';
    document.getElementById('cifras').setAttribute('aria-busy', 'false');
    document.querySelectorAll('#cifras dd').forEach(function (d) { d.textContent = '—'; });
    document.getElementById('agenda').innerHTML = '<li><p>Sin datos.</p></li>';
  });

  function suma(l) { return l.reduce(function (s, x) { return s + x.importe_centimos; }, 0); }
  function cuenta(n, una, varias) { return n + ' ' + (n === 1 ? una : varias); }

  function pintar(clientes, plazos, cobrosMes) {
    var vencidos = plazos.filter(function (p) { return p.estado === 'pendiente' && p.vence < hoy; });
    var devueltos = plazos.filter(function (p) { return p.estado === 'devuelto'; });
    var lim = new Date(); lim.setDate(lim.getDate() + 7);
    var hasta = lim.toISOString().slice(0, 10);
    var semana = plazos.filter(function (p) { return p.estado === 'pendiente' && p.vence >= hoy && p.vence <= hasta; })
      .sort(function (a, b) { return a.vence < b.vence ? -1 : 1; });
    var activas = clientes.reduce(function (s, c) { return s + c.inscripciones_activas; }, 0);

    /* resumen en una frase */
    var cosas = vencidos.length + devueltos.length;
    document.getElementById('resumen').textContent = cosas
      ? 'Hay ' + cuenta(cosas, 'cobro que mirar', 'cobros que mirar') + ' y ' + cuenta(semana.length, 'plazo', 'plazos') + ' que vencen esta semana.'
      : semana.length ? 'Todo al día. Esta semana vencen ' + cuenta(semana.length, 'plazo', 'plazos') + '.' : 'Todo al día. Nada vence esta semana.';

    var cifras = document.getElementById('cifras');
    cifras.innerHTML =
      '<div' + (vencidos.length ? ' class="peligro"' : '') + '><dt>Vencido</dt><dd>' + P.euros(suma(vencidos)) + '</dd><div class="pn-nota">' + cuenta(vencidos.length, 'plazo', 'plazos') + '</div></div>' +
      '<div' + (devueltos.length ? ' class="peligro"' : '') + '><dt>Devuelto</dt><dd>' + P.euros(suma(devueltos)) + '</dd><div class="pn-nota">' + cuenta(devueltos.length, 'recibo', 'recibos') + '</div></div>' +
      '<div><dt>Cobrado este mes</dt><dd>' + P.euros(suma(cobrosMes)) + '</dd><div class="pn-nota">' + cuenta(cobrosMes.length, 'movimiento', 'movimientos') + '</div></div>' +
      '<div><dt>Inscripciones activas</dt><dd>' + activas + '</dd><div class="pn-nota">' + cuenta(clientes.length, 'cliente', 'clientes') + '</div></div>';
    cifras.setAttribute('aria-busy', 'false');

    /* agenda: vencimientos de la semana */
    var ag = document.getElementById('agenda');
    ag.setAttribute('aria-busy', 'false');
    ag.innerHTML = semana.length ? semana.slice(0, 8).map(function (p) {
      var dias = Math.round((new Date(p.vence) - new Date(hoy)) / 864e5);
      var cuando = dias === 0 ? 'hoy' : dias === 1 ? 'mañana' : 'en ' + dias + ' días';
      return '<li><span class="pn-hora">' + P.fechaCorta(p.vence) + '</span><div><h3><a href="' + ficha(p) + '">' + esc(p.cliente.nombre) + '</a></h3>' +
        '<p>' + esc([p.concepto, p.persona && p.persona.nombre.split(' ')[0]].filter(Boolean).join(' · ')) + ' · ' + P.euros(p.importe_centimos) + '</p></div>' +
        '<span class="pn-chip' + (dias <= 1 ? ' aviso' : '') + '">' + cuando + '</span></li>';
    }).join('') + (semana.length > 8 ? '<li><p>Y ' + (semana.length - 8) + ' más en Cobros.</p></li>' : '')
      : '<li><div><h3>Nada vence esta semana</h3><p>Cuando haya plazos cerca, saldrán aquí.</p></div></li>';

    /* cobrar ya: lo vencido y devuelto, por cliente */
    var porCliente = {};
    vencidos.concat(devueltos).forEach(function (p) {
      var k = p.cliente.id || p.cliente.nombre;
      if (!porCliente[k]) porCliente[k] = { cliente: p.cliente, plazos: [] };
      porCliente[k].plazos.push(p);
    });
    var grupos = Object.keys(porCliente).map(function (k) { return porCliente[k]; })
      .sort(function (a, b) { return suma(b.plazos) - suma(a.plazos); });
    document.getElementById('cuenta-cobrar').textContent = grupos.length ? cuenta(grupos.length, 'cliente', 'clientes') : 'nada';
    document.getElementById('cobrar').innerHTML = grupos.length ? grupos.map(function (g) {
      var devuelto = g.plazos.some(function (p) { return p.estado === 'devuelto'; });
      var masViejo = g.plazos.reduce(function (m, p) { return p.vence < m ? p.vence : m; }, '9999');
      var dias = Math.round((new Date(hoy) - new Date(masViejo)) / 864e5);
      return '<article class="pn-tarjeta"><div class="arriba"><span class="pn-iniciales" aria-hidden="true">' + esc(P.iniciales(g.cliente.nombre)) + '</span>' +
        '<strong style="color:var(--c-text-strong);overflow-wrap:anywhere">' + esc(g.cliente.nombre) + '</strong><span class="importe">' + P.euros(suma(g.plazos)) + '</span></div>' +
        '<div>' + (devuelto ? '<span class="pn-chip mal">Devuelto</span>' : '<span class="pn-chip mal">Vencido · ' + dias + (dias === 1 ? ' día' : ' días') + '</span>') + '</div>' +
        '<div class="detalle">' + esc(g.plazos.map(function (p) { return p.concepto; }).join(' · ')) + '</div>' +
        '<a class="pn-boton peq" href="' + P.enlace('admin/cobros/?cliente=' + encodeURIComponent(g.cliente.id || '')) + '">Cobrar</a></article>';
    }).join('') : '<div class="pn-vacio" style="grid-column:1/-1;padding:var(--s-5)"><i data-lucide="check-circle" aria-hidden="true"></i><h3>Nada vencido</h3><p>Todo lo que tocaba está cobrado.</p></div>';

    /* novedades: clientes nuevos de los últimos 7 días */
    var hace7 = new Date(); hace7.setDate(hace7.getDate() - 7);
    var nuevos = clientes.filter(function (c) { return c.creado && new Date(c.creado) >= hace7; });
    document.getElementById('nuevos').innerHTML = nuevos.length ? nuevos.slice(0, 6).map(function (c) {
      return '<li style="grid-template-columns:auto minmax(0,1fr)"><span class="pn-iniciales" aria-hidden="true">' + esc(P.iniciales(c.nombre)) + '</span>' +
        '<div><h3><a href="' + P.enlace('admin/clientes/ficha/?id=' + encodeURIComponent(c.id)) + '">' + esc(c.nombre) + '</a></h3><p>Nuevo cliente · ' + P.fechaCorta(c.creado) + '</p></div></li>';
    }).join('') : '<li style="grid-template-columns:minmax(0,1fr)"><div><h3>Sin novedades</h3><p>Nadie nuevo en los últimos 7 días.</p></div></li>';
    P.iconos();
  }

  function ficha(p) {
    return p.cliente && p.cliente.id ? P.enlace('admin/clientes/ficha/?id=' + encodeURIComponent(p.cliente.id)) + '#pagos' : '#';
  }
})();
