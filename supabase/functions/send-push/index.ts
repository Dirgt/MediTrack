import { createClient } from "npm:@supabase/supabase-js@2.39.3";
import webpush from "npm:web-push@3.6.7";

console.log("send-push edge function started!");

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export default {
  async fetch(req: Request) {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    try {
      // The trigger or webhook will send JSON payload
      const payload = await req.json();
      // Expecting { user_id: '...', title: '...', body: '...', url: '...' }
      // Or if it comes from a Database Webhook on the 'notificaciones' table,
      // the payload has { record: { user_id, mensaje, tipo... } }
      
      let userId, title, body, url;
      
      if (payload.record) {
        // Came from a database webhook on 'notificaciones' table
        userId = payload.record.user_id;
        title = payload.record.tipo === 'nuevo_pedido' ? 'Nuevo Pedido Asignado' : 'Actualización de Pedido';
        body = payload.record.mensaje;
        url = '/notificaciones';
      } else {
        // Came from a direct fetch call
        userId = payload.user_id;
        title = payload.title || 'Nueva Notificación';
        body = payload.body || payload.mensaje;
        url = payload.url || '/notificaciones';
      }

      if (!userId || !body) {
        return new Response(JSON.stringify({ error: "Missing user_id or body" }), { 
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }

      // Configure web-push with VAPID keys
      const vapidPublicKey = Deno.env.get("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
      const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");

      if (!vapidPublicKey || !vapidPrivateKey) {
        throw new Error("VAPID keys not configured in environment variables");
      }

      webpush.setVapidDetails(
        "mailto:admin@meditrack.com",
        vapidPublicKey,
        vapidPrivateKey
      );

      // Initialize Supabase admin client to bypass RLS and read subscriptions
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      // Fetch all subscriptions for this user
      const { data: subscriptions, error: dbError } = await supabaseAdmin
        .from('push_subscriptions')
        .select('*')
        .eq('user_id', userId);

      if (dbError) throw dbError;

      if (!subscriptions || subscriptions.length === 0) {
        console.log(`No active push subscriptions found for user ${userId}`);
        return new Response(JSON.stringify({ success: true, message: "No subscriptions found" }), { 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }

      const pushPayload = JSON.stringify({
        title,
        body,
        url,
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png'
      });

      // Send push notification to all user's devices
      const sendPromises = subscriptions.map(async (sub) => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth
          }
        };

        try {
          await webpush.sendNotification(pushSubscription, pushPayload);
          console.log(`Push sent successfully to ${sub.endpoint}`);
        } catch (err: any) {
          console.error(`Error sending push to ${sub.endpoint}:`, err);
          // If the subscription is invalid/expired (HTTP 410 or 404), delete it from DB
          if (err.statusCode === 410 || err.statusCode === 404) {
            console.log(`Removing expired subscription: ${sub.endpoint}`);
            await supabaseAdmin
              .from('push_subscriptions')
              .delete()
              .eq('endpoint', sub.endpoint);
          }
        }
      });

      await Promise.all(sendPromises);

      return new Response(JSON.stringify({ success: true, count: subscriptions.length }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });

    } catch (error: any) {
      console.error("Function error:", error);
      return new Response(JSON.stringify({ error: error.message }), { 
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
  }
};
