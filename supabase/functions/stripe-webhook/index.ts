import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  
  const stripe = new Stripe(stripeKey || '', {
    apiVersion: '2023-10-16',
  })
  
  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    console.error("[stripe-webhook] Error: No stripe-signature header found.");
    return new Response('No signature', { status: 400 })
  }

  try {
    const body = await req.text()
    let event;

    try {
      // استخدام constructEventAsync بدلاً من constructEvent لحل مشكلة SubtleCryptoProvider
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret || '')
    } catch (err) {
      console.error(`[stripe-webhook] Signature verification failed: ${err.message}`);
      return new Response(`Webhook Error: ${err.message}`, { status: 400 })
    }

    console.log(`[stripe-webhook] Processing event: ${event.type}`);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      const userId = session.metadata?.user_id
      const plan = session.metadata?.plan

      console.log(`[stripe-webhook] Session completed for User: ${userId}, Plan: ${plan}`);

      if (!userId || !plan) {
        console.error("[stripe-webhook] Critical Error: Missing metadata (user_id or plan)");
        return new Response('Missing metadata', { status: 400 });
      }

      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      )

      const { data, error } = await supabase
        .from('profiles')
        .update({ 
          plan: plan,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)
        .select()

      if (error) {
        console.error("[stripe-webhook] Database Error:", error.message);
        return new Response('Database error', { status: 500 });
      }

      if (!data || data.length === 0) {
        console.warn("[stripe-webhook] Warning: No profile found to update for ID:", userId);
      } else {
        console.log(`[stripe-webhook] SUCCESS: User ${userId} plan updated to ${plan}`);
        
        // User will manually activate bots from Dashboard
        console.log(`[stripe-webhook] User ${userId} can now manually activate bots up to plan ${plan} limit`);
      }
    }

    return new Response(JSON.stringify({ received: true }), { 
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error(`[stripe-webhook] Unexpected Error: ${err.message}`);
    return new Response(`Error: ${err.message}`, { status: 500 })
  }
})