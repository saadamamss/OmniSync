import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { generateEmbedding } from '../_shared/embeddings.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const { bot_id, message, history, conversation_id, include_sources } = await req.json()
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // 1. جلب بيانات البوت وإعداداته
    const { data: bot } = await supabase.from('chatbots').select('*').eq('id', bot_id).single()
    if (!bot) throw new Error("Bot not found");

    // Check if bot is active
    if (bot.is_active === false) {
      return new Response(
        JSON.stringify({
          reply: "This chatbot is currently inactive. Please contact the website owner."
        }),
        {
          status: 200, // 200 not error so it doesn't break the widget
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Get user data and plan
    const { data: botOwner } = await supabase
      .from('chatbots')
      .select('user_id')
      .eq('id', bot_id)
      .single();

    const { data: profile } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', botOwner.user_id)
      .single();

    const plan = profile?.plan || 'starter';

    // Message limits
    const MESSAGE_LIMITS: Record<string, number> = {
      starter: 1000,
      pro: 10000,
      enterprise: Infinity
    };

    // Check message limits
    const currentUsage = await supabase
      .rpc('get_current_usage', { p_user_id: botOwner.user_id });

    const limit = MESSAGE_LIMITS[plan];

    if (currentUsage.data >= limit) {
      return new Response(
        JSON.stringify({
          reply: "I'm sorry, this chatbot has reached its monthly message limit. Please try again next month."
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // NOTE: usage is incremented only after a successful AI reply below —
    // billing before the answer let any visitor drain an owner's quota for free.

    const groqKey = Deno.env.get('GROQ_API_KEY');
    if (!groqKey) throw new Error("GROQ_API_KEY not configured in Supabase secrets");
    const openAiKey = Deno.env.get('OPENAI_API_KEY');
    
    let contextChunks: string[] = [];
    let sources: { title: string; matched_via: string }[] = [];

    // 2. Hybrid retrieval — the single search entry point.
    // Keyword (FTS) always runs; the semantic arm activates only when an
    // embedding is supplied, so one code path serves both plan tiers.
    try {
      let queryEmbedding: number[] | null = null;
      if (openAiKey) {
        try {
          queryEmbedding = await generateEmbedding(message, openAiKey);
        } catch (e) {
          console.error("[chat] Query embedding failed, using keyword-only:", (e as Error).message);
        }
      }
      const { data: results, error: searchError } = await supabase.rpc('hybrid_search_knowledge', {
        p_chatbot_id: bot_id,
        p_query: message,
        p_query_embedding: queryEmbedding,
        p_match_count: 5,
      });
      if (searchError) throw searchError;
      if (results?.length) {
        contextChunks = results.map((c: any) => c.content);
        // matched_via: 'keyword' | 'semantic' | 'hybrid' — the Playground
        // "Show why" panel consumes this; the widget never sees it.
        sources = results.map((c: any) => ({ title: c.title ?? "", matched_via: c.matched_via }));
      }
    } catch (e) {
      console.error("[chat] Hybrid search failed:", (e as Error).message);
      // Last-resort fallback so a retriever bug degrades to few-chunks instead
      // of an empty context.
      const { data: fallbackChunks } = await supabase
        .from('knowledge_chunks')
        .select('content')
        .eq('chatbot_id', bot_id)
        .limit(5);
      if (fallbackChunks) contextChunks = fallbackChunks.map((c: any) => c.content);
    }

    const context = contextChunks.join("\n\n");
    const botName = bot.settings?.appearance?.botName || bot.name;
    const systemPrompt = bot.settings?.appearance?.systemPrompt || "";

    // 5. تعليمات صارمة جداً للذكاء الاصطناعي
    const finalPrompt = `أنت المساعد الرسمي لـ "${botName}".
    يجب أن تكون إجاباتك مستمدة بنسبة 100% من "معلومات التدريب" المقدمة أدناه.
    
    معلومات التدريب الخاصة بك:
    ${context || "لا توجد معلومات محددة حالياً، أجب بلباقة واعتذر عن عدم توفر المعلومة بدقة."}
    
    التعليمات:
    - اسمك هو: ${botName}.
    - ${systemPrompt}
    - إذا سألك العميل عن شيء موجود في "معلومات التدريب"، أجب به فوراً.
    - لا تخترع معلومات من عندك خارج السياق.
    - تحدث بلهجة بشرية طبيعية تماماً.
    - التزم بلغة المستخدم.`;

    const aiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b',
        messages: [
          { role: 'system', content: finalPrompt },
          ...(history || []).slice(-6),
          { role: 'user', content: message }
        ],
        temperature: 0.3, // تقليل العشوائية لزيادة الموثوقية
      })
    });

    const result = await aiRes.json();
    const reply = result.choices?.[0]?.message?.content;
    if (!reply) {
      throw new Error(`AI failed with ${aiRes.status}: ${JSON.stringify(result.error ?? result).slice(0, 300)}`);
    }

    // Bill the owner only for successful replies.
    await supabase.rpc('increment_message_usage', { p_user_id: botOwner.user_id });

    if (conversation_id) {
      await supabase.from('messages').insert([
        { conversation_id, role: 'user', content: message },
        { conversation_id, role: 'assistant', content: reply }
      ]);
    }

    // Sources are owner-only intel: flag-gated so the public widget never
    // receives them (Playground passes include_sources: true).
    const payload: Record<string, unknown> = { reply };
    if (include_sources) {
      payload.sources = sources.filter((s) => s.title);
    }

    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
})