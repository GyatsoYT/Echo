/**
 * ECHO — Campus Knowledge Base UI
 * Functional application scripts: alerts, forms, audio player, filters, trust votes, animations.
 */

// ── Alert Notification ───────────────────────────────────────────────────────

function showAlert(message, type = 'info', container = null) {
  const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
  const div = document.createElement('div');
  div.className = `alert alert-${type}`;
  div.innerHTML = `<span>${icons[type] || 'ℹ'}</span> <span>${message}</span>`;

  const target = container || document.getElementById('alert-container') || document.body;
  target.prepend(div);

  setTimeout(() => {
    div.style.opacity = '0';
    div.style.transition = 'opacity 0.2s ease';
    setTimeout(() => div.remove(), 200);
  }, 5000);
}

// ── Scroll-Reveal Animations with Staggering ──────────────────────────────────

function initScrollReveal() {
  const revealElements = document.querySelectorAll('.reveal-on-scroll, .step-card, .ghost-card');
  if (!revealElements.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, index) => {
      if (entry.isIntersecting) {
        setTimeout(() => {
          entry.target.classList.add('revealed');
        }, index * 45);
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.08,
    rootMargin: '0px 0px -30px 0px'
  });

  revealElements.forEach(el => observer.observe(el));
}

// ── Counter Animations ───────────────────────────────────────────────────────

function animateCounters() {
  const counters = document.querySelectorAll('.stat-num[data-count], .stat-val[data-count], .stat-value[data-count]');
  if (!counters.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const target = parseInt(el.dataset.count, 10);
        if (isNaN(target) || target === 0) return;

        let start = 0;
        const duration = 1000;
        const startTime = performance.now();

        const updateCount = (now) => {
          const progress = Math.min((now - startTime) / duration, 1);
          const ease = 1 - Math.pow(1 - progress, 3); // cubic ease-out
          el.textContent = Math.floor(ease * target);
          if (progress < 1) {
            requestAnimationFrame(updateCount);
          } else {
            el.textContent = target;
          }
        };

        requestAnimationFrame(updateCount);
        observer.unobserve(el);
      }
    });
  }, { threshold: 0.1 });

  counters.forEach(c => observer.observe(c));
}

// ── Search Scanning Step Sequence (Ask Tab) ──────────────────────────────────

function initSearchScanning() {
  const searchForm = document.getElementById('search-form');
  const scanContainer = document.getElementById('search-scanning');

  if (!searchForm || !scanContainer) return;

  searchForm.addEventListener('submit', (e) => {
    const query = searchForm.querySelector('input[name="q"]')?.value.trim();
    if (!query) return;

    scanContainer.classList.add('visible');
    const steps = ['scan-1', 'scan-2', 'scan-3', 'scan-4'];

    steps.forEach((id, i) => {
      setTimeout(() => {
        const stepEl = document.getElementById(id);
        if (stepEl) {
          steps.slice(0, i).forEach(prevId => {
            const p = document.getElementById(prevId);
            if (p) {
              p.classList.remove('active');
              p.classList.add('done');
            }
          });
          stepEl.classList.add('active');
        }
      }, i * 260);
    });
  });
}

// ── Echoes Archive Page: Live Search, Filter Pills & View Switcher ───────────

