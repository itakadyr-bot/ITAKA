-- ============================================================
-- Gestión de Ítaka · clientes, actividades, cobros, equipo y gastos
-- ------------------------------------------------------------
-- Proyecto Supabase: oopyndrewijbqcryfbuj
-- Todo es ADITIVO: no se borra ni se renombra ninguna tabla ni
-- columna existente. reservas, plazos, campamentos, interesados y
-- mensajes siguen igual, así que reserva-crear, domiciliar-crear,
-- plazos-cobrar, pago-webhook y correo-avisar no se enteran.
--
-- Lo único que cambia en lo existente:
--   · plazos.reserva_id pasa a poder ser nulo (para cuotas de
--     extraescolares que no vienen de una reserva), con una
--     comprobación de que cada plazo cuelga de algo.
--   · triggers nuevos en reservas que rellenan clientes, personas
--     e inscripciones solos. No modifican la fila de la reserva.
--
-- Acceso: RLS en todas las tablas nuevas. Solo administración
-- (es_admin()) lee y escribe. Ninguna política para anon: desde
-- la web pública no se ve nada de esto. El rol «monitor» se añade
-- en la fase de debería (ver architecture.md).
--
-- Dinero en céntimos (integer) y moneda 'EUR'. Fechas con hora en
-- timestamptz (UTC); días sueltos en date.
-- ============================================================

begin;

-- ---------- utilidades ------------------------------------------

create or replace function public.tocar_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- clientes y personas ---------------------------------

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'familia'
    check (tipo in ('familia','colegio','ampa','ayuntamiento','empresa','otro')),
  nombre text not null,
  nif text,
  email text,
  telefono text,
  direccion text,
  etiquetas text[] not null default '{}',
  notas text,
  -- domiciliación: el IBAN NO se guarda aquí; lo guarda Stripe.
  stripe_customer_id text,
  sepa_pm text,
  mandato_fecha timestamptz,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index clientes_email_unico on public.clientes (lower(email)) where email is not null;
create index clientes_tipo on public.clientes (tipo);
create index clientes_nombre on public.clientes (lower(nombre));
create trigger clientes_updated before update on public.clientes
  for each row execute function public.tocar_updated_at();

create table public.personas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  rol text not null default 'participante'
    check (rol in ('tutor','participante','contacto')),
  nombre text not null,
  nacimiento date,
  -- el formulario de la web a veces solo pide el año
  anyo_nacimiento smallint check (anyo_nacimiento between 1900 and 2100),
  dni text,
  telefono text,
  email text,
  -- datos sensibles del menor (alergias, SIP, observaciones,
  -- autorizaciones de fotos…). Solo administración.
  salud jsonb not null default '{}',
  autorizaciones jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index personas_cliente on public.personas (cliente_id);
create index personas_nombre on public.personas (lower(nombre));
create trigger personas_updated before update on public.personas
  for each row execute function public.tocar_updated_at();

-- ---------- actividades e inscripciones -------------------------

create table public.actividades (
  id uuid primary key default gen_random_uuid(),
  tipo text not null
    check (tipo in ('campamento','extraescolar','campus','evento','servicio')),
  nombre text not null,
  -- para los campamentos: puente 1-1 con la tabla de la web pública
  campamento_id text unique references public.campamentos(id) on delete restrict,
  -- si la contrata una institución (colegio, AMPA, ayuntamiento)
  cliente_id uuid references public.clientes(id) on delete set null,
  lugar text,
  empieza date,
  termina date,
  cupo integer check (cupo is null or cupo >= 0),
  precio_centimos integer check (precio_centimos is null or precio_centimos >= 0),
  moneda text not null default 'EUR',
  estado text not null default 'abierta'
    check (estado in ('borrador','abierta','completa','en_curso','terminada','cancelada')),
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fechas_en_orden check (termina is null or empieza is null or termina >= empieza)
);
create index actividades_tipo_fecha on public.actividades (tipo, empieza);
create index actividades_cliente on public.actividades (cliente_id);
create trigger actividades_updated before update on public.actividades
  for each row execute function public.tocar_updated_at();

