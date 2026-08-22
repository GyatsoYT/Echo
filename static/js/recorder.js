/**
 * recorder.js — MediaRecorder-based audio capture for Echo
 *
 * Usage: import this on record.html. It exposes a global EchoRecorder object.
 *
 * Flow:
 *   1. User clicks record button → starts microphone capture
 *   2. Blob chunks collected during recording
 *   3. On stop → blob assembled → audio preview shown
 *   4. Blob attached to the form for submission
 */

const EchoRecorder = (() => {
  let mediaRecorder = null;
  let chunks = [];
  let stream = null;
  let recordedBlob = null;
  let timerInterval = null;
  let seconds = 0;

  // DOM refs (populated on init)
  let recordBtn, statusEl, previewEl, timerEl, uploadInput;

  function formatTime(secs) {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function startTimer() {
    seconds = 0;
    timerInterval = setInterval(() => {
      seconds++;
      if (timerEl) timerEl.textContent = formatTime(seconds);
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  async function startRecording() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      alert('Microphone access denied. Please allow microphone access and try again.');
      return;
    }

    chunks = [];
    recordedBlob = null;

    // Prefer webm/opus for broad browser support; fall back to whatever is available
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';

    mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      recordedBlob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' });
      const url = URL.createObjectURL(recordedBlob);

      if (previewEl) {
        previewEl.src = url;
        previewEl.classList.remove('hidden');
      }

      // Attach blob to the hidden file input so the form picks it up
      if (uploadInput) {
        const file = new File([recordedBlob], 'echo-recording.webm', {
          type: recordedBlob.type,
        });
        const dt = new DataTransfer();
        dt.items.add(file);
        uploadInput.files = dt.files;
      }

      stopTimer();
      if (statusEl) statusEl.textContent = `Recording saved (${formatTime(seconds)})`;
    };

    mediaRecorder.start(250); // collect chunks every 250ms
    startTimer();

    // Update UI
    if (recordBtn) {
      recordBtn.classList.add('recording');
      recordBtn.innerHTML = '⏹';
      recordBtn.title = 'Stop recording';
    }
    if (statusEl) {
      statusEl.textContent = 'Recording…';
      statusEl.classList.add('active');
    }
    const recorderArea = document.querySelector('.recorder-area');
    if (recorderArea) recorderArea.classList.add('recording');
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }

    // Update UI
    if (recordBtn) {
      recordBtn.classList.remove('recording');
      recordBtn.innerHTML = '🎙';
      recordBtn.title = 'Start recording';
    }
    if (statusEl) statusEl.classList.remove('active');
    const recorderArea = document.querySelector('.recorder-area');
    if (recorderArea) recorderArea.classList.remove('recording');
  }

  function init({ recordBtnId, statusId, previewId, timerId, uploadInputId }) {
    recordBtn   = document.getElementById(recordBtnId);
    statusEl    = document.getElementById(statusId);
    previewEl   = document.getElementById(previewId);
    timerEl     = document.getElementById(timerId);
    uploadInput = document.getElementById(uploadInputId);

    if (!recordBtn) return;

    recordBtn.addEventListener('click', () => {
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        startRecording();
      } else {
        stopRecording();
      }
    });
  }

  function getBlob() { return recordedBlob; }

  return { init, getBlob, startRecording, stopRecording };
})();
