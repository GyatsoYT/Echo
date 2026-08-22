# Echo — Frontend Dev Guide

> Your role: Make the UI absolutely stunning and add any polish needed for the demo.
> The backend is already done. You don't need to touch Python files.

---

## Setup (your laptop)

```bash
cd d:/Hackathon
python -m pip install -r requirements.txt

# Get API keys from Gyatso (or set dummy values for UI-only work)
copy .env.example .env

# Run
python app.py
# Open http://localhost:5000
```

---

## Your Files

| File | What it does | Your job |
|---|---|---|
| `static/css/style.css` | Full design system | Tweak colors, animations, spacing |
| `static/js/app.js` | UI interactions | Add any new JS behaviors |
| `static/js/recorder.js` | Mic recording | Already complete, don't touch |
| `templates/base.html` | Navbar + footer | Update branding if needed |
| `templates/index.html` | Landing page | Add hero polish, animations |
| `templates/record.html` | Leave an Echo form | Recorder UI polish |
| `templates/search.html` | Search page | Make it feel powerful |
| `templates/results.html` | Results + synthesis | Cards need to wow |
| `templates/echoes.html` | Browse all Echoes | Grid layout, filtering |
| `templates/gaps.html` | Knowledge Gaps | Make the numbers pop |

---

## Design System

All design tokens are in `:root {}` at the top of `style.css`:

```css
--purple-600: #7c3aed;   /* primary action color */
--violet-500: #a855f7;   /* secondary / gradient end */
--bg-primary: #0a0a0f;   /* page background */
--bg-card: #16162a;      /* card background */
```

### Component Classes (already built)

```css
.btn.btn-primary       → purple gradient CTA
.btn.btn-secondary     → dark card button
.btn.btn-ghost         → outlined button
.card                  → dark card with hover glow
.card-glass            → frosted glass card
.echo-card             → Echo result card with left purple bar
.health-badge          → 🟢🟡🔴 freshness indicator
.synthesis-panel       → "Ask the Batch" answer box
.gap-item              → Knowledge Gap row
.similarity-bar        → animated relevance bar
.tag.tag-course        → purple course tag pill
.tag.tag-professor     → violet professor tag pill
.tag.tag-topic         → grey topic tag pill
```

---

## Key Templates to Polish

### `templates/results.html` — Most important for demo
This is the money page. When a judge sees it:
1. `synthesis-panel` at top → the "Ask the Batch" answer
2. Individual echo cards below → each with health badge + similarity bar
3. Similarity bars animate in from 0% width on scroll

Ideas to improve:
- Add a subtle particle / grid background
- Make similarity bars animate smoother
- Add a "copying from seniors" loading skeleton state

### `templates/gaps.html` — Most differentiated feature
The knowledge gaps view is what makes Echo different from "another Q&A app."
Ideas:
- Add a ticker/counter effect on the numbers
- Show a "heat" indicator (how often asked)
- Add a empty state animation

### `templates/index.html` — First impression
- The hero title should feel epic
- Consider adding a floating Echo card preview
- Stats bar numbers animate in (already coded via `data-count`)

---

## Adding a New Page

1. Create `templates/your_page.html`
2. Start with `{% extends "base.html" %}`
3. Add your route in `routes/admin.py` or a new blueprint
4. Register it in `app.py` if it's a new blueprint

---

## Sending Data to Templates

If you need new data on a page, ask Gyatso to add it to the route. Example:
```python
# In routes/admin.py
return render_template("gaps.html", gaps=gaps, stats=stats, new_data=something)
```

Then in the template:
```html
{{ new_data }}
```

---

## Google Fonts in Use

```
Inter — body text (weights 300, 400, 500, 600, 700, 800)
Space Grotesk — headings (weights 400, 500, 600, 700)
```

Add more fonts via `templates/base.html` in the `<head>`.

---

## Tips

- Dark theme: always test changes in Chrome dark mode
- Use browser DevTools → Elements to inspect CSS variables live
- The `--transition` variable is `all 0.2s cubic-bezier(0.4, 0, 0.2, 1)` — use it for hover states
- Don't add external CSS libraries (Tailwind, Bootstrap) — the design system covers everything
