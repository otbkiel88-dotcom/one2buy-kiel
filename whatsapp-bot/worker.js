// ONE 2 BUY Kiel – WhatsApp Bot Worker
// Phone Number ID : 1071037936103595
// Business Account: 760021927177401
//
// Webhook-URL (nach Deploy eintragen in Meta Developer Console):
//   https://one2buy-whatsapp.<dein-subdomain>.workers.dev/webhook
//
// Benötigte Secrets (je einzeln setzen):
//   npx wrangler secret put OPENAI_API_KEY        -c whatsapp-bot/wrangler.toml
//   npx wrangler secret put WHATSAPP_ACCESS_TOKEN -c whatsapp-bot/wrangler.toml
//   npx wrangler secret put WHATSAPP_VERIFY_TOKEN -c whatsapp-bot/wrangler.toml  (beliebiger String, z.B. "one2buy-kiel-wa")

const PHONE_NUMBER_ID = '1071037936103595';
const WA_API = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}`;

// Maximale Gesprächstiefe (Anzahl User+Assistent-Nachrichten, die im Kontext bleiben)
const MAX_HISTORY = 10;

const SYSTEM_PROMPT = `Du bist der offizielle WhatsApp Assistent von ONE 2 BUY Kiel. Du antwortest kurz und direkt – das Gespräch läuft über WhatsApp, also keine langen Texte.

Adresse: Sophienblatt 19, 24103 Kiel (direkt gegenüber Sophienhof)
Telefon: 0431 6004839
Öffnungszeiten: Mo–Fr 9–19 Uhr (Ankauf bis 18:30), Sa 9–18 Uhr (Ankauf bis 17:30), So geschlossen.
Zahlung: Bar, EC, PayPal, Überweisung.

WICHTIGSTE REGEL: Wenn ein Kunde etwas verkaufen möchte, frage nach: Modellbezeichnung, Zustand, vorhandenem Zubehör, Mängeln, Mindestpreis.

Nenne NIEMALS verbindliche Ankaufspreise. Alle Preisangaben sind unverbindlich. Die endgültige Bewertung erfolgt nur durch einen Mitarbeiter vor Ort.

Bei Gold, Silber, iPhones, Gaming-PCs, Rolex, E-Bikes und hochwertigen Kameras sage möglichst früh: "Das klingt grundsätzlich interessant für uns."

Wenn genug Informationen vorliegen, empfehle einen Besuch im Laden oder einen Rückruf unter 0431 6004839.

ANKAUFREGELN:
- Ausweis erforderlich, Verkäufer muss Eigentümer sein
- Ware muss testbar und funktionsfähig sein
- Keine iCloud-, Google- oder Aktivierungssperre bei Smartphones
- Keine Wasserschäden bei Smartphones
- Laptops nicht älter als 6 Jahre
- Konsolenspiele ja, PC-Spiele nein
- Nur Marken-Smartphones, keine No-Name-Geräte
- Nur hochwertige Markenwerkzeuge
- Gold und Silber nach Materialwert, Diamanten nicht gesondert bewertet
- Luxusuhren nur mit nachvollziehbarer Herkunft
- Haushaltsgeräte nur Premiummarken: Thermomix, Dyson, KitchenAid
- Drohnen nur DJI und Qualitätsmarken, muss flugfähig sein
- Smart-TVs nur modern mit Netflix/YouTube