function initEchoesArchive() {
  const grid = document.getElementById('echoes-grid');
  const liveSearch = document.getElementById('echoes-live-search');
  const filterPills = document.querySelectorAll('.filter-pill');
  const sortBtns = document.querySelectorAll('.sort-tab-btn, .sort-btn');
  const viewGridBtn = document.getElementById('view-grid-btn');
  const viewListBtn = document.getElementById('view-list-btn');
  const cards = document.querySelectorAll('.echo-interactive-card, .ghost-card');

  if (!grid || !cards.length) return;

  let currentFilter = 'all';
  let currentSearch = '';

  const filterMap = {
    all: () => true,
    course: (card) => !['lab', 'professor', 'hostel', 'campus', 'placement', 'internship', 'whatsapp'].some(t =>
      (card.dataset.course || '').includes(t) || (card.dataset.topic || '').includes(t)),
    professor: (card) => (card.dataset.prof || '').includes('prof') || (card.dataset.topic || '').includes('prof'),
    lab: (card) => (card.dataset.course || '').includes('lab') || (card.dataset.topic || '').includes('lab'),
    campus: (card) => ['hostel', 'campus', 'portal', 'registration', 'wifi', 'library'].some(t =>
      (card.dataset.course || '').includes(t) || (card.dataset.topic || '').includes(t)),
    whatsapp: (card) => card.dataset.source === 'whatsapp',
  };

  function applyEchoFilters() {
    cards.forEach(card => {
      const course = card.dataset.course || '';
      const prof = card.dataset.prof || '';
      const topic = card.dataset.topic || '';
      const transcript = card.dataset.transcript || '';

      const filterFn = filterMap[currentFilter] || filterMap.all;
      const matchesCategory = filterFn(card);

      const matchesSearch = !currentSearch ||
        course.includes(currentSearch) ||
        prof.includes(currentSearch) ||
        topic.includes(currentSearch) ||
        transcript.includes(currentSearch);

      if (matchesCategory && matchesSearch) {
        card.style.display = 'flex';
      } else {
        card.style.display = 'none';
      }
    });
  }

  // Live Search Input
  if (liveSearch) {
    liveSearch.addEventListener('input', (e) => {
      currentSearch = e.target.value.toLowerCase().trim();
      applyEchoFilters();
    });
  }

  // Filter Pills
  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentFilter = pill.dataset.filter || 'all';
      applyEchoFilters();
    });
  });

  // Sort Tabs
  sortBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      sortBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const cardArray = Array.from(cards);
      if (btn.dataset.sort === 'recent') {
        cardArray.sort((a, b) => (b.dataset.created || '').localeCompare(a.dataset.created || ''));
      } else if (btn.dataset.sort === 'fresh') {
        const order = { fresh: 0, aging: 1, stale: 2 };
        cardArray.sort((a, b) => (order[a.dataset.health] || 0) - (order[b.dataset.health] || 0));
      }
      cardArray.forEach(c => grid.appendChild(c));
    });
  });

  // View Mode Switcher
  if (viewGridBtn && viewListBtn) {
    viewGridBtn.addEventListener('click', () => {
      viewGridBtn.classList.add('active');
      viewListBtn.classList.remove('active');
      grid.classList.remove('list-view');
    });

    viewListBtn.addEventListener('click', () => {
      viewListBtn.classList.add('active');
      viewGridBtn.classList.remove('active');
      grid.classList.add('list-view');
    });
  }

  // Expand / Collapse Full Transcripts
  document.querySelectorAll('.expand-text-btn, .expand-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const teaserId = btn.dataset.targetTeaser;
      const fullId = btn.dataset.targetFull || btn.dataset.target;
      const teaserEl = teaserId ? document.getElementById(teaserId) : null;
      const fullEl = document.getElementById(fullId);

      if (!fullEl) return;

      const isExpanded = !fullEl.classList.contains('hidden') && fullEl.classList.contains('expanded');
      if (isExpanded) {
        fullEl.classList.add('hidden');
        fullEl.classList.remove('expanded');
        if (teaserEl) teaserEl.classList.remove('hidden');
        const span = btn.querySelector('span');
        if (span) span.innerHTML = 'Read full memory &darr;';
        else btn.textContent = 'Read more ↓';
      } else {
        fullEl.classList.remove('hidden');
        fullEl.classList.add('expanded');
        if (teaserEl) teaserEl.classList.add('hidden');
        const span = btn.querySelector('span');
        if (span) span.innerHTML = 'Show less &uarr;';
        else btn.textContent = 'Show less ↑';
      }
    });
  });
}

