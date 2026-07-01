import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MODEL = 'claude-sonnet-4-6';

function buildPrompt(query: string): string {
  return `A user wants to add a plant to their collection and described it as: "${query}"

Identify the plant and respond with ONLY a JSON object — no markdown, no explanation, no code fences:

{
  "name": string,
  "species": string
}

Rules:
- "name": the most common English name (e.g. "Snake Plant")
- "species": the accepted scientific/botanical name (e.g. "Dracaena trifasciata")
- If the description is vague or matches multiple plants, return the single most likely one
- If uncertain, make your best educated guess — always return a real plant's name and species
- Never return empty strings

Respond with raw JSON only.`;
}

function extractJSON(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse(fenced ? fenced[1].trim() : trimmed);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return json({ error: 'API key not configured' }, 503);
  }

  let body: { query?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const { query } = body;
  if (typeof query !== 'string' || !query.trim()) {
    return json({ error: 'Missing or empty query' }, 400);
  }

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 256,
        messages: [{ role: 'user', content: buildPrompt(query.trim()) }],
      }),
    });

    type ClaudeRes = {
      content?: Array<{ type: string; text: string }>;
      error?: { message: string };
    };
    const claudeData = (await claudeRes.json()) as ClaudeRes;

    if (!claudeRes.ok) {
      return json({ error: claudeData?.error?.message ?? `Claude error ${claudeRes.status}` }, 502);
    }

    const rawText = claudeData?.content?.[0]?.text ?? '';
    if (!rawText) return json({ error: 'Empty response from Claude' }, 502);

    const parsed = extractJSON(rawText) as Record<string, unknown>;
    return json({
      name: typeof parsed.name === 'string' && parsed.name ? parsed.name : query.trim(),
      species: typeof parsed.species === 'string' ? parsed.species : '',
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
