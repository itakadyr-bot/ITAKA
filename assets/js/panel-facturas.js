/* ============================================================
   FACTURAS · registro · /admin/facturas/[?cliente=…&nueva]
   ------------------------------------------------------------
   Las facturas las emite la contable con su programa (Verifactu va
   por su cuenta). Aquí se ARCHIVAN: número, cliente, importes, si
   está cobrada y el PDF, guardado en un sitio privado.
   ?cliente=<id> enseña solo las de ese cliente; &nueva abre el alta
   con el cliente ya puesto (desde la ficha).
   ============================================================ */
(function () {
  'use strict';

  var P = window.PANEL;
  var esc = P.esc;
  var hoy = P.hoy();
  var q = new URLSearchParams(location.search);
  var clienteFiltro = q.get('cliente');
  var DATOS = null;
  var facturas = [];
  var clientes = [];
  var vista = 'todas';
  var buscar = '';
  var editando = null;

  var ESTADOS = { pendiente: 'Pendiente', parcial: 'Cobrada en parte', cobrada: 'Cobrada', anulada: 'Anulada' };

  var filas = document.getElementById('filas');
  var caja = document.getElementById('caja-tabla');
  var sinFilas = document.getElementById('sin-filas');

  P.entrar().then(function (sesion) {
    DATOS = window.DATOS_PANEL.crear(sesion);
    return Promise.all([DATOS.listarFacturas(), DATOS.listarClientes({})]);
  }).then(function (r) {
    facturas = r[0]; clientes = r[1];
    document.getElementById('lista-clientes').innerHTML = clientes.map(function (c) {
      return '<option value="' + esc(c.nombre) + '"></option>';
    }).join('');
    pintar();
    if (q.has('nueva')) abrir(null);
  }).catch(fallo);

  function fallo(e) {
    caja.hidden = true; sinFilas.hidden = false;
    sinFilas.innerHTML = '<div class="pn-cuerpo"><div class="pn-aviso mal" role="alert"><i data-lucide="x-circle" aria-hidden="true"></i><div>' +
      esc(e.sinTablas ? 'Falta la tabla de facturas en la base de datos.' : 'No se han podido cargar las facturas: ' + e.message + '.') +
      ' <button class="pn-boton peq" onclick="location.reload()">Reintentar</button></div></div></div>';
    document.querySelectorAll('#cifras dd').forEach(function (d) { d.textContent = '—'; });
    document.getElementById('cifras').setAttribute('aria-busy', 'false');
    P.iconos();
  }

  function recargar() {
    return DATOS.listarFacturas().then(function (l) { facturas = l; pintar(); });
  }

  /* ------------------- clasificar ------------------------------ */

  function vencida(f) { return (f.estado === 'pendiente' || f.estado === 'parcial') && f.vence && f.vence < hoy; }
  function enVista(f, v) {
    if (v === 'pendientes') return f.estado === 'pendiente' || f.estado === 'parcial';
    if (v === 'vencidas') return vencida(f);
    if (v === 'cobradas') return f.estado === 'cobrada';
    if (v === 'anuladas') return f.estado === 'anulada';
    return true;
  }
  function suma(l) { return l.reduce(function (s, f) { return s + (f.total_centimos || 0); }, 0); }
  function quitarTildes(t) { return (t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function base() {
    return facturas.filter(function (f) { return !clienteFiltro || (f.cliente && f.cliente.id === clienteFiltro) || f.cliente_id === clienteFiltro; });
  }

  /* ------------------- pintar ---------------------------------- */

  function pintar() {
    var todas = base();
    var vivas = todas.filter(function (f) { return f.estado !== 'anulada'; });
    var mes = hoy.slice(0, 7), anyo = hoy.slice(0, 4);
    var esteMes = vivas.filter(function (f) { return f.fecha.slice(0, 7) === mes; });
    var pendientes = vivas.filter(function (f) { return f.estado === 'pendiente' || f.estado === 'parcial'; });
    var vencidas = vivas.filter(vencida);
    var esteAnyo = vivas.filter(function (f) { return f.fecha.slice(0, 4) === anyo; });
    var cifras = document.getElementById('cifras');
    cifras.innerHTML =
      '<div><dt>Facturado este mes</dt><dd>' + P.euros(suma(esteMes)) + '</dd><div class="pn-nota">' + esteMes.length + ' facturas</div></div>' +
      '<div><dt>Pendiente de cobro</dt><dd>' + P.euros(suma(pendientes)) + '</dd><div class="pn-nota">' + pendientes.length + ' facturas</div></div>' +
      '<div' + (vencidas.length ? ' class="peligro"' : '') + '><dt>Vencidas</dt><dd>' + P.euros(suma(vencidas)) + '</dd><div class="pn-nota">' +
        (vencidas.length ? vencidas.length + ' sin cobrar pasada la fecha' : 'Ninguna') + '</div></div>' +
      '<div><dt>Facturado en ' + anyo + '</dt><dd>' + P.euros(suma(esteAnyo)) + '</dd><div class="pn-nota">' + esteAnyo.length + ' facturas</div></div>';
    cifras.setAttribute('aria-busy', 'false');

    document.querySelectorAll('#segmento button').forEach(function (b) {
      var v = b.getAttribute('data-v');
      var n = todas.filter(function (f) { return enVista(f, v); }).length;
      b.setAttribute('aria-pressed', v === vista ? 'true' : 'false');
      b.textContent = b.textContent.replace(/\s\(\d+\)$/, '') + (n ? ' (' + n + ')' : '');
    });

    var mesFiltro = document.getElementById('mes').value;
    var t = quitarTildes(buscar.trim());
    var lista = todas.filter(function (f) {
      if (!enVista(f, vista)) return false;
      if (mesFiltro && f.fecha.slice(0, 7) !== mesFiltro) return false;
      if (!t) return true;
      return quitarTildes([f.numero, f.cliente && f.cliente.nombre, f.concepto].join(' ')).indexOf(t) >= 0;
    });
    caja.setAttribute('aria-busy', 'false');
    document.getElementById('resumen-tabla').textContent = lista.length + ' facturas';

    if (!lista.length) {
      caja.hidden = true; sinFilas.hidden = false;
      var hay = todas.length > 0;
      sinFilas.innerHTML = '<div class="pn-vacio"><i data-lucide="' + (hay ? 'search-x' : 'file-text') + '" aria-hidden="true"></i><h3>' +
        (hay ? 'Ninguna con este filtro' : 'Todavía no hay facturas') + '</h3><p>' +
        (hay ? 'Prueba con otra pestaña, otro mes o quita la búsqueda.' : 'Cuando la contable te pase una, añádela con su PDF.') + '</p>' +
        (hay ? '' : '<button class="pn-boton primario" id="vacio-nueva">Añadir factura</button>') + '</div>';
      var b = document.getElementById('vacio-nueva');
      if (b) b.addEventListener('click', function () { abrir(null); });
      document.getElementById('pie').hidden = true;
      P.iconos();
      return;
    }
    caja.hidden = false; sinFilas.hidden = true;
    filas.innerHTML = lista.map(function (f) {
      var desglose = 'Base ' + P.euros(f.base_centimos) + (f.iva_centimos ? ' · IVA ' + P.euros(f.iva_centimos) : '') + (f.irpf_centimos ? ' · IRPF −' + P.euros(f.irpf_centimos) : '');
      var ficha = f.cliente && f.cliente.id ? P.enlace('admin/clientes/ficha/?id=' + encodeURIComponent(f.cliente.id)) : '#';
      return '<tr>' +
        '<td data-titulo="Número"><span class="numero">' + esc(f.numero) + '</span><span class="sub">' + P.fechaCorta(f.fecha) + ' ' + f.fecha.slice(0, 4) + '</span></td>' +
        '<td data-titulo="Cliente" class="principal"><div class="pn-con-iniciales"><span class="pn-iniciales" aria-hidden="true">' + esc(P.iniciales(f.cliente && f.cliente.nombre)) + '</span>' +
          '<div><a href="' + ficha + '">' + esc(f.cliente ? f.cliente.nombre : '—') + '</a><span class="sub">' + esc(f.concepto) + '</span></div></div></td>' +
        '<td data-titulo="Vence" class="ancho-solo">' + (f.vence ? P.fechaCorta(f.vence) : '—') + (vencida(f) ? '<span class="sub" style="color:var(--c-danger)">vencida</span>' : '') + '</td>' +
        '<td data-titulo="Total" class="num"><strong>' + P.euros(f.total_centimos) + '</strong><span class="sub">' + esc(desglose) + '</span></td>' +
        '<td data-titulo="Estado">' + selectorEstado(f) + '</td>' +
        '<td data-titulo=""><div style="display:flex;gap:6px;justify-content:flex-end">' +
          (f.archivo ? '<button class="pn-boton peq" data-pdf="' + esc(f.id) + '" aria-label="Abrir el PDF de ' + esc(f.numero) + '"><i data-lucide="file-text" aria-hidden="true"></i>PDF</button>'
                     : '<span class="pn-chip" title="Falta el PDF">Sin PDF</span>') +
          '<button class="pn-boton peq fantasma" data-editar="' + esc(f.id) + '" aria-label="Editar ' + esc(f.numero) + '"><i data-lucide="pencil" aria-hidden="true"></i></button>' +
        '</div></td></tr>';
    }).join('');
    document.getElementById('pie').hidden = false;
    document.getElementById('pie-total').textContent = P.euros(suma(lista.filter(function (f) { return f.estado !== 'anulada'; })));
    P.iconos();
  }

  function selectorEstado(f) {
    var color = f.estado === 'cobrada' ? 'cobrada' : f.estado === 'anulada' ? 'anulada' : vencida(f) ? 'vencido' : f.estado === 'parcial' ? 'pendiente' : 'pendiente';
    return '<label class="solo-lector" for="e-' + esc(f.id) + '">Estado de ' + esc(f.numero) + '</label>' +
      '<select class="pn-estado" id="e-' + esc(f.id) + '" data-factura="' + esc(f.id) + '" data-estado="' + color + '">' +
      Object.keys(ESTADOS).map(function (k) { return '<option value="' + k + '"' + (k === f.estado ? ' selected' : '') + '>' + ESTADOS[k] + '</option>'; }).join('') + '</select>';
  }

  /* ------------------- acciones de la tabla --------------------- */

  var modalAnular = document.getElementById('modal-anular');
  var pendienteAnular = null;

  filas.addEventListener('change', function (e) {
    var s = e.target.closest('select.pn-estado');
    if (!s) return;
    var f = facturas.filter(function (x) { return x.id === s.getAttribute('data-factura'); })[0];
    if (!f) return;
    if (s.value === 'anulada') {
      pendienteAnular = { f: f, s: s };
      document.getElementById('a-detalle').textContent = 'La factura ' + f.numero + ' (' + P.euros(f.total_centimos) +
        ') deja de contar en los totales. Si la contable hizo una rectificativa, añádela también.';
      modalAnular.showModal();
      return;
    }
    cambiar(f, s.value, s);
  });
  modalAnular.addEventListener('close', function () {
    if (!pendienteAnular) return;
    var p = pendienteAnular; pendienteAnular = null;
    if (modalAnular.returnValue === 'si') cambiar(p.f, 'anulada', p.s);
    else p.s.value = p.f.estado;
  });

  function cambiar(f, estado, select) {
    var antes = f.estado;
    DATOS.cambiarEstadoFactura(f.id, estado).then(function () {
      P.avisar('Factura ' + f.numero + ': ' + ESTADOS[estado].toLowerCase() + '.');
      return recargar();
    }).then(function () {
      var s = document.getElementById('e-' + f.id);
      if (s) s.focus();
    }).catch(function (e) {
      select.value = antes;
      P.avisar('No se ha podido cambiar: ' + e.message, true);
    });
  }

  filas.addEventListener('click', function (e) {
    var pdf = e.target.closest('[data-pdf]');
    if (pdf) {
      var f = facturas.filter(function (x) { return x.id === pdf.getAttribute('data-pdf'); })[0];
      /* la ventana se abre antes de pedir el enlace, para que el
         navegador no la bloquee */
      var ventana = P.DEMO ? null : window.open('', '_blank');
      DATOS.abrirFactura(f.archivo).then(function (url) {
        if (ventana) ventana.location = url; else window.open(url, '_blank');
      }).catch(function (err) {
        if (ventana) ventana.close();
        P.avisar(err.message, !P.DEMO);
      });
      return;
    }
    var ed = e.target.closest('[data-editar]');
    if (ed) abrir(facturas.filter(function (x) { return x.id === ed.getAttribute('data-editar'); })[0]);
  });

  /* ------------------- filtros ----------------------------------- */

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
  document.getElementById('mes').addEventListener('change', pintar);

  /* ------------------- alta y edición ----------------------------- */

  var modal = document.getElementById('modal');
  var form = document.getElementById('form');
  var abridor = null;
  document.getElementById('btn-nueva').addEventListener('click', function () { abrir(null); });
  document.getElementById('f-cancelar').addEventListener('click', function () { modal.close(); });
  modal.addEventListener('close', function () { if (abridor && document.body.contains(abridor)) abridor.focus(); });

  function centimos(t) {
    t = String(t || '').trim().replace(/\s|€/g, '');
    if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t)) t = t.replace(/\./g, '');
    t = t.replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
    return Math.round(parseFloat(t) * 100);
  }
  function aEuros(c) { return (c / 100).toFixed(2).replace('.', ','); }

  function calcular() {
    var b = centimos(document.getElementById('f-base').value) || 0;
    var iva = Math.round(b * parseFloat(document.getElementById('f-iva').value) / 100);
    var irpf = Math.round(b * parseFloat(document.getElementById('f-irpf').value) / 100);
    document.getElementById('t-iva').textContent = P.euros(iva);
    document.getElementById('t-irpf').textContent = irpf ? '−' + P.euros(irpf) : P.euros(0);
    document.getElementById('t-total').textContent = P.euros(b + iva - irpf);
    return { base: b, iva: iva, irpf: irpf };
  }
  ['f-base', 'f-iva', 'f-irpf'].forEach(function (id) {
    document.getElementById(id).addEventListener('input', calcular);
    document.getElementById(id).addEventListener('change', calcular);
  });

  function abrir(f) {
    editando = f;
    abridor = document.activeElement;
    limpiar();
    document.getElementById('m-titulo').textContent = f ? 'Editar factura ' + f.numero : 'Añadir factura';
    var cli = f ? clientes.filter(function (c) { return c.id === (f.cliente && f.cliente.id || f.cliente_id); })[0]
                : (clienteFiltro && clientes.filter(function (c) { return c.id === clienteFiltro; })[0]);
    document.getElementById('f-cliente').value = cli ? cli.nombre : '';
    document.getElementById('f-numero').value = f ? f.numero : '';
    document.getElementById('f-fecha').value = f ? f.fecha : hoy;
    document.getElementById('f-vence').value = f && f.vence ? f.vence : '';
    document.getElementById('f-concepto').value = f ? f.concepto : '';
    document.getElementById('f-base').value = f ? aEuros(f.base_centimos) : '';
    document.getElementById('f-iva').value = f ? String(Math.round(f.iva_pct || 0)) : '0';
    var irpfPct = f && f.base_centimos ? Math.round(f.irpf_centimos * 100 / f.base_centimos) : 0;
    document.getElementById('f-irpf').value = [0, 7, 15].indexOf(irpfPct) >= 0 ? String(irpfPct) : '0';
    document.getElementById('f-estado').value = f ? f.estado : 'pendiente';
    document.getElementById('f-notas').value = f && f.notas ? f.notas : '';
    document.getElementById('f-pdf').value = '';
    document.getElementById('f-pdf-ayuda').textContent = f && f.archivo ? 'Ya tiene PDF. Elige otro solo si quieres cambiarlo.' : 'Mejor con el PDF: así está todo junto.';
    calcular();
    modal.showModal();
    document.getElementById(cli ? 'f-numero' : 'f-cliente').focus();
  }

  function limpiar() {
    form.querySelectorAll('[aria-invalid="true"]').forEach(function (x) { x.setAttribute('aria-invalid', 'false'); });
    form.querySelectorAll('.pn-error').forEach(function (x) { x.hidden = true; });
    document.getElementById('f-error').hidden = true;
  }
  function error(id, texto) {
    var el = document.getElementById(id);
    el.setAttribute('aria-invalid', 'true');
    var e = document.getElementById(id + '-err');
    e.textContent = texto; e.hidden = false;
    return el;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    limpiar();
    var nombre = document.getElementById('f-cliente').value.trim();
    var cli = clientes.filter(function (c) { return c.nombre.toLowerCase() === nombre.toLowerCase(); })[0];
    var numero = document.getElementById('f-numero').value.trim();
    var fecha = document.getElementById('f-fecha').value;
    var vence = document.getElementById('f-vence').value;
    var concepto = document.getElementById('f-concepto').value.trim();
    var baseC = centimos(document.getElementById('f-base').value);
    var archivo = document.getElementById('f-pdf').files[0] || null;
    var primero = null;
    if (!cli) primero = error('f-cliente', nombre ? 'No hay ningún cliente con ese nombre. Elígelo de la lista o dalo de alta primero.' : 'Elige el cliente.');
    if (!numero) primero = primero || error('f-numero', 'Pon el número de la factura.');
    if (!fecha) primero = primero || error('f-fecha', 'Pon la fecha.');
    if (vence && fecha && vence < fecha) primero = primero || error('f-vence', 'No puede vencer antes de la fecha de la factura.');
    if (!concepto) primero = primero || error('f-concepto', 'Escribe un concepto corto.');
    if (baseC === null) primero = primero || error('f-base', 'Escribe la base, por ejemplo 480 o 480,50.');
    if (archivo && archivo.size > 10 * 1024 * 1024) primero = primero || error('f-pdf', 'Pesa más de 10 MB.');
    if (archivo && !/pdf|jpeg|png/.test(archivo.type)) primero = primero || error('f-pdf', 'Tiene que ser un PDF o una foto (JPG o PNG).');
    if (primero) { primero.focus(); return; }

    var t = calcular();
    var estado = document.getElementById('f-estado').value;
    var datos = {
      cliente_id: cli.id, numero: numero, fecha: fecha, vence: vence || null, concepto: concepto,
      base_centimos: t.base, iva_pct: parseFloat(document.getElementById('f-iva').value), iva_centimos: t.iva, irpf_centimos: t.irpf,
      estado: estado, cobrada_en: estado === 'cobrada' ? (editando && editando.cobrada_en || hoy) : null,
      notas: document.getElementById('f-notas').value.trim() || null
    };
    if (editando) { datos.id = editando.id; datos.archivo = editando.archivo; }
    var boton = document.getElementById('f-guardar');
    boton.setAttribute('aria-busy', 'true');
    DATOS.guardarFactura(datos, archivo).then(function () {
      boton.removeAttribute('aria-busy');
      abridor = document.getElementById('btn-nueva');
      modal.close();
      P.avisar('Factura ' + numero + ' guardada' + (archivo ? ' con su PDF.' : '.') + (P.DEMO ? ' (Demostración: no se guarda de verdad.)' : ''));
      return recargar();
    }).catch(function (err) {
      boton.removeAttribute('aria-busy');
      if (err.duplicado) { error('f-numero', 'Ya hay una factura con este número.').focus(); return; }
      var c = document.getElementById('f-error');
      c.textContent = 'No se ha guardado: ' + err.message;
      c.hidden = false;
    });
  });

  /* ------------------- CSV ------------------------------------------ */

  document.getElementById('btn-csv').addEventListener('click', function () {
    var mesFiltro = document.getElementById('mes').value;
    var l = base().filter(function (f) { return enVista(f, vista) && (!mesFiltro || f.fecha.slice(0, 7) === mesFiltro); });
    if (!l.length) { P.avisar('No hay facturas que descargar con este filtro.', true); return; }
    var cab = ['Número', 'Fecha', 'Vence', 'Cliente', 'NIF', 'Concepto', 'Base (€)', 'IVA %', 'IVA (€)', 'IRPF (€)', 'Total (€)', 'Estado', 'Cobrada el'];
    var d = function (c) { return (c / 100).toFixed(2).replace('.', ','); };
    var lineas = [cab].concat(l.map(function (f) {
      return [f.numero, f.fecha, f.vence || '', f.cliente ? f.cliente.nombre : '', f.cliente ? f.cliente.nif : '', f.concepto,
        d(f.base_centimos), String(f.iva_pct).replace('.', ','), d(f.iva_centimos), d(f.irpf_centimos), d(f.total_centimos), ESTADOS[f.estado], f.cobrada_en || ''];
    }));
    var csv = '﻿' + lineas.map(function (r) {
      return r.map(function (v) { v = String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(';');
    }).join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'facturas-itaka' + (mesFiltro ? '-' + mesFiltro : '') + '.csv';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    P.avisar(l.length + ' facturas descargadas.');
  });
})();