// ── Gaps Interactive Toolbar & Filter ────────────────────────────────────────

function initGapsFilter() {
  const filterBtns = document.querySelectorAll('.gaps-filter-btn');
  const searchInput = document.getElementById('gaps-search-input');
  const gapCards = document.querySelectorAll('.interactive-gap-card');

  if (!gapCards.length) return;

  let currentFilter = 'all';
  let currentSearch = '';

  function applyFilters() {
    gapCards.forEach(card => {
      const severity = card.dataset.severity || 'open';
      const query = card.dataset.query || '';

      const matchesFilter = (currentFilter === 'all') ||
        (currentFilter === 'critical' && severity === 'critical') ||
        (currentFilter === 'high' && (severity === 'high' || severity === 'critical'));

      const matchesSearch = !currentSearch || query.includes(currentSearch);

      if (matchesFilter && matchesSearch) {
        card.style.display = 'flex';
      } else {
        card.style.display = 'none';
      }
    });
  }

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter || 'all';
      applyFilters();
    });
  });

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearch = e.target.value.toLowerCase().trim();
      applyFilters();
    });
  }
}

// ── Global Audio Player with Equalizer Animation ─────────────────────────────

let currentPlayingAudio = null;
let currentPlayingBtn = null;
let currentWaveformWrap = null;

function initAudioPlayers() {
  document.querySelectorAll('.audio-play-trigger, .play-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const audioUrl = btn.dataset.audio;
      const echoId = btn.dataset.id || btn.dataset.echoId;
      const waveformWrap = document.getElementById(`waveform-wrap-${echoId}`) || document.getElementById(`waveform-${echoId}`);

      if (!audioUrl) return;

      let audioEl = document.getElementById(`audio-${echoId}`) || document.getElementById(`echoes-audio-el-${echoId}`);
      if (!audioEl) {
        audioEl = new Audio(audioUrl);
        audioEl.id = `audio-${echoId}`;
        document.body.appendChild(audioEl);
      }

      if (currentPlayingAudio && currentPlayingAudio !== audioEl) {
        currentPlayingAudio.pause();
        if (currentPlayingBtn) {
          currentPlayingBtn.textContent = '▶ Play Note';
          currentPlayingBtn.classList.remove('playing');
        }
        if (currentWaveformWrap) {
          currentWaveformWrap.classList.remove('playing');
        }
      }

      if (audioEl.paused) {
        audioEl.play();
        btn.textContent = '⏸ Pause';
        btn.classList.add('playing');
        if (waveformWrap) waveformWrap.classList.add('playing');
        currentPlayingAudio = audioEl;
        currentPlayingBtn = btn;
        currentWaveformWrap = waveformWrap;
      } else {
        audioEl.pause();
        btn.textContent = '▶ Play Note';
        btn.classList.remove('playing');
        if (waveformWrap) waveformWrap.classList.remove('playing');
        currentPlayingAudio = null;
        currentPlayingBtn = null;
        currentWaveformWrap = null;
      }

      audioEl.onended = () => {
        btn.textContent = '▶ Play Note';
        btn.classList.remove('playing');
        if (waveformWrap) waveformWrap.classList.remove('playing');
        currentPlayingAudio = null;
        currentPlayingBtn = null;
        currentWaveformWrap = null;
      };
    });
  });
}

// ── Record Form Handler ──────────────────────────────────────────────────────

