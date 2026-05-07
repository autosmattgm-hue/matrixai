(function () {
  const settingsApi = window.MatrixSettings;

  if (!settingsApi) {
    return;
  }

  const form = document.getElementById("settings-form");
  const status = document.getElementById("settings-status");
  const previewButton = document.getElementById("preview-voice");
  const resetButton = document.getElementById("reset-settings");
  const enrollButton = document.getElementById("enroll-owner-voice");
  const clearVoiceButton = document.getElementById("clear-owner-voice");
  const voiceprintStatus = document.getElementById("owner-voiceprint-status");

  const fields = {
    voiceURI: document.getElementById("voiceURI"),
    speechRate: document.getElementById("speechRate"),
    speechPitch: document.getElementById("speechPitch"),
    speechVolume: document.getElementById("speechVolume"),
    startupGreeting: document.getElementById("startupGreeting"),
    visualIntensity: document.getElementById("visualIntensity"),
    rememberContext: document.getElementById("rememberContext"),
    voiceRecognitionEnabled: document.getElementById("voiceRecognitionEnabled"),
    restrictSensitiveToOwner: document.getElementById("restrictSensitiveToOwner"),
    ownerMatchThreshold: document.getElementById("ownerMatchThreshold")
  };

  const outputs = {
    speechRate: document.getElementById("speechRateValue"),
    speechPitch: document.getElementById("speechPitchValue"),
    speechVolume: document.getElementById("speechVolumeValue"),
    visualIntensity: document.getElementById("visualIntensityValue"),
    ownerMatchThreshold: document.getElementById("ownerMatchThresholdValue")
  };

  let voices = [];

  function loadVoices() {
    if (!("speechSynthesis" in window)) {
      status.textContent = "Speech synthesis is not available in this browser.";
      return;
    }

    voices = window.speechSynthesis.getVoices();
    const current = fields.voiceURI.value;
    fields.voiceURI.innerHTML = '<option value="">System Default</option>';

    for (const voice of voices) {
      const option = document.createElement("option");
      option.value = voice.voiceURI;
      option.textContent = `${voice.name} (${voice.lang})`;
      fields.voiceURI.appendChild(option);
    }

    if (current) {
      fields.voiceURI.value = current;
    }
  }

  function applyToForm(settings) {
    fields.voiceURI.value = settings.voiceURI;
    fields.speechRate.value = settings.speechRate;
    fields.speechPitch.value = settings.speechPitch;
    fields.speechVolume.value = settings.speechVolume;
    fields.startupGreeting.checked = settings.startupGreeting;
    fields.visualIntensity.value = settings.visualIntensity;
    fields.rememberContext.checked = settings.rememberContext;
    fields.voiceRecognitionEnabled.checked = settings.voiceRecognitionEnabled;
    fields.restrictSensitiveToOwner.checked = settings.restrictSensitiveToOwner;
    fields.ownerMatchThreshold.value = settings.ownerMatchThreshold;
    updateVoiceprintStatus(settings.ownerVoicePrint);
    syncOutputs();
  }

  function readFromForm() {
    return settingsApi.normalize({
      voiceURI: fields.voiceURI.value,
      speechRate: Number(fields.speechRate.value),
      speechPitch: Number(fields.speechPitch.value),
      speechVolume: Number(fields.speechVolume.value),
      startupGreeting: fields.startupGreeting.checked,
      visualIntensity: Number(fields.visualIntensity.value),
      rememberContext: fields.rememberContext.checked,
      voiceRecognitionEnabled: fields.voiceRecognitionEnabled.checked,
      restrictSensitiveToOwner: fields.restrictSensitiveToOwner.checked,
      ownerMatchThreshold: Number(fields.ownerMatchThreshold.value),
      ownerVoicePrint: settingsApi.load().ownerVoicePrint
    });
  }

  function syncOutputs() {
    outputs.speechRate.textContent = Number(fields.speechRate.value).toFixed(2);
    outputs.speechPitch.textContent = Number(fields.speechPitch.value).toFixed(2);
    outputs.speechVolume.textContent = Number(fields.speechVolume.value).toFixed(2);
    outputs.visualIntensity.textContent = Number(fields.visualIntensity.value).toFixed(2);
    outputs.ownerMatchThreshold.textContent = Number(fields.ownerMatchThreshold.value).toFixed(2);
  }

  function saveSettings(event) {
    if (event) {
      event.preventDefault();
    }

    const saved = settingsApi.save(readFromForm());
    applyToForm(saved);
    status.textContent = "Settings saved. Return to Matrix to apply the updated profile.";
  }

  function resetSettings() {
    const reset = settingsApi.reset();
    applyToForm(reset);
    status.textContent = "Defaults restored.";
  }

  function updateVoiceprintStatus(voicePrint) {
    if (!voicePrint) {
      voiceprintStatus.textContent = "No owner voice enrolled.";
      return;
    }

    const created = new Date(voicePrint.createdAt).toLocaleString();
    voiceprintStatus.textContent = `Owner voice enrolled. Frames: ${voicePrint.frames}. Captured: ${created}.`;
  }

  function previewVoice() {
    if (!("speechSynthesis" in window)) {
      status.textContent = "Voice preview is unavailable in this browser.";
      return;
    }

    const settings = readFromForm();
    const utterance = new SpeechSynthesisUtterance(
      "Matrix Omega Ultra voice profile initialized."
    );
    utterance.rate = settings.speechRate;
    utterance.pitch = settings.speechPitch;
    utterance.volume = settings.speechVolume;

    const selectedVoice = voices.find((voice) => voice.voiceURI === settings.voiceURI);
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    status.textContent = "Voice preview active.";
  }

  async function enrollOwnerVoice() {
    if (!navigator.mediaDevices?.getUserMedia) {
      status.textContent = "Microphone capture is not available in this browser.";
      return;
    }

    status.textContent = "Owner voice enrollment active. Speak naturally for about four seconds.";

    let stream;
    let audioContext;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      const source = audioContext.createMediaStreamSource(stream);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      source.connect(analyser);

      const frames = [];
      const startedAt = performance.now();

      await new Promise((resolve) => {
        const tick = () => {
          analyser.getByteFrequencyData(dataArray);
          const bins = Array.from(dataArray.slice(0, 32), (value) => value / 255);
          const energy = bins.reduce((sum, value) => sum + value, 0) / bins.length;

          if (energy > 0.08) {
            frames.push(bins);
          }

          if (performance.now() - startedAt >= 4000) {
            resolve();
            return;
          }

          requestAnimationFrame(tick);
        };

        tick();
      });

      if (frames.length < 12) {
        status.textContent = "Enrollment sample was too quiet. Retry and speak closer to the microphone.";
        return;
      }

      const averagedBins = averageFrames(frames);
      const voicePrint = buildVoicePrint(averagedBins, frames.length);
      const saved = settingsApi.save({
        ...readFromForm(),
        ownerVoicePrint: voicePrint
      });

      applyToForm(saved);
      status.textContent = "Owner voice enrolled successfully.";
    } catch (_error) {
      status.textContent = "Owner voice enrollment failed. Check microphone permission and retry.";
    } finally {
      if (stream) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
      }

      if (audioContext) {
        await audioContext.close();
      }
    }
  }

  function clearOwnerVoice() {
    const saved = settingsApi.save({
      ...readFromForm(),
      ownerVoicePrint: null
    });
    applyToForm(saved);
    status.textContent = "Owner voiceprint cleared.";
  }

  function averageFrames(frames) {
    const length = frames[0]?.length || 0;
    const bins = new Array(length).fill(0);

    for (const frame of frames) {
      for (let index = 0; index < length; index += 1) {
        bins[index] += frame[index];
      }
    }

    return bins.map((value) => value / frames.length);
  }

  function buildVoicePrint(bins, frames) {
    const total = bins.reduce((sum, value) => sum + value, 0) || 1;
    const normalized = bins.map((value) => value / total);
    const centroid =
      normalized.reduce((sum, value, index) => sum + value * (index / Math.max(1, normalized.length - 1)), 0);
    const energy = bins.reduce((sum, value) => sum + value, 0) / bins.length;

    return {
      bins: normalized,
      centroid,
      energy,
      frames,
      createdAt: Date.now()
    };
  }

  const initialSettings = settingsApi.load();
  applyToForm(initialSettings);
  loadVoices();

  if ("speechSynthesis" in window) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  form.addEventListener("submit", saveSettings);
  previewButton.addEventListener("click", previewVoice);
  resetButton.addEventListener("click", resetSettings);
  enrollButton.addEventListener("click", enrollOwnerVoice);
  clearVoiceButton.addEventListener("click", clearOwnerVoice);

  for (const input of Object.values(fields)) {
    input.addEventListener("input", syncOutputs);
  }
})();
