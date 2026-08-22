/**
 * app.js — Echo Ghost Mentor UI
 * Handles: alerts, form submissions, ghost cards, filters, animations,
 *          waveform playback, search scanning, trust votes, category picker
 */

// ── Flash alerts ─────────────────────────────────────────────────────────────

function showAlert(message, type = 'info', container = null) {
  const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
  const div = document.createElement('div');
  div.className = `alert alert-${type}`;
  div.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${message}</span>`;

  const target = container || document.getElementById('alert-container') || document.body;
  target.prepend(div);

  setTimeout(() => {
    div.style.opacity = '0';
    div.style.transform = 'translateY(-8px)';
    div.style.transition = 'all 0.3s ease';
    setTimeout(() => div.remove(), 300);
  }, 6000);
}

// ── Record form submission ────────────────────────────────────────────────────

function initRecordForm() {
  const form = document.getElementById('echo-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('[type="submit"]');

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-width:2px;display:inline-block"></span> Leaving your Echo…';

    const formData = new FormData(form);

    // If there is an in-memory recorded blob from the mic, append it directly
    const recordedBlob = (typeof EchoRecorder !== 'undefined' && EchoRecorder.getBlob) ? EchoRecorder.getBlob() : null;
    const uploadedFile = document.getElementById('audio-upload')?.files?.[0];

    if (recordedBlob && (!uploadedFile || !uploadedFile.name)) {
      formData.set('audio', recordedBlob, 'echo-recording.webm');
    } else if (uploadedFile) {
      formData.set('audio', uploadedFile);
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-width:2px;display:inline-block"></span> Saving & Transcribing…';

    try {
      const res = await fetch('/record', { method: 'POST', body: formData });
      const data = await res.json();

      if (data.status === 'created') {
        showAlert('👻 Echo preserved. Your knowledge will live on.', 'success');
        const transcriptBox = document.getElementById('transcript-preview');
        if (transcriptBox && data.transcript) {
          transcriptBox.textContent = data.transcript;
          document.getElementById('transcript-preview-container').classList.remove('hidden');
        }
        form.reset();
        // Reset category picker
        document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('selected'));
        const preview = document.getElementById('audio-preview');
        if (preview) { preview.src = ''; preview.classList.add('hidden'); }
        // Reset equalizer
        const eq = document.getElementById('rec-equalizer');
        if (eq) eq.classList.remove('active');

      } else if (data.status === 'confirmed') {
        showAlert('👻 A similar Echo already exists — confirmation count bumped!', 'info');

      } else if (data.status === 'needs_transcript') {
        showAlert('⚠ Transcription unavailable. Please type your transcript below.', 'warning');
        const manualArea = document.getElementById('manual-transcript-area');
        if (manualArea) manualArea.classList.remove('hidden');

      } else {
        showAlert(data.error || 'Something went wrong.', 'error');
      }
    } catch (err) {
      showAlert('Network error — check your connection.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '👻 Leave Your Echo';
    }
  });
}

// ── Search form / scanning animation ─────────────────────────────────────────

function initSearchForm() {
  const form = document.getElementById('search-form');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    const q = form.querySelector('input[name="q"]').value.trim();
    if (!q) {
      e.preventDefault();
      showAlert('Please enter a question first.', 'warning');
      return;
    }

    // Show scanning animation on the /search page (not /results)
    const scanEl = document.getElementById('search-scanning');
    if (scanEl) {
      scanEl.classList.add('visible');
      const steps = ['scan-1', 'scan-2', 'scan-3', 'scan-4'];
      steps.forEach((id, i) => {
        setTimeout(() => {
          const el = document.getElementById(id);
          if (!el) return;
          steps.slice(0, i).forEach(prev => {
            const p = document.getElementById(prev);
            if (p) { p.classList.remove('active'); p.classList.add('done'); }
          });
          el.classList.add('active');
        }, i * 280);
      });
    }
  });
}

// ── Similarity bar animation ──────────────────────────────────────────────────

function animateSimilarityBars() {
  const bars = document.querySelectorAll('.similarity-fill[data-width]');
  if (!bars.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const bar = entry.target;
        setTimeout(() => {
          bar.style.width = bar.dataset.width + '%';
        }, 200);
        observer.unobserve(bar);
      }
    });
  }, { threshold: 0.2 });

  bars.forEach(bar => {
    bar.style.width = '0%';
    observer.observe(bar);
  });
}

// ── Consensus bar animation ───────────────────────────────────────────────────

function animateConsensusBar() {
  const fill = document.getElementById('consensus-bar-fill');
  if (!fill) return;

  const pct = parseInt(fill.dataset.pct || '75', 10);

  setTimeout(() => {
    fill.style.width = pct + '%';
    const agreeEl = document.getElementById('consensus-agree-pct');
    const disagreeEl = document.getElementById('consensus-disagree-pct');
    if (agreeEl) agreeEl.textContent = pct + '% agree';
    if (disagreeEl) disagreeEl.textContent = (100 - pct) + '% add nuance';
  }, 400);
}

// ── Expand transcript ─────────────────────────────────────────────────────────

function initExpandTranscripts() {
  document.querySelectorAll('.expand-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const body = targetId
        ? document.getElementById(targetId)
        : btn.previousElementSibling;

      if (!body) return;

      const isExpanded = body.classList.toggle('expanded');
      btn.textContent = isExpanded ? 'Show less ↑' : 'Read more ↓';
    });
  });
}

// ── Seed demo data button ─────────────────────────────────────────────────────

function initSeedButton() {
  const btn = document.getElementById('seed-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Seeding…';
    try {
      const res = await fetch('/seed', { method: 'POST' });
      const data = await res.json();
      showAlert(data.message, 'success');
      setTimeout(() => location.reload(), 1500);
    } catch (err) {
      showAlert('Seed failed. Check console.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '🌱 Seed Demo Data';
    }
  });
}

// ── Counter animation ─────────────────────────────────────────────────────────

function animateCounter(el) {
  const target = parseInt(el.dataset.count || el.textContent, 10);
  if (isNaN(target) || target === 0) return;
  let start = 0;
  const duration = 900;
  const startTime = performance.now();
  const step = (now) => {
    const progress = Math.min((now - startTime) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3); // cubic ease-out
    const value = Math.floor(ease * target);
    el.textContent = value;
    if (progress < 1) requestAnimationFrame(step);
    else el.textContent = target;
  };
  requestAnimationFrame(step);
}

// ── Scroll-reveal animations (step cards, etc.) ───────────────────────────────

function initScrollAnimations() {
  const targets = document.querySelectorAll('.step-card, .ghost-card');
  if (!targets.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        setTimeout(() => {
          entry.target.classList.add('revealed');
        }, 80 * i);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  targets.forEach(el => observer.observe(el));
}

// ── Ghost Card — Why this answer? ─────────────────────────────────────────────

const STOP_WORDS = new Set([
  'a','an','the','is','it','in','of','for','to','and','or','not','do',
  'does','how','what','when','where','who','why','was','are','been',
  'has','have','had','with','from','that','this','these','those','be',
  'will','can','could','should','would','my','your','his','her','their',
  'our','we','i','me','he','she','they','you','about','like','very',
  'so','if','but','than','then','at','by','on','up','out','as','any'
]);

function extractKeywords(query) {
  return query.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

function initGhostCards() {
  // "Why this answer?" toggles
  document.querySelectorAll('.why-trigger').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.echoId;
      const content = document.getElementById(`why-content-${id}`);
      if (!content) return;

      const isOpen = content.classList.toggle('open');
      btn.classList.toggle('open', isOpen);

      // Populate keywords on first open
      const kwEl = document.getElementById(`why-keywords-${id}`);
      if (kwEl && kwEl.children.length === 0) {
        const query = kwEl.dataset.query || '';
        const kws = extractKeywords(query);
        kws.forEach(kw => {
          const span = document.createElement('span');
          span.className = 'why-keyword';
          span.textContent = kw;
          kwEl.appendChild(span);
        });
        if (kws.length === 0) {
          kwEl.innerHTML = '<span style="color: var(--text-muted); font-size:0.75rem;">No distinct keywords</span>';
        }
      }
    });
  });

  // Trust votes
  document.querySelectorAll('.trust-btn').forEach(btn => {
    const echoId = btn.dataset.echoId;
    const vote = btn.dataset.vote;
    const key = `echo-trust-${echoId}`;
    const stored = localStorage.getItem(key);
    if (stored === vote) btn.classList.add(vote === 'yes' ? 'voted-yes' : 'voted-no');

    btn.addEventListener('click', () => {
      const current = localStorage.getItem(key);

      // Remove sibling votes
      document.querySelectorAll(`.trust-btn[data-echo-id="${echoId}"]`).forEach(b => {
        b.classList.remove('voted-yes', 'voted-no');
      });

      if (current === vote) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, vote);
        btn.classList.add(vote === 'yes' ? 'voted-yes' : 'voted-no');
        const msg = vote === 'yes'
          ? '❤ Marked as useful — thanks!'
          : '👎 Noted. Knowledge may have changed.';
        showAlert(msg, vote === 'yes' ? 'success' : 'info');
      }
    });
  });

  // Audio play buttons with waveform
  document.querySelectorAll('.play-btn').forEach(btn => {
    const echoId = btn.dataset.echoId;
    const audioEl = document.getElementById(`audio-${echoId}`) || document.getElementById(`echoes-audio-el-${echoId}`);
    const waveform = document.getElementById(`waveform-${echoId}`) || document.getElementById(`echoes-waveform-${echoId}`);
    const timeEl = document.getElementById(`audio-time-${echoId}`) || document.getElementById(`echoes-time-${echoId}`);
    const card = btn.closest('.ghost-card');

    if (!audioEl) return;

    function formatTime(s) {
      const m = Math.floor(s / 60);
      const sec = Math.floor(s % 60);
      return `${m}:${sec.toString().padStart(2,'0')}`;
    }

    btn.addEventListener('click', () => {
      // Pause all other audios
      document.querySelectorAll('.play-btn').forEach(b => {
        if (b !== btn) {
          const otherId = b.dataset.echoId;
          const otherAudio = document.getElementById(`audio-${otherId}`) || document.getElementById(`echoes-audio-el-${otherId}`);
          const otherWave = document.getElementById(`waveform-${otherId}`) || document.getElementById(`echoes-waveform-${otherId}`);
          const otherCard = b.closest('.ghost-card');
          if (otherAudio && !otherAudio.paused) {
            otherAudio.pause();
            b.textContent = '▶';
            b.classList.remove('playing');
            if (otherWave) otherWave.classList.remove('playing');
            if (otherCard) otherCard.classList.remove('playing');
          }
        }
      });

      if (audioEl.paused) {
        audioEl.play();
        btn.textContent = '⏸';
        btn.classList.add('playing');
        if (waveform) waveform.classList.add('playing');
        if (card) card.classList.add('playing');
      } else {
        audioEl.pause();
        btn.textContent = '▶';
        btn.classList.remove('playing');
        if (waveform) waveform.classList.remove('playing');
        if (card) card.classList.remove('playing');
      }
    });

    audioEl.addEventListener('timeupdate', () => {
      if (timeEl) timeEl.textContent = formatTime(audioEl.currentTime);
    });

    audioEl.addEventListener('ended', () => {
      btn.textContent = '▶';
      btn.classList.remove('playing');
      if (waveform) waveform.classList.remove('playing');
      if (card) card.classList.remove('playing');
      if (timeEl) timeEl.textContent = '0:00';
    });
  });
}

// ── Category picker (record page) ─────────────────────────────────────────────

function initCategoryPicker() {
  const picker = document.getElementById('category-picker');
  if (!picker) return;

  const topicInput = document.getElementById('topic_tag');

  picker.querySelectorAll('.category-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      picker.querySelectorAll('.category-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      if (topicInput) topicInput.value = btn.dataset.value;
    });
  });

  // Pre-select from URL param ?topic=...
  const urlTopic = new URLSearchParams(window.location.search).get('topic');
  if (urlTopic && topicInput) {
    topicInput.value = urlTopic;
  }
}

// ── Recording UI enhancements ─────────────────────────────────────────────────

function initRecordingUI() {
  const recordBtn = document.getElementById('record-btn');
  const equalizer = document.getElementById('rec-equalizer');
  const timerEl = document.getElementById('recording-timer');

  if (!recordBtn || !equalizer) return;

  // Watch for the .recording class being added by recorder.js
  const observer = new MutationObserver(() => {
    if (recordBtn.classList.contains('recording')) {
      equalizer.classList.add('active');
      if (timerEl) timerEl.classList.add('visible');
    } else {
      equalizer.classList.remove('active');
      if (timerEl) timerEl.classList.remove('visible');
    }
  });

  observer.observe(recordBtn, { attributes: true, attributeFilter: ['class'] });
}

// ── Echoes page — client-side filter + sort ───────────────────────────────────

function initEchoFilters() {
  const filterBar = document.getElementById('filter-bar');
  const grid = document.getElementById('echoes-grid');
  if (!filterBar || !grid) return;

  const filterMap = {
    all: () => true,
    course: (el) => !['lab','campus','hostel','portal','library','placement','internship'].some(t =>
      el.dataset.course.includes(t) || el.dataset.topic.includes(t)),
    professor: (el) => el.dataset.topic.includes('professor') || el.querySelectorAll('.tag-professor').length > 0,
    lab: (el) => el.dataset.topic.includes('lab') || el.dataset.course.includes('lab'),
    campus: (el) => ['hostel','campus','wifi','portal','library'].some(t =>
      el.dataset.course.includes(t) || el.dataset.topic.includes(t)),
  };

  // Filter pills
  filterBar.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      filterBar.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const filter = filterMap[pill.dataset.filter] || filterMap.all;
      grid.querySelectorAll('.ghost-card').forEach(card => {
        card.style.display = filter(card) ? '' : 'none';
      });
    });
  });

  // Sort buttons
  filterBar.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      filterBar.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const cards = [...grid.querySelectorAll('.ghost-card')];
      if (btn.dataset.sort === 'recent') {
        cards.sort((a, b) => (b.dataset.created || '').localeCompare(a.dataset.created || ''));
      } else if (btn.dataset.sort === 'fresh') {
        const order = { fresh: 0, aging: 1, stale: 2 };
        cards.sort((a, b) => (order[a.dataset.health] || 0) - (order[b.dataset.health] || 0));
      }
      cards.forEach(c => grid.appendChild(c));
    });
  });
}

// ── Hero chips → search navigation ───────────────────────────────────────────
// (Handled inline via href="/results?q=..." in index.html, no JS needed)

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initRecordForm();
  initSearchForm();
  animateSimilarityBars();
  animateConsensusBar();
  initExpandTranscripts();
  initSeedButton();
  initGhostCards();
  initCategoryPicker();
  initRecordingUI();
  initEchoFilters();
  initScrollAnimations();

  // Animate stat counters
  document.querySelectorAll('.stat-value[data-count]').forEach(el => {
    el.textContent = el.dataset.count;
    animateCounter(el);
  });

  // Echo counter on search page
  const echoCountEl = document.getElementById('echo-count-display');
  if (echoCountEl) {
    const n = parseInt(echoCountEl.textContent, 10);
    if (!isNaN(n) && n > 0) {
      let count = 0;
      const interval = setInterval(() => {
        count += Math.ceil(n / 30);
        if (count >= n) { count = n; clearInterval(interval); }
        echoCountEl.textContent = count;
      }, 40);
    }
  }
});
