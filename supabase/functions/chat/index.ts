import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const { bot_id, message, history, conversation_id } = await req.json()
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

    // Increment count
    await supabase.rpc('increment_message_usage', { p_user_id: botOwner.user_id });

    const groqKey = Deno.env.get('GROQ_API_KEY');
    const openAiKey = Deno.env.get('OPENAI_API_KEY');
    
    let contextChunks: string[] = [];

    // 2. البحث الذكي (Vector Search) - إذا توفرت المفاتيح
    if (openAiKey) {
      try {
        const embRes = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: { "Authorization": `Bearer ${openAiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ input: message, model: "text-embedding-3-small" }),
        });
        if (embRes.ok) {
          const embData = await embRes.json();
          const { data: vectorResults } = await supabase.rpc('match_knowledge_chunks', {
            query_embedding: embData.data[0].embedding,
            match_threshold: 0.1, // عتبة منخفضة جداً لضمان إيجاد أي شيء قريب
            match_count: 5,
            p_chatbot_id: bot_id
          });
          if (vectorResults && vectorResults.length > 0) {
            contextChunks = vectorResults.map((c: any) => c.content);
          }
        }
      } catch (e) { console.error("[chat] Vector search failed:", e.message); }
    }

    // 3. البحث النصي المباشر (Keyword Search) - منقذ الموثوقية
    // إذا لم نجد نتائج ذكية، أو لتعزيز النتائج، نبحث عن الكلمات في قاعدة البيانات مباشرة
    const searchTerms = message.split(' ').filter((w: string) => w.length > 2);
    if (searchTerms.length > 0) {
      const { data: textResults } = await supabase
        .from('knowledge_chunks')
        .select('content')
        .eq('chatbot_id', bot_id)
        .or(searchTerms.map(term => `content.ilike.%${term}%`).join(','));
      
      if (textResults) {
        textResults.forEach(r => {
          if (!contextChunks.includes(r.content)) contextChunks.push(r.content);
        });
      }
    }

    // 4. إذا كان البوت لا يزال لا يملك سياقاً، نسحب آخر 10 قطع معرفية كخيار أخير
    if (contextChunks.length === 0) {
      const { data: fallbackChunks } = await supabase
        .from('knowledge_chunks')
        .select('content')
        .eq('chatbot_id', bot_id)
        .limit(5);
      if (fallbackChunks) contextChunks = fallbackChunks.map(c => c.content);
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
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: finalPrompt },
          ...(history || []).slice(-6),
          { role: 'user', content: message }
        ],
        temperature: 0.3, // تقليل العشوائية لزيادة الموثوقية
      })
    });

    const result = await aiRes.json();
    const reply = result.choices[0].message.content;

    if (conversation_id) {
      await supabase.from('messages').insert([
        { conversation_id, role: 'user', content: message },
        { conversation_id, role: 'assistant', content: reply }
      ]);
    }

    return new Response(JSON.stringify({ reply }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
})