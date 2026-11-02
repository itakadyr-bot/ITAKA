-- ============================================================
-- Gestión de Ítaka · cobros
-- ------------------------------------------------------------
-- 1. Cada plazo que pasa a «cobrado» deja su apunte en `cobros`,
--    venga de donde venga: del webhook de Stripe (SEPA o tarjeta)
--    o del panel (efectivo, transferencia). Si un plazo cobrado se
--    devuelve, se apunta la devolución en negativo. Así pago-webhook
--    y plazos-cobrar no cambian.
-- 2. apuntar_cobro(): el botón «Apuntar cobro» del panel. Todo en
--    una transacción: si el cobro es parcial, el plazo se parte en
--    lo cobrado y el resto (que sigue pendiente con la misma fecha).
-- 3. Copia a la familia la domiciliación de las reservas que ya la
--    tenían (el volcado anterior no lo hizo).
-- ============================================================

begin;

-- ---------- 1. plazos → cobros ------------------------------------

create or replace function public.plazo_a_cobro()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_cliente uuid;
  v_ref text := nullif(current_setting('itaka.referencia', true), '');
  v_notas text := nullif(current_setting('itaka.notas', true), '');
begin
  if new.estado = 'cobrado' and new.cobrado_en is null then
    new.cobrado_en := now();
  end if;
  begin
    select i.cliente_id into v_cliente from inscripciones i
     where i.id = new.inscripcion_id or (new.reserva_id is not null and i.reserva_id = new.reserva_id)
     limit 1;
    if v_cliente is null then return new; end if;

    if new.estado = 'cobrado' and old.estado is distinct from 'cobrado' then
      insert into cobros (cliente_id, plazo_id, reserva_id, fecha, importe_centimos, metodo, referencia, notas)
      values (v_cliente, new.id, new.reserva_id, (new.cobrado_en at time zone 'Europe/Madrid')::date, new.importe_centimos,
              coalesce(new.metodo, case when new.stripe_payment_intent is not null then 'sepa' else 'efectivo' end),
              coalesce(v_ref, new.stripe_payment_intent), v_notas)
      on conflict do nothing;
    elsif new.estado = 'devuelto' and old.estado = 'cobrado' then
      insert into cobros (cliente_id, plazo_id, reserva_id, fecha, importe_centimos, metodo, referencia, notas)
      values (v_cliente, new.id, new.reserva_id, (now() at time zone 'Europe/Madrid')::date, -new.importe_centimos,
              coalesce(new.metodo, 'sepa'), 'devolucion-' || coalesce(new.stripe_payment_intent, new.id::text),
              coalesce(new.devuelto_motivo, 'Devuelto por el banco'))
      on conflict do nothing;
    end if;
  exception when others then
    -- nunca hacer fallar al webhook de Stripe por un apunte
    raise warning 'plazo_a_cobro: % (plazo %)', sqlerrm, new.id;
  end;
  return new;
end $$;
revoke execute on function public.plazo_a_cobro() from public, anon, authenticated;

create trigger plazos_a_cobro before update of estado on public.plazos
  for each row execute function public.plazo_a_cobro();

-- ---------- 2. apuntar un cobro desde el panel ----------------------

create or replace function public.apuntar_cobro(
  p_plazo uuid,
  p_importe_centimos integer,
  p_metodo text,
  p_fecha date default current_date,
  p_referencia text default null,
  p_notas text default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v public.plazos;
begin
  if not public.es_admin() then
    raise exception 'Solo administración puede apuntar cobros' using errcode = '42501';
  end if;
  if p_metodo not in ('efectivo', 'transferencia', 'tarjeta', 'sepa') then
    raise exception 'Forma de pago no válida: %', p_metodo using errcode = '22023';
  end if;
  if p_fecha is null or p_fecha > current_date + 1 then
    raise exception 'La fecha del cobro no puede ser futura' using errcode = '22023';
  end if;

  select * into v from public.plazos where id = p_plazo for update;
  if not found then
    raise exception 'Ese plazo no existe' using errcode = 'P0002';
  end if;
  if v.estado not in ('pendiente', 'devuelto') then
    raise exception 'Ese plazo ya está %', v.estado using errcode = '22023';
  end if;
  if p_importe_centimos is null or p_importe_centimos <= 0 or p_importe_centimos > v.importe_centimos then
    raise exception 'El importe tiene que estar entre 0,01 € y %', to_char(v.importe_centimos / 100.0, 'FM999G990D00') || ' €'
      using errcode = '22023';
  end if;

  -- Cobro parcial: el resto queda como un plazo nuevo pendiente.
  if p_importe_centimos < v.importe_centimos then
    insert into public.plazos (reserva_id, inscripcion_id, concepto, importe_centimos, vence, estado, metodo)
    values (v.reserva_id, v.inscripcion_id, v.concepto || ' (resto)', v.importe_centimos - p_importe_centimos,
            v.vence, 'pendiente', v.metodo);
    update public.plazos set importe_centimos = p_importe_centimos where id = p_plazo;
  end if;

  perform set_config('itaka.referencia', coalesce(p_referencia, ''), true);
  perform set_config('itaka.notas', coalesce(p_notas, ''), true);
  update public.plazos
     set estado = 'cobrado', metodo = p_metodo,
         cobrado_en = (p_fecha::timestamp + time '12:00') at time zone 'Europe/Madrid'
   where id = p_plazo;
  perform set_config('itaka.referencia', '', true);
  perform set_config('itaka.notas', '', true);
  return p_plazo;
end $$;
revoke execute on function public.apuntar_cobro(uuid, integer, text, date, text, text) from public, anon;
grant execute on function public.apuntar_cobro(uuid, integer, text, date, text, text) to authenticated;

-- ---------- 3. domiciliaciones que faltaban ------------------------

update public.clientes c
   set sepa_pm = r.sepa_pm,
       stripe_customer_id = coalesce(c.stripe_customer_id, r.stripe_customer_id),
       mandato_fecha = coalesce(c.mandato_fecha, r.created_at)
  from public.inscripciones i
  join public.reservas r on r.id = i.reserva_id
 where i.cliente_id = c.id and c.sepa_pm is null and r.sepa_pm is not null;

-- Los plazos ya cobrados de reservas con SEPA eran por domiciliación.
update public.plazos set metodo = 'sepa'
 where metodo is null and stripe_payment_intent is not null;

commit;