create table public.inscripciones (
  id uuid primary key default gen_random_uuid(),
  actividad_id uuid not null references public.actividades(id) on delete restrict,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  persona_id uuid references public.personas(id) on delete set null,
  -- si viene del formulario público de campamentos
  reserva_id uuid unique references public.reservas(id) on delete cascade,
  estado text not null default 'activa'
    check (estado in ('pendiente','activa','baja','espera')),
  importe_centimos integer not null default 0 check (importe_centimos >= 0),
  moneda text not null default 'EUR',
  alta date not null default current_date,
  baja date,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index inscripciones_actividad on public.inscripciones (actividad_id, estado);
create index inscripciones_cliente on public.inscripciones (cliente_id);
create index inscripciones_persona on public.inscripciones (persona_id);
-- un mismo niño no se inscribe dos veces en la misma actividad
create unique index inscripciones_una_por_persona
  on public.inscripciones (actividad_id, persona_id)
  where persona_id is not null and estado <> 'baja';
create trigger inscripciones_updated before update on public.inscripciones
  for each row execute function public.tocar_updated_at();

-- ---------- plazos: también para cuotas sin reserva --------------

alter table public.plazos alter column reserva_id drop not null;
alter table public.plazos
  add column inscripcion_id uuid references public.inscripciones(id) on delete cascade,
  add column metodo text check (metodo in ('sepa','tarjeta','efectivo','transferencia')),
  add column cobrado_en timestamptz,
  add column devuelto_motivo text,
  add constraint plazo_cuelga_de_algo check (reserva_id is not null or inscripcion_id is not null);
create index plazos_inscripcion on public.plazos (inscripcion_id);
create index plazos_estado_vence on public.plazos (estado, vence);
create index if not exists plazos_reserva on public.plazos (reserva_id);
-- estados que ya usan las funciones: pendiente, procesando, cobrado, devuelto
alter table public.plazos add constraint plazos_estado_valido
  check (estado in ('pendiente','procesando','cobrado','devuelto','anulado')) not valid;

-- cobros manuales (efectivo, transferencia) y registro de cada cobro
create table public.cobros (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  plazo_id uuid references public.plazos(id) on delete set null,
  reserva_id uuid references public.reservas(id) on delete set null,
  fecha date not null default current_date,
  importe_centimos integer not null check (importe_centimos <> 0), -- negativo = devolución
  moneda text not null default 'EUR',
  metodo text not null check (metodo in ('sepa','tarjeta','efectivo','transferencia')),
  referencia text,              -- id de Stripe o concepto de la transferencia
  notas text,
  registrado_por text default (auth.jwt()->>'email'),
  created_at timestamptz not null default now()
);
create index cobros_cliente_fecha on public.cobros (cliente_id, fecha);
create index cobros_plazo on public.cobros (plazo_id);
create index cobros_fecha on public.cobros (fecha);
-- un mismo cargo de Stripe no se apunta dos veces
create unique index cobros_referencia_unica on public.cobros (metodo, referencia)
  where referencia is not null;

-- ---------- equipo ----------------------------------------------

create table public.monitores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  dni text,
  email text,
  telefono text,
  titulaciones text[] not null default '{}',
  certificado_delitos_fecha date,   -- LOPIVI: fecha del certificado
  activo boolean not null default true,
  user_email text unique,           -- para el acceso del monitor (fase debería)
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index monitores_activo on public.monitores (activo, lower(nombre));
create trigger monitores_updated before update on public.monitores
  for each row execute function public.tocar_updated_at();

create table public.sesiones (
  id uuid primary key default gen_random_uuid(),
  actividad_id uuid not null references public.actividades(id) on delete cascade,
  empieza timestamptz not null,
  termina timestamptz not null,
  lugar text,
  estado text not null default 'prevista'
    check (estado in ('prevista','hecha','cancelada')),
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sesion_duracion check (termina > empieza)
);
create index sesiones_actividad_fecha on public.sesiones (actividad_id, empieza);
create index sesiones_fecha on public.sesiones (empieza);
create trigger sesiones_updated before update on public.sesiones
  for each row execute function public.tocar_updated_at();

create table public.sesion_monitores (
  sesion_id uuid not null references public.sesiones(id) on delete cascade,
  monitor_id uuid not null references public.monitores(id) on delete restrict,
  papel text not null default 'monitor' check (papel in ('coordinador','monitor','apoyo')),
  primary key (sesion_id, monitor_id)
);
create index sesion_monitores_monitor on public.sesion_monitores (monitor_id);

create table public.asistencia (
  sesion_id uuid not null references public.sesiones(id) on delete cascade,
  persona_id uuid not null references public.personas(id) on delete cascade,
  presente boolean not null,
  nota text,
  marcado_por text default (auth.jwt()->>'email'),
  marcado_en timestamptz not null default now(),
  primary key (sesion_id, persona_id)
);
create index asistencia_persona on public.asistencia (persona_id);

create table public.horas (
  id uuid primary key default gen_random_uuid(),
  monitor_id uuid not null references public.monitores(id) on delete cascade,
  sesion_id uuid references public.sesiones(id) on delete set null,
  actividad_id uuid references public.actividades(id) on delete set null,
  fecha date not null,
  minutos integer not null check (minutos > 0 and minutos <= 24*60),
  estado text not null default 'pendiente' check (estado in ('pendiente','aprobada','rechazada')),
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index horas_monitor_fecha on public.horas (monitor_id, fecha);
create index horas_actividad on public.horas (actividad_id);
create index horas_estado on public.horas (estado);
-- la misma sesión no se apunta dos veces al mismo monitor
create unique index horas_una_por_sesion on public.horas (monitor_id, sesion_id) where sesion_id is not null;
create trigger horas_updated before update on public.horas
  for each row execute function public.tocar_updated_at();

-- ---------- gastos ----------------------------------------------

create table public.proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  nif text,
  email text,
  telefono text,
  notas text,
  created_at timestamptz not null default now()
);
create unique index proveedores_nif_unico on public.proveedores (upper(nif)) where nif is not null;
create index proveedores_nombre on public.proveedores (lower(nombre));

create table public.gastos (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid references public.proveedores(id) on delete set null,
  actividad_id uuid references public.actividades(id) on delete set null,
  fecha date not null default current_date,
  concepto text not null,
  categoria text not null default 'otros'
    check (categoria in ('transporte','alojamiento','comida','material','personal','seguros','publicidad','instalaciones','otros')),
  base_centimos integer not null check (base_centimos >= 0),
  iva_centimos integer not null default 0 check (iva_centimos >= 0),
  total_centimos integer generated always as (base_centimos + iva_centimos) stored,
  moneda text not null default 'EUR',
  metodo text check (metodo in ('tarjeta','efectivo','transferencia','domiciliacion')),
  adjunto text,                  -- ruta en el bucket privado «gastos»
  estado text not null default 'nuevo' check (estado in ('nuevo','revisar','hecho')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index gastos_fecha on public.gastos (fecha);
create index gastos_actividad on public.gastos (actividad_id);
create index gastos_proveedor on public.gastos (proveedor_id);
create trigger gastos_updated before update on public.gastos
  for each row execute function public.tocar_updated_at();

-- ---------- reservas de la web → clientes, personas, inscripciones

-- Al entrar una reserva (la escribe reserva-crear con la llave de
-- servicio) se busca o crea la familia por email, el niño por
-- nombre + nacimiento, y su inscripción en la actividad del
-- campamento. No toca la fila de la reserva. Si algo falla, la
-- reserva entra igual: este trigger nunca rompe el formulario.
create or replace function public.vincular_reserva(r public.reservas)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_cliente uuid;
  v_persona uuid;
  v_actividad uuid;
  d jsonb := coalesce(r.datos, '{}');
  v_nac date;
  v_anyo smallint;
begin
  begin
    -- reservas.nacimiento es texto: «2014-05-10» o solo «2014».
    -- Dentro del bloque protegido: una fecha imposible no rompe la reserva.
    begin
      v_nac := case when r.nacimiento ~ '^\d{4}-\d{2}-\d{2}$' then r.nacimiento::date end;
    exception when others then v_nac := null;
    end;
    v_anyo := coalesce(extract(year from v_nac)::smallint,
      case when coalesce(r.nacimiento, d->>'anyo_nacimiento') ~ '^\d{4}$'
           then coalesce(r.nacimiento, d->>'anyo_nacimiento')::smallint end);
    select id into v_cliente from clientes where lower(email) = lower(r.email);
    if v_cliente is null then
      insert into clientes (tipo, nombre, email, telefono, direccion)
      values ('familia', r.tutor, r.email, r.telefono, d->>'direccion')
      returning id into v_cliente;
      insert into personas (cliente_id, rol, nombre, dni, telefono, email)
      values (v_cliente, 'tutor', r.tutor, d->>'tutor_dni', r.telefono, r.email);
    end if;

    select id into v_persona from personas
     where cliente_id = v_cliente and rol = 'participante'
       and lower(nombre) = lower(r.participante)
       and (anyo_nacimiento is not distinct from v_anyo or anyo_nacimiento is null or v_anyo is null)
     limit 1;
    if v_persona is null then
      insert into personas (cliente_id, rol, nombre, nacimiento, anyo_nacimiento, dni, salud, autorizaciones)
      values (v_cliente, 'participante', r.participante, v_nac, v_anyo, d->>'dni',
              jsonb_strip_nulls(jsonb_build_object('alergias', d->'alergias', 'sip', d->'sip',
                'observaciones', d->'observaciones', 'talla', d->'talla')),
              jsonb_strip_nulls(jsonb_build_object('fotos', d->'autoriza_fotos', 'info', d->'autoriza_info')))
      returning id into v_persona;
    end if;

    select id into v_actividad from actividades where campamento_id = r.campamento_id;
    if v_actividad is null then
      insert into actividades (tipo, nombre, campamento_id)
      select 'campamento', c.nombre, c.id from campamentos c where c.id = r.campamento_id
      returning id into v_actividad;
    end if;

    insert into inscripciones (actividad_id, cliente_id, persona_id, reserva_id, estado, importe_centimos)
    values (v_actividad, v_cliente, v_persona, r.id,
            case when r.estado in ('pagada','pendiente-efectivo') then 'activa' else 'pendiente' end,
            r.importe_centimos)
    on conflict (reserva_id) do nothing;
  exception when others then
    raise warning 'vincular_reserva: % (reserva %)', sqlerrm, r.id;
  end;
end $$;
revoke execute on function public.vincular_reserva(public.reservas) from public, anon, authenticated;

create or replace function public.reserva_a_cliente()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.vincular_reserva(new);
  return new;
end $$;


create trigger reservas_a_cliente after insert on public.reservas
  for each row execute function public.reserva_a_cliente();

-- Cuando cambia el estado o la domiciliación de una reserva, se
-- refleja en la inscripción y en el cliente.
create or replace function public.reserva_sincronizar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    update inscripciones
       set estado = case when new.estado in ('pagada','pendiente-efectivo') then 'activa' else estado end
     where reserva_id = new.id;
    if new.sepa_pm is distinct from old.sepa_pm and new.sepa_pm is not null then
      update clientes c
         set sepa_pm = new.sepa_pm,
             stripe_customer_id = coalesce(new.stripe_customer_id, c.stripe_customer_id),
             mandato_fecha = now()
        from inscripciones i
       where i.reserva_id = new.id and c.id = i.cliente_id;
    end if;
  exception when others then
    raise warning 'reserva_sincronizar: % (reserva %)', sqlerrm, new.id;
  end;
  return new;
end $$;

create trigger reservas_sincronizar after update of estado, sepa_pm on public.reservas
  for each row execute function public.reserva_sincronizar();

-- ---------- vistas para el panel --------------------------------

-- Lo que debe cada cliente, con plazos de reservas y de inscripciones.
create or replace view public.v_deuda_clientes with (security_invoker = true) as
select c.id as cliente_id, c.nombre, c.tipo,
       count(p.id) filter (where p.estado = 'pendiente') as plazos_pendientes,
       count(p.id) filter (where p.estado = 'pendiente' and p.vence < current_date) as plazos_vencidos,
       count(p.id) filter (where p.estado = 'devuelto') as plazos_devueltos,
       coalesce(sum(p.importe_centimos) filter (where p.estado in ('pendiente','devuelto')), 0) as debe_centimos
  from clientes c
  left join inscripciones i on i.cliente_id = c.id
  left join plazos p on p.inscripcion_id = i.id or (p.reserva_id is not null and p.reserva_id = i.reserva_id)
 group by c.id;

-- Ingresos, gastos y horas por actividad (rentabilidad).
create or replace view public.v_actividad_resumen with (security_invoker = true) as
select a.id as actividad_id, a.nombre, a.tipo, a.empieza,
       (select count(*) from inscripciones i where i.actividad_id = a.id and i.estado = 'activa') as inscritos,
       (select coalesce(sum(co.importe_centimos), 0) from cobros co
          join plazos p on p.id = co.plazo_id
          join inscripciones i on i.id = p.inscripcion_id or i.reserva_id = p.reserva_id
         where i.actividad_id = a.id) as cobrado_centimos,
       (select coalesce(sum(g.total_centimos), 0) from gastos g where g.actividad_id = a.id) as gastos_centimos,
       (select coalesce(sum(h.minutos), 0) from horas h where h.actividad_id = a.id and h.estado = 'aprobada') as minutos_aprobados
  from actividades a;

-- Las vistas usan los permisos de quien consulta (security_invoker),
-- así que RLS ya las protege; además se cierran al rol anónimo.
revoke all on public.v_deuda_clientes, public.v_actividad_resumen from anon;

-- ---------- RLS: solo administración -----------------------------

do $$
declare t text;
begin
  foreach t in array array['clientes','personas','actividades','inscripciones','cobros',
                           'monitores','sesiones','sesion_monitores','asistencia','horas',
                           'proveedores','gastos']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "admin gestiona %1$s" on public.%1$I for all to authenticated
                    using (public.es_admin()) with check (public.es_admin())', t);
  end loop;
end $$;

-- ---------- archivos de gastos (bucket privado) -------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gastos', 'gastos', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
on conflict (id) do nothing;

create policy "admin gestiona tickets" on storage.objects for all to authenticated
  using (bucket_id = 'gastos' and public.es_admin())
  with check (bucket_id = 'gastos' and public.es_admin());

-- ---------- volcado de lo que ya existe ---------------------------

-- Una actividad por cada campamento de la web.
insert into public.actividades (tipo, nombre, campamento_id, cupo, precio_centimos)
select 'campamento', c.nombre, c.id, c.cupo, null
  from public.campamentos c
on conflict (campamento_id) do nothing;

-- Las reservas que ya hay pasan por el mismo camino que las nuevas.
do $$
declare fila public.reservas;
begin
  for fila in select * from public.reservas order by created_at loop
    perform public.vincular_reserva(fila);
  end loop;
end $$;

-- Los cobros ya hechos quedan apuntados en cobros.
insert into public.cobros (cliente_id, plazo_id, reserva_id, fecha, importe_centimos, metodo, referencia)
select i.cliente_id, p.id, p.reserva_id, coalesce(p.created_at::date, current_date), p.importe_centimos,
       'sepa', p.stripe_payment_intent
  from public.plazos p join public.inscripciones i on i.reserva_id = p.reserva_id
 where p.estado = 'cobrado'
on conflict do nothing;

commit;
