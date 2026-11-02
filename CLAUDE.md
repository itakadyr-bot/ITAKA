# CLAUDE.md

## Qué es este proyecto

Esta es la web y la gestión de **Ítaka Deporte y Recreación**
([itakarecreacion.com](https://itakarecreacion.com); itakadyr.com redirige aquí).
Incluye la web pública, las reservas de campamentos, el cobro de señales y
domiciliaciones, la lista de espera y el panel de administración (`/admin/`).

- Repo de GitHub: `itakadyr-bot/web`, servido con GitHub Pages (`CNAME`).
- HTML estático + `assets/css/itaka.css` y `assets/js/` (ver `README.md`).
- Funciones del servidor en `supabase/functions/` (Edge Functions de Supabase).

## No tiene nada que ver con Apolana

Este proyecto **no tiene ninguna relación con Apolana**. No mezcles código,
textos, estilos, claves, base de datos ni configuración de Apolana (ni de la
carpeta `Web Apolana`) con este repo, y no los tomes como referencia.

## Base de datos (Supabase)

- Proyecto de Supabase: `oopyndrewijbqcryfbuj`
  (`https://oopyndrewijbqcryfbuj.supabase.co`).
- La web usa solo la clave **publishable** (`sb_publishable_…`, en
  `assets/js/db.js`). Es pública por diseño; la seguridad la da RLS.
- Las funciones de `supabase/functions/` leen las claves secretas de variables
  de entorno (`Deno.env.get(...)`): `SUPABASE_SERVICE_ROLE_KEY` /
  `SUPABASE_SECRET_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `RESEND_API_KEY`. Se configuran en los secretos de Supabase, nunca en el código.

## Nunca se suben claves secretas al repo

- Nunca escribas en ningún archivo del repo una clave secreta: la service role
  o secret de Supabase (`sb_secret_…`, JWT `service_role`), claves de Stripe
  (`sk_…`, `whsec_…`), de Resend (`re_…`) ni contraseñas.
- Si una función necesita una clave nueva, léela con `Deno.env.get` y añádela a
  los secretos de Supabase (Dashboard o `supabase secrets set`), no al repo.
- No crees archivos `.env` con valores reales dentro del repo.
- Antes de cada commit, revisa el diff y asegúrate de que no hay ninguna clave
  secreta. Si alguna llega a subirse, hay que rotarla en el servicio
  correspondiente, no basta con borrarla del repo.
