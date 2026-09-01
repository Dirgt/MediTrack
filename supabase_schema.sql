-- Esquema Inicial para MediTrack (Supabase PostgreSQL)
-- 1. Extiende perfiles de usuario
CREATE TYPE user_role AS ENUM ('admin', 'vendedor');

CREATE TABLE public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  role user_role not null default 'vendedor',
  nombre_completo text,
  meta_mensual numeric default 0,
  porcentaje_comision numeric default 0,
  creado_en timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Habilitar Row Level Security para perfilesa
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
-- comentario nuevo
CREATE POLICY "Los perfiles son visibles por todos los autenticados" 
ON public.profiles FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Los usuarios pueden actualizar su propio perfil" 
ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Trigger para crear un perfil automáticamente cuando hay nuevo registro en Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, nombre_completo, role)
  VALUES (new.id, new.raw_user_meta_data->>'nombre_completo', 'vendedor');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 2. Tabla de Pedidos
CREATE TYPE order_status AS ENUM (
  'pendiente',
  'alistando', 
  'facturando', 
  'en_camino', 
  'entregado', 
  'rechazado_puerta', 
  'programado_reintento', 
  'cerrado_sin_entrega'
);

CREATE TABLE public.orders (
  id uuid default uuid_generate_v4() primary key,
  vendedor_id uuid references public.profiles(id) not null,
  cliente_nombre text not null,
  observaciones text,
  estado order_status default 'pendiente' not null,
  total_recaudo numeric default 0,
  pagado boolean default false,
  intentos_entrega int default 1,
  creado_en timestamp with time zone default timezone('utc'::text, now()) not null,
  actualizado_en timestamp with time zone default timezone('utc'::text, now()) not null
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Vendedores sólo pueden ver y crear sus propios pedidos.
CREATE POLICY "Vendedores ven sus pedidos" ON public.orders
FOR SELECT USING (auth.uid() = vendedor_id OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Vendedores crean pedidos" ON public.orders
FOR INSERT WITH CHECK (auth.uid() = vendedor_id);

CREATE POLICY "Admins actualizan cualquier orden" ON public.orders
FOR UPDATE USING ( (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin' );

-- 3. Detalles de Pedido (Item = Medicamentos en texto libre)
CREATE TABLE public.order_items (
  id uuid default uuid_generate_v4() primary key,
  order_id uuid references public.orders(id) on delete cascade not null,
  medicamento_nombre text not null,
  cantidad int not null default 1,
  creado_en timestamp with time zone default timezone('utc'::text, now()) not null
);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Accesibles por dueño o admin" ON public.order_items
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM orders WHERE orders.id = order_items.order_id 
    AND (orders.vendedor_id = auth.uid() OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
  )
);

-- 4. Trazabilidad (History)
CREATE TABLE public.order_history (
  id uuid default uuid_generate_v4() primary key,
  order_id uuid references public.orders(id) on delete cascade not null,
  estado_anterior text,
  estado_nuevo text not null,
  cambiado_por uuid references public.profiles(id) not null,
  motivo_rechazo text,
  nota_interna text,
  creado_en timestamp with time zone default timezone('utc'::text, now()) not null
);

ALTER TABLE public.order_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Accesibles por dueño o admin history" ON public.order_history
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM orders WHERE orders.id = order_history.order_id 
    AND (orders.vendedor_id = auth.uid() OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
  )
);
-- Sólo los admin pueden insertar historial (o triggers en base a update)
CREATE POLICY "Admins insertan historial" ON public.order_history
FOR INSERT WITH CHECK ( (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin' );

-- Activar realtime para orders
alter publication supabase_realtime add table orders;

-- 5. Geolocalización de usuarios (rastreo silencioso por interacción)
ALTER TABLE public.profiles ADD COLUMN latitud numeric;
ALTER TABLE public.profiles ADD COLUMN longitud numeric;
ALTER TABLE public.profiles ADD COLUMN ultima_actualizacion timestamp with time zone;

-- Activar realtime para profiles (para ver motos/vendedores moverse en el mapa)
alter publication supabase_realtime add table profiles;

-- Política: los usuarios pueden actualizar su propia ubicación
CREATE POLICY "Usuarios actualizan su ubicación" ON public.profiles
FOR UPDATE USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 6. Motor Inteligente de Rutero y GPS
CREATE TABLE IF NOT EXISTS public.visitas (
  id uuid default gen_random_uuid() primary key,
  cliente_id uuid references public.clientes(id) on delete cascade not null,
  vendedor_id uuid references auth.users(id) on delete cascade not null,
  tipo_visita text not null check (tipo_visita in ('presencial', 'llamada_externa')),
  estado text not null default 'completada',
  lat_checkin numeric,
  lng_checkin numeric,
  distancia_metros numeric,
  justificacion_lejania text,
  observaciones text,
  proxima_visita_agendada date,
  creado_en timestamp with time zone default timezone('utc'::text, now()) not null
);

ALTER TABLE public.visitas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Visitas visibles para dueño o admin" ON public.visitas
FOR SELECT USING (
  vendedor_id = auth.uid() OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);
CREATE POLICY "Vendedores pueden insertar sus visitas" ON public.visitas
FOR INSERT WITH CHECK ( vendedor_id = auth.uid() );


CREATE OR REPLACE VIEW public.rutero_hoy AS
WITH ultimas_visitas AS (
    SELECT cliente_id, MAX(creado_en) as ultima_visita, MAX(proxima_visita_agendada) as proxima_visita
    FROM public.visitas
    GROUP BY cliente_id
),
ventas_stats AS (
    SELECT o.cliente_nombre, c.id as cliente_id, COUNT(o.id) as total_pedidos, MAX(o.creado_en) as ultimo_pedido
    FROM public.orders o
    JOIN public.clientes c ON o.cliente_nombre = c.nombre
    GROUP BY o.cliente_nombre, c.id
),
ranking_clientes AS (
    SELECT 
        c.id, c.vendedor_id, c.nombre, c.direccion, c.ciudad, c.telefono, c.latitud, c.longitud,
        v.ultima_visita,
        v.proxima_visita,
        s.total_pedidos,
        s.ultimo_pedido,
        CASE 
            WHEN v.proxima_visita IS NOT NULL AND v.proxima_visita <= CURRENT_DATE THEN 10000
            WHEN v.ultima_visita IS NULL AND s.total_pedidos IS NOT NULL THEN 5000 + s.total_pedidos * 10
            WHEN v.ultima_visita IS NOT NULL THEN EXTRACT(DAY FROM (now() - v.ultima_visita)) * COALESCE(s.total_pedidos, 1)
            ELSE 100
        END as prioridad,
        EXISTS (
            SELECT 1 FROM public.visitas v2 
            WHERE v2.cliente_id = c.id 
            AND v2.estado = 'completada' 
            AND DATE(v2.creado_en AT TIME ZONE 'America/Bogota') = DATE(now() AT TIME ZONE 'America/Bogota')
        ) as visitado_hoy
    FROM public.clientes c
    LEFT JOIN ultimas_visitas v ON c.id = v.cliente_id
    LEFT JOIN ventas_stats s ON c.id = s.cliente_id
    WHERE c.activo = true
),
rutero_filtrado AS (
    SELECT *, 
           ROW_NUMBER() OVER(PARTITION BY vendedor_id ORDER BY prioridad DESC) as rn
    FROM ranking_clientes
)
SELECT id, vendedor_id, nombre, direccion, ciudad, telefono, latitud, longitud, prioridad
FROM rutero_filtrado
WHERE rn <= 12 AND visitado_hoy = false;

CREATE OR REPLACE VIEW public.alertas_visitas_atrasadas AS
SELECT c.id, c.vendedor_id, c.nombre, 
       EXTRACT(DAY FROM (now() - COALESCE((SELECT MAX(creado_en) FROM public.visitas WHERE cliente_id = c.id), c.creado_en))) as dias_sin_visita
FROM public.clientes c
WHERE EXTRACT(DAY FROM (now() - COALESCE((SELECT MAX(creado_en) FROM public.visitas WHERE cliente_id = c.id), c.creado_en))) > 10
AND c.activo = true;

-- Índices para optimizar al máximo la vista rutero_hoy y ahorrar recursos
CREATE INDEX IF NOT EXISTS idx_visitas_cliente_id_creado ON public.visitas(cliente_id, creado_en);
CREATE INDEX IF NOT EXISTS idx_orders_cliente_nombre_creado ON public.orders(cliente_nombre, creado_en);
CREATE INDEX IF NOT EXISTS idx_clientes_vendedor_activo ON public.clientes(vendedor_id, activo);
