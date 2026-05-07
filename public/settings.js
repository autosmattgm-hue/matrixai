(function () {
  const settingsApi = window.MatrixSettings;

  if (!settingsApi) {
    return;
  }

  const form = document.getElementById("settings-form");
  const status = document.getElementById("settings-status");
  const previewButton = document.getElementById("preview-voice");
  const resetButton = document.getElementById("reset-settings");

  const fields = {
    voiceURI: document.getElementById("voiceURI"),
    speechRate: document.getElementById("speechRate"),
    speechPitch: document.getElementById("speechPitch"),
    speechVolume: document.getElementById("speechVolume"),
    startupGreeting: document.getElementById("startupGreeting"),
    visualIntensity: document.getElementById("visualIntensity"),
    rememberContext: document.getElementById("rememberContext")
  };

  const outputs = {
    speechRate: document.getElementById("speechRateValue"),
    speechPitch: document.getElementById("speechPitchValue"),
    speechVolume: document.getElementById("speechVolumeValue"),
    visualIntensity: document.getElementById("visualIntensityValue")
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
      rememberContext: fields.rememberContext.checked
    });
  }

  function syncOutputs() {
    outputs.speechRate.textContent = Number(fields.speechRate.value).toFixed(2);
    outputs.speechPitch.textContent = Number(fields.speechPitch.value).toFixed(2);
    outputs.speechVolume.textContent = Number(fields.speechVolume.value).toFixed(2);
    outputs.visualIntensity.textContent = Number(fields.visualIntensity.value).toFixed(2);
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

  const initialSettings = settingsApi.load();
  applyToForm(initialSettings);
  loadVoices();

  if ("speechSynthesis" in window) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  form.addEventListener("submit", saveSettings);
  previewButton.addEventListener("click", previewVoice);
  resetButton.addEventListener("click", resetSettings);

  for (const input of Object.values(fields)) {
    input.addEventListener("input", syncOutputs);
  }
})();
