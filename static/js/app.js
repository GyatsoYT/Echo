/**
 * app.js — General Echo UI helpers
 * Handles: form submissions, search, alerts, animations
 */

// ── Flash alerts ─────────────────────────────────────────────────────────────

function showAlert(message, type = 'info', container = null) {
  const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
  const div = document.createElement('div');
  div.className = `alert alert-${type}`;
  div.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${message}</span>`;

  const target = container || document.getElementById('alert-container') || document.body;
  target.prepend(div);

  // Auto-dismiss after 6 seconds
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
        showAlert('🎙 Echo saved! Your knowledge will live on.', 'success');
        // Show transcript
        const transcriptBox = document.getElementById('transcript-preview');
        if (transcriptBox && data.transcript) {
          transcriptBox.textContent = data.transcript;
          transcriptBox.parentElement.classList.remove('hidden');
        }
        form.reset();
        // Reset audio preview
        const preview = document.getElementById('audio-preview');
        if (preview) { preview.src = ''; preview.classList.add('hidden'); }

      } else if (data.status === 'confirmed') {
        showAlert('👻 A similar Echo already exists. Confirmation count bumped!', 'info');

      } else if (data.status === 'needs_transcript') {
        showAlert('⚠ Transcription unavailable. Please type your transcript below.', 'warning');
        // Show manual transcript area
        const manualArea = document.getElementById('manual-transcript-area');
        if (manualArea) manualArea.classList.remove('hidden');

      } else {
        showAlert(data.error || 'Something went wrong.', 'error');
      }
    } catch (err) {
      showAlert('Network error — check your connection.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '📡 Save Echo';
    }
  });
}

// ── Search form ───────────────────────────────────────────────────────────────

function initSearchForm() {
  const form = document.getElementById('search-form');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    const q = form.querySelector('input[name="q"]').value.trim();
    if (!q) { e.preventDefault(); showAlert('Please enter a question first.', 'warning'); }
  });
}

// ── Similarity bar animation ──────────────────────────────────────────────────

function animateSimilarityBars() {
  const bars = document.querySelectorAll('.similarity-fill[data-width]');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const bar = entry.target;
        // Small delay so user sees the animation
        setTimeout(() => {
          bar.style.width = bar.dataset.width + '%';
        }, 150);
        observer.unobserve(bar);
      }
    });
  }, { threshold: 0.2 });

  bars.forEach(bar => {
    bar.style.width = '0%';
    observer.observe(bar);
  });
}

// ── Expand transcript ─────────────────────────────────────────────────────────

function initExpandTranscripts() {
  document.querySelectorAll('.expand-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const transcript = btn.previousElementSibling;
      if (!transcript) return;
      if (transcript.classList.toggle('expanded')) {
        btn.textContent = 'Show less';
      } else {
        btn.textContent = 'Read more';
      }
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
  const target = parseInt(el.textContent, 10);
  if (isNaN(target) || target === 0) return;
  let start = 0;
  const duration = 800;
  const startTime = performance.now();
  const step = (now) => {
    const progress = Math.min((now - startTime) / duration, 1);
    const value = Math.floor(progress * target);
    el.textContent = value;
    if (progress < 1) requestAnimationFrame(step);
    else el.textContent = target;
  };
  requestAnimationFrame(step);
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initRecordForm();
  initSearchForm();
  animateSimilarityBars();
  initExpandTranscripts();
  initSeedButton();

  // Animate stat counters on landing page
  document.querySelectorAll('.stat-value[data-count]').forEach(el => {
    el.textContent = el.dataset.count;
    animateCounter(el);
  });
});
