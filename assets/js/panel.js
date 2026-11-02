/* ============================================================
   PANEL DE GESTIÓN · armazón común de las páginas de /admin/
   ------------------------------------------------------------
   Cada página trae solo su <main class="pn-pagina">. Este archivo
   le pone alrededor la barra lateral, la barra de arriba y el
   menú del móvil, mira quién ha entrado y deja a mano utilidades
   (euros, fechas, avisos flotantes, escapar texto).

   La página dice dónde está con atributos en <body>:
     data-seccion="clientes"            qué enlace va marcado
     data-ruta="Clientes|Ficha"         la ruta de arriba
     data-raiz="../../"                 cuánto subir hasta la raíz

   La seguridad NO está aquí: está en la base (RLS + es_admin()).
   Esto solo decide qué se enseña mientras tanto.
   ============================================================ */
(function () {
  'use strict';

  var body = document.body;
  var RAIZ = body.getAttribute('data-raiz') || '../';
  var SECCION = body.getAttribute('data-seccion') || '';
  var RUTA = (body.getAttribute('data-ruta') || '').split('|').filter(Boolean);
  var DEMO = /[?&]demo\b/.test(location.search);

  var ICONO = {
    inicio: 'layout-dashboard', clientes: 'users', cobros: 'wallet',
    actividades: 'calendar-days', equipo: 'id-card', gastos: 'receipt',
    campamentos: 'tent'
  };

  /* Lo que hay hecho y lo que llega después. «pronto» sale en gris. */
  var PRINCIPAL = [
    { id: 'inicio', texto: 'Resumen', href: 'admin/inicio/', pronto: true },
    { id: 'clientes', texto: 'Clientes', href: 'admin/clientes/' },
    { id: 'cobros', texto: 'Cobros', href: 'admin/cobros/' },
    { id: 'actividades', texto: 'Actividades', href: 'admin/actividades/', pronto: true }
  ];
  var GRUPOS = [
    { titulo: 'Equipo', enlaces: [
      { id: 'equipo', texto: 'Monitores', href: 'admin/equipo/', pronto: true }
    ] },
    { titulo: 'Dinero', enlaces: [
      { id: 'gastos', texto: 'Gastos', href: 'admin/gastos/', pronto: true }
    ] },
    { titulo: 'Web', enlaces: [
      { id: 'campamentos', texto: 'Listas de campamentos', href: 'admin/' }
    ] }
  ];

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function enlace(e) {
    /* lo que aún no existe no es un enlace: así nadie acaba en un 404 */
    if (e.pronto) {
      return '<span class="pronto" aria-disabled="true"><i data-lucide="' + (ICONO[e.id] || 'circle') +
        '" aria-hidden="true"></i>' + esc(e.texto) + '<span class="solo-lector"> (próximamente)</span></span>';
    }
    var actual = e.id === SECCION;
    var href = RAIZ + e.href + (DEMO ? '?demo' : '');
    return '<a href="' + href + '"' + (actual ? ' aria-current="page"' : '') +
      (e.pronto ? ' class="pronto"' : '') + '><i data-lucide="' + (ICONO[e.id] || 'circle') +
      '" aria-hidden="true"></i>' + esc(e.texto) + '</a>';
  }

  /* ------------------- pintar el armazón ---------------------- */

  var main = document.querySelector('main.pn-pagina');
  var app = document.createElement('div');
  app.className = 'pn-app';

  var grupos = GRUPOS.map(function (g) {
    var abierto = g.enlaces.some(function (e) { return e.id === SECCION; });
    return '<details class="pn-grupo"' + (abierto ? ' open' : '') + '><summary>' + esc(g.titulo) +
      '</summary><nav class="pn-nav" aria-label="' + esc(g.titulo) + '">' +
      g.enlaces.map(enlace).join('') + '</nav></details>';
  }).join('');

  var ruta = ['Gestión'].concat(RUTA).map(function (r, i, todo) {
    var ultimo = i === todo.length - 1;
    return '<li' + (ultimo ? ' aria-current="page"' : '') + '>' + esc(r) + '</li>';
  }).join('');

  app.innerHTML =
    '<aside class="pn-lateral" id="pn-lateral">' +
      '<a class="pn-marca" href="' + RAIZ + '"><img src="' + RAIZ + 'assets/img/logo-color.png" alt="Ítaka Deporte y Recreación">' +
      '<span>Gestión del día a día</span></a>' +
      '<nav class="pn-nav" aria-label="Panel">' + PRINCIPAL.map(enlace).join('') + '</nav>' +
      grupos +
      '<div class="pn-lateral-pie">' + (DEMO
        ? 'Modo demostración: datos inventados, nada se guarda.'
        : 'Solo para administración de Ítaka.') + '</div>' +
    '</aside>' +
    '<div class="pn-velo" id="pn-velo"></div>' +
    '<div class="pn-principal">' +
      '<header class="pn-barra">' +
        '<button class="pn-menu-movil" id="pn-menu" aria-label="Abrir el menú" aria-controls="pn-lateral" aria-expanded="false">' +
          '<i data-lucide="menu" aria-hidden="true"></i></button>' +
        '<ol class="pn-ruta" aria-label="Estás en">' + ruta + '</ol>' +
        '<span class="pn-hueco"></span>' +
        (DEMO ? '<span class="pn-chip aviso">Demostración</span>' : '') +
        '<div class="pn-cuenta-menu"><span class="pn-avatar" id="pn-avatar" aria-hidden="true">·</span>' +
          '<div><b id="pn-cuenta">…</b><small>Administración</small></div></div>' +
      '</header>' +
    '</div>' +
    '<div class="pn-toasts" id="pn-toasts" aria-live="polite"></div>';

  body.insertBefore(app, body.firstChild);
  app.querySelector('.pn-principal').appendChild(main);

  /* menú del móvil */
  var boton = document.getElementById('pn-menu');
  function menu(abrir) {
    body.classList.toggle('menu-abierto', abrir);
    boton.setAttribute('aria-expanded', abrir ? 'true' : 'false');
    if (abrir) { var a = document.querySelector('#pn-lateral a'); if (a) a.focus(); } else boton.focus();
  }
  boton.addEventListener('click', function () { menu(!body.classList.contains('menu-abierto')); });
  document.getElementById('pn-velo').addEventListener('click', function () { menu(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && body.classList.contains('menu-abierto')) menu(false);
  });

  /* ------------------- utilidades ----------------------------- */

  var euros = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
  var fechaCorta = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
  var fechaLarga = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

  function aFecha(f) {
    if (!f) return null;
    /* «2026-11-02» es un día, no una hora: se lee en hora local */
    return /^\d{4}-\d{2}-\d{2}$/.test(f) ? new Date(f + 'T12:00:00') : new Date(f);
  }

  function avisar(texto, mal) {
    var caja = document.getElementById('pn-toasts');
    var t = document.createElement('div');
    t.className = 'pn-toast' + (mal ? ' mal' : '');
    t.innerHTML = '<i data-lucide="' + (mal ? 'x-circle' : 'check-circle') + '" aria-hidden="true"></i><span></span>';
    t.querySelector('span').textContent = texto;
    caja.setAttribute('aria-live', mal ? 'assertive' : 'polite');
    caja.appendChild(t);
    iconos();
    var quieto = false;
    t.addEventListener('mouseenter', function () { quieto = true; });
    t.addEventListener('mouseleave', function () { quieto = false; });
    (function quitar() { setTimeout(function () { if (quieto) return quitar(); t.remove(); }, 5000); })();
  }

  function iconos() { if (window.lucide) window.lucide.createIcons(); }

  /* ------------------- quién ha entrado ----------------------- */

  /* Resuelve con { demo: true } o { cliente, email }. Si no hay
     sesión o no es de administración, pinta el aviso en <main> y
     no resuelve nunca (la página no sigue). */
  function entrar() {
    if (DEMO) {
      document.getElementById('pn-cuenta').textContent = 'Cuenta de prueba';
      document.getElementById('pn-avatar').textContent = 'CP';
      return Promise.resolve({ demo: true });
    }
    return window.ITAKA.conCliente().then(function (c) {
      return c.auth.getSession().then(function (r) {
        var s = r && r.data && r.data.session;
        if (!s) return parar('Para entrar en la gestión hay que iniciar sesión con la cuenta de administración.', true);
        return c.rpc('es_admin').then(function (r2) {
          if (!r2 || r2.data !== true) return parar('Esta cuenta no es de administración.', false);
          var email = s.user.email || '';
          document.getElementById('pn-cuenta').textContent = email.split('@')[0];
          document.getElementById('pn-avatar').textContent = email.slice(0, 2).toUpperCase();
          return { cliente: c, email: email };
        });
      });
    }).catch(function (e) {
      return parar('No se ha podido comprobar el acceso (' + e.message + '). Revisa la conexión y vuelve a cargar.', false);
    });
  }

  function parar(texto, conAcceso) {
    main.innerHTML = '<div class="pn-tarjeta pn-vacio" role="alert">' +
      '<i data-lucide="lock" aria-hidden="true"></i><h3>Sin acceso</h3><p>' + esc(texto) + '</p>' +
      (conAcceso ? '<a class="pn-boton primario" href="' + RAIZ + 'acceso/">Ir al acceso</a> ' : '') +
      '<a class="pn-boton" href="?demo">Ver la demostración</a></div>';
    iconos();
    return new Promise(function () {});
  }

  iconos();

  window.PANEL = {
    DEMO: DEMO,
    RAIZ: RAIZ,
    esc: esc,
    euros: function (c) { return euros.format((c || 0) / 100); },
    fechaCorta: function (f) { var d = aFecha(f); return d ? fechaCorta.format(d).replace('.', '') : '—'; },
    fechaLarga: function (f) { var d = aFecha(f); return d ? fechaLarga.format(d) : '—'; },
    edad: function (f) {
      var d = aFecha(f); if (!d) return null;
      var hoy = new Date(), e = hoy.getFullYear() - d.getFullYear();
      if (hoy.getMonth() < d.getMonth() || (hoy.getMonth() === d.getMonth() && hoy.getDate() < d.getDate())) e--;
      return e;
    },
    hoy: function () { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); },
    avisar: avisar,
    iconos: iconos,
    entrar: entrar,
    enlace: function (ruta) { return RAIZ + ruta + (DEMO ? (ruta.indexOf('?') >= 0 ? '&demo' : '?demo') : ''); }
  };
})();