Schreibe kurze, freundliche Antworten ohne Aufzählungszeichen – einfacher Fließtext. Keine HTML-Formatierung.
Hinweis am Schluss: "Alle Preisangaben unverbindlich – endgültige Bewertung nur vor Ort."`;

// ─── Entry point ─────────────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname !== '/webhook') {
      return new Response('ONE 2 BUY WhatsApp Bot läuft.', { status: 200 });
    }

    if (request.method === 'GET') {
      return handleVerification(request, env);
    }

    if (request.method === 'POST') {
      // Payload sofort lesen, bevor die Response gesendet wird
      const body = await request.json().catch(() => null);
      // Asynchron verarbeiten – WhatsApp bekommt sofort 200
      ctx.waitUntil(processWebhook(body, env));
      return new Response('OK', { status: 200 });
    }

    return new Response('Method not allowed', { status: 405 });
  },
};

// Verify Token – muss exakt mit dem Wert in der Meta Developer Console übereinstimmen.
// Das Secret WHATSAPP_VERIFY_TOKEN überschreibt diesen Wert wenn gesetzt.
const VERIFY_TOKEN_FALLBACK = 'one2buy-kiel-wa';

// ─── Webhook-Verifizierung (GET) ──────────────────────────────────────────────

function handleVerification(request, env) {
  const url = new URL(request.url);
  const mode      = url.searchParams.get('hub.mode');
  const token     = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  const expectedToken = (env.WHATSAPP_VERIFY_TOKEN || '').trim() || VERIFY_TOKEN_FALLBACK;

  console.log(`Verification: mode="${mode}" token="${token}" expected="${expectedToken}" challenge="${challenge}"`);

  if (mode === 'subscribe' && token === expectedToken) {
    console.log('Webhook verification successful');
    return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }

  console.error(`Verification failed: received token="${token}", expected="${expectedToken}"`);
  return new Response('Forbidden', { status: 403 });
}

// ─── Eingehende Nachrichten verarbeiten (POST) ────────────────────────────────

async function processWebhook(body, env) {
  try {
    const messages = body?.entry?.[0]?.changes?.[0]?.value?.messages;
    if (!messages?.length) return; // Status-Update oder leeres Event

    const msg = messages[0];
    const from  = msg.from;   // Absender-Rufnummer (internationales Format)
    const msgId = msg.id;

    // Duplikate vermeiden (WhatsApp sendet gelegentlich doppelt)
    if (await isDuplicate(msgId, env)) {
      console.log(`Duplicate message ${msgId} – skipped`);
      return;
    }

    // Nachricht als gelesen markieren (blaue Haken)
    await markAsRead(msgId, env);

    // Nur Text-Nachrichten beantworten
    if (msg.type !== 'text') {
      await sendText(
        from,
        'Ich kann leider nur Textnachrichten verarbeiten. Für andere Anfragen ruf uns gerne an: 0431 6004839',
        null,
        env,
      );
      return;
    }

    const userText = msg.text.body.trim().slice(0, 1000);

    // Gesprächsverlauf laden
    const history = await loadHistory(from, env);

    // OpenAI anfragen
    const reply = await getAIReply(userText, history, env);

    // Verlauf speichern
    history.push({ role: 'user',      content: userText });
    history.push({ role: 'assistant', content: reply });
    await saveHistory(from, history, env);

    // Antwort an WhatsApp senden
    await sendText(from, reply, msgId, env);

  } catch (e) {
    console.error('processWebhook error:', e);
  }
}

// ─── OpenAI ──────────────────────────────────────────────────────────────────

async function getAIReply(userText, history, env) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.slice(-MAX_HISTORY),
    { role: 'user',   content: userText },
  ];

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 500,
      temperature: 0.5,
    }),
  });

  if (!res.ok) {
    console.error('OpenAI error:', await res.text());
    return 'Entschuldigung, ich kann gerade nicht antworten. Ruf uns gerne direkt an: 0431 6004839';
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim()
    ?? 'Entschuldigung, keine Antwort erhalten. Ruf uns an: 0431 6004839';
}

// ─── WhatsApp API ─────────────────────────────────────────────────────────────

async function sendText(to, text, replyToMsgId, env) {
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text, preview_url: false },
  };

  // Als Antwort auf die ursprüngliche Nachricht verknüpfen (zeigt Kontext-Bubble)
  if (replyToMsgId) {
    payload.context = { message_id: replyToMsgId };
  }

  const res = await fetch(`${WA_API}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    console.error('WhatsApp send error:', await res.text());
  }
}

async function markAsRead(msgId, env) {
  await fetch(`${WA_API}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: msgId,
    }),
  }).catch((e) => console.error('markAsRead error:', e));
}

// ─── KV: Gesprächsverlauf ─────────────────────────────────────────────────────

async function loadHistory(phone, env) {
  if (!env.CHAT_HISTORY) return [];
  try {
    const raw = await env.CHAT_HISTORY.get(`wa:${phone}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveHistory(phone, messages, env) {
  if (!env.CHAT_HISTORY) return;
  try {
    const trimmed = messages.slice(-MAX_HISTORY);
    await env.CHAT_HISTORY.put(
      `wa:${phone}`,
      JSON.stringify(trimmed),
      { expirationTtl: 86400 }, // 24 Stunden
    );
  } catch (e) {
    console.error('KV saveHistory error:', e);
  }
}

// ─── KV: Duplikatschutz ───────────────────────────────────────────────────────

async function isDuplicate(msgId, env) {
  if (!env.CHAT_HISTORY) return false;
  const key = `dedup:${msgId}`;
  try {
    const exists = await env.CHAT_HISTORY.get(key);
    if (exists) return true;
    await env.CHAT_HISTORY.put(key, '1', { expirationTtl: 3600 }); // 1 Stunde
    return false;
  } catch {
    return false;
  }
}
