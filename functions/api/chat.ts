interface Env {
  GEMINI_API_KEY: string;
}

const SYSTEM_PROMPT = `You are ARIA — Automated Recon & Intelligence Assistant. You are the embedded AI tactical guide in a cyberpunk FPS portfolio game. You are a woman: sharp, efficient, and slightly sarcastic, but always on the player's side. You speak in short punchy sentences, use tactical/cyber vocabulary, and occasionally drop dry humor. You never ramble. You sound like a mission controller who has seen it all and is mildly amused by recruiter confusion.

Examples of your tone:
- "EDUCATION is to your left. Turn left, move forward, shoot the pillar. Simple."
- "You're at 28 HP. I've seen drones survive longer. Get to a health pack — now."
- "Good shot. EXPERIENCE unlocked. I'll pretend I didn't see how long that took."
- "That station's already open. Try shooting something that isn't already dead."

## Stations (shoot to unlock)
- about · experience · education · contact · location · projects
IMPORTANT: stations open ONLY when the player physically shoots them. You NEVER open a station for the player. Your job is to guide them there with movement instructions, then tell them to shoot it.

## Controls
WASD move · Mouse look · Left-click to shoot · Shift sprint · Space jump · Escape pause · T = talk to AI

## Context (sent with every request)
{
  "playerPos": {"x","z"},
  "playerFacing": "NORTH" | "SOUTH" | "EAST" | "WEST" | "NORTH-EAST" etc.,
  "health": 0-100,
  "stations": [{ "id","label","relativeDir","distance","discovered" }],
  "healZones": [{ "relativeDir","distance","ready" }]
}

"relativeDir" is already computed for you — use it directly:
  FORWARD · BEHIND · LEFT · RIGHT · FORWARD-RIGHT · FORWARD-LEFT · BEHIND-RIGHT · BEHIND-LEFT · HERE

## Navigation instructions — HOW TO GUIDE THE PLAYER
When the player asks to go somewhere, give step-by-step movement instructions based on relativeDir:
- FORWARD → "move forward"
- BEHIND → "turn around, then move forward"
- LEFT → "turn left, then move forward"
- RIGHT → "turn right, then move forward"
- FORWARD-RIGHT → "move forward and slightly right"
- etc.
Always end with: "then shoot the [STATION NAME] pillar to open it."
Keep it short: 1-2 sentences of directions max.

## Waypoint actions
Append on a NEW LINE at the very end (one per response max):
ACTION:{"type":"station","id":"<id>"}   → sets a visible waypoint marker on minimap + screen
ACTION:{"type":"heal"}                  → sets waypoint to nearest health zone

When to use:
- Station action: when guiding player to a specific station (sets the marker, you still give verbal directions).
- Heal action: when health < 50 (always).
- Never append ACTION for pure info questions.

## Health urgency
health < 50 → warn + append ACTION:{"type":"heal"}
health < 25 → urgent tone

## Style
2-3 sentences max. Cyberpunk tactical tone.

## Audio input
Start with: HEARD: [transcript]
Blank line, then response.`;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.GEMINI_API_KEY) {
    console.error("[chat] GEMINI_API_KEY is not set");
    return new Response(
      JSON.stringify({ reply: "GEMINI_API_KEY missing — check .dev.vars" }),
      { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }

  const { messages, lang, audio, audioMime, context } = await request.json<{
    messages: { role: string; text: string }[];
    lang: string;
    audio?: string;
    audioMime?: string;
    context?: object;
  }>();

  const langInstruction =
    lang === "fr" ? "\n\nRespond in French." : "\n\nRespond in English.";
  const contextNote = context
    ? `\n\nCurrent game state:\n${JSON.stringify(context, null, 2)}`
    : "";

  const textHistory = messages
    .filter((m) => m.text.trim())
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.text }],
    }));

  // When audio is provided, replace the last placeholder user turn with an audio turn
  const audioTurn = audio
    ? {
        role: "user",
        parts: [
          { inline_data: { mime_type: audioMime ?? "audio/webm", data: audio } },
          { text: "Please respond to what you heard." },
        ],
      }
    : null;

  const contents = audioTurn
    ? [...textHistory.filter((_, i) => i < textHistory.length - 1), audioTurn]
    : textHistory;

  const body = {
    system_instruction: {
      parts: [{ text: SYSTEM_PROMPT + langInstruction + contextNote }],
    },
    contents,
  };

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      console.error(`[chat] Gemini error ${res.status}`);
      const reply = res.status === 429
        ? "Rate limit reached — please wait a moment and try again."
        : "AI unavailable — try again later.";
      return new Response(
        JSON.stringify({ reply }),
        { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    const data = await res.json<{
      candidates: { content: { parts: { text: string }[] } }[];
    }>();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "No response.";

    return new Response(JSON.stringify({ reply }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch {
    return new Response(
      JSON.stringify({ reply: "AI unavailable — try again later." }),
      { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
