/* ============================================================
   CLIENTES · lista (S01) · /admin/clientes/
   ------------------------------------------------------------
   Se cargan todos una vez (son cientos, no miles) y el buscador y
   los filtros trabajan sobre lo cargado, sin volver a la base.
   ============================================================ */
(function () {
  'use strict';

  var P = window.PANEL;
  var esc = P.esc;
  var TIPOS = { familia: 'Familia', colegio: 'Colegio', ampa: 'AMPA', ayuntamiento: 'Ayuntamiento', empresa: 'Empresa', otro: 'Otro' };

  var todos = [];
  var filtro = { tipo: '', buscar: '' };

  var filas = document.getElementById('filas');
  var caja = document.getElementById('caja-tabla');
  var sinFilas = document.getElementById('sin-filas');
  var resumenTabla = document.getElementById('resumen-tabla');

  document.getElementById('btn-nuevo').href = P.enlace('admin/clientes/editar/');
  document.getElementById('btn-importar').href = P.enlace('admin/clientes/importar/');

  P.entrar().then(function (sesion) {
    var DATOS = window.DATOS_PANEL.crear(sesion);
    return DATOS.listarClientes({}).then(function (lista) {
      todos = lista;
      pintarCifras();
      pintarRevisar();
      pintar();
    });
  }).catch(function (e) {
    caja.setAttribute('aria-busy', 'false');
    document.getElementById('cifras').setAttribute('aria-busy', 'false');
    var texto = e.sinTablas
      ? 'La base de datos todavía no tiene las tablas de clientes. Hay que aplicar el esquema nuevo (replica/schema.sql). Mientras tanto puedes ver la demostración.'
      : 'No se ha podido cargar la lista: ' + e.message + '. Revisa la conexión y vuelve a intentarlo.';
    caja.hidden = true;
    sinFilas.hidden = false;
    sinFilas.innerHTML = '<div class="pn-cuerpo"><div class="pn-aviso mal" role="alert"><i data-lucide="x-circle" aria-hidden="true"></i><div>' +
      esc(texto) + '<div style="margin-top:var(--s-3);display:flex;gap:var(--s-2);flex-wrap:wrap">' +
      '<button class="pn-boton peq" onclick="location.reload()">Reintentar</button>' +
      (e.sinTablas ? '<a class="pn-boton peq" href="?demo">Ver la demostración</a>' : '') + '</div></div></div></div>';
    document.querySelectorAll('#cifras dd').forEach(function (d) { d.textContent = '—'; });
    document.getElementById('revisar').innerHTML = '<li><p>Sin datos.</p></li>';
    P.iconos();
  });

  /* ------------------- cifras de arriba ----------------------- */

  function pintarCifras() {
    var familias = todos.filter(function (c) { return c.tipo === 'familia'; });
    var inst = todos.length - familias.length;
    var conDeuda = todos.filter(function (c) { return c.debe_centimos > 0; });
    var debe = conDeuda.reduce(function (s, c) { return s + c.debe_centimos; }, 0);
    var vencidos = todos.reduce(function (s, c) { return s + c.plazos_vencidos + c.plazos_devueltos; }, 0);
    var semana = new Date(); semana.setDate(semana.getDate() - 7);
    var nuevas = familias.filter(function (c) { return c.creado && new Date(c.creado) >= semana; }).length;

    var cifras = document.getElementById('cifras');
    cifras.innerHTML =
      cifra('Familias', familias.length, nuevas ? nuevas + (nuevas === 1 ? ' nueva' : ' nuevas') + ' esta semana' : 'Ninguna nueva esta semana', 'familia') +
      cifra('Instituciones', inst, 'Colegios, AMPAs y ayuntamientos', 'institucion') +
      cifra('Con pagos pendientes', conDeuda.length, conDeuda.length ? 'Clientes que deben algo' : 'Todo al día', 'deuda') +
      '<div' + (vencidos ? ' class="peligro"' : '') + '><dt>Por cobrar</dt><dd>' + P.euros(debe) + '</dd><div class="pn-nota">' +
        (vencidos ? vencidos + (vencidos === 1 ? ' plazo vencido o devuelto' : ' plazos vencidos o devueltos') : 'Nada vencido') + '</div></div>';
    cifras.setAttribute('aria-busy', 'false');
    cifras.querySelectorAll('[data-filtro]').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); elegirTipo(a.getAttribute('data-filtro')); });
    });
  }

  function cifra(titulo, n, nota, f) {
    return '<div><dt>' + esc(titulo) + '</dt><dd><a href="#" data-filtro="' + f + '" aria-label="' + esc(titulo) + ': ' + n + '. Ver en la lista">' +
      n + '</a></dd><div class="pn-nota">' + esc(nota) + '</div></div>';
  }

  /* ------------------- para revisar --------------------------- */

  function pintarRevisar() {
    var avisos = [];
    todos.forEach(function (c) {
      if (c.plazos_devueltos) avisos.push({ orden: 0, c: c, titulo: c.nombre, texto: c.plazos_devueltos === 1 ? 'Un recibo devuelto por el banco' : c.plazos_devueltos + ' recibos devueltos', chip: '<span class="pn-chip mal">Devuelto</span>' });
      else if (c.plazos_vencidos) avisos.push({ orden: 1, c: c, titulo: c.nombre, texto: c.plazos_vencidos === 1 ? 'Un plazo vencido sin cobrar' : c.plazos_vencidos + ' plazos vencidos sin cobrar', chip: '<span class="pn-chip mal">Vencido</span>' });
      else if (c.tipo === 'familia' && !c.domiciliado && c.inscripciones_activas && c.debe_centimos) avisos.push({ orden: 2, c: c, titulo: c.nombre, texto: 'Paga en efectivo o transferencia: sin domiciliar', chip: '<span class="pn-chip aviso">Sin SEPA</span>' });
    });
    avisos.sort(function (a, b) { return a.orden - b.orden; });
    var ul = document.getElementById('revisar');
    ul.setAttribute('aria-busy', 'false');
    if (!avisos.length) {
      ul.innerHTML = '<li><div><h3>Todo en orden</h3><p>No hay recibos devueltos ni plazos vencidos.</p></div></li>';
      return;
    }
    ul.innerHTML = avisos.slice(0, 6).map(function (a) {
      return '<li style="grid-template-columns:minmax(0,1fr)"><div><h3><a href="' + P.enlace('admin/clientes/ficha/?id=' + encodeURIComponent(a.c.id)) + '">' +
        esc(a.titulo) + '</a></h3><p>' + esc(a.texto) + '</p><div style="margin-top:var(--s-2)">' + a.chip + '</div></div></li>';
    }).join('') + (avisos.length > 6 ? '<li><p>Y ' + (avisos.length - 6) + ' más: filtra por «Deben algo».</p></li>' : '');
  }

  /* ------------------- tabla ---------------------------------- */

  function coincide(c) {
    var f = filtro;
    if (f.tipo === 'familia' && c.tipo !== 'familia') return false;
    if (f.tipo === 'institucion' && c.tipo === 'familia') return false;
    if (f.tipo === 'deuda' && !c.debe_centimos) return false;
    var q = quitarTildes(f.buscar.trim());
    if (!q) return true;
    var texto = [c.nombre, c.email, c.telefono].concat(c.personas.map(function (p) { return p.nombre; })).join(' ');
    return quitarTildes(texto).indexOf(q) >= 0 || (c.telefono || '').replace(/\s/g, '').indexOf(q.replace(/\s/g, '')) >= 0;
  }
  function quitarTildes(t) { return (t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  function estadoPagos(c) {
    if (c.plazos_devueltos) return '<span class="pn-chip mal">Devuelto</span>';
    if (c.plazos_vencidos) return '<span class="pn-chip mal">Vencido</span>';
    if (c.debe_centimos) return '<span class="pn-chip">Pendiente</span>';
    if (c.inscripciones_activas) return '<span class="pn-chip ok">Al día</span>';
    return '<span class="pn-chip">Sin actividad</span>';
  }

  function pintar() {
    var lista = todos.filter(coincide);
    caja.setAttribute('aria-busy', 'false');
    resumenTabla.textContent = lista.length + (lista.length === 1 ? ' cliente' : ' clientes');

    if (!lista.length) {
      caja.hidden = true;
      sinFilas.hidden = false;
      var hayFiltro = filtro.tipo || filtro.buscar.trim();
      sinFilas.innerHTML = hayFiltro
        ? '<div class="pn-vacio"><i data-lucide="search-x" aria-hidden="true"></i><h3>Nadie con ese filtro</h3>' +
          '<p>Prueba con otro nombre, o mira todos los clientes.</p><button class="pn-boton" id="quitar">Quitar filtros</button></div>'
        : '<div class="pn-vacio"><i data-lucide="users" aria-hidden="true"></i><h3>Todavía no hay clientes</h3>' +
          '<p>Las familias aparecen solas cuando reservan en la web. Los colegios y ayuntamientos se dan de alta a mano.</p></div>';
      var q = document.getElementById('quitar');
      if (q) q.addEventListener('click', function () { document.getElementById('buscar').value = ''; filtro.buscar = ''; elegirTipo(''); });
      P.iconos();
      return;
    }
    caja.hidden = false;
    sinFilas.hidden = true;
    filas.innerHTML = lista.map(function (c) {
      var ninos = c.personas.filter(function (p) { return p.rol === 'participante'; }).map(function (p) { return p.nombre.split(' ')[0]; });
      var sub = c.tipo === 'familia' ? (ninos.length ? ninos.join(', ') : 'Sin niños apuntados') : (c.email || c.telefono || '');
      return '<tr>' +
        '<td data-titulo="Cliente" class="principal"><div class="pn-con-iniciales"><span class="pn-iniciales" aria-hidden="true">' + esc(P.iniciales(c.nombre)) + '</span>' +
          '<div><a href="' + P.enlace('admin/clientes/ficha/?id=' + encodeURIComponent(c.id)) + '">' + esc(c.nombre) + '</a>' +
          '<span class="sub">' + esc(sub) + '</span></div></div></td>' +
        '<td data-titulo="Tipo" class="ancho-solo">' + esc(TIPOS[c.tipo] || c.tipo) + '</td>' +
        '<td data-titulo="Inscripciones" class="num ancho-solo">' + c.inscripciones_activas + '</td>' +
        '<td data-titulo="Pagos">' + estadoPagos(c) + '</td>' +
        '<td data-titulo="Pendiente" class="num">' + (c.debe_centimos ? P.euros(c.debe_centimos) : '—') + '</td>' +
      '</tr>';
    }).join('');
  }

  /* ------------------- filtros -------------------------------- */

  function elegirTipo(t) {
    filtro.tipo = t;
    document.querySelectorAll('#segmento button').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-tipo') === t ? 'true' : 'false');
    });
    pintar();
  }
  document.getElementById('segmento').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (b) elegirTipo(b.getAttribute('data-tipo'));
  });
  var pausa = null;
  document.getElementById('buscar').addEventListener('input', function () {
    var v = this.value;
    clearTimeout(pausa);
    pausa = setTimeout(function () { filtro.buscar = v; pintar(); }, 200);
  });

  /* ------------------- CSV ------------------------------------ */

  document.getElementById('btn-csv').addEventListener('click', function () {
    var lista = todos.filter(coincide);
    if (!lista.length) { P.avisar('No hay nada que descargar con este filtro.', true); return; }
    var cab = ['Nombre', 'Tipo', 'Email', 'Teléfono', 'Niños', 'Inscripciones activas', 'Pendiente (€)', 'Domiciliado'];
    var lineas = [cab].concat(lista.map(function (c) {
      return [c.nombre, TIPOS[c.tipo] || c.tipo, c.email || '', c.telefono || '',
        c.personas.filter(function (p) { return p.rol === 'participante'; }).map(function (p) { return p.nombre; }).join(' / '),
        c.inscripciones_activas, (c.debe_centimos / 100).toFixed(2).replace('.', ','), c.domiciliado ? 'Sí' : 'No'];
    }));
    var csv = '﻿' + lineas.map(function (l) {
      return l.map(function (v) { v = String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(';');
    }).join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'clientes-itaka-' + P.hoy() + '.csv';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    P.avisar('Descargados ' + lista.length + ' clientes.');
  });
})();
