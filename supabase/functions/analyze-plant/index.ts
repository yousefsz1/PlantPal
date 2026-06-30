import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MODEL = 'claude-sonnet-4-6';

const PROMPT = `You are an expert botanist with plant disease diagnosis skills. Carefully examine this plant image and respond with ONLY a JSON object — no markdown, no explanation, no code fences, just raw JSON.

Schema:
{
  "name": string,
  "species": string,
  "status": "healthy" | "mild" | "serious" | "critical",
  "issues": string[],
  "fixPlan": string[]
}

Rules:
- "name": common name (e.g. "Monstera Deliciosa")
- "species": scientific/botanical name (e.g. "Monstera deliciosa")
- "status" severity:
    healthy  — thriving, no visible problems
    mild     — minor cosmetic issues (slight yellowing, dust, isolated brown tips, minor spotting)
    serious  — significant stress (wilting, major leaf damage, visible pest infestation, root rot signs)
    critical — plant is dying or has rapidly spreading damage requiring immediate action
- "issues": short phrases (one per issue) describing each visible problem; empty array [] if healthy
- "fixPlan": exactly 3 short, concrete, actionable steps tailored to the detected issues (or care tips if healthy)

If you cannot confidently identify the species, give your best estimate and add "Species uncertain" to the issues array.

Respond with raw JSON only — nothing before or after the JSON object.`;

function extractJSON(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse(fenced ? fenced[1].trim() : trimmed);
}

type ScanResult = {
  name: string;
  species: string;
  status: string;
  issues: string[];
  fixPlan: string[];
};

function validate(data: unknown): ScanResult {
  const VALID = new Set(['healthy', 'mild', 'serious', 'critical']);
  if (typeof data !== 'object' || data === null) throw new Error('Response is not an object');
  const d = data as Record<string, unknown>;
  return {
    name: typeof d.name === 'string' && d.name ? d.name : 'Unknown plant',
    species: typeof d.species === 'string' && d.species ? d.species : 'Unknown',
    status: typeof d.status === 'string' && VALID.has(d.status) ? d.status : 'mild',
    issues: Array.isArray(d.issues) ? (d.issues as unknown[]).filter((i): i is string => typeof i === 'string') : [],
    fixPlan: Array.isArray(d.fixPlan)
      ? (d.fixPlan as unknown[]).filter((s): s is string => typeof s === 'string').slice(0, 3)
      : [],
  };
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
    return json({ error: 'Analysis service is not configured. Contact support.' }, 503);
  }

  let body: { image?: unknown; mediaType?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const { image, mediaType = 'image/jpeg' } = body;

  if (typeof image !== 'string' || !image) {
    return json({ error: 'Missing image data' }, 400);
  }

  const supportedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const resolvedType = typeof mediaType === 'string' && supportedTypes.includes(mediaType)
    ? mediaType
    : 'image/jpeg';

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
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: resolvedType, data: image },
              },
              { type: 'text', text: PROMPT },
            ],
          },
        ],
      }),
    });

    type ClaudeResponse = {
      content?: Array<{ type: string; text: string }>;
      error?: { message: string };
    };
    const claudeData = (await claudeRes.json()) as ClaudeResponse;

    if (!claudeRes.ok) {
      const msg = claudeData?.error?.message ?? `Claude API returned ${claudeRes.status}`;
      return json({ error: msg }, 502);
    }

    const rawText = claudeData?.content?.[0]?.text ?? '';
    if (!rawText) return json({ error: 'Empty response from analysis service' }, 502);

    const result = validate(extractJSON(rawText));
    return json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: `Analysis failed: ${message}` }, 500);
  }
});
