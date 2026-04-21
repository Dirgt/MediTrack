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

-- Habilitar Row Level Security para perfiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

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
