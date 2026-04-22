-- ============================================================
--  MEDITRACK — Esquema completo de Supabase / PostgreSQL
--  Generado: 2026-04-22
--  Proyecto:  MediTrack Logistics (Distribuidora)
--
--  Instrucciones:
--   1. Ejecutar en el SQL Editor de Supabase (dashboard)
--      O en orden desde la CLI: psql -f schema.sql
--   2. Este archivo es idempotente (usa IF NOT EXISTS / OR REPLACE)
--      y puede ejecutarse varias veces sin romper nada.
-- ============================================================


-- ╔══════════════════════════════════════════════════════════╗
-- ║  0. EXTENSIONES                                          ║
-- ╚══════════════════════════════════════════════════════════╝

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ╔══════════════════════════════════════════════════════════╗
-- ║  1. TIPOS ENUMERADOS (ENUMS)                             ║
-- ╚══════════════════════════════════════════════════════════╝

-- Roles de usuario
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'vendedor');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Estados del pedido
DO $$ BEGIN
  CREATE TYPE order_status AS ENUM (
    'pendiente',
    'alistando',
    'facturando',
    'en_camino',
    'entregado',
    'rechazado_puerta',
    'programado_reintento',
    'cerrado_sin_entrega',
    'cancelado'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Agregar 'cancelado' si la tabla ya existía sin él
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'cancelado';


-- ╔══════════════════════════════════════════════════════════╗
-- ║  2. TABLAS                                               ║
-- ╚══════════════════════════════════════════════════════════╝

-- ── profiles ──────────────────────────────────────────────
-- Extiende auth.users de Supabase con datos del negocio.
-- Se crea automáticamente vía trigger de auth (handle_new_user).
CREATE TABLE IF NOT EXISTS public.profiles (
  id                  UUID         PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role                user_role    NOT NULL DEFAULT 'vendedor',
  nombre_completo     TEXT,
  meta_mensual        NUMERIC      DEFAULT 0,
  porcentaje_comision NUMERIC      DEFAULT 0,
  creado_en           TIMESTAMPTZ  NOT NULL DEFAULT timezone('utc', now())
);

-- ── orders ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orders (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendedor_id      UUID         NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  cliente_nombre   TEXT         NOT NULL,
  observaciones    TEXT,
  estado           order_status NOT NULL DEFAULT 'pendiente',
  total_recaudo    NUMERIC      DEFAULT 0,
  pagado           BOOLEAN      DEFAULT false,
  intentos_entrega INTEGER      DEFAULT 1,
  motivo_rechazo   TEXT,
  nota_reintento   TEXT,
  fecha_reintento  TIMESTAMPTZ,
  fecha_entrega    DATE,                   -- Fecha comprometida de entrega
  tipo_factura     TEXT,
  tipo_pago        TEXT,
  creado_en        TIMESTAMPTZ  NOT NULL DEFAULT timezone('utc', now()),
  actualizado_en   TIMESTAMPTZ  NOT NULL DEFAULT timezone('utc', now())
);

-- ── order_items ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_items (
  id                 UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id           UUID        NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  medicamento_nombre TEXT        NOT NULL,
  cantidad           INTEGER     NOT NULL DEFAULT 1,
  creado_en          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- ── order_history ─────────────────────────────────────────
-- Auditoría de cada cambio de estado.
CREATE TABLE IF NOT EXISTS public.order_history (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id        UUID        NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  estado_anterior TEXT,
  estado_nuevo    TEXT        NOT NULL,
  cambiado_por    UUID        NOT NULL REFERENCES auth.users(id),
  motivo_rechazo  TEXT,
  nota_interna    TEXT,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- ── notificaciones ────────────────────────────────────────
-- Push notifications internas (Realtime). Solo lectura por el destinatario.
CREATE TABLE IF NOT EXISTS public.notificaciones (
  id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id  UUID        REFERENCES public.orders(id) ON DELETE SET NULL,
  mensaje   TEXT        NOT NULL,
  tipo      TEXT        NOT NULL,    -- 'nuevo_pedido' | 'cambio_estado'
  leida     BOOLEAN     DEFAULT false,
  creado_en TIMESTAMPTZ DEFAULT timezone('utc', now())
);


-- ╔══════════════════════════════════════════════════════════╗
-- ║  3. ROW LEVEL SECURITY (RLS)                             ║
-- ╚══════════════════════════════════════════════════════════╝

-- Habilitar RLS en todas las tablas
ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_history  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;

-- ── profiles ──────────────────────────────────────────────
DROP POLICY IF EXISTS "Los perfiles son visibles por todos los autenticados" ON public.profiles;
CREATE POLICY "Los perfiles son visibles por todos los autenticados"
  ON public.profiles FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Los usuarios pueden actualizar su propio perfil" ON public.profiles;
CREATE POLICY "Los usuarios pueden actualizar su propio perfil"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- ── orders ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Vendedores ven sus pedidos" ON public.orders;
CREATE POLICY "Vendedores ven sus pedidos"
  ON public.orders FOR SELECT
  USING (
    auth.uid() = vendedor_id
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

DROP POLICY IF EXISTS "Vendedores crean pedidos" ON public.orders;
CREATE POLICY "Vendedores crean pedidos"
  ON public.orders FOR INSERT
  WITH CHECK (auth.uid() = vendedor_id);

DROP POLICY IF EXISTS "Admins actualizan cualquier orden" ON public.orders;
CREATE POLICY "Admins actualizan cualquier orden"
  ON public.orders FOR UPDATE
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- ── order_items ───────────────────────────────────────────
DROP POLICY IF EXISTS "Accesibles por dueño o admin" ON public.order_items;
CREATE POLICY "Accesibles por dueño o admin"
  ON public.order_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_items.order_id
        AND (
          orders.vendedor_id = auth.uid()
          OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
        )
    )
  );

-- ── order_history ─────────────────────────────────────────
DROP POLICY IF EXISTS "Accesibles por dueño o admin history" ON public.order_history;
CREATE POLICY "Accesibles por dueño o admin history"
  ON public.order_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_history.order_id
        AND (
          o.vendedor_id = auth.uid()
          OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
        )
    )
  );

