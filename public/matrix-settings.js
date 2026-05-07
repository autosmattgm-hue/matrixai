(function () {
  const STORAGE_KEY = "matrix-settings-v1";

  const DEFAULTS = {
    voiceURI: "",
    speechRate: 1.02,
    speechPitch: 0.98,
    speechVolume: 1,
    startupGreeting: true,
    visualIntensity: 1,
    rememberContext: true,
    voiceRecognitionEnabled: false,
    restrictSensitiveToOwner: true,
    ownerMatchThreshold: 0.18,
    ownerVoicePrint: null
  };

  function clamp(value, min, max, fallback) {
    const numeric = Number(value);

    if (!Number.isFinite(numeric)) {
      return fallback;
    }

    return Math.min(max, Math.max(min, numeric));
  }

  function normalize(raw) {
    const settings = raw && typeof raw === "object" ? raw : {};

    return {
      voiceURI: typeof settings.voiceURI === "string" ? settings.voiceURI : DEFAULTS.voiceURI,
      speechRate: clamp(settings.speechRate, 0.7, 1.3, DEFAULTS.speechRate),
      speechPitch: clamp(settings.speechPitch, 0.7, 1.3, DEFAULTS.speechPitch),
      speechVolume: clamp(settings.speechVolume, 0, 1, DEFAULTS.speechVolume),
      startupGreeting: settings.startupGreeting !== false,
      visualIntensity: clamp(settings.visualIntensity, 0.7, 1.4, DEFAULTS.visualIntensity),
      rememberContext: settings.rememberContext !== false,
      voiceRecognitionEnabled: settings.voiceRecognitionEnabled === true,
      restrictSensitiveToOwner: settings.restrictSensitiveToOwner !== false,
      ownerMatchThreshold: clamp(settings.ownerMatchThreshold, 0.08, 0.4, DEFAULTS.ownerMatchThreshold),
      ownerVoicePrint: normalizeVoicePrint(settings.ownerVoicePrint)
    };
  }

  function normalizeVoicePrint(value) {
    if (!value || typeof value !== "object" || !Array.isArray(value.bins)) {
      return null;
    }

    const bins = value.bins
      .slice(0, 32)
      .map((item) => clamp(item, 0, 1, 0));

    if (!bins.length) {
      return null;
    }

    return {
      bins,
      centroid: clamp(value.centroid, 0, 1, 0),
      energy: clamp(value.energy, 0, 1, 0),
      frames: Math.max(0, Number(value.frames) || 0),
      createdAt: typeof value.createdAt === "number" ? value.createdAt : Date.now()
    };
  }

  function load() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? normalize(JSON.parse(stored)) : { ...DEFAULTS };
    } catch (_error) {
      return { ...DEFAULTS };
    }
  }

  function save(nextSettings) {
    const normalized = normalize(nextSettings);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  }

  function reset() {
    localStorage.removeItem(STORAGE_KEY);
    return { ...DEFAULTS };
  }

  window.MatrixSettings = {
    STORAGE_KEY,
    DEFAULTS: { ...DEFAULTS },
    load,
    save,
    reset,
    normalize
  };
})();
