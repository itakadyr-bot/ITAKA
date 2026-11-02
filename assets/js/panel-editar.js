/* ============================================================
   CLIENTES · alta y edición (S03) · /admin/clientes/editar/[?id=]
   ------------------------------------------------------------
   Datos del cliente y sus personas (niños, tutores, contactos) en
   un solo formulario. Se guarda todo de una vez con
   guardar_cliente(): o entra todo o no entra nada.
   Si hay dos fichas del mismo niño, «Es la misma persona que…»
   las une (unir_personas): se queda con las inscripciones buenas.
   ============================================================ */
(function () {
  'use strict';

  var P = window.PANEL;
  var esc = P.esc;
  var id = new URLSearchParams(location.search).get('id');
  var DATOS = null;
  var original = null;     /* la ficha tal como vino, para saber qué se ha borrado */
  var cambios = false;
  var nuevas = 0;

  var TIPOS = [['familia', 'Familia'], ['colegio', 'Colegio'], ['ampa', 'AMPA'], ['ayuntamiento', 'Ayuntamiento'], ['empresa', 'Empresa'], ['otro', 'Otro']];
  var ROLES = [['participante', 'Niño o niña'], ['tutor', 'Tutor o tutora'], ['contacto', 'Contacto']];

  var caja = document.getElementById('formulario');
  var main = document.getElementById('contenido');

  P.entrar().then(function (sesion) {
    DATOS = window.DATOS_PANEL.crear(sesion);
    if (!id) return { cliente: { tipo: 'familia', etiquetas: [] }, personas: [] };
    return DATOS.obtenerCliente(id);
  }).then(function (f) {
    main.setAttribute('aria-busy', 'false');
    if (!f) {
      caja.innerHTML = '<div class="pn-tarjeta pn-vacio"><i data-lucide="user-x" aria-hidden="true"></i><h3>No encontramos este cliente</h3>' +
        '<p>Puede que se haya unido con otra ficha o que el enlace esté incompleto.</p><a class="pn-boton primario" href="' + P.enlace('admin/clientes/') + '">Ver clientes</a></div>';
      P.iconos();
      return;
    }
    original = f;
    pintar(f);
  }).catch(function (e) {
    main.setAttribute('aria-busy', 'false');
    caja.innerHTML = '<div class="pn-tarjeta pn-cuerpo"><div class="pn-aviso mal" role="alert"><i data-lucide="x-circle" aria-hidden="true"></i><div>No se ha podido cargar: ' +
      esc(e.message) + '. <button class="pn-boton peq" onclick="location.reload()">Reintentar</button></div></div></div>';
    P.iconos();
  });

  /* ------------------- pintar ---------------------------------- */

  function opciones(lista, valor) {
    return lista.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === valor ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('');
  }
  function campo(idc, etiqueta, valor, extra) {
    extra = extra || {};
    return '<div class="pn-campo' + (extra.ancho ? ' ancho' : '') + '"><label for="' + idc + '">' + esc(etiqueta) +
      (extra.opcional ? ' <span style="font-weight:400;color:var(--c-text-muted)">(opcional)</span>' : '') + '</label>' +
      '<input class="pn-entrada" id="' + idc + '" name="' + (extra.name || idc) + '" type="' + (extra.tipo || 'text') + '" value="' + esc(valor || '') + '"' +
      (extra.attrs || '') + ' aria-describedby="' + idc + '-err' + (extra.ayuda ? ' ' + idc + '-ayuda' : '') + '">' +
      (extra.ayuda ? '<span class="pn-ayuda" id="' + idc + '-ayuda">' + esc(extra.ayuda) + '</span>' : '') +
      '<span class="pn-error" id="' + idc + '-err" hidden></span></div>';
  }

  function pintar(f) {
    var c = f.cliente;
    if (id) {
      document.title = 'Editar ' + c.nombre + ' — Gestión de Ítaka';
      document.getElementById('antetitulo').textContent = 'Clientes · editar';
      document.getElementById('titulo').textContent = c.nombre;
      document.getElementById('subtitulo').textContent = 'Cambia sus datos o los de sus niños, tutores y contactos.';
      var miga = document.querySelector('.pn-ruta li:last-child');
      if (miga) miga.textContent = 'Editar';
    }

    caja.innerHTML =
      '<form class="pn-columnas" id="form" novalidate>' +
        '<div style="display:grid;gap:var(--s-5)">' +
          '<section class="pn-tarjeta" aria-labelledby="t-datos"><div class="pn-cab"><h2 id="t-datos">Datos</h2></div><div class="pn-cuerpo pn-form">' +
            '<div class="pn-campo"><label for="f-tipo">Tipo</label><select class="pn-entrada" id="f-tipo">' + opciones(TIPOS, c.tipo || 'familia') + '</select></div>' +
            campo('f-nombre', 'Nombre', c.nombre, { ayuda: 'Familias: «Familia» y apellidos. Instituciones: su nombre completo.', attrs: ' required autocomplete="off"' }) +
            campo('f-email', 'Email', c.email, { tipo: 'email', attrs: ' autocomplete="off"' }) +
            campo('f-telefono', 'Teléfono', c.telefono, { tipo: 'tel', attrs: ' autocomplete="off"' }) +
            campo('f-nif', 'NIF o CIF', c.nif, { opcional: true, ayuda: 'Para colegios, AMPAs y ayuntamientos.', attrs: ' autocomplete="off"' }) +
            campo('f-direccion', 'Dirección', c.direccion, { opcional: true, attrs: ' autocomplete="off"' }) +
            campo('f-etiquetas', 'Etiquetas', (c.etiquetas || []).join(', '), { opcional: true, ancho: true, ayuda: 'Separadas por comas, por ejemplo: hermanos, programa municipal.', attrs: ' autocomplete="off"' }) +
          '</div></section>' +
          '<section class="pn-tarjeta" aria-labelledby="t-personas"><div class="pn-cab"><h2 id="t-personas">Personas</h2><span class="pn-hueco" style="flex:1"></span>' +
            '<button type="button" class="pn-boton peq" data-anadir="participante"><i data-lucide="plus" aria-hidden="true"></i>Niño o niña</button>' +
            '<button type="button" class="pn-boton peq" data-anadir="tutor"><i data-lucide="plus" aria-hidden="true"></i>Adulto</button></div>' +
            '<div id="personas"></div>' +
          '</section>' +
        '</div>' +
        '<aside>' +
          '<section class="pn-tarjeta" aria-labelledby="t-notas"><div class="pn-cab"><h2><label for="f-notas" id="t-notas">Notas</label></h2></div>' +
            '<div class="pn-cuerpo"><textarea class="pn-entrada" id="f-notas" placeholder="Lo que conviene recordar">' + esc(c.notas || '') + '</textarea></div></section>' +
          '<div class="pn-tarjeta pn-cuerpo" style="display:grid;gap:var(--s-3)">' +
            '<div class="pn-aviso mal" id="error-general" role="alert" hidden></div>' +
            '<button type="submit" class="pn-boton primario gra" id="guardar">' + (id ? 'Guardar cambios' : 'Dar de alta') + '</button>' +
            '<a class="pn-boton" href="' + (id ? P.enlace('admin/clientes/ficha/?id=' + encodeURIComponent(id)) : P.enlace('admin/clientes/')) + '">Cancelar</a>' +
            (id ? '<a class="pn-enlace" style="text-align:center;padding-top:var(--s-2)" href="' + P.enlace('admin/clientes/unir/?id=' + encodeURIComponent(id)) + '">¿Es la misma familia que otra ficha? Unirlas</a>' : '') +
          '</div>' +
        '</aside>' +
      '</form>';

    var lista = document.getElementById('personas');
    var orden = { participante: 0, tutor: 1, contacto: 2 };
    f.personas.slice().sort(function (a, b) { return orden[a.rol] - orden[b.rol]; }).forEach(function (p) { lista.appendChild(bloquePersona(p)); });
    if (!f.personas.length && !id) lista.appendChild(bloquePersona({ rol: 'tutor' }));
    pintarVacioPersonas();
    actualizarUnir();
    activar();
    P.iconos();
    document.getElementById('f-nombre').focus();
  }

  function bloquePersona(p) {
    var clave = p.id || ('n' + (++nuevas));
    var s = p.salud || {}, a = p.autorizaciones || {};
    var esNino = (p.rol || 'participante') === 'participante';
    var div = document.createElement('fieldset');
    div.className = 'pn-persona';
    div.setAttribute('data-clave', clave);
    if (p.id) div.setAttribute('data-id', p.id);
    div.style.cssText = 'border:0;border-top:1px solid var(--c-border);margin:0;padding:var(--s-5)';
    var fotos = a.fotos == null ? '' : (/^(s|si|sí|true)$/i.test(String(a.fotos)) ? 'si' : 'no');
    div.innerHTML =
      '<legend class="solo-lector">' + esc(p.nombre || 'Persona nueva') + '</legend>' +
      '<div class="pn-form">' +
        '<div class="pn-campo"><label for="r-' + clave + '">Es</label><select class="pn-entrada" id="r-' + clave + '" data-k="rol">' + opciones(ROLES, p.rol || 'participante') + '</select></div>' +
        campo('n-' + clave, 'Nombre y apellidos', p.nombre, { name: 'nombre', attrs: ' data-k="nombre" autocomplete="off"' }) +
        '<div class="pn-campo solo-nino"><label for="a-' + clave + '">Año de nacimiento</label><input class="pn-entrada" id="a-' + clave + '" data-k="anyo_nacimiento" inputmode="numeric" maxlength="4" value="' +
          esc(p.anyo_nacimiento || (p.nacimiento ? String(p.nacimiento).slice(0, 4) : '')) + '" aria-describedby="a-' + clave + '-err"><span class="pn-error" id="a-' + clave + '-err" hidden></span></div>' +
        '<div class="pn-campo solo-nino"><label for="na-' + clave + '">Fecha de nacimiento <span style="font-weight:400;color:var(--c-text-muted)">(si se sabe)</span></label>' +
          '<input class="pn-entrada" id="na-' + clave + '" data-k="nacimiento" type="date" value="' + esc(p.nacimiento || '') + '"></div>' +
        campo('d-' + clave, 'DNI', p.dni, { opcional: true, attrs: ' data-k="dni" autocomplete="off"' }) +
        '<div class="pn-campo solo-adulto">' + campo('t-' + clave, 'Teléfono', p.telefono, { tipo: 'tel', attrs: ' data-k="telefono" autocomplete="off"' }).replace(/^<div class="pn-campo">|<\/div>$/g, '') + '</div>' +
        '<div class="pn-campo solo-adulto">' + campo('e-' + clave, 'Email', p.email, { tipo: 'email', attrs: ' data-k="email" autocomplete="off"' }).replace(/^<div class="pn-campo">|<\/div>$/g, '') + '</div>' +
        '<div class="pn-campo solo-nino ancho"><label for="al-' + clave + '">Alergias</label><input class="pn-entrada" id="al-' + clave + '" data-s="alergias" value="' + esc(s.alergias || '') + '" placeholder="Ninguna" autocomplete="off"></div>' +
        '<div class="pn-campo solo-nino"><label for="ob-' + clave + '">Observaciones de salud</label><input class="pn-entrada" id="ob-' + clave + '" data-s="observaciones" value="' + esc(s.observaciones || '') + '" autocomplete="off"></div>' +
        '<div class="pn-campo solo-nino"><label for="si-' + clave + '">SIP</label><input class="pn-entrada" id="si-' + clave + '" data-s="sip" value="' + esc(s.sip || '') + '" autocomplete="off"></div>' +
        '<div class="pn-campo solo-nino"><label for="fo-' + clave + '">Fotos</label><select class="pn-entrada" id="fo-' + clave + '" data-a="fotos">' +
          opciones([['', 'Sin preguntar'], ['si', 'Autoriza'], ['no', 'No autoriza']], fotos) + '</select></div>' +
      '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:var(--s-2);align-items:center;margin-top:var(--s-4)">' +
        '<div class="pn-unir" hidden style="display:flex;gap:var(--s-2);align-items:center;flex-wrap:wrap">' +
          '<label for="u-' + clave + '" style="font-size:13.5px;color:var(--c-text-muted)">Es la misma persona que</label>' +
          '<select class="pn-entrada" id="u-' + clave + '" style="width:auto;min-height:36px"></select>' +
          '<button type="button" class="pn-boton peq" data-unir="' + clave + '">Unir</button></div>' +
        '<span style="flex:1"></span>' +
        '<button type="button" class="pn-boton peq peligro" data-quitar="' + clave + '">Quitar</button>' +
      '</div>';
    mostrarSegunRol(div, esNino);
    return div;
  }

  function mostrarSegunRol(div, esNino) {
    div.querySelectorAll('.solo-nino').forEach(function (e) { e.hidden = !esNino; });
    div.querySelectorAll('.solo-adulto').forEach(function (e) { e.hidden = esNino; });
  }

  function pintarVacioPersonas() {
    var lista = document.getElementById('personas');
    var hay = lista.querySelector('.pn-persona');
    var v = lista.querySelector('.pn-vacio');
    if (!hay && !v) {
      lista.insertAdjacentHTML('beforeend', '<div class="pn-vacio" style="padding:var(--s-6) var(--s-5)"><h3>Sin personas</h3><p>Añade a los niños y a un adulto de contacto con los botones de arriba.</p></div>');
    } else if (hay && v) v.remove();
  }

  /* «Es la misma persona que…»: solo entre personas ya guardadas,
     del mismo papel y que se parecen (mismo nombre de pila o, en
     niños, mismo año). Así no aparece entre hermanos. */
  function pila(b) {
    return (b.querySelector('[data-k="nombre"]').value || '').trim().split(/\s+/)[0].toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  function anyo(b) { var a = b.querySelector('[data-k="anyo_nacimiento"]'); return a ? a.value : ''; }
  function actualizarUnir() {
    var bloques = Array.prototype.slice.call(document.querySelectorAll('.pn-persona[data-id]'));
    bloques.forEach(function (b) {
      var rol = b.querySelector('[data-k="rol"]').value;
      var otras = bloques.filter(function (x) {
        if (x === b || x.querySelector('[data-k="rol"]').value !== rol) return false;
        return (pila(x) && pila(x) === pila(b)) || (rol === 'participante' && anyo(b) && anyo(x) === anyo(b));
      });
      var zona = b.querySelector('.pn-unir');
      zona.hidden = !otras.length;
      zona.style.display = otras.length ? 'flex' : 'none';
      zona.querySelector('select').innerHTML = otras.map(function (x) {
        return '<option value="' + esc(x.getAttribute('data-id')) + '">' + esc(x.querySelector('[data-k="nombre"]').value || 'sin nombre') + '</option>';
      }).join('');
    });
  }

  /* ------------------- comportamiento -------------------------- */

  function activar() {
    var form = document.getElementById('form');
    form.addEventListener('input', function () { cambios = true; });
    form.addEventListener('change', function (e) {
      cambios = true;
      if (e.target.matches('[data-k="rol"]')) {
        mostrarSegunRol(e.target.closest('.pn-persona'), e.target.value === 'participante');
        actualizarUnir();
      }
    });
    form.addEventListener('click', function (e) {
      var anadir = e.target.closest('[data-anadir]');
      if (anadir) {
        var b = bloquePersona({ rol: anadir.getAttribute('data-anadir') });
        document.getElementById('personas').appendChild(b);
        pintarVacioPersonas();
        P.iconos();
        cambios = true;
        b.querySelector('[data-k="nombre"]').focus();
        return;
      }
      var quitar = e.target.closest('[data-quitar]');
      if (quitar) {
        var bloque = quitar.closest('.pn-persona');
        var siguiente = bloque.nextElementSibling || bloque.previousElementSibling;
        bloque.remove();
        cambios = true;
        pintarVacioPersonas();
        actualizarUnir();
        (siguiente && siguiente.querySelector('input,select') || document.querySelector('[data-anadir]')).focus();
        P.avisar('Se quitará al guardar.');
        return;
      }
      var unir = e.target.closest('[data-unir]');
      if (unir) pedirUnir(unir.closest('.pn-persona'));
    });
    form.addEventListener('submit', guardar);
    window.addEventListener('beforeunload', function (e) { if (cambios) { e.preventDefault(); e.returnValue = ''; } });
  }

  /* ------------------- guardar --------------------------------- */

  function error(idc, texto) {
    var el = document.getElementById(idc);
    el.setAttribute('aria-invalid', 'true');
    var e = document.getElementById(idc + '-err');
    if (e) { e.innerHTML = texto; e.hidden = false; }
    return el;
  }

  function recoger() {
    var v = function (i) { return document.getElementById(i).value.trim(); };
    var datos = {
      tipo: v('f-tipo'), nombre: v('f-nombre'), email: v('f-email'), telefono: v('f-telefono'),
      nif: v('f-nif'), direccion: v('f-direccion'), notas: document.getElementById('f-notas').value.trim(),
      etiquetas: v('f-etiquetas').split(',').map(function (t) { return t.trim(); }).filter(Boolean),
      personas: [], borrar_personas: []
    };
    if (id) datos.id = id;
    var vivos = {};
    document.querySelectorAll('.pn-persona').forEach(function (b) {
      var p = { salud: {}, autorizaciones: {} };
      if (b.getAttribute('data-id')) { p.id = b.getAttribute('data-id'); vivos[p.id] = true; }
      b.querySelectorAll('[data-k]').forEach(function (i) { p[i.getAttribute('data-k')] = i.value.trim(); });
      b.querySelectorAll('[data-s]').forEach(function (i) { if (i.value.trim()) p.salud[i.getAttribute('data-s')] = i.value.trim(); });
      b.querySelectorAll('[data-a]').forEach(function (i) { if (i.value) p.autorizaciones[i.getAttribute('data-a')] = i.value === 'si' ? 'sí' : 'no'; });
      if (p.rol !== 'participante') { delete p.anyo_nacimiento; delete p.nacimiento; p.salud = {}; p.autorizaciones = {}; }
      else { delete p.telefono; delete p.email; }
      if (p.nombre) datos.personas.push(p);
    });
    (original.personas || []).forEach(function (p) { if (!vivos[p.id]) datos.borrar_personas.push(p.id); });
    return datos;
  }

  function guardar(e) {
    e.preventDefault();
    document.querySelectorAll('[aria-invalid="true"]').forEach(function (x) { x.setAttribute('aria-invalid', 'false'); });
    document.querySelectorAll('.pn-error').forEach(function (x) { x.hidden = true; });
    var general = document.getElementById('error-general');
    general.hidden = true;

    var d = recoger();
    var primero = null;
    if (!d.nombre) primero = error('f-nombre', 'Hace falta un nombre.');
    if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) primero = primero || error('f-email', 'Este email no parece completo.');
    if (!d.email && !d.telefono) primero = primero || error('f-telefono', 'Pon al menos un teléfono o un email para poder contactar.');
    document.querySelectorAll('.pn-persona').forEach(function (b) {
      var anyo = b.querySelector('[data-k="anyo_nacimiento"]');
      var nac = b.querySelector('[data-k="nacimiento"]').value;
      if (anyo && !anyo.closest('.pn-campo').hidden && anyo.value && !/^(19|20)\d{2}$/.test(anyo.value)) primero = primero || error(anyo.id, 'Cuatro cifras, por ejemplo 2015.');
      else if (anyo && nac && anyo.value && nac.slice(0, 4) !== anyo.value) primero = primero || error(anyo.id, 'No coincide con la fecha de nacimiento.');
    });
    if (primero) { primero.focus(); return; }

    var boton = document.getElementById('guardar');
    boton.setAttribute('aria-busy', 'true');
    DATOS.guardarCliente(d).then(function (nuevoId) {
      cambios = false;
      P.avisar(id ? 'Cambios guardados.' : 'Cliente dado de alta.');
      setTimeout(function () { location.href = P.enlace('admin/clientes/ficha/?id=' + encodeURIComponent(nuevoId || id)); }, 600);
    }).catch(function (err) {
      boton.removeAttribute('aria-busy');
      if (err.duplicado) {
        error('f-email', 'Ya hay otro cliente con este email.' + (err.otroId
          ? ' <a href="' + P.enlace('admin/clientes/ficha/?id=' + encodeURIComponent(err.otroId)) + '">Ver esa ficha</a>' +
            (id ? ' · <a href="' + P.enlace('admin/clientes/unir/?id=' + encodeURIComponent(id) + '&con=' + encodeURIComponent(err.otroId)) + '">unirlas</a>' : '')
          : '')).focus();
        return;
      }
      general.textContent = 'No se ha guardado: ' + err.message;
      general.hidden = false;
      general.focus();
    });
  }

  /* ------------------- unir dos personas ------------------------ */

  var modal = document.getElementById('modal-unir');
  var pendiente = null;

  function pedirUnir(bloque) {
    if (cambios) {
      P.avisar('Guarda antes los cambios y luego une a las personas.', true);
      return;
    }
    var queda = bloque.getAttribute('data-id');
    var seVa = bloque.querySelector('.pn-unir select').value;
    var nq = bloque.querySelector('[data-k="nombre"]').value;
    var otro = document.querySelector('.pn-persona[data-id="' + CSS.escape(seVa) + '"]');
    var ns = otro ? otro.querySelector('[data-k="nombre"]').value : '';
    pendiente = { queda: queda, seVa: seVa };
    document.getElementById('unir-detalle').textContent = '«' + ns + '» desaparece y todo lo suyo (inscripciones, asistencia, datos de salud) pasa a «' + nq +
      '». Si los dos estaban en la misma actividad, se queda la inscripción pagada y la otra pasa a baja.';
    modal.showModal();
  }
  modal.addEventListener('close', function () {
    if (modal.returnValue !== 'si' || !pendiente) return;
    DATOS.unirPersonas(pendiente.queda, pendiente.seVa).then(function () {
      P.avisar('Personas unidas.');
      return DATOS.obtenerCliente(id);
    }).then(function (f) {
      if (f) { original = f; pintar(f); }
    }).catch(function (err) { P.avisar('No se han podido unir: ' + err.message, true); });
  });
})();