DROP POLICY IF EXISTS "Admins insertan historial" ON public.order_history;
CREATE POLICY "Admins insertan historial"
  ON public.order_history FOR INSERT
  WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- ── notificaciones ────────────────────────────────────────
DROP POLICY IF EXISTS "Usuarios ven sus propias notificaciones" ON public.notificaciones;
CREATE POLICY "Usuarios ven sus propias notificaciones"
  ON public.notificaciones FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuarios pueden actualizar sus notificaciones" ON public.notificaciones;
CREATE POLICY "Usuarios pueden actualizar sus notificaciones"
  ON public.notificaciones FOR UPDATE
  USING (auth.uid() = user_id);


-- ╔══════════════════════════════════════════════════════════╗
-- ║  4. FUNCIONES Y TRIGGERS                                 ║
-- ╚══════════════════════════════════════════════════════════╝

-- ── 4a. Auto-actualizar actualizado_en en orders ──────────
CREATE OR REPLACE FUNCTION public.fn_set_actualizado_en()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.actualizado_en := timezone('utc', now());
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_orders_actualizado_en ON public.orders;
CREATE TRIGGER tr_orders_actualizado_en
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_actualizado_en();

-- ── 4b. Notificaciones automáticas al cambiar un pedido ───
--
--  LÓGICA:
--   INSERT → Notifica a todos los admins sobre el nuevo pedido
--   UPDATE (estado cambia) →
--     · Vendedor:  "Tu pedido de X cambió a: <estado legible>"
--     · Admins:    "📦 X: <estado_anterior> → <estado_nuevo>"
--
--  NOTA IMPORTANTE:
--   Esta función usa SECURITY DEFINER para poder insertar en
--   notificaciones aunque el usuario anónimo o el service_role
--   actualicen orders. No requiere la variable SUPABASE_SERVICE_ROLE_KEY
--   en la app ya que corre internamente en Postgres.
--
--   El CASE usa ::TEXT para evitar coerciones al tipo order_status
--   (bug: PostgreSQL infiere el tipo del CASE desde la rama ELSE
--    si contiene un valor enum, causando cast errors).
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_order_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_admin             RECORD;
  v_msg_vendedor      TEXT;
  v_msg_admin         TEXT;
  v_tipo              TEXT;
  v_label_nuevo       TEXT;
  v_label_viejo       TEXT;
  v_estado_nuevo_text TEXT;
  v_estado_viejo_text TEXT;
