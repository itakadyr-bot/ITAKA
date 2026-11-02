/* ============================================================
   CLIENTES · importar contactos de Google · /admin/clientes/importar/
   ------------------------------------------------------------
   1. Se lee el archivo EN EL NAVEGADOR (CSV de Google o vCard):
      nada sale del ordenador hasta pulsar «Importar».
   2. Cada contacto se clasifica solo:
      · institución: el nombre o la empresa dice CEIP, AMPA,
        Ayuntamiento, IES, Club…  → marcado
      · ya en el panel: mismo email o teléfono que un cliente
        → «completar ficha» (solo rellena lo que falte), marcado
      · sin clasificar: el resto (monitores, proveedores,
        personales…) → SIN marcar
   3. Se importa de uno en uno con guardar_cliente(), igual que el
      formulario de alta.
   ============================================================ */
(function () {
  'use strict';

  var P = window.PANEL;
  var esc = P.esc;
  var DATOS = null;
  var clientes = [];       /* los que ya hay en el panel */
  var contactos = [];      /* los del archivo, ya clasificados */
  var vista = 'recomendados';
  var buscar = '';

  var TIPOS = [['familia', 'Familia'], ['colegio', 'Colegio'], ['ampa', 'AMPA'], ['ayuntamiento', 'Ayuntamiento'], ['empresa', 'Empresa'], ['otro', 'Otro']];

  P.entrar().then(function (sesion) {
    DATOS = window.DATOS_PANEL.crear(sesion);
    if (P.DEMO) document.getElementById('probar').hidden = false;
    return DATOS.listarClientes({});
  }).then(function (l) { clientes = l; }).catch(function (e) {
    mostrarError('No se ha podido leer la lista de clientes: ' + e.message);
  });

  /* ------------------- 1. leer el archivo ------------------------ */

  function mostrarError(t) {
    var e = document.getElementById('error-archivo');
    e.textContent = t; e.hidden = false;
  }

  document.getElementById('archivo').addEventListener('change', function () {
    var f = this.files && this.files[0];
    document.getElementById('error-archivo').hidden = true;
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { mostrarError('El archivo pesa más de 5 MB. ¿Seguro que es la exportación de contactos?'); return; }
    var lector = new FileReader();
    lector.onload = function () { procesar(String(lector.result || ''), f.name); };
    lector.onerror = function () { mostrarError('No se ha podido leer el archivo.'); };
    lector.readAsText(f, 'utf-8');
  });

  var zona = document.getElementById('zona');
  ['dragenter', 'dragover'].forEach(function (ev) { zona.addEventListener(ev, function (e) { e.preventDefault(); zona.classList.add('encima'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { zona.addEventListener(ev, function () { zona.classList.remove('encima'); }); });
  zona.addEventListener('drop', function (e) {
    e.preventDefault();
    var f = e.dataTransfer.files[0];
    if (!f) return;
    var lector = new FileReader();
    lector.onload = function () { procesar(String(lector.result || ''), f.name); };
    lector.readAsText(f, 'utf-8');
  });

  function procesar(texto, nombre) {
    var brutos;
    try {
      brutos = /BEGIN:VCARD/i.test(texto) ? leerVcard(texto) : leerCsv(texto);
    } catch (e) {
      mostrarError('No se ha entendido el archivo: ' + e.message);
      return;
    }
    brutos = juntarRepetidos(brutos.filter(function (c) { return c.nombre || c.empresa || c.email || c.telefono; }));
    if (!brutos.length) { mostrarError('El archivo «' + nombre + '» no tiene contactos que se puedan leer.'); return; }
    contactos = brutos.map(clasificar);
    vista = contactos.some(function (c) { return c.marcado; }) ? 'recomendados' : 'todos';
    document.getElementById('paso-archivo').hidden = true;
    document.getElementById('paso-revisar').hidden = false;
    pintar();
    P.iconos();
  }

  /* CSV con comillas, comas y saltos de línea dentro de los campos */
  function filasCsv(t) {
    t = t.replace(/^﻿/, '');
    var filas = [], fila = [], campo = '', comillas = false;
    var sep = (t.split('\n')[0].split(';').length > t.split('\n')[0].split(',').length) ? ';' : ',';
    for (var i = 0; i < t.length; i++) {
      var ch = t[i];
      if (comillas) {
        if (ch === '"') { if (t[i + 1] === '"') { campo += '"'; i++; } else comillas = false; }
        else campo += ch;
      } else if (ch === '"') comillas = true;
      else if (ch === sep) { fila.push(campo); campo = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && t[i + 1] === '\n') i++;
        fila.push(campo); campo = '';
        if (fila.length > 1 || fila[0] !== '') filas.push(fila);
        fila = [];
      } else campo += ch;
    }
    if (campo || fila.length) { fila.push(campo); filas.push(fila); }
    return filas;
  }

  /* Vale para el CSV de Google nuevo («First Name», «E-mail 1 - Value»)
     y el antiguo («Name», «Given Name», «Organization 1 - Name»). */
  function leerCsv(t) {
    var filas = filasCsv(t);
    if (filas.length < 2) throw new Error('no tiene filas de datos');
    var cab = filas[0].map(function (h) { return h.trim().toLowerCase(); });
    function col(re) { var i = -1; cab.some(function (h, k) { if (re.test(h)) { i = k; return true; } return false; }); return i; }
    function cols(re) { var l = []; cab.forEach(function (h, k) { if (re.test(h)) l.push(k); }); return l; }
    var iNombre = col(/^(name|nombre)$/), iPila = col(/^(first name|given name|nombre de pila)$/),
        iApe = col(/^(last name|family name|apellidos?)$/), iEmp = col(/^(organization( 1)? ?-? ?name|organization name|empresa|organización)/),
        iDir = col(/^address 1 - formatted|^dirección/), iNotas = col(/^(notes|notas)$/), iEtiq = col(/^(labels|group membership|etiquetas)$/);
    var iEmails = cols(/^e-?mail \d+ - value$|^correo/), iTels = cols(/^phone \d+ - value$|^teléfono/);
    if (iNombre < 0 && iPila < 0 && iEmp < 0 && !iEmails.length) throw new Error('no parece una exportación de Google Contacts (faltan las columnas de nombre y email)');
    return filas.slice(1).map(function (f) {
      var v = function (i) { return i >= 0 ? (f[i] || '').trim() : ''; };
      var pila = v(iPila), ape = v(iApe);
      var emails = [], tels = [];
      iEmails.forEach(function (i) { v(i).split(':::').forEach(function (x) { x = x.trim(); if (x) emails.push(x); }); });
      iTels.forEach(function (i) { v(i).split(':::').forEach(function (x) { x = x.trim(); if (x) tels.push(x); }); });
      return {
        nombre: v(iNombre) || [pila, ape].filter(Boolean).join(' '), pila: pila, apellidos: ape,
        empresa: v(iEmp), email: emails[0] || '', emails: emails, telefono: tels[0] || '', telefonos: tels,
        direccion: v(iDir).replace(/\s*\n\s*/g, ', '), notas: v(iNotas),
        etiquetas: v(iEtiq).split(':::').map(function (x) { return x.replace(/^\*\s*/, '').trim(); })
          .filter(function (x) { return x && !/^(myContacts|starred)$/i.test(x); })
      };
    });
  }

  function leerVcard(t) {
    t = t.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');   /* líneas plegadas */
    return t.split(/BEGIN:VCARD/i).slice(1).map(function (bloque) {
      var c = { nombre: '', pila: '', apellidos: '', empresa: '', email: '', emails: [], telefono: '', telefonos: [], direccion: '', notas: '', etiquetas: [] };
      bloque.split(/\r?\n/).forEach(function (l) {
        var m = l.match(/^(?:item\d+\.)?([A-Z-]+)(;[^:]*)?:(.*)$/i);
        if (!m) return;
        var k = m[1].toUpperCase(), val = m[3].replace(/\\n/g, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').trim();
        if (k === 'FN') c.nombre = val;
        else if (k === 'N') { var n = val.split(';'); c.apellidos = (n[0] || '').trim(); c.pila = (n[1] || '').trim(); }
        else if (k === 'ORG') c.empresa = val.split(';')[0].trim();
        else if (k === 'EMAIL' && val) c.emails.push(val);
        else if (k === 'TEL' && val) c.telefonos.push(val);
        else if (k === 'ADR' && !c.direccion) c.direccion = val.split(';').filter(Boolean).join(', ');
        else if (k === 'NOTE') c.notas = val;
        else if (k === 'CATEGORIES') c.etiquetas = val.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
      });
      if (!c.nombre) c.nombre = [c.pila, c.apellidos].filter(Boolean).join(' ');
      c.email = c.emails[0] || ''; c.telefono = c.telefonos[0] || '';
      return c;
    });
  }

  /* ------------------- 2. clasificar ------------------------------ */

  function tel9(t) {
    var d = String(t || '').replace(/\D/g, '');
    if (d.length > 9 && /^(0034|34)/.test(d)) d = d.replace(/^(0034|34)/, '');
    return d.length >= 9 ? d.slice(-9) : '';
  }
  function quitarTildes(t) { return (t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  /* El mismo contacto dos veces en Google (mismo email o teléfono) */
  function juntarRepetidos(l) {
    var porClave = {}, fuera = [];
    l.forEach(function (c) {
      var claves = c.emails.map(function (e) { return 'e:' + e.toLowerCase(); }).concat(c.telefonos.map(tel9).filter(Boolean).map(function (t) { return 't:' + t; }));
      var previo = null;
      claves.some(function (k) { if (porClave[k]) { previo = porClave[k]; return true; } return false; });
      if (previo) {
        ['nombre', 'pila', 'apellidos', 'empresa', 'email', 'telefono', 'direccion', 'notas'].forEach(function (k) { previo[k] = previo[k] || c[k]; });
        previo.emails = previo.emails.concat(c.emails); previo.telefonos = previo.telefonos.concat(c.telefonos);
        previo.repetido = (previo.repetido || 1) + 1;
      } else { fuera.push(c); previo = c; }
      claves.forEach(function (k) { porClave[k] = previo; });
    });
    return fuera;
  }

  var REGLAS = [
    [/\b(ampa|apa|afa)\b/, 'ampa'],
    [/\b(ayuntamiento|ajuntament|ayto|concejalia|regidoria|diputacion|patronato municipal|deportes municipal)\b/, 'ayuntamiento'],
    [/\b(ceip|cp|ies|colegio|col\.?legi|instituto|escuela|escola|cra|eei|guarderia|escuela infantil)\b/, 'colegio'],
    [/\b(club|asociacion|associacio|fundacion|federacion|s\.?l\.?|s\.?a\.?|sociedad|hotel|camping|albergue|granja escuela)\b/, 'empresa']
  ];

  function clasificar(c) {
    var texto = quitarTildes((c.empresa || '') + ' ' + (c.nombre || ''));
    var tipo = null;
    REGLAS.some(function (r) { if (r[0].test(texto)) { tipo = r[1]; return true; } return false; });

    var emails = c.emails.map(function (e) { return e.toLowerCase(); });
    var tels = c.telefonos.map(tel9).filter(Boolean);
    var existe = clientes.filter(function (k) {
      return (k.email && emails.indexOf(k.email.toLowerCase()) >= 0) || (k.telefono && tels.indexOf(tel9(k.telefono)) >= 0);
    })[0] || null;

    var r = {
      clave: Math.random().toString(36).slice(2),
      original: c,
      tipo: existe ? existe.tipo : (tipo || 'familia'),
      grupo: existe ? 'existe' : (tipo ? 'institucion' : 'sin'),
      existe: existe,
      marcado: !!(existe || tipo)
    };
    r.nombreCliente = nombreCliente(r);
    return r;
  }

  /* Instituciones: el nombre de la empresa; la persona va de contacto.
     Familias: «Familia» y apellidos; la persona va de tutor/a. */
  function nombreCliente(r) {
    var c = r.original;
    if (r.tipo !== 'familia') return c.empresa || c.nombre;
    if (c.apellidos) return 'Familia ' + c.apellidos;
    var partes = (c.nombre || '').trim().split(/\s+/);
    return partes.length > 1 ? 'Familia ' + partes.slice(1).join(' ') : (c.nombre || c.empresa);
  }

  /* ------------------- 3. revisar ---------------------------------- */

  function enVista(r) {
    if (vista === 'recomendados') return r.grupo !== 'sin';
    if (vista === 'sin') return r.grupo === 'sin';
    if (vista === 'existen') return r.grupo === 'existe';
    return true;
  }
  function coincide(r) {
    var q = quitarTildes(buscar.trim());
    if (!q) return true;
    var c = r.original;
    return quitarTildes([c.nombre, c.empresa, c.emails.join(' '), c.telefonos.join(' ')].join(' ')).indexOf(q) >= 0;
  }

  function queHara(r) {
    if (r.existe) {
      var falta = faltan(r);
      return falta.length
        ? '<span class="pn-chip info">Completa ficha</span><span class="sub">' + esc(r.existe.nombre) + ': añade ' + esc(falta.join(', ')) + '</span>'
        : '<span class="pn-chip">Ya está</span><span class="sub">' + esc(r.existe.nombre) + ' no cambia</span>';
    }
    return '<span class="pn-chip ok">Nuevo</span><span class="sub">' + esc(r.nombreCliente) + '</span>';
  }

  function faltan(r) {
    var c = r.original, e = r.existe, l = [];
    if (!e.email && c.email) l.push('email');
    if (!e.telefono && c.telefono) l.push('teléfono');
    return l;
  }

  function pintar() {
    var n = { institucion: 0, existe: 0, sin: 0 };
    contactos.forEach(function (r) { n[r.grupo]++; });
    var marcados = contactos.filter(function (r) { return r.marcado; });
    document.getElementById('cifras').innerHTML =
      '<div><dt>En el archivo</dt><dd>' + contactos.length + '</dd><div class="pn-nota">sin contar repetidos</div></div>' +
      '<div><dt>Instituciones</dt><dd>' + n.institucion + '</dd><div class="pn-nota">colegios, AMPAs, ayuntamientos…</div></div>' +
      '<div><dt>Ya en el panel</dt><dd>' + n.existe + '</dd><div class="pn-nota">mismo email o teléfono</div></div>' +
      '<div><dt>Sin clasificar</dt><dd>' + n.sin + '</dd><div class="pn-nota">sin marcar: revísalos tú</div></div>';

    document.querySelectorAll('#segmento button').forEach(function (b) {
      var v = b.getAttribute('data-v');
      var k = contactos.filter(function (r) { var g = vista; vista = v; var s = enVista(r); vista = g; return s; }).length;
      b.setAttribute('aria-pressed', v === vista ? 'true' : 'false');
      b.textContent = b.textContent.replace(/\s\(\d+\)$/, '') + ' (' + k + ')';
    });

    var lista = contactos.filter(function (r) { return enVista(r) && coincide(r); });
    document.getElementById('resumen-tabla').textContent = lista.length + ' contactos';
    var tbody = document.getElementById('filas');
    var sinFilas = document.getElementById('sin-filas');
    if (!lista.length) {
      tbody.innerHTML = '';
      tbody.closest('.pn-tabla-caja').hidden = true;
      sinFilas.hidden = false;
      sinFilas.innerHTML = '<div class="pn-vacio"><i data-lucide="search-x" aria-hidden="true"></i><h3>Ninguno aquí</h3><p>' +
        (buscar ? 'Prueba con otra búsqueda.' : 'Mira en las otras pestañas.') + '</p></div>';
    } else {
      tbody.closest('.pn-tabla-caja').hidden = false;
      sinFilas.hidden = true;
      tbody.innerHTML = lista.map(function (r) {
        var c = r.original;
        var quien = c.empresa && c.nombre && c.empresa !== c.nombre ? c.nombre + ' · ' + c.empresa : (c.nombre || c.empresa);
        var datos = [c.email, c.telefono].filter(Boolean).join(' · ');
        if (r.original.repetido) datos += ' · estaba ' + r.original.repetido + ' veces';
        return '<tr data-clave="' + r.clave + '"' + (r.marcado ? ' aria-selected="true"' : ' class="desmarcada"') + '>' +
          '<td class="sel"><input type="checkbox" class="pn-casilla" data-marcar="' + r.clave + '"' + (r.marcado ? ' checked' : '') + ' aria-label="Importar ' + esc(quien) + '"></td>' +
          '<td data-titulo="Contacto" class="principal"><div><strong style="color:var(--c-text-strong)">' + esc(quien || '(sin nombre)') + '</strong><span class="sub">' + esc(datos) + '</span></div></td>' +
          '<td data-titulo="Tipo">' + (r.existe ? esc((TIPOS.filter(function (t) { return t[0] === r.tipo; })[0] || [0, r.tipo])[1]) :
            '<label class="solo-lector" for="t-' + r.clave + '">Tipo de ' + esc(quien) + '</label><select class="pn-entrada" id="t-' + r.clave + '" data-tipo="' + r.clave + '">' +
            TIPOS.map(function (t) { return '<option value="' + t[0] + '"' + (t[0] === r.tipo ? ' selected' : '') + '>' + t[1] + '</option>'; }).join('') + '</select>') + '</td>' +
          '<td data-titulo="Qué pasará"><div>' + queHara(r) + '</div></td></tr>';
      }).join('');
    }
    var visibles = lista.length;
    var marcadosVisibles = lista.filter(function (r) { return r.marcado; }).length;
    var todas = document.getElementById('todas');
    todas.checked = visibles > 0 && marcadosVisibles === visibles;
    todas.indeterminate = marcadosVisibles > 0 && marcadosVisibles < visibles;

    var nuevos = marcados.filter(function (r) { return !r.existe; }).length;
    var completar = marcados.filter(function (r) { return r.existe && faltan(r).length; }).length;
    document.getElementById('cuenta').textContent = marcados.length
      ? marcados.length + ' marcados: ' + nuevos + ' nuevos, ' + completar + ' fichas que se completan'
      : 'Ninguno marcado';
    document.getElementById('btn-importar').disabled = !(nuevos + completar);
    P.iconos();
  }

  var tabla = document.getElementById('filas');
  tabla.addEventListener('change', function (e) {
    var m = e.target.getAttribute('data-marcar');
    var t = e.target.getAttribute('data-tipo');
    var r = contactos.filter(function (x) { return x.clave === (m || t); })[0];
    if (!r) return;
    if (m) r.marcado = e.target.checked;
    if (t) { r.tipo = e.target.value; r.nombreCliente = nombreCliente(r); r.marcado = true; }
    var foco = e.target.id || null;
    pintar();
    if (t && foco) document.getElementById(foco).focus();
    if (m) { var c = document.querySelector('[data-marcar="' + m + '"]'); if (c) c.focus(); }
  });
  document.getElementById('todas').addEventListener('change', function () {
    var v = this.checked;
    contactos.filter(function (r) { return enVista(r) && coincide(r); }).forEach(function (r) { r.marcado = v; });
    pintar();
  });
  document.getElementById('segmento').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (b) { vista = b.getAttribute('data-v'); pintar(); }
  });
  var pausa = null;
  document.getElementById('buscar').addEventListener('input', function () {
    var v = this.value;
    clearTimeout(pausa);
    pausa = setTimeout(function () { buscar = v; pintar(); }, 200);
  });
  document.getElementById('btn-otro').addEventListener('click', function () {
    contactos = [];
    document.getElementById('archivo').value = '';
    document.getElementById('paso-revisar').hidden = true;
    document.getElementById('paso-archivo').hidden = false;
  });

  /* ------------------- 4. importar --------------------------------- */

  var modal = document.getElementById('modal');
  document.getElementById('btn-importar').addEventListener('click', function () {
    var m = contactos.filter(function (r) { return r.marcado; });
    var nuevos = m.filter(function (r) { return !r.existe; }).length;
    var completar = m.filter(function (r) { return r.existe && faltan(r).length; }).length;
    document.getElementById('m-detalle').textContent = 'Se darán de alta ' + nuevos + ' clientes nuevos y se completarán ' + completar +
      ' fichas que ya existían (solo lo que les falte; no se borra ni se cambia nada).';
    modal.showModal();
  });

  modal.addEventListener('close', function () {
    if (modal.returnValue !== 'si') return;
    var tareas = contactos.filter(function (r) { return r.marcado && (!r.existe || faltan(r).length); });
    var hechos = { nuevos: 0, completados: 0 }, errores = [];
    var fin = document.getElementById('paso-fin');
    document.getElementById('paso-revisar').hidden = true;
    fin.hidden = false;
    fin.innerHTML = '<div class="pn-tarjeta pn-cuerpo" style="display:grid;gap:var(--s-3);justify-items:start" aria-live="polite">' +
      '<h2 style="margin:0">Importando…</h2><div class="pn-progreso" style="max-width:none" role="progressbar" aria-valuemin="0" aria-valuemax="' + tareas.length +
      '" aria-valuenow="0" id="prog"><span style="width:0%"></span></div><p id="prog-texto" style="margin:0;color:var(--c-text-muted)">0 de ' + tareas.length + '</p></div>';
    var hecho = 0;
    tareas.reduce(function (cadena, r) {
      return cadena.then(function () {
        return importarUno(r).then(function (tipo) { hechos[tipo]++; })
          .catch(function (e) { errores.push((r.original.nombre || r.original.empresa) + ': ' + e.message); })
          .then(function () {
            hecho++;
            var p = document.getElementById('prog');
            p.setAttribute('aria-valuenow', hecho);
            p.firstChild.style.width = Math.round(hecho * 100 / tareas.length) + '%';
            document.getElementById('prog-texto').textContent = hecho + ' de ' + tareas.length;
          });
      });
    }, Promise.resolve()).then(function () {
      fin.innerHTML = '<div class="pn-tarjeta pn-cuerpo" style="display:grid;gap:var(--s-4)">' +
        '<div class="pn-aviso ok" role="status"><i data-lucide="check-circle" aria-hidden="true"></i><div>' + hechos.nuevos + ' clientes nuevos y ' +
          hechos.completados + ' fichas completadas.' + (P.DEMO ? ' (Demostración: no se ha guardado nada de verdad.)' : '') + '</div></div>' +
        (errores.length ? '<div class="pn-aviso mal" role="alert"><i data-lucide="x-circle" aria-hidden="true"></i><div><strong>' + errores.length +
          ' no se han podido importar:</strong><ul style="margin:6px 0 0;padding-left:18px">' + errores.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul></div></div>' : '') +
        '<div style="display:flex;gap:var(--s-2);flex-wrap:wrap"><a class="pn-boton primario" href="' + P.enlace('admin/clientes/') + '">Ver clientes</a>' +
        '<a class="pn-boton" href="' + P.enlace('admin/clientes/importar/') + '">Importar otro archivo</a></div></div>';
      P.iconos();
    });
  });

  function importarUno(r) {
    var c = r.original;
    var nota = 'Importado de Google Contacts.' + (c.notas ? ' ' + c.notas : '') +
      (c.emails.length > 1 ? ' Otros emails: ' + c.emails.slice(1).join(', ') + '.' : '') +
      (c.telefonos.length > 1 ? ' Otros teléfonos: ' + c.telefonos.slice(1).join(', ') + '.' : '');
    if (r.existe) {
      /* completar: se carga la ficha entera y solo se rellenan huecos */
      return DATOS.obtenerCliente(r.existe.id).then(function (f) {
        if (!f) throw new Error('la ficha ya no existe');
        var k = f.cliente;
        return DATOS.guardarCliente({
          id: k.id, tipo: k.tipo, nombre: k.nombre, nif: k.nif, direccion: k.direccion || c.direccion,
          email: k.email || c.email, telefono: k.telefono || c.telefono, etiquetas: k.etiquetas,
          notas: [k.notas, 'Completado desde Google Contacts.'].filter(Boolean).join('\n')
        });
      }).then(function () { return 'completados'; });
    }
    var persona = c.nombre && (r.tipo === 'familia' || (c.empresa && c.nombre !== c.empresa))
      ? [{ rol: r.tipo === 'familia' ? 'tutor' : 'contacto', nombre: c.nombre, telefono: c.telefono, email: c.email }]
      : [];
    return DATOS.guardarCliente({
      tipo: r.tipo, nombre: r.nombreCliente, email: c.email, telefono: c.telefono, direccion: c.direccion,
      etiquetas: c.etiquetas.slice(0, 5), notas: nota, personas: persona
    }).then(function () { return 'nuevos'; });
  }

  /* ------------------- ejemplo (solo demostración) ----------------- */

  document.getElementById('btn-ejemplo').addEventListener('click', function () {
    procesar([
      'Name,Given Name,Family Name,Organization 1 - Name,E-mail 1 - Value,Phone 1 - Value,Notes,Group Membership',
      'Rosa Pérez,Rosa,Pérez,AMPA CEIP Las Moreras,ampa.moreras@example.com,600 100 200,Presidenta,* myContacts',
      'Concejalía de Deportes,,,Ayuntamiento de Monforte,deportes.monforte@example.com,965 111 000,,* myContacts',
      'CEIP El Pinar,,,,secretaria.pinar@example.com,965 222 000,"Llamar por la mañana, antes de las 10",* myContacts',
      'Carmen Ruiz,Carmen,Ruiz,,carmen.ruiz@example.com,+34 600 111 222,,* myContacts',
      'Hugo Navarro,Hugo,Navarro,,hugo.nuevo@example.com,600333444,,* myContacts',
      'Marta Gil,Marta,Gil,,marta.gil@example.com,600 555 777,Monitora de verano,* myContacts',
      'Fontanero Paco,Paco,,,,611 000 000,,* myContacts',
      'Rosa Pérez (otro),,,,ampa.moreras@example.com,,,* myContacts',
      'Club Atletismo Elda,,,Club Atletismo Elda,club.elda@example.com,965 333 000,,* myContacts'
    ].join('\n'), 'ejemplo.csv');
  });
})();
