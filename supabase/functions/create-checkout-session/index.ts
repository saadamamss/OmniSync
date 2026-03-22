import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // معالجة طلبات CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) {
      console.error("[create-checkout-session] Error: STRIPE_SECRET_KEY is not set in Supabase Secrets.");
      return new Response(JSON.stringify({ error: 'Stripe configuration missing on server.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { plan, user_id, user_email } = await req.json();
    console.log(`[create-checkout-session] Creating session for ${user_email} (Plan: ${plan})`);

    const stripe = new Stripe(stripeKey, {
      apiVersion: '2023-10-16',
    });

    const prices: Record<string, number> = {
      'pro': 4900,
      'enterprise': 19900
    };

    const session = await stripe.checkout.sessions.create({
      customer_email: user_email,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `OmniSync AI - ${plan.toUpperCase()} Plan`,
              description: `Upgrade your account to ${plan} plan`,
            },
            unit_amount: prices[plan] || 4900,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${req.headers.get('origin')}/dashboard?status=success`,
      cancel_url: `${req.headers.get('origin')}/dashboard/settings?status=cancelled`,
      metadata: {
        user_id: user_id,
        plan: plan
      }
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error("[create-checkout-session] Unexpected Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
})