function initRecordForm() {
  const form = document.getElementById('echo-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('submit-btn') || form.querySelector('[type="submit"]');

    submitBtn.disabled = true;
    const origText = submitBtn.textContent;
    submitBtn.textContent = 'Saving Echo...';

    const formData = new FormData(form);

    const recordedBlob = (typeof EchoRecorder !== 'undefined' && EchoRecorder.getBlob) ? EchoRecorder.getBlob() : null;
    const uploadedFile = document.getElementById('audio-upload')?.files?.[0];

    if (recordedBlob && (!uploadedFile || !uploadedFile.name)) {
      formData.set('audio', recordedBlob, 'echo-recording.webm');
    } else if (uploadedFile) {
      formData.set('audio', uploadedFile);
    }

    try {
      const res = await fetch('/record', { method: 'POST', body: formData });
      const data = await res.json();

      if (data.status === 'created') {
        showAlert('Echo preserved. Your advice has been added to the knowledge base.', 'success');
        form.reset();
        const preview = document.getElementById('audio-preview');
        if (preview) { preview.src = ''; preview.classList.add('hidden'); }
        const timer = document.getElementById('recording-timer');
        if (timer) timer.textContent = '00:00';
        const eq = document.getElementById('rec-equalizer');
        if (eq) eq.classList.remove('active');
        const status = document.getElementById('recording-status');
        if (status) status.textContent = 'Click mic to start recording';
        setTimeout(() => {
          window.location.href = `/echoes/${data.echo_id}`;
        }, 1200);
      } else if (data.status === 'confirmed') {
        showAlert('A similar Echo exists — confirmation count increased.', 'info');
        setTimeout(() => { window.location.href = '/echoes'; }, 1200);
      } else if (data.status === 'needs_transcript') {
        // Whisper failed — prompt user to type manually
        showAlert('⚠️ Audio transcription failed. Please type your advice below and resubmit.', 'warning');
        const transcriptArea = document.getElementById('transcript');
        if (transcriptArea) {
          transcriptArea.focus();
          transcriptArea.placeholder = 'Whisper transcription failed — please type your advice here...';
          transcriptArea.style.borderColor = 'rgba(229, 169, 82, 0.6)';
          transcriptArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        // Store audio path for resubmit
        if (data.audio_path) {
          form.dataset.audioCached = data.audio_path;
        }
      } else {
        showAlert(data.error || 'Could not save Echo. Please check fields.', 'error');
      }
    } catch (err) {
      showAlert('Network error while saving Echo.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = origText;
    }
  });
}

// ── Trust Votes (Helpful / Not Helpful) ──────────────────────────────────────

function initTrustVotes() {
  document.querySelectorAll('.trust-btn').forEach(btn => {
    const echoId = btn.dataset.echoId;
    const vote = btn.dataset.vote;
    const key = `echo-trust-${echoId}`;
    const stored = localStorage.getItem(key);

    if (stored === vote) {
      btn.classList.add(vote === 'yes' ? 'voted-yes' : 'voted-no', 'active');
    }

    btn.addEventListener('click', () => {
      const current = localStorage.getItem(key);

      document.querySelectorAll(`.trust-btn[data-echo-id="${echoId}"]`).forEach(b => {
        b.classList.remove('voted-yes', 'voted-no', 'active');
      });

      if (current === vote) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, vote);
        btn.classList.add(vote === 'yes' ? 'voted-yes' : 'voted-no', 'active');
        showAlert(vote === 'yes' ? 'Marked as helpful.' : 'Feedback recorded.', 'info');
      }
    });
  });
}

// ── Dev Seed Button ─────────────────────────────────────────────────────────

