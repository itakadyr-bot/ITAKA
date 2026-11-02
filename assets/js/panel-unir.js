/* ============================================================
   CLIENTES · unir fichas · /admin/clientes/unir/?id=…[&con=…]
   ------------------------------------------------------------
   1. Se busca la otra ficha (si no viene en ?con=).
   2. Se ven las dos lado a lado y se elige cuál se queda.
   3. unir_clientes(): todo lo de la otra pasa a esta y la otra se
      borra. Los datos que falten se completan con los de la otra;
      el email o teléfono distintos quedan apuntados en notas.
   ============================================================ */
(function () {
  'use strict';

  var P = window.PANEL;
  var esc = P.esc;
  var q = new URLSearchParams(location.search);
  var idA = q.get('id');
  var idB = q.get('con');
  var DATOS = null;
  var todos = [];
  var fichas = {};
  var paso = document.getElementById('paso');
  var TIPOS = { familia: 'Familia', colegio: 'Colegio', ampa: 'AMPA', ayuntamiento: 'Ayuntamiento', empresa: 'Empresa', otro: 'Otro' };

  P.entrar().then(function (sesion) {
    DATOS = window.DATOS_PANEL.crear(sesion);
    return Promise.all([DATOS.obtenerCliente(idA), DATOS.listarClientes({})]);
  }).then(function (r) {
    if (!r[0]) {
      paso.innerHTML = '<div class="pn-tarjeta pn-vacio"><i data-lucide="user-x" aria-hidden="true"></i><h3>No encontramos esta ficha</h3>' +
        '<p>Puede que ya se haya unido con otra.</p><a class="pn-boton primario" href="' + P.enlace('admin/clientes/') + '">Ver clientes</a></div>';
      P.iconos();
      return;
    }
    fichas[idA] = r[0];
    todos = r[1].filter(function (c) { return c.id !== idA; });
    if (idB && todos.some(function (c) { return c.id === idB; })) return comparar(idB);
    buscar();
  }).catch(function (e) {
    paso.innerHTML = '<div class="pn-tarjeta pn-cuerpo"><div class="pn-aviso mal" role="alert"><i data-lucide="x-circle" aria-hidden="true"></i><div>No se ha podido cargar: ' +
      esc(e.message) + '</div></div></div>';
    P.iconos();
  });

  /* ------------------- 1. buscar la otra ----------------------- */

  function quitarTildes(t) { return (t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  /* Las que más se parecen primero: mismo apellido, teléfono o niño */
  function parecido(c) {
    var a = fichas[idA].cliente;
    var pal = quitarTildes(a.nombre).split(/\s+/).filter(function (x) { return x.length > 3 && x !== 'familia'; });
    var n = 0;
    pal.forEach(function (x) { if (quitarTildes(c.nombre).indexOf(x) >= 0) n += 2; });
    if (a.telefono && c.telefono && a.telefono.replace(/\s/g, '') === c.telefono.replace(/\s/g, '')) n += 3;
    var ninosA = fichas[idA].personas.map(function (p) { return quitarTildes(p.nombre.split(' ')[0]); });
    c.personas.forEach(function (p) { if (ninosA.indexOf(quitarTildes(p.nombre.split(' ')[0])) >= 0) n += 1; });
    return n;
  }

  function buscar() {
    var a = fichas[idA].cliente;
    paso.innerHTML =
      '<div class="pn-columnas"><section class="pn-tarjeta" aria-labelledby="t-buscar">' +
        '<div class="pn-cab"><h2 id="t-buscar">¿Con qué ficha se une «' + esc(a.nombre) + '»?</h2></div>' +
        '<div class="pn-cuerpo"><label class="pn-buscar" style="max-width:none"><span class="solo-lector">Buscar la otra ficha</span><i data-lucide="search" aria-hidden="true"></i>' +
          '<input class="pn-entrada" type="search" id="q" placeholder="Nombre, niño, email o teléfono" autocomplete="off"></label></div>' +
        '<ul class="pn-filas" id="resultados" aria-live="polite"></ul>' +
      '</section><aside><div class="pn-tarjeta pn-cuerpo"><p style="margin:0;color:var(--c-text-muted)">Arriba salen primero las que más se parecen: mismo apellido, mismo teléfono o un niño con el mismo nombre.</p></div></aside></div>';
    var input = document.getElementById('q');
    function pintar() {
      var t = quitarTildes(input.value.trim());
      var l = todos.filter(function (c) {
        if (!t) return true;
        return quitarTildes([c.nombre, c.email, c.telefono].concat(c.personas.map(function (p) { return p.nombre; })).join(' ')).indexOf(t) >= 0;
      }).map(function (c) { return { c: c, n: parecido(c) }; })
        .sort(function (x, y) { return y.n - x.n || x.c.nombre.localeCompare(y.c.nombre); }).slice(0, 8);
      document.getElementById('resultados').innerHTML = l.length ? l.map(function (x) {
        var c = x.c;
        return '<li><span class="pn-hora">' + esc(TIPOS[c.tipo] || '') + '</span><div><h3>' + esc(c.nombre) + '</h3><p>' +
          esc([c.email, c.telefono, c.personas.map(function (p) { return p.nombre.split(' ')[0]; }).join(', ')].filter(Boolean).join(' · ')) + '</p></div>' +
          '<button class="pn-boton peq" data-elegir="' + esc(c.id) + '">Elegir</button></li>';
      }).join('') : '<li><div><h3>Ninguna coincide</h3><p>Prueba con otro nombre o teléfono.</p></div></li>';
    }
    input.addEventListener('input', pintar);
    document.getElementById('resultados').addEventListener('click', function (e) {
      var b = e.target.closest('[data-elegir]');
      if (b) comparar(b.getAttribute('data-elegir'));
    });
    pintar();
    P.iconos();
    input.focus();
  }

  /* ------------------- 2. comparar ------------------------------ */

  function comparar(otro) {
    idB = otro;
    history.replaceState(null, '', location.pathname + '?id=' + encodeURIComponent(idA) + '&con=' + encodeURIComponent(idB) + (P.DEMO ? '&demo' : ''));
    paso.innerHTML = '<div class="pn-tarjeta pn-cuerpo"><span class="pn-esqueleto" style="width:50%"></span></div>';
    DATOS.obtenerCliente(idB).then(function (f) {
      if (!f) { P.avisar('Esa ficha ya no existe.', true); return buscar(); }
      fichas[idB] = f;
      var a = fichas[idA], b = fichas[idB];
      /* por defecto se queda la que tiene más cosas */
      var peso = function (x) { return x.inscripciones.length * 3 + x.plazos.length + x.personas.length + (x.cliente.domiciliado ? 5 : 0); };
      var queda = peso(b) > peso(a) ? idB : idA;
      paso.innerHTML =
        '<form id="form-unir"><fieldset style="border:0;padding:0;margin:0"><legend class="pn-antetitulo" style="margin-bottom:var(--s-4)">Elige la ficha que se queda</legend>' +
        '<div class="elegir">' + tarjeta(a, idA === queda) + tarjeta(b, idB === queda) + '</div></fieldset>' +
        '<div class="pn-aviso" style="margin-top:var(--s-5)"><i data-lucide="info" aria-hidden="true"></i><div>La otra ficha desaparece y todo lo suyo pasa a la que se queda: niños, tutores, inscripciones, plazos y cobros. ' +
          'Si a la que se queda le falta el NIF, la dirección o la domiciliación, se toman de la otra; un email o teléfono distinto se guarda en las notas.</div></div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:var(--s-2);justify-content:flex-end;margin-top:var(--s-5)">' +
          '<button type="button" class="pn-boton" id="otra">Elegir otra ficha</button>' +
          '<button type="submit" class="pn-boton primario" id="btn-unir">Unir fichas</button></div></form>';
      document.getElementById('otra').addEventListener('click', function () { idB = null; buscar(); });
      document.getElementById('form-unir').addEventListener('submit', function (e) { e.preventDefault(); confirmar(); });
      P.iconos();
      document.querySelector('.elegir input:checked').focus();
    }).catch(function (e) { P.avisar('No se ha podido cargar la otra ficha: ' + e.message, true); });
  }

  function tarjeta(f, marcada) {
    var c = f.cliente;
    var debe = window.DATOS_PANEL.cuentaPlazos(f.plazos, P.hoy()).debe;
    var filas = [
      ['Email', c.email || '—'], ['Teléfono', c.telefono || '—'],
      ['Personas', f.personas.map(function (p) { return p.nombre; }).join(', ') || '—'],
      ['Inscripciones', String(f.inscripciones.length)], ['Pendiente', P.euros(debe)],
      ['Domiciliación', c.domiciliado ? 'Sí' : 'No']
    ];
    return '<label><input type="radio" name="queda" value="' + esc(c.id) + '"' + (marcada ? ' checked' : '') + '>' +
      '<div class="pn-tarjeta"><div class="pn-cab"><h2 style="overflow-wrap:anywhere">' + esc(c.nombre) + '</h2><span style="flex:1"></span>' +
      '<span class="pn-chip ok marca">Se queda</span></div><div class="pn-cuerpo"><dl class="pn-datos" style="grid-template-columns:1fr">' +
      filas.map(function (r) { return '<div><dt>' + esc(r[0]) + '</dt><dd style="overflow-wrap:anywhere">' + esc(r[1]) + '</dd></div>'; }).join('') +
      '</dl></div></div></label>';
  }

  /* ------------------- 3. unir ----------------------------------- */

  var modal = document.getElementById('modal');
  function confirmar() {
    var queda = document.querySelector('input[name="queda"]:checked').value;
    var seVa = queda === idA ? idB : idA;
    document.getElementById('m-detalle').textContent = '«' + fichas[seVa].cliente.nombre + '» desaparece y todo lo suyo pasa a «' +
      fichas[queda].cliente.nombre + '». No se puede deshacer desde el panel.';
    modal.showModal();
  }
  modal.addEventListener('close', function () {
    if (modal.returnValue !== 'si') return;
    var queda = document.querySelector('input[name="queda"]:checked').value;
    var seVa = queda === idA ? idB : idA;
    var boton = document.getElementById('btn-unir');
    boton.setAttribute('aria-busy', 'true');
    DATOS.unirClientes(queda, seVa).then(function () {
      P.avisar('Fichas unidas. Si un mismo niño sale dos veces, únelo desde «Editar».');
      setTimeout(function () { location.href = P.enlace('admin/clientes/ficha/?id=' + encodeURIComponent(queda)); }, 900);
    }).catch(function (e) {
      boton.removeAttribute('aria-busy');
      P.avisar('No se han podido unir: ' + e.message, true);
    });
  });
})();
