-- ============================================================
-- Gestión de Ítaka · registro de facturas
-- ------------------------------------------------------------
-- Las facturas las EMITE la contable con su programa (que es el
-- que cumple Verifactu). Aquí solo se ARCHIVAN: datos básicos, el
-- PDF y si está cobrada, para verlas junto al cliente.
-- Los PDF van al bucket privado «facturas»; solo administración.
-- ============================================================

begin;

create table public.facturas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  actividad_id uuid references public.actividades(id) on delete set null,
  numero text not null,
  fecha date not null,
  vence date,
  concepto text not null,
  base_centimos integer not null check (base_centimos >= 0),
  iva_pct numeric(4,1) not null default 0 check (iva_pct >= 0 and iva_pct <= 30),
  iva_centimos integer not null default 0 check (iva_centimos >= 0),
  irpf_centimos integer not null default 0 check (irpf_centimos >= 0),
  total_centimos integer generated always as (base_centimos + iva_centimos - irpf_centimos) stored,
  moneda text not null default 'EUR',
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'parcial', 'cobrada', 'anulada')),
  cobrada_en date,
  rectifica_id uuid references public.facturas(id) on delete set null,   -- si es rectificativa
  archivo text,                 -- ruta del PDF en el bucket «facturas»
  notas text,
  creado_por text default (auth.jwt()->>'email'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint factura_vence_despues check (vence is null or vence >= fecha)
);
-- el mismo número no se apunta dos veces
create unique index facturas_numero_unico on public.facturas (upper(trim(numero)));
create index facturas_cliente_fecha on public.facturas (cliente_id, fecha desc);
create index facturas_fecha on public.facturas (fecha desc);
create index facturas_estado on public.facturas (estado, vence);
create index facturas_actividad on public.facturas (actividad_id);
create trigger facturas_updated before update on public.facturas
  for each row execute function public.tocar_updated_at();

alter table public.facturas enable row level security;
create policy "admin gestiona facturas" on public.facturas for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- ---------- PDF de las facturas (bucket privado) -------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('facturas', 'facturas', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "admin gestiona pdf de facturas" on storage.objects for all to authenticated
  using (bucket_id = 'facturas' and public.es_admin())
  with check (bucket_id = 'facturas' and public.es_admin());

commit;
