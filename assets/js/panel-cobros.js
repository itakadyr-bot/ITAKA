/* ============================================================
   COBROS (S07) · /admin/cobros/
   ------------------------------------------------------------
   Todos los plazos en una pantalla, por cómo están: vencidos,
   devueltos, próximos, en el banco (SEPA en curso) y cobrados.
   · «Apuntar»: efectivo, transferencia o datáfono, también parcial
     (la base parte el plazo: apuntar_cobro()).
   · «Cobrar por SEPA»: los seleccionados que tienen mandato, uno a
     uno por la función plazos-cobrar de siempre.
   · «Para la contable»: CSV con lo cobrado y devuelto en un mes.
   ?cliente=<id> enseña solo los plazos de ese cliente.
   ============================================================ */
(function () {
  'use strict';

  var P = window.PANEL;
  var esc = P.esc;
  var METODO = { sepa: 'Domiciliación', tarjeta: 'Tarjeta', efectivo: 'Efectivo', transferencia: 'Transferencia' };
  var VISTAS = {
    vencidos: { vacio: 'Nada vencido', texto: 'Ningún plazo ha pasado su fecha sin cobrarse.' },
    devueltos: { vacio: 'Ningún recibo devuelto', texto: 'Cuando el banco devuelva un recibo, aparecerá aquí.' },
    proximos: { vacio: 'Nada programado', texto: 'No hay plazos pendientes con fecha futura.' },
    banco: { vacio: 'Nada en el banco', texto: 'Los recibos SEPA salen aquí mientras el banco los procesa.' },
    cobrados: { vacio: 'Sin cobros todavía', texto: 'Los plazos cobrados aparecerán aquí.' }
  };

  var DATOS = null;
  var plazos = [];
  var hoy = P.hoy();
  var vista = 'vencidos';
  var buscar = '';
  var elegidos = {};
  var clienteFiltro = new URLSearchParams(location.search).get('cliente');
  var enCurso = null;

  var filas = document.getElementById('filas');
  var caja = document.getElementById('caja-tabla');
  var sinFilas = document.getElementById('sin-filas');

  document.getElementById('mes').value = hoy.slice(0, 7);

  P.entrar().then(function (sesion) {
    DATOS = window.DATOS_PANEL.crear(sesion);
    return cargar(true);
  }).catch(fallo);

  function fallo(e) {
    caja.setAttribute('aria-busy', 'false');
    caja.hidden = true;
    sinFilas.hidden = false;
    sinFilas.innerHTML = '<div class="pn-cuerpo"><div class="pn-aviso mal" role="alert"><i data-lucide="x-circle" aria-hidden="true"></i><div>' +
      esc(e.sinTablas ? 'Faltan las tablas de cobros en la base de datos.' : 'No se han podido cargar los plazos: ' + e.message + '.') +
      '<div style="margin-top:var(--s-3)"><button class="pn-boton peq" onclick="location.reload()">Reintentar</button></div></div></div></div>';
    document.querySelectorAll('#cifras dd').forEach(function (d) { d.textContent = '—'; });
    document.getElementById('cifras').setAttribute('aria-busy', 'false');
    P.iconos();
  }

  function cargar(primeraVez) {
    var mesDesde = hoy.slice(0, 8) + '01';
    return Promise.all([DATOS.listarPlazos(), DATOS.listarCobros(mesDesde, hoy)]).then(function (r) {
      plazos = r[0];
      if (clienteFiltro) plazos = plazos.filter(function (p) { return p.cliente && p.cliente.id === clienteFiltro; });
      pintarCifras(r[1]);
      if (primeraVez) elegirVistaInicial();
      avisoCliente();
      pintar();
    });
  }

  /* ------------------- clasificar ----------------------------- */

  function enVista(p, v) {
    if (v === 'vencidos') return p.estado === 'pendiente' && p.vence < hoy;
    if (v === 'devueltos') return p.estado === 'devuelto';
    if (v === 'proximos') return p.estado === 'pendiente' && p.vence >= hoy;
    if (v === 'banco') return p.estado === 'procesando';
    if (v === 'cobrados') return p.estado === 'cobrado';
    return false;
  }
  function cobrable(p) { return p.estado === 'pendiente' || p.estado === 'devuelto'; }
  function suma(l) { return l.reduce(function (s, p) { return s + p.importe_centimos; }, 0); }

  function elegirVistaInicial() {
    var orden = ['vencidos', 'devueltos', 'proximos', 'banco', 'cobrados'];
    for (var i = 0; i < orden.length; i++) {
      if (plazos.some(function (p) { return enVista(p, orden[i]); })) { vista = orden[i]; break; }
    }
  }

  /* ------------------- cifras --------------------------------- */

  function pintarCifras(cobrosMes) {
    var venc = plazos.filter(function (p) { return enVista(p, 'vencidos'); });
    var dev = plazos.filter(function (p) { return enVista(p, 'devueltos'); });
    var limite = new Date(); limite.setDate(limite.getDate() + 7);
    var lim = limite.toISOString().slice(0, 10);
    var semana = plazos.filter(function (p) { return p.estado === 'pendiente' && p.vence >= hoy && p.vence <= lim; });
    if (clienteFiltro) cobrosMes = cobrosMes.filter(function (k) { return k.cliente_id === clienteFiltro; });
    var cobradoMes = suma(cobrosMes);

    var el = document.getElementById('cifras');
    el.innerHTML =
      cifra('Vencido', P.euros(suma(venc)), venc.length ? cuenta(venc.length, 'plazo') + ' sin cobrar' : 'Nada vencido', venc.length, 'vencidos') +
      cifra('Devuelto por el banco', P.euros(suma(dev)), dev.length ? cuenta(dev.length, 'recibo') + ' por recuperar' : 'Ninguno', dev.length, 'devueltos') +
      cifra('Vence en 7 días', P.euros(suma(semana)), semana.length ? cuenta(semana.length, 'plazo') : 'Nada esta semana', 0, 'proximos') +
      '<div><dt>Cobrado este mes</dt><dd>' + P.euros(cobradoMes) + '</dd><div class="pn-nota">' +
        cuenta(cobrosMes.length, 'movimiento') + ' desde el día 1</div></div>';
    el.setAttribute('aria-busy', 'false');
    el.querySelectorAll('[data-vista]').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); cambiarVista(a.getAttribute('data-vista')); });
    });
  }
  function cifra(t, valor, nota, peligro, v) {
    return '<div' + (peligro ? ' class="peligro"' : '') + '><dt>' + esc(t) + '</dt><dd><a href="#" data-vista="' + v + '">' + valor +
      '</a></dd><div class="pn-nota">' + esc(nota) + '</div></div>';
  }
  function cuenta(n, palabra) { return n + ' ' + palabra + (n === 1 ? '' : 's'); }

  function avisoCliente() {
    var a = document.getElementById('aviso-cliente');
    if (!clienteFiltro) { a.hidden = true; return; }
    var nombre = plazos[0] && plazos[0].cliente ? plazos[0].cliente.nombre : 'este cliente';
    a.hidden = false;
    a.style.marginBottom = 'var(--s-4)';
    a.innerHTML = '<i data-lucide="filter" aria-hidden="true"></i><div>Solo los plazos de <strong>' + esc(nombre) +
      '</strong>. <a href="' + P.enlace('admin/cobros/') + '">Ver todos</a></div>';
    P.iconos();
  }

  /* ------------------- tabla ---------------------------------- */

  function quitarTildes(t) { return (t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  function lista() {
    var q = quitarTildes(buscar.trim());
    var l = plazos.filter(function (p) {
      if (!enVista(p, vista)) return false;
      if (!q) return true;
      return quitarTildes([p.cliente && p.cliente.nombre, p.persona && p.persona.nombre, p.concepto, p.actividad && p.actividad.nombre].join(' ')).indexOf(q) >= 0;
    });
    l.sort(function (a, b) {
      var x = vista === 'cobrados' ? (b.cobrado_en || b.vence) : a.vence;
      var y = vista === 'cobrados' ? (a.cobrado_en || a.vence) : b.vence;
      return x < y ? -1 : x > y ? 1 : 0;
    });
    return l;
  }

  function chip(p) {
    if (p.estado === 'cobrado') return '<span class="pn-chip ok">Cobrado</span>';
    if (p.estado === 'devuelto') return '<span class="pn-chip mal">Devuelto</span>';
    if (p.estado === 'procesando') return '<span class="pn-chip info">En el banco</span>';
    if (p.vence < hoy) {
      var dias = Math.round((new Date(hoy) - new Date(p.vence)) / 864e5);
      return '<span class="pn-chip mal">Vencido · ' + dias + (dias === 1 ? ' día' : ' días') + '</span>';
    }
    return '<span class="pn-chip">Pendiente</span>';
  }

  function forma(p) {
    if (p.estado === 'cobrado') return esc(METODO[p.metodo] || '—');
    return p.sepa_posible ? 'Domiciliado' : '<span style="color:var(--c-text-muted)">Sin domiciliar</span>';
  }

  function pintar() {
    document.querySelectorAll('#segmento button').forEach(function (b) {
      var v = b.getAttribute('data-vista');
      var n = plazos.filter(function (p) { return enVista(p, v); }).length;
      b.setAttribute('aria-pressed', v === vista ? 'true' : 'false');
      b.textContent = b.textContent.replace(/\s\(\d+\)$/, '') + (n ? ' (' + n + ')' : '');
    });

    var l = lista();
    var seleccionable = vista !== 'banco' && vista !== 'cobrados';
    caja.setAttribute('aria-busy', 'false');
    document.getElementById('resumen-tabla').textContent = l.length + ' plazos';
    document.getElementById('todas').closest('th').style.visibility = seleccionable ? '' : 'hidden';
    Object.keys(elegidos).forEach(function (id) { if (!l.some(function (p) { return p.id === id; })) delete elegidos[id]; });

    if (!l.length) {
      caja.hidden = true;
      sinFilas.hidden = false;
      var v = VISTAS[vista];
      sinFilas.innerHTML = buscar.trim()
        ? '<div class="pn-vacio"><i data-lucide="search-x" aria-hidden="true"></i><h3>Nada con esa búsqueda</h3><p>Prueba con otro nombre o concepto.</p></div>'
        : '<div class="pn-vacio"><i data-lucide="' + (vista === 'vencidos' || vista === 'devueltos' ? 'check-circle' : 'wallet') + '" aria-hidden="true"></i><h3>' +
          esc(v.vacio) + '</h3><p>' + esc(v.texto) + '</p></div>';
      pintarSeleccion();
      P.iconos();
      return;
    }
    caja.hidden = false;
    sinFilas.hidden = true;
    filas.innerHTML = l.map(function (p) {
      var sub = [p.concepto, p.persona && p.persona.nombre.split(' ')[0], p.actividad && p.actividad.nombre].filter(Boolean).join(' · ');
      var motivo = p.estado === 'devuelto' && p.devuelto_motivo ? '<span class="sub" style="color:var(--c-danger)">' + esc(p.devuelto_motivo) + '</span>' : '';
      var fecha = p.estado === 'cobrado' && p.cobrado_en ? P.fechaCorta(p.cobrado_en) : P.fechaCorta(p.vence);
      var ficha = p.cliente && p.cliente.id ? P.enlace('admin/clientes/ficha/?id=' + encodeURIComponent(p.cliente.id)) + '#pagos' : '#';
      return '<tr' + (elegidos[p.id] ? ' aria-selected="true"' : '') + '>' +
        '<td class="sel">' + (seleccionable ? '<input type="checkbox" class="pn-casilla" data-id="' + esc(p.id) + '"' + (elegidos[p.id] ? ' checked' : '') +
          ' aria-label="Seleccionar ' + esc(p.concepto + ' de ' + (p.cliente ? p.cliente.nombre : '')) + '">' : '') + '</td>' +
        '<td data-titulo="' + (p.estado === 'cobrado' ? 'Cobrado' : 'Vence') + '">' + fecha + '</td>' +
        '<td data-titulo="Cliente" class="principal"><div><a href="' + ficha + '">' + esc(p.cliente ? p.cliente.nombre : '—') + '</a><span class="sub">' + esc(sub) + '</span>' + motivo + '</div></td>' +
        '<td data-titulo="Forma" class="ancho-solo">' + forma(p) + '</td>' +
        '<td data-titulo="Estado">' + chip(p) + '</td>' +
        '<td data-titulo="Importe" class="num">' + P.euros(p.importe_centimos) + '</td>' +
        '<td data-titulo="">' + (cobrable(p) ? '<button class="pn-boton peq" data-apuntar="' + esc(p.id) + '">Apuntar</button>' : '') + '</td>' +
      '</tr>';
    }).join('');

    var pie = document.getElementById('pie');
    pie.hidden = false;
    document.getElementById('pie-texto').textContent = 'Total ' + (vista === 'cobrados' ? 'cobrado' : 'de la lista');
    document.getElementById('pie-total').textContent = P.euros(suma(l));
    pintarSeleccion();
  }

  /* ------------------- selección y SEPA ------------------------ */

  function seleccionados() { return plazos.filter(function (p) { return elegidos[p.id] && cobrable(p); }); }

  function pintarSeleccion() {
    var sel = seleccionados();
    var todas = document.getElementById('todas');
    var visibles = filas.querySelectorAll('.pn-casilla');
    todas.checked = visibles.length > 0 && sel.length === visibles.length;
    todas.indeterminate = sel.length > 0 && sel.length < visibles.length;
    var barra = document.getElementById('seleccion');
    barra.hidden = sel.length === 0;
    var sepa = sel.filter(function (p) { return p.sepa_posible; });
    document.getElementById('cuenta-sel').textContent = cuenta(sel.length, 'seleccionado').replace('seleccionados', 'seleccionados') +
      ' · ' + P.euros(suma(sel)) + (sepa.length < sel.length ? ' · ' + (sel.length - sepa.length) + ' sin domiciliar' : '');
    var b = document.getElementById('btn-sepa');
    b.disabled = sepa.length === 0;
    b.textContent = sepa.length ? 'Cobrar ' + sepa.length + ' por SEPA' : 'Ninguno domiciliado';
  }

  filas.addEventListener('change', function (e) {
    var c = e.target.closest('.pn-casilla');
    if (!c) return;
    if (c.checked) elegidos[c.getAttribute('data-id')] = true; else delete elegidos[c.getAttribute('data-id')];
    c.closest('tr').setAttribute('aria-selected', c.checked ? 'true' : 'false');
    pintarSeleccion();
  });
  document.getElementById('todas').addEventListener('change', function () {
    var marcar = this.checked;
    filas.querySelectorAll('.pn-casilla').forEach(function (c) {
      c.checked = marcar;
      if (marcar) elegidos[c.getAttribute('data-id')] = true; else delete elegidos[c.getAttribute('data-id')];
      c.closest('tr').setAttribute('aria-selected', marcar ? 'true' : 'false');
    });
    pintarSeleccion();
  });

  var modalSepa = document.getElementById('modal-sepa');
  document.getElementById('btn-sepa').addEventListener('click', function () {
    var sepa = seleccionados().filter(function (p) { return p.sepa_posible; });
    if (!sepa.length) return;
    document.getElementById('sepa-detalle').textContent = 'Se pasarán ' + cuenta(sepa.length, 'recibo') + ' por ' + P.euros(suma(sepa)) +
      ' a las cuentas domiciliadas. El banco tarda unos días en confirmarlos.' +
      (sepa.length < seleccionados().length ? ' Los que no están domiciliados no se tocan.' : '');
    modalSepa.showModal();
  });
  modalSepa.addEventListener('close', function () {
    if (modalSepa.returnValue !== 'si') return;
    var sepa = seleccionados().filter(function (p) { return p.sepa_posible; });
    var boton = document.getElementById('btn-sepa');
    boton.setAttribute('aria-busy', 'true');
    var lanzados = 0, problemas = [];
    /* de uno en uno: Stripe y el webhook lo agradecen */
    sepa.reduce(function (cadena, p) {
      return cadena.then(function () {
        return DATOS.cobrarSepa(p.id).then(function (r) {
          lanzados += r.lanzados || 0;
          problemas = problemas.concat(r.saltados || [], r.errores || []);
        }).catch(function (e) { problemas.push(p.concepto + ': ' + e.message); });
      });
    }, Promise.resolve()).then(function () {
      boton.removeAttribute('aria-busy');
      elegidos = {};
      if (lanzados) P.avisar(cuenta(lanzados, 'recibo') + ' enviados al banco. Saldrán «En el banco» hasta que respondan.');
      if (problemas.length) P.avisar('No se pudieron pasar: ' + problemas.join(' · '), true);
      return cargar();
    }).catch(fallo);
  });

  /* ------------------- apuntar un cobro ------------------------ */

  var modal = document.getElementById('modal');
  var form = document.getElementById('form-cobro');
  var abridor = null;

  filas.addEventListener('click', function (e) {
    var b = e.target.closest('[data-apuntar]');
    if (!b) return;
    enCurso = plazos.filter(function (p) { return p.id === b.getAttribute('data-apuntar'); })[0];
    if (!enCurso) return;
    abridor = b;
    document.getElementById('modal-detalle').textContent = enCurso.cliente.nombre + ' · ' + enCurso.concepto + ' · ' + P.euros(enCurso.importe_centimos);
    var imp = document.getElementById('c-importe');
    imp.value = (enCurso.importe_centimos / 100).toFixed(2).replace('.', ',');
    document.getElementById('c-importe-ayuda').textContent = 'Si pagan menos, el resto queda pendiente.';
    var f = document.getElementById('c-fecha');
    f.value = hoy; f.max = hoy;
    document.getElementById('c-ref').value = '';
    document.getElementById('c-notas').value = '';
    document.getElementById('c-metodo').value = enCurso.estado === 'devuelto' ? 'transferencia' : 'efectivo';
    limpiarErrores();
    modal.showModal();
    imp.focus(); imp.select();
  });
  document.getElementById('c-cancelar').addEventListener('click', function () { modal.close(); });
  modal.addEventListener('close', function () { if (abridor && document.body.contains(abridor)) abridor.focus(); });

  function limpiarErrores() {
    ['c-importe', 'c-fecha'].forEach(function (id) {
      document.getElementById(id).setAttribute('aria-invalid', 'false');
      document.getElementById(id + '-err').hidden = true;
    });
    document.getElementById('c-error').hidden = true;
  }
  function errorCampo(id, texto) {
    var el = document.getElementById(id);
    el.setAttribute('aria-invalid', 'true');
    var e = document.getElementById(id + '-err');
    e.textContent = texto; e.hidden = false;
    return el;
  }
  function aCentimos(t) {
    t = String(t || '').trim().replace(/\s|€/g, '');
    if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t)) t = t.replace(/\./g, '');
    t = t.replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
    return Math.round(parseFloat(t) * 100);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    limpiarErrores();
    var importe = aCentimos(document.getElementById('c-importe').value);
    var fecha = document.getElementById('c-fecha').value;
    var primero = null;
    if (importe === null || importe <= 0) primero = errorCampo('c-importe', 'Escribe un importe, por ejemplo 35 o 35,50.');
    else if (importe > enCurso.importe_centimos) primero = errorCampo('c-importe', 'No puede ser más que el plazo (' + P.euros(enCurso.importe_centimos) + ').');
    if (!fecha || fecha > hoy) primero = primero || errorCampo('c-fecha', 'Pon una fecha de hoy o anterior.');
    if (primero) { primero.focus(); return; }

    var boton = document.getElementById('c-guardar');
    boton.setAttribute('aria-busy', 'true');
    var parcial = importe < enCurso.importe_centimos;
    var resto = enCurso.importe_centimos - importe;
    DATOS.apuntarCobro(enCurso.id, {
      importe_centimos: importe,
      metodo: document.getElementById('c-metodo').value,
      fecha: fecha,
      referencia: document.getElementById('c-ref').value.trim(),
      notas: document.getElementById('c-notas').value.trim()
    }).then(function () {
      boton.removeAttribute('aria-busy');
      abridor = null;
      modal.close();
      P.avisar('Cobro de ' + P.euros(importe) + ' apuntado' + (parcial ? '. Quedan ' + P.euros(resto) + ' pendientes.' : '.'));
      return cargar();
    }).catch(function (err) {
      boton.removeAttribute('aria-busy');
      var caja = document.getElementById('c-error');
      caja.textContent = 'No se ha podido apuntar: ' + err.message;
      caja.hidden = false;
    });
  });

  /* ------------------- filtros --------------------------------- */

  function cambiarVista(v) { vista = v; elegidos = {}; pintar(); }
  document.getElementById('segmento').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (b) cambiarVista(b.getAttribute('data-vista'));
  });
  var pausa = null;
  document.getElementById('buscar').addEventListener('input', function () {
    var v = this.value;
    clearTimeout(pausa);
    pausa = setTimeout(function () { buscar = v; pintar(); }, 200);
  });

  /* ------------------- CSV para la contable --------------------- */

  document.getElementById('btn-contable').addEventListener('click', function () {
    var mes = document.getElementById('mes').value;
    if (!/^\d{4}-\d{2}$/.test(mes)) { P.avisar('Elige un mes.', true); return; }
    var y = +mes.slice(0, 4), m = +mes.slice(5, 7);
    var desde = mes + '-01';
    var hasta = mes + '-' + String(new Date(y, m, 0).getDate()).padStart(2, '0');
    var boton = this;
    boton.setAttribute('aria-busy', 'true');
    DATOS.listarCobros(desde, hasta).then(function (l) {
      boton.removeAttribute('aria-busy');
      if (!l.length) { P.avisar('No hay cobros en ' + mes + '.', true); return; }
      var cab = ['Fecha', 'Cliente', 'NIF', 'Concepto', 'Forma de pago', 'Importe (€)', 'Referencia', 'Notas'];
      var lineas = [cab].concat(l.map(function (k) {
        return [k.fecha, k.cliente ? k.cliente.nombre : '', k.cliente ? k.cliente.nif : '', k.concepto || '',
          METODO[k.metodo] || k.metodo, (k.importe_centimos / 100).toFixed(2).replace('.', ','), k.referencia || '', k.notas || ''];
      }));
      var total = l.reduce(function (s, k) { return s + k.importe_centimos; }, 0);
      lineas.push(['', '', '', '', 'Total', (total / 100).toFixed(2).replace('.', ','), '', '']);
      var csv = '﻿' + lineas.map(function (r) {
        return r.map(function (v) { v = String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(';');
      }).join('\r\n');
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      a.download = 'cobros-itaka-' + mes + '.csv';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      P.avisar(cuenta(l.length, 'movimiento') + ' de ' + mes + ' descargados (' + P.euros(total) + ').');
    }).catch(function (e) {
      boton.removeAttribute('aria-busy');
      P.avisar('No se ha podido descargar: ' + e.message, true);
    });
  });
})();
