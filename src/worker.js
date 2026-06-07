const SYSTEM_PROMPT = `Du bist der offizielle One2buy Ankauf Assistent. Beantworte nur Fragen zu One2Buy Kiel. Adresse: Sophienblatt 19, 24103 Kiel. Tel: 0431 6004839. Öffnungszeiten: Mo-Fr 9-19 Uhr, Sa 9-18 Uhr, So geschlossen. Ankauf: Smartphones, Tablets, Laptops, Konsolen, Spiele, Gold, Silber, Werkzeug, Kameras. Nenne nie verbindliche Preise. Führe Kunden ins Geschäft. Bei unbekannten Fragen: Ruf uns an unter 0431 6004839.`;

const ALLOWED_ORIGINS = ['https://one2buy-kiel.de', 'http://localhost:4321'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/chat') {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(request) });
      }
      if (request.method === 'POST') {
        return handleChat(request, env);
      }
      return new Response('Method not allowed', { status: 405 });
    }

    return env.ASSETS.fetch(request);
  },
};

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

async function handleChat(request, env) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError('Ungültige Anfrage', 400, request);
    }

    const { messages } = body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return jsonError('Keine Nachrichten übergeben', 400, request);
    }

    const trimmed = messages.slice(-20).map((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: String(m.content).slice(0, 1000),
    }));

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...trimmed],
        max_tokens: 400,
        temperature: 0.5,
      }),
    });

    if (!openaiRes.ok) {
      console.error('OpenAI error:', await openaiRes.text());
      return jsonError('KI nicht erreichbar. Bitte ruf uns an: 0431 6004839', 502, request);
    }

    const data = await openaiRes.json();
    const reply = data.choices?.[0]?.message?.content ?? 'Keine Antwort erhalten.';

    return new Response(JSON.stringify({ reply }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
    });
  } catch (e) {
    console.error('Chat handler error:', e);
    return jsonError('Serverfehler. Bitte ruf uns an: 0431 6004839', 500, request);
  }
}

function jsonError(message, status, request) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
  });
}