function initSeedButton() {
  const btn = document.getElementById('seed-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Seeding demo data...';
    try {
      const res = await fetch('/seed', { method: 'POST' });
      const data = await res.json();
      showAlert(data.message || 'Demo data loaded.', 'success');
      setTimeout(() => location.reload(), 1000);
    } catch (err) {
      showAlert('Seed failed. Check server log.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Seed Demo Data';
    }
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

// ── Live Feed: poll for new WhatsApp echoes ───────────────────────────────────

let _liveFeedLastId = null;

function initLiveFeed() {
  const hasStats = document.querySelector('.stats-bar, .echoes-grid, .echoes-dynamic-grid');
  if (!hasStats) return;

  async function checkFeed() {
    try {
      const res = await fetch('/api/echoes/recent');
      if (!res.ok) return;
      const echoes = await res.json();
      if (!echoes || echoes.length === 0) return;

      const newest = echoes[0];
      if (_liveFeedLastId === null) {
        _liveFeedLastId = newest.id;
        return;
      }

      if (newest.id !== _liveFeedLastId) {
        _liveFeedLastId = newest.id;
        const src = newest.source === 'whatsapp' ? '💬 WhatsApp' : newest.source === 'reddit' ? '🔴 Reddit' : '🎙 Web';
        const shortTranscript = (newest.transcript || '').slice(0, 60);
        showAlert(
          `New Echo captured via ${src}: "${shortTranscript}..." — <a href="/echoes" style="color:inherit;text-decoration:underline;">View it</a>`,
          'success'
        );

        const statsRes = await fetch('/api/stats');
        if (statsRes.ok) {
          const stats = await statsRes.json();
          const echoCountEl = document.querySelector('.stat-value[data-count], .stat-num[data-count]');
          if (echoCountEl) {
            echoCountEl.dataset.count = stats.total_echoes;
            echoCountEl.textContent = stats.total_echoes;
          }
        }
      }
    } catch (e) {
      // Silently ignore network errors
    }
  }

  checkFeed();
  setInterval(checkFeed, 8000);
}

// ── Re-verify stale Echo button ───────────────────────────────────────────────

function initReverifyButtons() {
  document.querySelectorAll('.reverify-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const echoId = btn.dataset.echoId;
      if (!echoId) return;

      btn.disabled = true;
      btn.textContent = 'Verifying…';

      try {
        const res = await fetch(`/api/echoes/${echoId}/reverify`, { method: 'POST' });
        const data = await res.json();
        if (res.ok && data.status === 'reverified') {
          showAlert('✓ Echo re-verified! Freshness score boosted.', 'success');
          const badge = document.getElementById(`health-badge-${echoId}`);
          if (badge && data.health) {
            badge.className = `health-pill health-${data.health.status}`;
            badge.textContent = data.health.label;
          }
          const box = document.getElementById(`stale-box-${echoId}`);
          if (box) {
            box.style.opacity = '0';
            box.style.transform = 'scale(0.95)';
            box.style.transition = 'all 0.3s ease';
            setTimeout(() => box.remove(), 300);
          }
        } else {
          showAlert(data.error || 'Could not verify Echo.', 'error');
          btn.disabled = false;
          btn.textContent = 'Mark as Still True ✓';
        }
      } catch (err) {
        showAlert('Network error verifying Echo.', 'error');
        btn.disabled = false;
        btn.textContent = 'Mark as Still True ✓';
      }
    });
  });
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initScrollReveal();
  animateCounters();
  initSearchScanning();
  initEchoesArchive();
  initGapsFilter();
  initRecordForm();
  initAudioPlayers();
  initTrustVotes();
  initSeedButton();
  initCategoryPicker();
  initRecordingUI();
  initLiveFeed();
  initReverifyButtons();

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

  // Mark high-match result cards for green badge coloring
  document.querySelectorAll('.ghost-result-card').forEach(card => {
    const badge = card.querySelector('.match-score-badge');
    if (badge) {
      const pct = parseInt(badge.textContent, 10);
      if (!isNaN(pct) && pct >= 80) {
        card.dataset.highMatch = '1';
      }
    }
  });

  // Flash live preview card on transcript update
  const transcriptArea = document.getElementById('transcript');
  const previewCard = document.querySelector('.preview-echo-card');
  if (transcriptArea && previewCard) {
    transcriptArea.addEventListener('input', () => {
      previewCard.classList.remove('updated');
      void previewCard.offsetWidth; // force reflow to restart animation
      previewCard.classList.add('updated');
    });
  }
});