BEGIN

  IF TG_OP = 'UPDATE' THEN
    -- Cast explícito a TEXT ANTES del CASE para evitar coerciones de tipo enum
    v_estado_nuevo_text := NEW.estado::TEXT;
    v_estado_viejo_text := OLD.estado::TEXT;

    v_label_nuevo := CASE v_estado_nuevo_text
      WHEN 'pendiente'            THEN 'Pendiente ⏳'
      WHEN 'alistando'            THEN 'En alistamiento 📦'
      WHEN 'facturando'           THEN 'En facturación 🧾'
      WHEN 'en_camino'            THEN 'En camino 🚚'
      WHEN 'entregado'            THEN '¡Entregado! ✅'
      WHEN 'rechazado_puerta'     THEN 'Rechazado en puerta 🚫'
      WHEN 'programado_reintento' THEN 'Reintento programado 🔄'
      WHEN 'cerrado_sin_entrega'  THEN 'Cerrado sin entrega 🔒'
      WHEN 'cancelado'            THEN 'Cancelado ❌'
      ELSE v_estado_nuevo_text
    END;

    v_label_viejo := CASE v_estado_viejo_text
      WHEN 'pendiente'            THEN 'Pendiente ⏳'
      WHEN 'alistando'            THEN 'En alistamiento 📦'
      WHEN 'facturando'           THEN 'En facturación 🧾'
      WHEN 'en_camino'            THEN 'En camino 🚚'
      WHEN 'entregado'            THEN '¡Entregado! ✅'
      WHEN 'rechazado_puerta'     THEN 'Rechazado en puerta 🚫'
      WHEN 'programado_reintento' THEN 'Reintento programado 🔄'
      WHEN 'cerrado_sin_entrega'  THEN 'Cerrado sin entrega 🔒'
      WHEN 'cancelado'            THEN 'Cancelado ❌'
      ELSE v_estado_viejo_text
    END;
  END IF;

  -- ── INSERT: nuevo pedido → notificar admins ─────────────
  IF TG_OP = 'INSERT' THEN
    v_tipo      := 'nuevo_pedido';
    v_msg_admin := '🆕 Nuevo pedido de ' || NEW.cliente_nombre;

    FOR v_admin IN SELECT id FROM public.profiles WHERE role = 'admin' LOOP
      IF v_admin.id != NEW.vendedor_id THEN
        INSERT INTO public.notificaciones (user_id, order_id, mensaje, tipo)
        VALUES (v_admin.id, NEW.id, v_msg_admin, v_tipo);
      END IF;
    END LOOP;

  -- ── UPDATE: cambio de estado → notificar vendedor + admins
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.estado IS DISTINCT FROM NEW.estado THEN
      v_tipo := 'cambio_estado';

      v_msg_vendedor := 'Tu pedido de "' || NEW.cliente_nombre
                        || '" cambió a: ' || v_label_nuevo;
      v_msg_admin    := '📦 ' || NEW.cliente_nombre || ': '
                        || v_label_viejo || ' → ' || v_label_nuevo;

      -- Notificar al vendedor dueño del pedido
      IF NEW.vendedor_id IS NOT NULL THEN
        INSERT INTO public.notificaciones (user_id, order_id, mensaje, tipo)
        VALUES (NEW.vendedor_id, NEW.id, v_msg_vendedor, v_tipo);
      END IF;

      -- Notificar a cada admin (excepto si el mismo admin es el vendedor)
      FOR v_admin IN SELECT id FROM public.profiles WHERE role = 'admin' LOOP
        IF v_admin.id != NEW.vendedor_id THEN
          INSERT INTO public.notificaciones (user_id, order_id, mensaje, tipo)
          VALUES (v_admin.id, NEW.id, v_msg_admin, v_tipo);
        END IF;
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS order_notifications_trigger ON public.orders;
CREATE TRIGGER order_notifications_trigger
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_order_notifications();

-- ── 4c. Crear perfil automáticamente al registrar usuario ─
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.profiles (id, nombre_completo)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'nombre_completo')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ╔══════════════════════════════════════════════════════════╗
-- ║  5. REALTIME                                             ║
-- ╚══════════════════════════════════════════════════════════╝

-- Habilitar publicación Realtime para notificaciones
-- (recibe INSERT/UPDATE en tiempo real en el cliente)
ALTER PUBLICATION supabase_realtime ADD TABLE public.notificaciones;

-- También habilitar pedidos para actualizaciones en tiempo real
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;


-- ╔══════════════════════════════════════════════════════════╗
-- ║  6. VARIABLES DE ENTORNO REQUERIDAS (.env.local)         ║
-- ╚══════════════════════════════════════════════════════════╝
--
--  NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
--  NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
--  SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   ← Solo servidor
--
--  En Vercel → Settings → Environment Variables
--  · NEXT_PUBLIC_* → "All Environments"
--  · SUPABASE_SERVICE_ROLE_KEY → "Production and Preview" (Sensitive)
--
-- ============================================================
--  FIN DEL ESQUEMA
-- ============================================================
