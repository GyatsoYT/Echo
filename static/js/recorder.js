/**
 * recorder.js — MediaRecorder-based audio capture for Echo
 *
 * Robust rewrite with:
 *  - Proper state machine (idle → recording → stopped)
 *  - Permission denial UX
 *  - Pulse ring + equalizer control
 *  - Correct blob attachment for form submission
 */

const EchoRecorder = (() => {
  // ── State ────────────────────────────────────────────────────────────────
  let mediaRecorder = null;
  let chunks = [];
  let stream = null;
  let recordedBlob = null;
  let timerInterval = null;
  let seconds = 0;
  let state = 'idle'; // idle | recording | stopped

  // ── DOM refs (populated on init) ─────────────────────────────────────────
  let recordBtn, statusEl, previewEl, timerEl;
  let pulseRing, equalizer;

  // ── Helpers ───────────────────────────────────────────────────────────────
  function formatTime(secs) {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function setStatus(text, active = false) {
    if (!statusEl) return;
    statusEl.textContent = text;
    if (active) statusEl.classList.add('active');
    else statusEl.classList.remove('active');
  }

  function startTimer() {
    seconds = 0;
    if (timerEl) timerEl.textContent = '00:00';
    timerInterval = setInterval(() => {
      seconds++;
      if (timerEl) timerEl.textContent = formatTime(seconds);
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  function setRecordingUI(isRecording) {
    if (!recordBtn) return;

    if (isRecording) {
      recordBtn.classList.add('recording');
      recordBtn.title = 'Stop recording';
      recordBtn.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="6" width="12" height="12" rx="2"/>
        </svg>`;
      if (pulseRing) pulseRing.classList.add('active');
      if (equalizer) equalizer.classList.add('active');
    } else {
      recordBtn.classList.remove('recording');
      recordBtn.title = 'Start voice recording';
      recordBtn.innerHTML = `
        <svg class="record-mic-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" x2="12" y1="19" y2="22"/>
        </svg>`;
      if (pulseRing) pulseRing.classList.remove('active');
      if (equalizer) equalizer.classList.remove('active');
    }
  }

  // ── Core recording logic ──────────────────────────────────────────────────
  async function startRecording() {
    if (state === 'recording') return;

    // Check MediaRecorder support
    if (typeof MediaRecorder === 'undefined') {
      setStatus('❌ Browser does not support recording. Use Chrome or Firefox.');
      return;
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setStatus('❌ Microphone access denied. Enable in browser settings and refresh.');
      } else if (err.name === 'NotFoundError') {
        setStatus('❌ No microphone found. Connect a mic and refresh.');
      } else {
        setStatus(`❌ Could not access microphone: ${err.message}`);
      }
      console.warn('[EchoRecorder] getUserMedia error:', err);
      return;
    }

    chunks = [];
    recordedBlob = null;
    state = 'recording';

    // Pick best supported MIME type
    const mimeType = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      '',
    ].find(t => t === '' || MediaRecorder.isTypeSupported(t));

    try {
      mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    } catch (err) {
      console.warn('[EchoRecorder] MediaRecorder init error:', err);
      mediaRecorder = new MediaRecorder(stream);
    }

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const blobType = mediaRecorder.mimeType || 'audio/webm';
      recordedBlob = new Blob(chunks, { type: blobType });
      const url = URL.createObjectURL(recordedBlob);

      if (previewEl) {
        previewEl.src = url;
        previewEl.classList.remove('hidden');
        previewEl.style.display = 'block';
      }

      stopTimer();
      state = 'stopped';
      setStatus(`✓ Recording saved — ${formatTime(seconds)}. Ready to submit.`, false);
      setRecordingUI(false);
    };

    mediaRecorder.onerror = (err) => {
      console.warn('[EchoRecorder] MediaRecorder error:', err);
      stopRecording();
      setStatus('❌ Recording error. Try again.');
    };

    mediaRecorder.start(200); // collect every 200ms
    startTimer();
    setRecordingUI(true);
    setStatus('🔴 Recording… Click stop when done.', true);
  }

  function stopRecording() {
    if (state !== 'recording') return;

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try { mediaRecorder.stop(); } catch (e) { /* ignore */ }
    }
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }

    stopTimer();
    // onstop will fire and update UI/state
  }

  // ── Public API ────────────────────────────────────────────────────────────
  function init({ recordBtnId, statusId, previewId, timerId }) {
    recordBtn = document.getElementById(recordBtnId);
    statusEl  = document.getElementById(statusId);
    previewEl = document.getElementById(previewId);
    timerEl   = document.getElementById(timerId);

    // Optional visual elements
    pulseRing = document.getElementById('mic-pulse-ring');
    equalizer = document.getElementById('rec-equalizer');

    if (!recordBtn) {
      console.warn('[EchoRecorder] Record button not found:', recordBtnId);
      return;
    }

    // Single, clean click handler
    recordBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (state === 'recording') {
        stopRecording();
      } else {
        // Reset preview if re-recording
        if (previewEl) {
          previewEl.src = '';
          previewEl.classList.add('hidden');
        }
        state = 'idle';
        startRecording();
      }
    });

    setStatus('Click mic to start recording');
    console.log('[EchoRecorder] Initialized successfully');
  }

  function getBlob() { return recordedBlob; }
  function getState() { return state; }

  return { init, getBlob, getState, startRecording, stopRecording };
})();
