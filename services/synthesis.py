"""
services/synthesis.py
----------------------
"Ask the Batch" — synthesises a single answer from multiple matching Echoes
using Gemini 3.6 Flash / Groq LLM. Falls back to a structured template if the
API is unavailable (venue wifi, rate limits, etc.).

Usage:
    from services.synthesis import ask_the_batch
    answer = ask_the_batch(
        question="Which professor gives the hardest midterm?",
        echoes=[echo1, echo2, echo3]   # dicts with "transcript", "course_tag", etc.
    )
    # Returns a dict with "answer", "source", "echo_count"
"""

from config import Config


# ── Template fallback ───────────────────────────────────────────────────────

def _template_synthesis(question: str, echoes: list[dict]) -> str:
    """
    Generate a structured summary without any API call.
    Always works, even with zero connectivity.
    """
    n = len(echoes)
    top = echoes[0]["transcript"][:300].strip()
    others = []
    for e in echoes[1:3]:
        snip = e["transcript"][:150].strip()
        if snip:
            others.append(f'"{snip}..."')

    lines = [
        f"Based on {n} Echo{'es' if n > 1 else ''} from seniors who have been there:",
        "",
        f"- {top}{'...' if len(echoes[0]['transcript']) > 300 else ''}",
    ]
    if others:
        lines.append("")
        lines.append("Others also mentioned:")
        for o in others:
            lines.append(f"  * {o}")

    return "\n".join(lines)


# ── LLM synthesis ───────────────────────────────────────────────────────────

def ask_the_batch(question: str, echoes: list[dict]) -> dict:
    """
    Synthesise a single conversational answer from multiple matching Echoes.

    Args:
        question: The junior's original search query.
        echoes:   List of echo dicts (already filtered + sorted by similarity).
                  Expected keys: transcript, course_tag, professor_tag, topic_tag,
                                 created_at, confirmations, similarity.

    Returns:
        dict with:
          - "answer": str   — the synthesised text
          - "source": str   — "llm" | "template"
          - "echo_count": int
    """
    if not echoes:
        return {
            "answer": "No matching Echoes found. Be the first to leave one!",
            "source": "none",
            "echo_count": 0,
        }

    # Limit to top N echoes
    top_echoes = echoes[:Config.ASK_BATCH_MAX_CONTEXTS]
    n = len(top_echoes)

    # Build context block
    context_parts = []
    for i, e in enumerate(top_echoes, 1):
        tags = f"[{e.get('course_tag', '?')} | {e.get('topic_tag', '?')}]"
        snippet = e["transcript"][:500]
        context_parts.append(f"Echo {i} {tags}:\n{snippet}")
    context_block = "\n\n".join(context_parts)

    prompt = f"""You are Echo, an institutional memory system for a university.
A junior student just asked: "{question}"

Here are {n} relevant Echoes (voice memories) left by seniors who experienced this:

{context_block}

Write a concise, helpful 2 to 4 sentence synthesis of what these seniors are saying.
Be direct and practical. Start with "Seniors say..." or a similar framing.
Do not make up information beyond what the Echoes contain."""

    # 1. Try Gemini first (fast & reliable)
    if Config.GEMINI_API_KEY:
        try:
            from google import genai
            client = genai.Client(api_key=Config.GEMINI_API_KEY)
            res = client.models.generate_content(
                model="gemini-3.6-flash",
                contents=prompt,
            )
            if res and res.text:
                return {"answer": res.text.strip(), "source": "llm", "echo_count": n}
        except Exception as exc:
            print(f"[Synthesis] Gemini LLM failed: {exc}")

    # 2. Try Groq LLM
    if Config.GROQ_API_KEY:
        try:
            from groq import Groq
            client = Groq(api_key=Config.GROQ_API_KEY)
            response = client.chat.completions.create(
                model=Config.GROQ_LLM_MODEL,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=300,
                temperature=0.4,
            )
            answer = response.choices[0].message.content.strip()
            return {"answer": answer, "source": "llm", "echo_count": n}
        except Exception as exc:
            print(f"[Synthesis] Groq LLM failed: {exc}")

    # 3. Template fallback (pure offline math & formatting)
    answer = _template_synthesis(question, top_echoes)
    return {"answer": answer, "source": "template", "echo_count": n}
