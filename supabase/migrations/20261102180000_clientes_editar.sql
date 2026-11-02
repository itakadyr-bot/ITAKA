-- ============================================================
-- Gestión de Ítaka · alta, edición y unión de clientes
-- ------------------------------------------------------------
-- guardar_cliente(datos)        alta o edición de un cliente con
--                               sus personas, todo o nada
-- unir_clientes(queda, se_va)   dos fichas de la misma familia o
--                               institución pasan a ser una
-- unir_personas(queda, se_va)   el mismo niño apuntado dos veces
-- Las tres comprueban es_admin() y corren con los permisos de quien
-- llama (RLS sigue mandando).
-- ============================================================

begin;

-- ---------- guardar_cliente ---------------------------------------
-- datos = { id?, tipo, nombre, nif, email, telefono, direccion,
--           etiquetas[], notas,
--           personas: [{ id?, rol, nombre, nacimiento, anyo_nacimiento,
--                        dni, telefono, email, salud{}, autorizaciones{} }],
--           borrar_personas: [id, …] }
create or replace function public.guardar_cliente(datos jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid := nullif(datos->>'id', '')::uuid;
  v_email text := nullif(lower(trim(datos->>'email')), '');
  p jsonb;
  v_borrar uuid;
begin
  if not public.es_admin() then
    raise exception 'Solo administración puede guardar clientes' using errcode = '42501';
  end if;
  if coalesce(trim(datos->>'nombre'), '') = '' then
    raise exception 'Falta el nombre' using errcode = '22023';
  end if;
  if v_email is not null and exists (select 1 from clientes where lower(email) = v_email and id is distinct from v_id) then
    raise exception 'Ya hay otro cliente con el email %', v_email using errcode = '23505',
      hint = (select id::text from clientes where lower(email) = v_email limit 1);
  end if;

  if v_id is null then
    insert into clientes (tipo, nombre, nif, email, telefono, direccion, etiquetas, notas)
    values (coalesce(datos->>'tipo', 'familia'), trim(datos->>'nombre'), nullif(trim(datos->>'nif'), ''), v_email,
            nullif(trim(datos->>'telefono'), ''), nullif(trim(datos->>'direccion'), ''),
            coalesce(array(select jsonb_array_elements_text(datos->'etiquetas')), '{}'), nullif(datos->>'notas', ''))
    returning id into v_id;
  else
    update clientes set
      tipo = coalesce(datos->>'tipo', tipo), nombre = trim(datos->>'nombre'),
      nif = nullif(trim(datos->>'nif'), ''), email = v_email,
      telefono = nullif(trim(datos->>'telefono'), ''), direccion = nullif(trim(datos->>'direccion'), ''),
      etiquetas = coalesce(array(select jsonb_array_elements_text(datos->'etiquetas')), '{}'),
      notas = nullif(datos->>'notas', '')
    where id = v_id;
    if not found then raise exception 'Ese cliente no existe' using errcode = 'P0002'; end if;
  end if;

  for v_borrar in select (jsonb_array_elements_text(coalesce(datos->'borrar_personas', '[]')))::uuid loop
    if exists (select 1 from inscripciones where persona_id = v_borrar and estado <> 'baja') then
      raise exception 'No se puede quitar a % porque está inscrito en una actividad',
        (select nombre from personas where id = v_borrar) using errcode = '23503';
    end if;
    delete from personas where id = v_borrar and cliente_id = v_id;
  end loop;

  for p in select * from jsonb_array_elements(coalesce(datos->'personas', '[]')) loop
    if coalesce(trim(p->>'nombre'), '') = '' then continue; end if;
    if nullif(p->>'id', '') is null then
      insert into personas (cliente_id, rol, nombre, nacimiento, anyo_nacimiento, dni, telefono, email, salud, autorizaciones)
      values (v_id, coalesce(p->>'rol', 'participante'), trim(p->>'nombre'), nullif(p->>'nacimiento', '')::date,
              coalesce(nullif(p->>'anyo_nacimiento', '')::smallint, extract(year from nullif(p->>'nacimiento', '')::date)::smallint),
              nullif(trim(p->>'dni'), ''), nullif(trim(p->>'telefono'), ''), nullif(lower(trim(p->>'email')), ''),
              jsonb_strip_nulls(coalesce(p->'salud', '{}')), jsonb_strip_nulls(coalesce(p->'autorizaciones', '{}')));
    else
      update personas set
        rol = coalesce(p->>'rol', rol), nombre = trim(p->>'nombre'),
        nacimiento = nullif(p->>'nacimiento', '')::date,
        anyo_nacimiento = coalesce(nullif(p->>'anyo_nacimiento', '')::smallint, extract(year from nullif(p->>'nacimiento', '')::date)::smallint),
        dni = nullif(trim(p->>'dni'), ''), telefono = nullif(trim(p->>'telefono'), ''),
        email = nullif(lower(trim(p->>'email')), ''),
        salud = jsonb_strip_nulls(coalesce(p->'salud', '{}')),
        autorizaciones = jsonb_strip_nulls(coalesce(p->'autorizaciones', '{}'))
      where id = (p->>'id')::uuid and cliente_id = v_id;
    end if;
  end loop;

  return v_id;
end $$;

-- ---------- unir_personas -------------------------------------------
-- Si las dos estaban en la misma actividad, la inscripción repetida
-- (la de se_va) pasa a «baja» con una nota: no se pierde nada.
create or replace function public.unir_personas(p_queda uuid, p_se_va uuid)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  q personas; s personas; par record;
begin
  if not public.es_admin() then
    raise exception 'Solo administración puede unir personas' using errcode = '42501';
  end if;
  if p_queda = p_se_va then raise exception 'Es la misma persona' using errcode = '22023'; end if;
  select * into q from personas where id = p_queda for update;
  select * into s from personas where id = p_se_va for update;
  if q.id is null or s.id is null then raise exception 'Alguna de las dos personas no existe' using errcode = 'P0002'; end if;
  if q.cliente_id <> s.cliente_id then
    raise exception 'Las dos personas tienen que ser del mismo cliente (une antes las fichas)' using errcode = '22023';
  end if;

  -- Si las dos estaban en la misma actividad, queda activa la que
  -- vale más (reserva pagada > activa > el resto); la otra, a «baja».
  for par in
    select i_s.id as sid, i_q.id as qid,
           (case when rs.estado = 'pagada' then 2 else 0 end) + (case when i_s.estado = 'activa' then 1 else 0 end) as ps,
           (case when rq.estado = 'pagada' then 2 else 0 end) + (case when i_q.estado = 'activa' then 1 else 0 end) as pq
      from inscripciones i_s
      join inscripciones i_q on i_q.actividad_id = i_s.actividad_id and i_q.persona_id = p_queda and i_q.estado <> 'baja'
      left join reservas rs on rs.id = i_s.reserva_id
      left join reservas rq on rq.id = i_q.reserva_id
     where i_s.persona_id = p_se_va and i_s.estado <> 'baja'
  loop
    update inscripciones set estado = 'baja', baja = coalesce(baja, current_date),
           notas = trim(coalesce(notas || ' · ', '') || 'Duplicada: se unió con otra ficha del mismo niño')
     where id = case when par.ps > par.pq then par.qid else par.sid end;
  end loop;
  update inscripciones set persona_id = p_queda where persona_id = p_se_va;
  insert into asistencia (sesion_id, persona_id, presente, nota, marcado_por, marcado_en)
    select sesion_id, p_queda, presente, nota, marcado_por, marcado_en from asistencia where persona_id = p_se_va
    on conflict do nothing;
  delete from asistencia where persona_id = p_se_va;

  update personas set
    nacimiento = coalesce(q.nacimiento, s.nacimiento),
    anyo_nacimiento = coalesce(q.anyo_nacimiento, s.anyo_nacimiento),
    dni = coalesce(q.dni, s.dni), telefono = coalesce(q.telefono, s.telefono), email = coalesce(q.email, s.email),
    salud = s.salud || q.salud, autorizaciones = s.autorizaciones || q.autorizaciones
  where id = p_queda;
  delete from personas where id = p_se_va;
  return p_queda;
end $$;

-- ---------- unir_clientes -------------------------------------------
create or replace function public.unir_clientes(p_queda uuid, p_se_va uuid)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  q clientes; s clientes;
  v_notas text;
begin
  if not public.es_admin() then
    raise exception 'Solo administración puede unir fichas' using errcode = '42501';
  end if;
  if p_queda = p_se_va then raise exception 'Es la misma ficha' using errcode = '22023'; end if;
  select * into q from clientes where id = p_queda for update;
  select * into s from clientes where id = p_se_va for update;
  if q.id is null or s.id is null then raise exception 'Alguna de las dos fichas no existe' using errcode = 'P0002'; end if;

  update personas set cliente_id = p_queda where cliente_id = p_se_va;
  update inscripciones set cliente_id = p_queda where cliente_id = p_se_va;
  update cobros set cliente_id = p_queda where cliente_id = p_se_va;
  update actividades set cliente_id = p_queda where cliente_id = p_se_va;

  v_notas := nullif(concat_ws(E'\n', q.notas, s.notas,
    case when s.email is not null and q.email is not null and lower(s.email) <> lower(q.email)
         then 'Otro email: ' || s.email end,
    case when s.telefono is not null and q.telefono is not null and s.telefono <> q.telefono
         then 'Otro teléfono: ' || s.telefono end), '');

  -- se borra primero la que se va para que su email no choque
  delete from clientes where id = p_se_va;
  update clientes set
    nif = coalesce(q.nif, s.nif),
    email = coalesce(q.email, s.email),
    telefono = coalesce(q.telefono, s.telefono),
    direccion = coalesce(q.direccion, s.direccion),
    etiquetas = array(select distinct unnest(q.etiquetas || s.etiquetas)),
    notas = v_notas,
    stripe_customer_id = coalesce(q.stripe_customer_id, s.stripe_customer_id),
    sepa_pm = coalesce(q.sepa_pm, s.sepa_pm),
    mandato_fecha = coalesce(q.mandato_fecha, s.mandato_fecha),
    created_at = least(q.created_at, s.created_at)
  where id = p_queda;
  return p_queda;
end $$;

revoke execute on function public.guardar_cliente(jsonb) from public, anon;
revoke execute on function public.unir_personas(uuid, uuid) from public, anon;
revoke execute on function public.unir_clientes(uuid, uuid) from public, anon;
grant execute on function public.guardar_cliente(jsonb) to authenticated;
grant execute on function public.unir_personas(uuid, uuid) to authenticated;
grant execute on function public.unir_clientes(uuid, uuid) to authenticated;

commit;
