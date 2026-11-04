/* ============================================================
   Ítaka · web pública · comportamiento del diseño nuevo
   ------------------------------------------------------------
   «¿Para quién?»: los botones de #quien enseñan solo los
   servicios de ese público (data-para en cada tarjeta). Sin
   JavaScript se ven todos, que es lo correcto.
   Un enlace con data-quien-salta="familias" (p. ej. «Soy familia»)
   además de bajar a la sección elige ese filtro.
   ============================================================ */
(function () {
  'use strict';

  var grupo = document.getElementById('quien');
  if (!grupo) return;
  var tarjetas = document.querySelectorAll('#servicios [data-para]');

  function elegir(quien) {
    grupo.querySelectorAll('button').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-quien') === quien ? 'true' : 'false');
    });
    tarjetas.forEach(function (t) {
      var para = (t.getAttribute('data-para') || '').split(' ');
      t.hidden = quien !== 'todos' && para.indexOf(quien) < 0;
    });
  }

  grupo.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-quien]');
    if (b) elegir(b.getAttribute('data-quien'));
  });

  document.querySelectorAll('[data-quien-salta]').forEach(function (a) {
    a.addEventListener('click', function () { elegir(a.getAttribute('data-quien-salta')); });
  });
})();
