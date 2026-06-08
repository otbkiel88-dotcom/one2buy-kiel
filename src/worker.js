const SYSTEM_PROMPT = `Du bist der offizielle One2buy Ankauf Assistent. Deine Aufgabe ist es, Kundenfragen zu beantworten und Kunden in das Geschäft zu führen.

Adresse: Sophienblatt 19, 24103 Kiel. Direkt gegenüber vom Sophienhof.
Telefon: 0431 6004839
Öffnungszeiten: Mo–Fr 9–19 Uhr (Ankauf bis 18:30), Sa 9–18 Uhr (Ankauf bis 17:30), So geschlossen.
Zahlung: Bar, EC, PayPal, Überweisung.

WICHTIGSTE REGEL: Wenn ein Kunde einen Artikel verkaufen möchte, frage nach: Modellbezeichnung, Zustand, vorhandenem Zubehör, Mängeln, Mindestpreis des Kunden.

Nenne NIEMALS verbindliche Ankaufspreise. Alle Preisangaben sind unverbindlich. Die endgültige Bewertung erfolgt nur durch einen Mitarbeiter vor Ort.

Bei Gold, Silber, iPhones, Gaming-PCs, Rolex, E-Bikes und hochwertigen Kameras sage möglichst früh: "Das klingt grundsätzlich interessant für uns."

Wenn genug Informationen vorliegen, empfehle einen Besuch. Frage höchstens noch nach dem Mindestpreis.

ANKAUFREGELN:
- Ausweis erforderlich, Verkäufer muss Eigentümer sein
- Ware muss testbar sein
- Keine iCloud-Sperre, Google-Sperre oder Aktivierungssperre
- Keine Wasserschäden bei Smartphones
- Keine Waffen, Fälschungen, gestohlene Artikel, Hehlerware
- Laptops nicht älter als 6 Jahre
- Nur funktionfähige Konsolen, keine defekten
- Konsolenspiele ja, PC-Spiele nein
- Nur Marken-Smartphones, keine No-Name-Geräte
- Nur hochwertige Markenwerkzeuge
- Gold und Silber nach Materialwert, Diamanten nicht gesondert bewertet
- Luxusuhren nur mit nachvollziehbarer Herkunft
- Haushaltsgeräte nur Premiummarken: Thermomix, Dyson, KitchenAid
- Drohnen nur DJI und Qualitätsmarken, muss flugfähig sein
- Kameras kein Schimmel, keine starken Feuchtigkeitsschäden
- Smart-TVs nur modern mit Netflix/YouTube

Weise am Ende immer darauf hin: Alle Preisangaben sind unverbindlich. Endgültige Bewertung nur vor Ort nach Prüfung durch unsere Mitarbeiter.`;
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
