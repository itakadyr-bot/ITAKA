/* ============================================================
   CLIENTES · ficha (S02) · /admin/clientes/ficha/?id=…
   ------------------------------------------------------------
   Todo de un cliente en una página: quién es, a qué está apuntado,
   qué ha pagado, qué debe, y lo que hay que saber antes de llamar.
   Los datos de salud de los niños solo se ven aquí (y solo
   administración puede leerlos: RLS en `personas`).
   ============================================================ */
(function () {
  'use strict';

  var P = window.PANEL;
  var esc = P.esc;
  var main = document.getElementById('contenido');
  var id = new URLSearchParams(location.search).get('id');

  var TIPOS = { familia: 'Familia', colegio: 'Colegio', ampa: 'AMPA', ayuntamiento: 'Ayuntamiento', empresa: 'Empresa', otro: 'Cliente' };
  var TIPO_ACT = { campamento: 'Campamento', extraescolar: 'Extraescolar', campus: 'Campus', evento: 'Evento', servicio: 'Servicio' };
  var ROL = { tutor: 'Tutor o tutora', participante: 'Participante', contacto: 'Contacto' };
  var METODO = { sepa: 'Domiciliación', tarjeta: 'Tarjeta', efectivo: 'Efectivo', transferencia: 'Transferencia' };
  var DATOS = null;

  P.entrar().then(function (sesion) {
    DATOS = window.DATOS_PANEL.crear(sesion);
    if (!id) return null;
    return DATOS.obtenerCliente(id);
  }).then(function (f) {
    main.setAttribute('aria-busy', 'false');
    if (!f) return noEncontrado();
    pintar(f);
  }).catch(function (e) {
    main.setAttribute('aria-busy', 'false');
    main.innerHTML = '<div class="pn-tarjeta pn-cuerpo"><div class="pn-aviso mal" role="alert"><i data-lucide="x-circle" aria-hidden="true"></i><div>' +
      esc(e.sinTablas
        ? 'La base de datos todavía no tiene las tablas de clientes. Hay que aplicar el esquema nuevo.'
        : 'No se ha podido cargar la ficha: ' + e.message + '.') +
      '<div style="margin-top:var(--s-3);display:flex;gap:var(--s-2);flex-wrap:wrap"><button class="pn-boton peq" onclick="location.reload()">Reintentar</button>' +
      '<a class="pn-boton peq" href="' + P.enlace('admin/clientes/') + '">Volver a clientes</a></div></div></div></div>';
    P.iconos();
  });

  function noEncontrado() {
    main.innerHTML = '<div class="pn-tarjeta pn-vacio"><i data-lucide="user-x" aria-hidden="true"></i><h3>No encontramos este cliente</h3>' +
      '<p>Puede que se haya borrado o que el enlace esté incompleto.</p><a class="pn-boton primario" href="' + P.enlace('admin/clientes/') + '">Ver todos los clientes</a></div>';
    document.title = 'Cliente no encontrado — Gestión de Ítaka';
    P.iconos();
  }

  /* ------------------- la ficha -------------------------------- */

  function pintar(f) {
    var c = f.cliente;
    var hoy = P.hoy();
    var n = window.DATOS_PANEL.cuentaPlazos(f.plazos, hoy);
    var activas = f.inscripciones.filter(function (i) { return i.estado === 'activa'; });
    var cobrado = f.cobros.reduce(function (s, k) { return s + k.importe_centimos; }, 0);
    var ninos = f.personas.filter(function (p) { return p.rol === 'participante'; });

    document.title = c.nombre + ' — Gestión de Ítaka';
    var miga = document.querySelector('.pn-ruta li:last-child');
    if (miga) miga.textContent = c.nombre;

    var contacto = [c.telefono, c.email].filter(Boolean);
    var desde = c.creado ? 'cliente desde ' + P.fechaLarga(c.creado).replace(/^\d+ de /, '') : '';

    main.innerHTML =
      '<div class="pn-cabecera"><div>' +
        '<p class="pn-antetitulo">' + esc([TIPOS[c.tipo] || 'Cliente', desde].filter(Boolean).join(' · ')) + '</p>' +
        '<h1>' + esc(c.nombre) + '</h1>' +
        '<p class="pn-subtitulo">' + (contacto.length ? esc(contacto.join(' · ')) : 'Sin teléfono ni email apuntados') + '</p>' +
      '</div><div class="pn-acciones-pag">' +
        (c.telefono ? '<a class="pn-boton" href="tel:' + esc(c.telefono.replace(/\s/g, '')) + '"><i data-lucide="phone" aria-hidden="true"></i>Llamar</a>' : '') +
        (c.email ? '<a class="pn-boton" href="mailto:' + esc(c.email) + '"><i data-lucide="mail" aria-hidden="true"></i>Escribir</a>' : '') +
        '<a class="pn-boton primario" aria-disabled="true" title="Llega con la pantalla de cobros"><i data-lucide="plus" aria-hidden="true"></i>Apuntar cobro</a>' +
      '</div></div>' +

      '<dl class="pn-cifras">' +
        '<div><dt>Inscripciones activas</dt><dd>' + activas.length + '</dd><div class="pn-nota">' +
          esc(ninos.length ? ninos.length + (ninos.length === 1 ? ' niño o niña' : ' niños') : (c.tipo === 'familia' ? 'Sin niños apuntados' : 'Contrato de institución')) + '</div></div>' +
        '<div><dt>Pendiente</dt><dd>' + P.euros(n.debe) + '</dd><div class="pn-nota">' +
          (n.pendientes + n.devueltos ? (n.pendientes + n.devueltos) + ' plazos por cobrar' : 'Nada por cobrar') + '</div></div>' +
        '<div' + (n.vencidos + n.devueltos ? ' class="peligro"' : '') + '><dt>Vencido o devuelto</dt><dd>' + (n.vencidos + n.devueltos) + '</dd><div class="pn-nota">' +
          (n.devueltos ? n.devueltos + ' devuelto por el banco' : n.vencidos ? 'Pasada la fecha' : 'Todo a tiempo') + '</div></div>' +
        '<div><dt>Cobrado</dt><dd>' + P.euros(cobrado) + '</dd><div class="pn-nota">' + f.cobros.length + (f.cobros.length === 1 ? ' movimiento' : ' movimientos') + '</div></div>' +
      '</dl>' +

      '<div class="pn-columnas">' +
        '<section class="pn-tarjeta" aria-label="Detalle">' +
          '<div class="pn-pestanas" role="tablist" aria-label="Ficha" id="pestanas">' +
            pestana('personas', 'Personas', f.personas.length, true) +
            pestana('inscripciones', 'Inscripciones', f.inscripciones.length) +
            pestana('pagos', 'Pagos', f.plazos.length) +
            pestana('movimientos', 'Movimientos', f.cobros.length) +
          '</div>' +
          panel('personas', personas(f.personas, c), true) +
          panel('inscripciones', inscripciones(f.inscripciones)) +
          panel('pagos', pagos(f.plazos, hoy)) +
          panel('movimientos', movimientos(f.cobros)) +
        '</section>' +
        '<aside>' + avisos(f, n, c) + datos(c) + notas(c) + '</aside>' +
      '</div>';

    activarPestanas();
    activarNotas(c);
    P.iconos();
  }

  function pestana(clave, texto, n, sel) {
    return '<button class="pn-pestana" role="tab" id="t-' + clave + '" aria-controls="p-' + clave + '" aria-selected="' + (sel ? 'true' : 'false') + '"' +
      (sel ? '' : ' tabindex="-1"') + '>' + esc(texto) + '<span class="pn-cuenta">' + n + '</span></button>';
  }
  function panel(clave, html, sel) {
    return '<div role="tabpanel" id="p-' + clave + '" aria-labelledby="t-' + clave + '" tabindex="0"' + (sel ? '' : ' hidden') + '>' + html + '</div>';
  }
  function vacio(icono, titulo, texto) {
    return '<div class="pn-vacio"><i data-lucide="' + icono + '" aria-hidden="true"></i><h3>' + esc(titulo) + '</h3><p>' + esc(texto) + '</p></div>';
  }

  /* ------------------- pestañas -------------------------------- */

  function personas(lista, c) {
    if (!lista.length) return vacio('user-plus', 'Sin personas apuntadas', c.tipo === 'familia'
      ? 'Los niños y sus tutores aparecen al reservar en la web.' : 'Apunta aquí a la persona de contacto.');
    var orden = { participante: 0, tutor: 1, contacto: 2 };
    lista = lista.slice().sort(function (a, b) { return orden[a.rol] - orden[b.rol]; });
    return '<ul class="pn-filas">' + lista.map(function (p) {
      var edad = P.edad(p.nacimiento);
      var salud = p.salud || {};
      var aut = p.autorizaciones || {};
      var detalle = [ROL[p.rol] || p.rol];
      if (edad != null) detalle.push(edad + ' años');
      /* de la web a veces solo llega el año: edad aproximada */
      else if (p.anyo_nacimiento) detalle.push('año de nacimiento ' + p.anyo_nacimiento + ' (unos ' + (new Date().getFullYear() - p.anyo_nacimiento) + ' años)');
      if (p.telefono) detalle.push(p.telefono);
      var datosSalud = '';
      if (p.rol === 'participante') {
        var filas = [];
        if (salud.alergias) filas.push('<div class="sensible"><dt>Alergias</dt><dd>' + esc(salud.alergias) + '</dd></div>');
        if (salud.observaciones) filas.push('<div><dt>Observaciones</dt><dd>' + esc(salud.observaciones) + '</dd></div>');
        if (salud.sip) filas.push('<div><dt>SIP</dt><dd>' + esc(salud.sip) + '</dd></div>');
        if (aut.fotos) filas.push('<div><dt>Fotos</dt><dd>' + (/^(s|si|sí|true)$/i.test(String(aut.fotos)) ? 'Autoriza' : 'No autoriza') + '</dd></div>');
        if (filas.length) datosSalud = '<dl class="pn-datos" style="margin-top:var(--s-3)">' + filas.join('') + '</dl>';
      }
      return '<li style="grid-template-columns:minmax(0,1fr)"><div><h3>' + esc(p.nombre) + '</h3><p>' + esc(detalle.join(' · ')) + '</p>' + datosSalud + '</div></li>';
    }).join('') + '</ul>';
  }

  function chipInscripcion(e) {
    return { activa: '<span class="pn-chip ok">Activa</span>', pendiente: '<span class="pn-chip">Sin confirmar</span>',
      espera: '<span class="pn-chip info">Lista de espera</span>', baja: '<span class="pn-chip mal">Baja</span>' }[e] || esc(e);
  }

  function inscripciones(lista) {
    if (!lista.length) return vacio('calendar-x', 'Sin inscripciones', 'Cuando se apunte a una actividad, aparecerá aquí.');
    return '<ul class="pn-filas">' + lista.map(function (i) {
      var a = i.actividad || {};
      var fechas = a.empieza ? P.fechaCorta(a.empieza) + (a.termina && a.termina !== a.empieza ? ' – ' + P.fechaCorta(a.termina) : '') : '';
      var detalle = [TIPO_ACT[a.tipo] || '', i.persona ? i.persona.nombre : '', fechas].filter(Boolean).join(' · ');
      return '<li><span class="pn-hora">' + (a.empieza ? P.fechaCorta(a.empieza) : '—') + '</span>' +
        '<div><h3>' + esc(a.nombre || 'Actividad') + '</h3><p>' + esc(detalle) + '</p></div>' +
        '<div style="display:grid;gap:6px;justify-items:end">' + chipInscripcion(i.estado) +
        (i.importe_centimos ? '<span class="pn-nota" style="color:var(--c-text-muted)">' + P.euros(i.importe_centimos) + '</span>' : '') + '</div></li>';
    }).join('') + '</ul>';
  }

  function chipPlazo(p, hoy) {
    if (p.estado === 'cobrado') return '<span class="pn-chip ok">Cobrado</span>';
    if (p.estado === 'devuelto') return '<span class="pn-chip mal">Devuelto</span>';
    if (p.estado === 'procesando') return '<span class="pn-chip info">En el banco</span>';
    if (p.estado === 'anulado') return '<span class="pn-chip">Anulado</span>';
    if (p.vence < hoy) return '<span class="pn-chip mal">Vencido</span>';
    return '<span class="pn-chip">Pendiente</span>';
  }

  function pagos(lista, hoy) {
    if (!lista.length) return vacio('wallet', 'Sin plazos', 'No hay nada programado para cobrar a este cliente.');
    lista = lista.slice().sort(function (x, y) { return x.vence < y.vence ? -1 : x.vence > y.vence ? 1 : 0; });
    var total = lista.filter(function (p) { return p.estado === 'pendiente' || p.estado === 'devuelto'; })
      .reduce(function (s, p) { return s + p.importe_centimos; }, 0);
    return '<div class="pn-tabla-caja"><table class="pn-tabla apilable"><caption class="solo-lector">Plazos del cliente</caption>' +
      '<thead><tr><th scope="col">Vence</th><th scope="col">Concepto</th><th scope="col" class="ancho-solo">Forma</th><th scope="col">Estado</th><th scope="col" class="num">Importe</th></tr></thead><tbody>' +
      lista.map(function (p) {
        var concepto = esc(p.concepto) + '<span class="sub">' + esc([p.actividad && p.actividad.nombre, p.persona && p.persona.nombre.split(' ')[0]].filter(Boolean).join(' · ')) + '</span>';
        if (p.estado === 'devuelto' && p.devuelto_motivo) concepto += '<span class="sub" style="color:var(--c-danger)">' + esc(p.devuelto_motivo) + '</span>';
        return '<tr><td data-titulo="Vence">' + P.fechaCorta(p.vence) + '</td><td data-titulo="Concepto"><div>' + concepto + '</div></td>' +
          '<td data-titulo="Forma" class="ancho-solo">' + esc(METODO[p.metodo] || '—') + '</td><td data-titulo="Estado">' + chipPlazo(p, hoy) + '</td>' +
          '<td data-titulo="Importe" class="num">' + P.euros(p.importe_centimos) + '</td></tr>';
      }).join('') +
      '</tbody><tfoot><tr><td></td><td colspan="3">Queda por cobrar</td><td class="num">' + P.euros(total) + '</td></tr></tfoot></table></div>';
  }

  function movimientos(lista) {
    if (!lista.length) return vacio('receipt', 'Sin movimientos', 'Aquí se apunta cada cobro y cada devolución.');
    return '<ul class="pn-filas">' + lista.map(function (k) {
      var neg = k.importe_centimos < 0;
      return '<li><span class="pn-hora">' + P.fechaCorta(k.fecha) + '</span><div><h3>' + (neg ? 'Devolución' : 'Cobro') + ' · ' + esc(METODO[k.metodo] || k.metodo) + '</h3>' +
        (k.notas ? '<p>' + esc(k.notas) + '</p>' : '') + '</div><strong style="font-variant-numeric:tabular-nums;color:' +
        (neg ? 'var(--c-danger)' : 'var(--c-text-strong)') + '">' + P.euros(k.importe_centimos) + '</strong></li>';
    }).join('') + '</ul>';
  }

  /* ------------------- columna derecha ------------------------- */

  function avisos(f, n, c) {
    var lista = [];
    if (n.devueltos) lista.push({ t: n.devueltos === 1 ? 'Un recibo devuelto' : n.devueltos + ' recibos devueltos', d: 'Llamar para cobrarlo de otra forma o revisar la cuenta.', chip: '<span class="pn-chip mal">Devuelto</span>' });
    if (n.vencidos) lista.push({ t: n.vencidos === 1 ? 'Un plazo vencido' : n.vencidos + ' plazos vencidos', d: 'Ya pasó la fecha y no está cobrado.', chip: '<span class="pn-chip mal">Vencido</span>' });
    f.personas.forEach(function (p) {
      if (p.salud && p.salud.alergias) lista.push({ t: p.nombre.split(' ')[0] + ' · alergia', d: p.salud.alergias + '. Que lo sepa el monitor.', chip: '<span class="pn-chip aviso">Salud</span>' });
    });
    if (c.tipo === 'familia' && !c.domiciliado && n.pendientes) lista.push({ t: 'Sin domiciliar', d: 'Paga en efectivo o transferencia: hay que perseguir cada plazo.', chip: '<span class="pn-chip aviso">Sin SEPA</span>' });
    f.inscripciones.forEach(function (i) {
      if (i.estado === 'espera') lista.push({ t: 'En lista de espera', d: (i.actividad && i.actividad.nombre) + (i.persona ? ' · ' + i.persona.nombre.split(' ')[0] : ''), chip: '<span class="pn-chip info">Espera</span>' });
    });
    var cuerpo = lista.length
      ? '<ul class="pn-filas">' + lista.map(function (a) {
          return '<li style="grid-template-columns:minmax(0,1fr)"><div><h3>' + esc(a.t) + '</h3><p>' + esc(a.d) + '</p><div style="margin-top:var(--s-2)">' + a.chip + '</div></div></li>';
        }).join('') + '</ul>'
      : '<div class="pn-cuerpo"><p style="margin:0;color:var(--c-text-muted)">Nada pendiente con esta familia.</p></div>';
    return '<div class="pn-tarjeta"><div class="pn-cab"><h2>Antes de llamar</h2></div>' + cuerpo + '</div>';
  }

  function datos(c) {
    var filas = [];
    filas.push(['Email', c.email || '—']);
    filas.push(['Teléfono', c.telefono || '—']);
    if (c.direccion) filas.push(['Dirección', c.direccion]);
    if (c.nif) filas.push(['NIF', c.nif]);
    filas.push(['Domiciliación', c.domiciliado ? 'Mandato SEPA firmado' + (c.mandato_fecha ? ' el ' + P.fechaCorta(c.mandato_fecha) : '') : 'Sin domiciliar']);
    if (c.etiquetas && c.etiquetas.length) filas.push(['Etiquetas', c.etiquetas.join(', ')]);
    return '<div class="pn-tarjeta"><div class="pn-cab"><h2>Datos</h2></div><div class="pn-cuerpo"><dl class="pn-datos" style="grid-template-columns:1fr">' +
      filas.map(function (r) { return '<div><dt>' + esc(r[0]) + '</dt><dd style="overflow-wrap:anywhere">' + esc(r[1]) + '</dd></div>'; }).join('') +
      '</dl></div></div>';
  }

  function notas(c) {
    return '<form class="pn-tarjeta" id="form-notas"><div class="pn-cab"><h2><label for="notas">Notas</label></h2></div><div class="pn-cuerpo" style="display:grid;gap:var(--s-3)">' +
      '<textarea class="pn-entrada" id="notas" placeholder="Lo que conviene recordar de este cliente">' + esc(c.notas || '') + '</textarea>' +
      '<div style="display:flex;justify-content:flex-end"><button class="pn-boton peq primario" type="submit" id="guardar-notas" disabled>Guardar</button></div></div></form>';
  }

  /* ------------------- comportamiento -------------------------- */

  function activarPestanas() {
    var lista = document.getElementById('pestanas');
    var tabs = Array.prototype.slice.call(lista.querySelectorAll('[role="tab"]'));
    function elegir(t, foco) {
      tabs.forEach(function (x) {
        var sel = x === t;
        x.setAttribute('aria-selected', sel ? 'true' : 'false');
        x.tabIndex = sel ? 0 : -1;
        document.getElementById(x.getAttribute('aria-controls')).hidden = !sel;
      });
      if (foco) t.focus();
      history.replaceState(null, '', location.pathname + location.search + '#' + t.id.slice(2));
    }
    lista.addEventListener('click', function (e) { var t = e.target.closest('[role="tab"]'); if (t) elegir(t); });
    lista.addEventListener('keydown', function (e) {
      var i = tabs.indexOf(document.activeElement);
      if (e.key === 'ArrowRight') { e.preventDefault(); elegir(tabs[(i + 1) % tabs.length], true); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); elegir(tabs[(i - 1 + tabs.length) % tabs.length], true); }
      if (e.key === 'Home') { e.preventDefault(); elegir(tabs[0], true); }
      if (e.key === 'End') { e.preventDefault(); elegir(tabs[tabs.length - 1], true); }
    });
    var ancla = location.hash.slice(1);
    var inicial = tabs.filter(function (t) { return t.id === 't-' + ancla; })[0];
    if (inicial) elegir(inicial);
  }

  function activarNotas(c) {
    var form = document.getElementById('form-notas');
    var area = document.getElementById('notas');
    var boton = document.getElementById('guardar-notas');
    var guardado = c.notas || '';
    area.addEventListener('input', function () { boton.disabled = area.value === guardado; });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      boton.setAttribute('aria-busy', 'true');
      DATOS.guardarNotas(c.id, area.value).then(function () {
        guardado = area.value;
        boton.removeAttribute('aria-busy');
        boton.disabled = true;
        P.avisar(P.DEMO ? 'Notas guardadas (demostración: no se guardan de verdad).' : 'Notas guardadas.');
      }).catch(function (err) {
        boton.removeAttribute('aria-busy');
        P.avisar('No se han podido guardar las notas: ' + err.message, true);
      });
    });
  }
})();
