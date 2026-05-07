(function () {
  const AppState = {
    BOOTING: "booting",
    IDLE: "idle",
    LISTENING: "listening",
    THINKING: "thinking",
    AUTHORIZING: "authorizing",
    EXECUTING: "executing",
    SPEAKING: "speaking",
    ALERT: "alert"
  };

  const dom = {
    body: document.body,
    statusLabel: document.getElementById("status-label"),
    stateLabel: document.getElementById("state-label"),
    headline: document.getElementById("headline"),
    subheadline: document.getElementById("subheadline"),
    transcriptPanel: document.getElementById("transcript-panel"),
    responsePanel: document.getElementById("response-panel"),
    memoryPanel: document.getElementById("memory-panel"),
    visualizer: document.getElementById("audio-visualizer"),
    sourcesPanel: document.getElementById("sources-panel"),
    srStatus: document.getElementById("sr-status"),
    permissionBanner: document.getElementById("permission-banner"),
    latencyLabel: document.getElementById("latency-label"),
    avatar: document.getElementById("matrix-avatar"),
    avatarStage: document.querySelector(".avatar-stage"),
    cameraCapture: document.getElementById("camera-capture")
  };

  const runtime = window.MATRIX_RUNTIME || {
    apiEndpoint: "/api/matrix/respond",
    healthEndpoint: "/api/health",
    provider: "nvidia",
    executionMode: "browser-shell",
    wakeWords: ["Hey Matrix", "Matrix", "Omega", "Matrix Ultra"],
    model: "meta/llama-4-maverick-17b-128e-instruct",
    asrEndpoint: "/api/matrix/transcribe",
    asrModel: "nvidia/nemotron-3-nano-30b-vlm",
    providerConfigured: false
  };

  const settingsApi = window.MatrixSettings;
  const matrixSettings = settingsApi
    ? settingsApi.load()
    : {
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
        ownerVoicePrint: null,
        inputMode: "auto",
        hapticsEnabled: true
      };

  const wakeRegex = /\b(?:hey\s+matrix|matrix\s+ultra|matrix|omega)\b/i;
  const AUTH_CONFIRM_REGEX = /\b(?:authorize|authorise|confirmed|confirm|proceed|approved|grant access|yes)\b/i;
  const AUTH_CANCEL_REGEX = /\b(?:cancel|deny|abort|stop|negative|no)\b/i;
  const SENSITIVE_ACTION_REGEX =
    /\b(?:delete|remove|erase|wipe|shutdown|restart|reboot|factory reset|payment|password|credential|admin|administrator|sudo|rm\b|format|sensitive data)\b/i;

  class MatrixUI {
    constructor() {
      this.barElements = [];
      this.buildVisualizer();
    }

    buildVisualizer() {
      for (let index = 0; index < 24; index += 1) {
        const bar = document.createElement("span");
        bar.className = "visualizer-bar";
        bar.style.height = `${12 + (index % 6) * 5}px`;
        bar.style.opacity = "0.34";
        dom.visualizer.appendChild(bar);
        this.barElements.push(bar);
      }
    }

    async runStartupSequence() {
      if (!window.gsap) {
        return;
      }

      gsap.set(".avatar-stage, .orbital-ring, .neural-lattice, .command-orbit, .data-stream", {
        autoAlpha: 0,
        y: 18
      });
      gsap.set("#boot-veil", { autoAlpha: 1 });

      gsap.fromTo(
        dom.avatar,
        { autoAlpha: 0, scale: 0.88, filter: "blur(12px)" },
        {
          autoAlpha: 1,
          scale: 1,
          filter: "blur(0px)",
          duration: 1.3,
          ease: "power3.out"
        }
      );

      gsap.to(".avatar-stage, .orbital-ring, .neural-lattice, .command-orbit, .data-stream", {
        autoAlpha: 1,
        y: 0,
        stagger: 0.08,
        duration: 0.95,
        ease: "power2.out"
      });

      gsap.to("#boot-veil", {
        autoAlpha: 0,
        duration: 1.6,
        ease: "power2.out",
        delay: 0.25
      });

      await wait(1000);
    }

    setState(state, subtitle) {
      dom.body.dataset.state = state;
      dom.stateLabel.textContent = subtitle;
      dom.srStatus.textContent = `Matrix state ${state}. ${subtitle}`;
    }

    updateStatus(status, headline, subheadline) {
      dom.statusLabel.textContent = status;
      if (headline) {
        dom.headline.textContent = headline;
      }
      if (subheadline) {
        dom.subheadline.textContent = subheadline;
      }
    }

    updateTranscript(text) {
      dom.transcriptPanel.textContent = text;
    }

    updateResponse(text) {
      dom.responsePanel.textContent = text;
    }

    updateLatency(label) {
      dom.latencyLabel.textContent = label;
    }

    renderSources(sources) {
      dom.sourcesPanel.innerHTML = "";

      for (const source of sources || []) {
        const anchor = document.createElement("a");
        anchor.href = source.url;
        anchor.target = "_blank";
        anchor.rel = "noreferrer";
        anchor.className = "source-chip";
        anchor.textContent = truncate(source.title, 34);
        dom.sourcesPanel.appendChild(anchor);
      }
    }

    renderMemory(entries) {
      dom.memoryPanel.innerHTML = "";

      if (!entries.length) {
        const empty = document.createElement("p");
        empty.className = "text-slate-500";
        empty.textContent = "No retained exchanges yet.";
        dom.memoryPanel.appendChild(empty);
        return;
      }

      for (const entry of entries.slice(-4)) {
        const row = document.createElement("div");
        row.className = "rounded-2xl border border-cyan-300/10 bg-slate-950/35 px-3 py-2";

        const role = document.createElement("p");
        role.className = "font-display text-[10px] uppercase tracking-[0.32em] text-cyan-200/70";
        role.textContent = entry.role;

        const content = document.createElement("p");
        content.className = "mt-1 text-sm leading-6 text-slate-300";
        content.textContent = truncate(entry.content, 140);

        row.append(role, content);
        dom.memoryPanel.appendChild(row);
      }
    }

    showPermissionBanner(visible, message) {
      if (message) {
        dom.permissionBanner.textContent = message;
      }
      dom.permissionBanner.classList.toggle("hidden", !visible);
    }

    animateVisualizer(levels, state) {
      const activeBoost =
        state === AppState.LISTENING || state === AppState.SPEAKING
          ? 1
          : state === AppState.THINKING
            ? 0.55
            : 0.22;

      this.barElements.forEach((bar, index) => {
        const level = levels[index % levels.length] || 0;
        const height = 10 + level * 54 * activeBoost + (index % 4) * 4;
        bar.style.height = `${height}px`;
        bar.style.opacity = `${0.25 + Math.min(0.75, level * 1.8 + activeBoost * 0.25)}`;
      });
    }
  }

  class MemoryStore {
    constructor(settings, key = "matrix-memory-v1") {
      this.settings = settings;
      this.key = key;
      this.entries = this.load();
    }

    load() {
      try {
        const value = localStorage.getItem(this.key);
        return value ? JSON.parse(value) : [];
      } catch (_error) {
        return [];
      }
    }

    save() {
      if (!this.settings.rememberContext) {
        localStorage.removeItem(this.key);
        return;
      }

      localStorage.setItem(this.key, JSON.stringify(this.entries.slice(-12)));
    }

    list() {
      return [...this.entries];
    }

    add(role, content) {
      if (!this.settings.rememberContext) {
        return;
      }

      this.entries.push({ role, content, timestamp: Date.now() });
      this.entries = this.entries.slice(-12);
      this.save();
    }

    clear() {
      this.entries = [];
      this.save();
    }
  }

  class MatrixScene {
    constructor(settings) {
      this.settings = settings;
      this.canvas = document.getElementById("matrix-webgl");
      this.renderer = null;
      this.scene = null;
      this.camera = null;
      this.particles = null;
      this.ringA = null;
      this.ringB = null;
      this.ringC = null;
      this.audioLevel = 0;
      this.state = AppState.BOOTING;
      this.intensity = 0.24;
      this.targetIntensity = 0.3;
      this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }

    init() {
      if (!window.THREE || !this.canvas) {
        return;
      }

      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        alpha: true,
        antialias: true
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
      this.renderer.setSize(window.innerWidth, window.innerHeight);

      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 100);
      this.camera.position.z = 12;

      const particleGeometry = new THREE.BufferGeometry();
      const particleCount = 900;
      const positions = new Float32Array(particleCount * 3);

      for (let index = 0; index < particleCount; index += 1) {
        const radius = 4 + Math.random() * 4;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
        positions[index * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        positions[index * 3 + 2] = radius * Math.cos(phi);
      }

      particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

      const particleMaterial = new THREE.PointsMaterial({
        color: 0x7dd3fc,
        size: 0.045,
        transparent: true,
        opacity: 0.65
      });

      this.particles = new THREE.Points(particleGeometry, particleMaterial);
      this.scene.add(this.particles);

      this.ringA = new THREE.Mesh(
        new THREE.TorusGeometry(5.3, 0.03, 16, 160),
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.13,
          wireframe: true
        })
      );
      this.ringB = new THREE.Mesh(
        new THREE.TorusGeometry(3.9, 0.02, 16, 140),
        new THREE.MeshBasicMaterial({
          color: 0x67e8f9,
          transparent: true,
          opacity: 0.09,
          wireframe: true
        })
      );
      this.ringC = new THREE.Mesh(
        new THREE.TorusGeometry(4.7, 0.018, 16, 140),
        new THREE.MeshBasicMaterial({
          color: 0xc4f1ff,
          transparent: true,
          opacity: 0.08,
          wireframe: true
        })
      );

      this.ringA.rotation.x = Math.PI / 2.5;
      this.ringB.rotation.y = Math.PI / 2.8;
      this.ringC.rotation.z = Math.PI / 5;
      this.scene.add(this.ringA, this.ringB, this.ringC);

      window.addEventListener("resize", () => this.handleResize());
      this.animate();
    }

    setState(state) {
      this.state = state;
      this.targetIntensity = (
        {
          [AppState.BOOTING]: 0.28,
          [AppState.IDLE]: 0.22,
          [AppState.LISTENING]: 0.82,
          [AppState.THINKING]: 0.52,
          [AppState.AUTHORIZING]: 0.74,
          [AppState.EXECUTING]: 1.06,
          [AppState.SPEAKING]: 0.92,
          [AppState.ALERT]: 0.66
        }[state] || 0.3
      ) * this.settings.visualIntensity;
    }

    setAudioLevel(level) {
      this.audioLevel = level;
    }

    handleResize() {
      if (!this.renderer || !this.camera) {
        return;
      }

      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    animate() {
      if (!this.renderer || !this.scene || !this.camera) {
        return;
      }

      requestAnimationFrame(() => this.animate());

      this.intensity += (this.targetIntensity - this.intensity) * 0.065;
      const energy = this.reducedMotion
        ? 0.18
        : this.intensity + this.audioLevel * 0.85 * this.settings.visualIntensity;

      if (this.particles) {
        this.particles.rotation.y += 0.0009 + energy * 0.0035;
        this.particles.rotation.x += 0.00045 + energy * 0.0015;
        this.particles.material.opacity = 0.24 + energy * 0.45;
      }

      if (this.ringA && this.ringB && this.ringC) {
        this.ringA.rotation.z += 0.0015 + energy * 0.011;
        this.ringB.rotation.x += 0.0012 + energy * 0.008;
        this.ringC.rotation.y += 0.0018 + energy * 0.01;
        this.ringA.material.opacity = 0.06 + energy * 0.14;
        this.ringB.material.opacity = 0.05 + energy * 0.12;
        this.ringC.material.opacity = 0.04 + energy * 0.15;
        this.ringA.scale.setScalar(1 + energy * 0.08);
        this.ringB.scale.setScalar(1 + energy * 0.05);
        this.ringC.scale.setScalar(1 + energy * 0.07);
      }

      this.renderer.render(this.scene, this.camera);
    }
  }

  class MatrixVoiceEngine {
    constructor({ onWake, onTranscript, onCommand, onError, onAudioLevel, settings }) {
      this.onWake = onWake;
      this.onTranscript = onTranscript;
      this.onCommand = onCommand;
      this.onError = onError;
      this.onAudioLevel = onAudioLevel;
      this.settings = settings;
      this.recognition = null;
      this.audioContext = null;
      this.analyser = null;
      this.dataArray = null;
      this.stream = null;
      this.mediaRecorder = null;
      this.recordedChunks = [];
      this.fallbackMode = false;
      this.fallbackCaptureMode = "command";
      this.fallbackRecording = false;
      this.fallbackRecordingStopTimer = null;
      this.isInitializing = false;
      this.isReady = false;
      this.isRecognizing = false;
      this.shouldRestart = false;
      this.mode = "standby";
      this.finalSegments = [];
      this.interimSegment = "";
      this.silenceTimer = null;
      this.readyToSpeak = false;
      this.pendingGreeting = null;
      this.voices = [];
      this.voiceFrames = [];
      this.recognitionRestartFailures = 0;
      this.setupSpeechSynthesis();
      this.installKeyboardFallback();
      this.installRecoveryHooks();
    }

    setupSpeechSynthesis() {
      const loadVoices = () => {
        this.voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
      };

      if ("speechSynthesis" in window) {
        loadVoices();
        window.speechSynthesis.onvoiceschanged = loadVoices;
      }

      const prime = () => {
        this.readyToSpeak = true;
        if (this.pendingGreeting) {
          const queued = this.pendingGreeting;
          this.pendingGreeting = null;
          this.speak(queued);
        }
        window.removeEventListener("pointerdown", prime);
        window.removeEventListener("keydown", prime);
      };

      window.addEventListener("pointerdown", prime, { once: true });
      window.addEventListener("keydown", prime, { once: true });
    }

    installKeyboardFallback() {
      window.addEventListener("keydown", (event) => {
        if (event.code === "Space") {
          event.preventDefault();
          if (this.mode === "standby") {
            this.onWake("");
            this.activateManualListening();
          }
        }

        if (event.code === "KeyY" && this.mode === "authorization") {
          event.preventDefault();
          this.finalizeCommand("authorize");
        }

        if (event.code === "KeyN" && this.mode === "authorization") {
          event.preventDefault();
          this.finalizeCommand("cancel");
        }

        if (event.code === "Escape") {
          if ("speechSynthesis" in window) {
            window.speechSynthesis.cancel();
          }
          this.stopListening();
        }
      });
    }

    installRecoveryHooks() {
      const resume = () => {
        this.resumeAudioContext();
      };

      window.addEventListener("pointerdown", resume);
      window.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          resume();
        }
      });
    }

    usesTapMode() {
      return this.fallbackMode;
    }

    preferredInputMode() {
      if (this.settings.inputMode === "live") {
        return "live";
      }

      if (this.settings.inputMode === "tap") {
        return "tap";
      }

      return isMobilePlatform() ? "tap" : "live";
    }

    async resumeAudioContext() {
      if (this.audioContext?.state === "suspended") {
        try {
          await this.audioContext.resume();
        } catch (_error) {
          return;
        }
      }
    }

    async initialize() {
      if (this.isInitializing) {
        return false;
      }

      if (this.isReady) {
        return true;
      }

      this.isInitializing = true;

      try {
        const audioReady = await this.initializeAudioMonitoring();
        if (!audioReady) {
          return false;
        }

        const preferredMode = this.preferredInputMode();
        const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (preferredMode === "live" && Recognition) {
          this.setupRecognition(Recognition);
          this.isReady = true;
          this.fallbackMode = false;
          return true;
        }

        if (typeof MediaRecorder !== "undefined") {
          this.fallbackMode = true;
          this.isReady = true;
          return true;
        }

        if (Recognition) {
          this.setupRecognition(Recognition);
          this.isReady = true;
          this.fallbackMode = false;
          return true;
        }

        this.onError("This browser does not expose a supported voice capture path.");
        return false;
      } finally {
        this.isInitializing = false;
      }
    }

    async initializeAudioMonitoring() {
      if (!navigator.mediaDevices?.getUserMedia) {
        this.onError("Microphone capture is not available in this browser.");
        return false;
      }

      if (!this.stream) {
        try {
          this.stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          });
        } catch (_error) {
          this.onError("Microphone permission was denied.");
          return false;
        }
      }

      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        await this.resumeAudioContext();
        const source = this.audioContext.createMediaStreamSource(this.stream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 128;
        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        source.connect(this.analyser);
        this.monitorAudio();
      }

      return true;
    }

    setupRecognition(Recognition) {
      if (this.recognition) {
        return;
      }

      this.recognition = new Recognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = "en-US";

      this.recognition.onstart = () => {
        this.isRecognizing = true;
        this.recognitionRestartFailures = 0;
      };

      this.recognition.onend = () => {
        this.isRecognizing = false;
        if (this.shouldRestart && this.mode !== "processing" && this.mode !== "speaking") {
          window.setTimeout(() => this.startPassiveListening(), 180);
        }
      };

      this.recognition.onerror = (event) => {
        const { error } = event;

        if (error === "not-allowed" || error === "service-not-allowed") {
          this.isReady = false;
          this.onError("Microphone access is blocked. Tap the avatar once and allow microphone access.");
          return;
        }

        if (error === "audio-capture") {
          this.onError("No microphone input was detected. Check browser permission and the active microphone.");
          return;
        }

        if (error === "aborted") {
          return;
        }

        if (error === "network" || error === "service-not-available") {
          this.promoteToFallbackMode("Live speech recognition is unstable. Tap the avatar and speak.");
          return;
        }

        if (error === "no-speech") {
          if (this.shouldRestart && this.mode === "standby") {
            window.setTimeout(() => this.startPassiveListening(), 400);
          }
          return;
        }

        this.onError(`Voice runtime issue: ${error}.`);
      };

      this.recognition.onresult = (event) => this.handleResults(event);
    }

    promoteToFallbackMode(message) {
      if (typeof MediaRecorder === "undefined") {
        this.onError(message);
        return;
      }

      this.fallbackMode = true;
      this.shouldRestart = false;
      this.stopListening();
      this.onError(message);
    }

    startPassiveListening() {
      if (this.fallbackMode || !this.recognition || this.isRecognizing || !this.isReady) {
        return;
      }

      this.mode = "standby";
      this.shouldRestart = true;

      try {
        this.recognition.start();
      } catch (_error) {
        this.recognitionRestartFailures += 1;
        if (this.recognitionRestartFailures >= 4) {
          this.promoteToFallbackMode("Passive listening was unreliable. Matrix switched to tap-to-talk mode.");
          return;
        }
        window.setTimeout(() => this.startPassiveListening(), 250);
      }
    }

    stopListening() {
      this.shouldRestart = false;
      window.clearTimeout(this.silenceTimer);

      if (this.recognition && this.isRecognizing) {
        try {
          this.recognition.stop();
        } catch (_error) {
          // Best-effort shutdown.
        }
      }

      if (this.fallbackRecording) {
        this.stopFallbackRecording();
      }
    }

    beginDirectMode(mode, seed = "") {
      this.mode = mode;
      this.finalSegments = seed ? [seed] : [];
      this.interimSegment = "";
      this.voiceFrames = [];
      this.restartSilenceTimer();
    }

    captureFollowUp(mode) {
      this.shouldRestart = false;
      if (this.fallbackMode) {
        this.toggleFallbackRecording(mode);
        return;
      }

      this.beginDirectMode(mode, "");

      if (!this.recognition || this.isRecognizing) {
        return;
      }

      try {
        this.recognition.start();
      } catch (_error) {
        window.setTimeout(() => this.captureFollowUp(mode), 220);
      }
    }

    activateManualListening(mode = "command") {
      if (this.fallbackMode) {
        this.toggleFallbackRecording(mode);
        return;
      }

      if (!this.isReady || !this.recognition) {
        return;
      }

      this.shouldRestart = false;
      this.beginDirectMode(mode, "");

      if (this.isRecognizing) {
        try {
          this.recognition.stop();
        } catch (_error) {
          // Allow the delayed restart below to recover.
        }
      }

      const startDirectRecognition = () => {
        if (!this.recognition || this.isRecognizing || !this.isReady) {
          return;
        }

        try {
          this.recognition.start();
        } catch (_error) {
          window.setTimeout(startDirectRecognition, 220);
        }
      };

      window.setTimeout(startDirectRecognition, 120);
    }

    async toggleFallbackRecording(mode = "command") {
      if (!this.isReady || !this.stream || typeof MediaRecorder === "undefined") {
        this.onError("Tap-to-talk is unavailable in this browser.");
        return;
      }

      if (this.fallbackRecording) {
        this.stopFallbackRecording();
        return;
      }

      this.fallbackCaptureMode = mode;
      this.beginDirectMode(mode, "");
      this.recordedChunks = [];
      const recorderOptions = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? { mimeType: "audio/webm;codecs=opus" }
        : MediaRecorder.isTypeSupported("audio/webm")
          ? { mimeType: "audio/webm" }
          : null;
      this.mediaRecorder = recorderOptions
        ? new MediaRecorder(this.stream, recorderOptions)
        : new MediaRecorder(this.stream);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        this.fallbackRecording = false;
        window.clearTimeout(this.fallbackRecordingStopTimer);

        const audioBlob = new Blob(this.recordedChunks, {
          type: this.mediaRecorder?.mimeType || "audio/webm"
        });
        this.recordedChunks = [];

        if (!audioBlob.size) {
          this.onError("No microphone input was captured. Tap the avatar and try again.");
          return;
        }

        try {
          const audioDataUrl = await blobToDataUrl(audioBlob);
          const transcript = await this.transcribeFallbackAudio(audioDataUrl);
          this.onTranscript(transcript || "Listening for command...");
          const voiceSignature = buildVoiceSignature(this.voiceFrames);
          this.voiceFrames = [];
          this.mode = "processing";
          this.onCommand(transcript || "Status report.", this.fallbackCaptureMode, voiceSignature);
        } catch (_error) {
          this.onError("Audio transcription failed. Tap the avatar and try again.");
        }
      };

      this.fallbackRecording = true;
      this.mediaRecorder.start();
      this.fallbackRecordingStopTimer = window.setTimeout(() => {
        this.stopFallbackRecording();
      }, 6500);
    }

    stopFallbackRecording() {
      if (this.mediaRecorder && this.fallbackRecording && this.mediaRecorder.state !== "inactive") {
        this.mediaRecorder.stop();
      }
    }

    async transcribeFallbackAudio(audioDataUrl) {
      const endpoint = runtime.asrEndpoint || "/api/matrix/transcribe";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ audioDataUrl })
      });

      if (!response.ok) {
        throw new Error(`Matrix transcription backend returned ${response.status}`);
      }

      const payload = await response.json();
      return typeof payload.text === "string" ? payload.text.trim() : "";
    }

    handleResults(event) {
      if (this.mode === "processing" || this.mode === "speaking") {
        return;
      }

      let interim = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0].transcript.trim();

        if (!transcript) {
          continue;
        }

        if (this.mode === "standby") {
          const match = transcript.match(wakeRegex);
          if (match) {
            const remainder = transcript.slice(match.index + match[0].length).trim();
            this.onWake(remainder);
            this.beginDirectMode("command", remainder);
            this.onTranscript(remainder || "Listening for command...");
            return;
          }
        }

        if (this.mode === "command" || this.mode === "authorization") {
          if (result.isFinal) {
            this.finalSegments.push(transcript);
          } else {
            interim = `${interim} ${transcript}`.trim();
          }
        }
      }

      if (this.mode === "command" || this.mode === "authorization") {
        this.interimSegment = interim;
        const text = [this.finalSegments.join(" "), this.interimSegment]
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();

        if (text) {
          this.onTranscript(text);
          this.restartSilenceTimer();
        }
      }
    }

    restartSilenceTimer() {
      window.clearTimeout(this.silenceTimer);
      const timeoutMs = this.mode === "authorization" ? 2200 : 1400;
      this.silenceTimer = window.setTimeout(() => this.finalizeCommand(), timeoutMs);
    }

    finalizeCommand(forcedText = "") {
      if (this.mode !== "command" && this.mode !== "authorization") {
        return;
      }

      const mode = this.mode;
      const text = forcedText || [this.finalSegments.join(" "), this.interimSegment]
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      this.mode = "processing";
      this.stopListening();
      const voiceSignature = buildVoiceSignature(this.voiceFrames);
      this.voiceFrames = [];

      if (!text && mode === "command") {
        this.onCommand("Status report.", mode, voiceSignature);
        return;
      }

      this.onCommand(text, mode, voiceSignature);
    }

    async speak(text) {
      if (!("speechSynthesis" in window)) {
        return;
      }

      if (!this.readyToSpeak) {
        this.pendingGreeting = text;
        return;
      }

      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = this.settings.speechRate;
      utterance.pitch = this.settings.speechPitch;
      utterance.volume = this.settings.speechVolume;

      const preferredVoice =
        this.voices.find((voice) => voice.voiceURI === this.settings.voiceURI) ||
        this.voices.find((voice) => /Google US English|Samantha|Daniel/i.test(voice.name)) ||
        this.voices.find((voice) => /en-US|en_US/i.test(voice.lang)) ||
        this.voices[0];

      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      this.mode = "speaking";

      await new Promise((resolve) => {
        utterance.onend = resolve;
        utterance.onerror = resolve;
        window.speechSynthesis.speak(utterance);
      });
    }

    monitorAudio() {
      if (!this.analyser || !this.dataArray) {
        return;
      }

      const tick = () => {
        if (this.analyser && this.dataArray) {
          this.analyser.getByteFrequencyData(this.dataArray);
          const values = Array.from(this.dataArray.slice(0, 24), (value) => value / 255);
          const average = values.reduce((sum, value) => sum + value, 0) / values.length;

          if ((this.mode === "command" || this.mode === "authorization") && average > 0.08) {
            this.voiceFrames.push(values);
            if (this.voiceFrames.length > 120) {
              this.voiceFrames.shift();
            }
          }

          this.onAudioLevel(average, values);
        }

        requestAnimationFrame(tick);
      };

      tick();
    }
  }

  class MatrixAIService {
    constructor(memory, options) {
      this.memory = memory;
      this.options = options;
    }

    async respond(message) {
      const start = performance.now();

      if (!runtime.apiEndpoint) {
        return {
          text: "The backend endpoint is offline. Matrix can still manage local voice control, memory, and visual state.",
          sources: [],
          latencyMs: Math.round(performance.now() - start)
        };
      }

      const response = await fetch(runtime.apiEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message,
          history: this.memory.list().slice(-8).map(({ role, content }) => ({ role, content }))
        })
      });

      if (!response.ok) {
        throw new Error(`Matrix backend returned ${response.status}`);
      }

      const payload = await response.json();
      return {
        text: payload.text || "Processing complete.",
        sources: payload.sources || [],
        latencyMs: Math.round(performance.now() - start)
      };
    }

    planAction(message) {
      const lower = message.toLowerCase();

      if (/\bclear memory\b/.test(lower)) {
        this.memory.clear();
        return this.localResult("clear-memory", "Context memory cleared. I am back to a clean state.");
      }

      if (/\b(time|what time)\b/.test(lower)) {
        return this.localResult(
          "time-check",
          `Local time is ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`
        );
      }

      if (/\b(date|day|what day)\b/.test(lower)) {
        return this.localResult(
          "date-check",
          `Today is ${new Date().toLocaleDateString([], {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric"
          })}.`
        );
      }

      if (/\b(system status|system monitoring|monitor system performance|performance status|cpu|ram diagnostics)\b/.test(lower)) {
        return this.localResult("system-status", this.buildSystemStatusReport());
      }

      if (/\bopen settings\b/.test(lower)) {
        return this.actionResult("open-settings", "open settings", async () => {
          window.location.href = "/settings.html";
          return { text: "Settings channel opening.", sources: [] };
        });
      }

      if (/\binstall matrix\b|\binstall app\b|\badd to home screen\b/.test(lower)) {
        return this.actionResult("install-matrix", "install Matrix", async () => {
          const didPrompt = await this.options.requestInstall();
          if (didPrompt) {
            return { text: "Install prompt opened.", sources: [] };
          }

          const context = this.options.getRuntimeContext();
          if (context.platform.isIOS && !context.standalone) {
            return {
              text: "Install prompt is not system-driven on iPhone. Open Share, then choose Add to Home Screen.",
              sources: []
            };
          }

          return {
            text: "Install prompt is not available yet. Open settings for install guidance once the browser allows it.",
            sources: []
          };
        });
      }

      if (/\b(open calendar|calendar management)\b/.test(lower)) {
        return this.actionResult(
          "open-calendar",
          "open calendar",
          async () => this.openUrl("https://calendar.google.com", "Calendar channel active.")
        );
      }

      if (/\b(open github)\b/.test(lower)) {
        return this.actionResult(
          "open-github",
          "open GitHub",
          async () => this.openUrl("https://github.com", "GitHub channel active.")
        );
      }

      if (/\b(open nvidia)\b/.test(lower)) {
        return this.actionResult(
          "open-nvidia",
          "open NVIDIA platform",
          async () => this.openUrl("https://build.nvidia.com", "NVIDIA platform active.")
        );
      }

      if (/\b(open gmail|open email)\b/.test(lower)) {
        return this.actionResult(
          "open-gmail",
          "open Gmail",
          async () => this.openUrl("https://mail.google.com", "Email channel active.")
        );
      }

      if (/\bdraft email to\b/.test(lower)) {
        return this.actionResult("draft-email", "draft email", async () => {
          const match = message.match(/draft email to\s+(.+)/i);
          const target = match?.[1]?.trim() || "team";
          const subject = encodeURIComponent("Strategic follow-up");
          const body = encodeURIComponent("Outline the key action items and next steps.");
          return this.openUrl(
            `mailto:${encodeURIComponent(target)}?subject=${subject}&body=${body}`,
            `Email draft initiated for ${target}.`,
            "_self"
          );
        });
      }

      const callTarget = extractPhoneTarget(message, /\b(?:call|dial)\s+(.+)/i);
      if (callTarget) {
        return this.actionResult("call-contact", "place call", async () => {
          const digits = normalizePhoneDigits(callTarget);
          if (!digits) {
            return {
              text: "I can open the phone dialer when you provide a number.",
              sources: []
            };
          }

          return this.openUrl(`tel:${digits}`, `Dialer ready for ${formatPhoneForSpeech(digits)}.`, "_self");
        });
      }

      const smsPayload = extractSmsPayload(message);
      if (smsPayload) {
        return this.actionResult("send-text", "send text", async () => {
          const digits = normalizePhoneDigits(smsPayload.target);
          if (!digits) {
            return {
              text: "I can open messages when you provide a phone number.",
              sources: []
            };
          }

          const body = smsPayload.body ? `?body=${encodeURIComponent(smsPayload.body)}` : "";
          return this.openUrl(
            `sms:${digits}${body}`,
            smsPayload.body
              ? `Text draft prepared for ${formatPhoneForSpeech(digits)}.`
              : `Messaging channel opened for ${formatPhoneForSpeech(digits)}.`,
            "_self"
          );
        });
      }

      const destination = extractDestination(message);
      if (destination) {
        return this.actionResult("open-maps", "open maps", async () => {
          const url = buildMapsUrl(destination);
          return this.openUrl(url, `Navigation route prepared for ${destination}.`, "_self");
        });
      }

      if (/\b(open camera|launch camera|take photo|take picture)\b/.test(lower)) {
        return this.actionResult("open-camera", "open camera", async () => {
          const opened = this.options.openCamera();
          return {
            text: opened
              ? "Camera channel opening."
              : "Camera capture is not available in this browser session.",
            sources: []
          };
        });
      }

      if (/\bshare (?:this|status|update|brief)\b/.test(lower)) {
        return this.actionResult("share-brief", "share brief", async () => {
          const shared = await this.shareLatestBrief();
          return {
            text: shared
              ? "Share sheet opened."
              : "Sharing is unavailable here. I copied the latest brief to the clipboard instead.",
            sources: []
          };
        });
      }

      if (/\bcopy (?:response|brief|status)\b/.test(lower)) {
        return this.actionResult("copy-brief", "copy brief", async () => {
          const text = this.getLatestAssistantReply();
          if (!text) {
            return { text: "There is no recent Matrix brief to copy yet.", sources: [] };
          }

          await copyText(text);
          return { text: "Latest Matrix brief copied.", sources: [] };
        });
      }

      if (/\b(open visual studio code|open vs code|launch visual studio code)\b/.test(lower)) {
        return this.buildBridgeAction(
          "launch Visual Studio Code",
          "Desktop application launch is staged, but browser-shell mode needs a secure native bridge to open Visual Studio Code directly."
        );
      }

      if (/\b(open terminal|launch terminal|start terminal)\b/.test(lower)) {
        return this.buildBridgeAction(
          "launch terminal",
          "Terminal execution requires a secure native bridge. Browser-shell mode will not invoke the local terminal directly."
        );
      }

      if (/\b(start my development environment|launch my ai dashboard)\b/.test(lower)) {
        return this.buildBridgeAction(
          "start development environment",
          "Environment orchestration is available once a native execution bridge is connected. In browser-shell mode I can only prepare or open web-based surfaces."
        );
      }

      if (/\b(organize my downloads folder|organize downloads|delete files|remove files|erase files)\b/.test(lower)) {
        return this.buildSensitiveBridgeAction(
          "downloads-file-operation",
          "downloads folder operation",
          "Authorization required. File operations can affect system integrity. Confirm or cancel."
        );
      }

      if (/\b(shutdown|restart|reboot)\b/.test(lower)) {
        return this.buildSensitiveBridgeAction(
          "system-power",
          "system power command",
          "Authorization required. Power state changes are critical operations. Confirm or cancel."
        );
      }

      if (/\b(password|credential|payment|admin|administrator)\b/.test(lower) || SENSITIVE_ACTION_REGEX.test(lower)) {
        return this.buildSensitiveBridgeAction(
          "privileged-operation",
          "privileged operation",
          "Authorization required. This request touches a protected operation. Confirm or cancel."
        );
      }

      return null;
    }

    async executeAction(plan) {
      const start = performance.now();

      if (plan.type === "local") {
        return {
          text: plan.text,
          sources: plan.sources || [],
          latencyMs: Math.round(performance.now() - start)
        };
      }

      if (typeof plan.execute === "function") {
        const result = await plan.execute();
        return {
          text: result.text || "Execution complete.",
          sources: result.sources || [],
          latencyMs: Math.round(performance.now() - start)
        };
      }

      return {
        text: "Execution path is unavailable.",
        sources: [],
        latencyMs: Math.round(performance.now() - start)
      };
    }

    localResult(id, text) {
      return {
        type: "local",
        id,
        text,
        sources: []
      };
    }

    actionResult(id, label, execute) {
      return {
        type: "action",
        id,
        label,
        execute,
        sources: []
      };
    }

    openUrl(url, spokenResult, target = "_blank") {
      if (target === "_self") {
        window.location.href = url;
      } else {
        window.open(url, target, "noopener,noreferrer");
      }

      return {
        text: spokenResult,
        sources: []
      };
    }

    buildBridgeAction(label, unavailableText) {
      return {
        type: "action",
        id: label.toLowerCase().replace(/\s+/g, "-"),
        label,
        execute: async () => ({
          text: unavailableText,
          sources: []
        }),
        sources: []
      };
    }

    buildSensitiveBridgeAction(id, label, authorizationPrompt) {
      return {
        type: "action",
        id,
        label,
        requiresAuthorization: true,
        authorizationPrompt,
        execute: async () => ({
          text: `${capitalize(label)} acknowledged. Authorization accepted, but browser-shell mode will not execute privileged local operations without a secure native bridge.`,
          sources: []
        }),
        sources: []
      };
    }

    async shareLatestBrief() {
      const latest = this.getLatestAssistantReply() || "Matrix Omega Ultra is active.";

      if (navigator.share) {
        await navigator.share({
          title: "Matrix Omega Ultra",
          text: latest,
          url: window.location.href
        });
        return true;
      }

      await copyText(latest);
      return false;
    }

    getLatestAssistantReply() {
      const latest = [...this.memory.list()].reverse().find((entry) => entry.role === "assistant");
      return latest?.content || "";
    }

    buildSystemStatusReport() {
      const context = this.options.getRuntimeContext();
      const cores = navigator.hardwareConcurrency || "unknown";
      const memory = navigator.deviceMemory ? `${navigator.deviceMemory} gigabytes` : "unknown";
      const online = navigator.onLine ? "online" : "offline";
      const installState = context.standalone ? "installed shell active" : "browser session";
      return `System diagnostics stable. Reported CPU threads: ${cores}. Reported device memory: ${memory}. Network status: ${online}. Execution mode: browser shell. Input mode: ${context.inputMode}. Session mode: ${installState}.`;
    }
  }

  class MatrixApp {
    constructor() {
      this.ui = new MatrixUI();
      this.settings = matrixSettings;
      this.memory = new MemoryStore(this.settings);
      this.scene = new MatrixScene(this.settings);
      this.launchContext = this.parseLaunchContext();
      this.deferredInstallPrompt = null;
      this.ai = new MatrixAIService(this.memory, {
        openCamera: () => this.openCamera(),
        requestInstall: () => this.requestInstallPrompt(),
        getRuntimeContext: () => this.getRuntimeContext()
      });
      this.voice = new MatrixVoiceEngine({
        onWake: (seed) => this.handleWake(seed),
        onTranscript: (text) => this.handleTranscript(text),
        onCommand: (text, mode, voiceSignature) => this.handleCommand(text, mode, voiceSignature),
        onError: (message) => this.handleAlert(message),
        onAudioLevel: (level, values) => this.handleAudio(level, values),
        settings: this.settings
      });
      this.currentState = AppState.BOOTING;
      this.pendingAuthorization = null;
      this.secretTapTimestamps = [];
      this.isRecoveringVoice = false;
      this.installSettingsGesture();
      this.installVoiceRecoveryGesture();
      this.installPwaHooks();
    }

    parseLaunchContext() {
      const params = new URLSearchParams(window.location.search);
      return {
        source: params.get("matrix_source") || "",
        intent: params.get("matrix_intent") || "",
        route: params.get("matrix_route") || "",
        listen: ["1", "true", "yes"].includes((params.get("matrix_listen") || "").toLowerCase())
      };
    }

    installPwaHooks() {
      window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        this.deferredInstallPrompt = event;
      });

      window.addEventListener("appinstalled", () => {
        this.deferredInstallPrompt = null;
      });
    }

    async registerServiceWorker() {
      if (!("serviceWorker" in navigator)) {
        return;
      }

      try {
        await navigator.serviceWorker.register("/sw.js");
      } catch (_error) {
        // Offline shell registration is best-effort.
      }
    }

    installSettingsGesture() {
      const gestureTarget = dom.avatarStage || dom.avatar;

      if (!gestureTarget) {
        return;
      }

      gestureTarget.addEventListener("pointerup", () => {
        const now = Date.now();
        this.secretTapTimestamps = this.secretTapTimestamps.filter((timestamp) => now - timestamp < 900);
        this.secretTapTimestamps.push(now);

        if (this.secretTapTimestamps.length >= 3) {
          window.location.href = "/settings.html";
        }
      });
    }

    installVoiceRecoveryGesture() {
      const gestureTarget = dom.avatarStage || dom.avatar;

      if (!gestureTarget) {
        return;
      }

      gestureTarget.addEventListener("click", () => {
        if (this.currentState === AppState.ALERT || !this.voice.isReady) {
          this.recoverVoiceRuntime(true);
          return;
        }

        if (this.currentState === AppState.IDLE) {
          this.handleWake("");
          this.voice.activateManualListening();
        }
      });
    }

    getRuntimeContext() {
      return {
        standalone: isStandaloneDisplay(),
        platform: {
          isMobile: isMobilePlatform(),
          isIOS: isIOSPlatform()
        },
        inputMode: this.voice.usesTapMode() ? "tap-to-talk" : "passive listening"
      };
    }

    async requestInstallPrompt() {
      if (!this.deferredInstallPrompt) {
        return false;
      }

      this.deferredInstallPrompt.prompt();
      await this.deferredInstallPrompt.userChoice.catch(() => null);
      this.deferredInstallPrompt = null;
      return true;
    }

    openCamera() {
      if (!dom.cameraCapture) {
        return false;
      }

      dom.cameraCapture.click();
      return true;
    }

    async recoverVoiceRuntime(startListening = false) {
      if (this.isRecoveringVoice) {
        return;
      }

      this.isRecoveringVoice = true;
      this.ui.updateResponse("Reinitializing voice runtime.");

      try {
        const ready = await this.voice.initialize();
        if (ready) {
          this.ui.showPermissionBanner(false);
          await this.returnToIdle(false);
          if (startListening) {
            this.handleWake("");
            this.voice.activateManualListening();
          }
        }
      } finally {
        this.isRecoveringVoice = false;
      }
    }

    async init() {
      this.scene.init();
      this.registerServiceWorker();

      if (!this.settings.rememberContext) {
        this.memory.clear();
      }

      this.ui.renderMemory(this.memory.list());
      await this.ui.runStartupSequence();

      const startupLine =
        "Matrix Omega Ultra online. Neural systems operational. Secure voice interface active. Awaiting authorization.";

      this.setState(
        AppState.BOOTING,
        "arming voice channels",
        "Initializing",
        "Matrix Omega Ultra",
        startupLine
      );
      this.ui.updateResponse(startupLine);

      if (this.settings.startupGreeting) {
        this.voice.speak(startupLine);
      }

      const ready = await this.voice.initialize();
      if (!ready) {
        this.ui.showPermissionBanner(
          true,
          "Microphone access is required for Matrix voice control. Tap the avatar, allow microphone access, then speak."
        );
        this.setState(
          AppState.ALERT,
          "microphone access required",
          "Microphone Required",
          "Voice Runtime Blocked",
          "Grant microphone access to enable Matrix voice control. Tap the avatar once to retry."
        );
        return;
      }

      if (this.voice.usesTapMode()) {
        this.ui.showPermissionBanner(
          true,
          "Matrix is in tap-to-talk mode on this device. Tap the avatar once, speak your command, then pause while it processes."
        );
      } else {
        this.ui.showPermissionBanner(false);
      }

      await this.returnToIdle();
      await this.handleLaunchContext();
    }

    async handleLaunchContext() {
      if (this.launchContext.route === "settings") {
        window.location.href = "/settings.html?matrix_source=native";
        return;
      }

      if (this.launchContext.listen || this.launchContext.intent === "listen") {
        await wait(250);
        this.handleWake("");
        this.voice.activateManualListening();
      }
    }

    setState(state, subtitle, status, headline, subheadline) {
      this.currentState = state;
      this.scene.setState(state);
      this.ui.setState(state, subtitle);
      this.ui.updateStatus(status, headline, subheadline);
      this.pulseHaptics(state);
    }

    pulseHaptics(state) {
      if (!this.settings.hapticsEnabled || typeof navigator.vibrate !== "function") {
        return;
      }

      const pattern =
        {
          [AppState.LISTENING]: 18,
          [AppState.THINKING]: [12, 16, 12],
          [AppState.AUTHORIZING]: [16, 22],
          [AppState.EXECUTING]: [20, 18, 20],
          [AppState.ALERT]: [28, 30, 28]
        }[state] || 0;

      if (pattern) {
        navigator.vibrate(pattern);
      }
    }

    handleWake(seed) {
      this.setState(
        AppState.LISTENING,
        "capturing voice command",
        "Listening",
        "Awaiting Directive",
        "Voice channel locked. Deliver the directive."
      );
      this.ui.updateLatency("Live input");
      this.ui.updateTranscript(seed || "Listening for command...");
      this.ui.updateResponse("Voice capture active.");
    }

    handleTranscript(text) {
      this.ui.updateTranscript(text);
    }

    async handleCommand(text, mode = "command", voiceSignature = null) {
      if (mode === "authorization") {
        await this.handleAuthorization(text, voiceSignature);
        return;
      }

      this.ui.updateTranscript(text);
      this.memory.add("user", text);
      this.ui.renderMemory(this.memory.list());

      const plan = this.ai.planAction(text);
      if (plan) {
        await this.processPlannedAction(plan, voiceSignature);
        return;
      }

      this.setState(
        AppState.THINKING,
        "reasoning across active context",
        "Processing",
        "Analyzing Request",
        "Evaluating intent, memory, and live intelligence pathways."
      );
      this.ui.updateLatency("Processing");
      this.ui.updateResponse("Thinking...");
      this.ui.renderSources([]);

      try {
        const result = await this.ai.respond(text);
        await this.deliverResult(result, {
          state: AppState.SPEAKING,
          subtitle: "delivering response",
          status: "Responding",
          headline: "Response Ready",
          subheadline: "Speech synthesis engaged."
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "An unexpected processing fault occurred.";
        this.ui.updateResponse(message);
        this.setState(
          AppState.ALERT,
          "response pipeline fault",
          "Degraded",
          "Pipeline Interrupted",
          "The response channel degraded. Reissue the directive and Matrix will retry."
        );
        await this.returnToIdle();
      }
    }

    async processPlannedAction(plan, voiceSignature = null) {
      const ownerCheck = evaluateOwnerVoice(this.settings, voiceSignature);

      if (
        plan.requiresAuthorization &&
        this.settings.voiceRecognitionEnabled &&
        this.settings.restrictSensitiveToOwner &&
        this.settings.ownerVoicePrint &&
        !ownerCheck.isOwner
      ) {
        await this.deliverResult(
          {
            text: "Owner voice verification failed. Protected operation blocked.",
            sources: [],
            latencyMs: 0
          },
          {
            state: AppState.ALERT,
            subtitle: "owner voice mismatch",
            status: "Blocked",
            headline: "Voice Guard Active",
            subheadline: "Protected operation rejected."
          }
        );
        return;
      }

      if (plan.requiresAuthorization) {
        this.pendingAuthorization = plan;
        this.setState(
          AppState.AUTHORIZING,
          "awaiting explicit authorization",
          "Authorization",
          "Protected Operation",
          "Authorization required before execution."
        );
        this.ui.updateResponse(plan.authorizationPrompt || "Authorization required. Confirm or cancel.");
        this.ui.updateLatency("Authorization");
        await this.voice.speak(plan.authorizationPrompt || "Authorization required. Confirm or cancel.");
        this.voice.captureFollowUp("authorization");
        return;
      }

      this.setState(
        AppState.EXECUTING,
        "executing authorized workflow",
        "Executing",
        "Execution Active",
        "Secure execution pipeline active."
      );
      this.ui.updateLatency("Executing");
      this.ui.updateResponse(`Executing ${plan.label || "workflow"}.`);

      try {
        const result = await this.ai.executeAction(plan);
        await this.deliverResult(result, {
          state: AppState.SPEAKING,
          subtitle: "reporting execution status",
          status: "Complete",
          headline: "Execution Report",
          subheadline: "Operation status delivered."
        });
      } catch (error) {
        this.handleAlert(error instanceof Error ? error.message : "Execution fault.");
        await this.returnToIdle();
      }
    }

    async handleAuthorization(text, voiceSignature = null) {
      this.ui.updateTranscript(text || "Authorization response pending.");

      if (!this.pendingAuthorization) {
        await this.returnToIdle();
        return;
      }

      const ownerCheck = evaluateOwnerVoice(this.settings, voiceSignature);

      if (
        this.settings.voiceRecognitionEnabled &&
        this.settings.restrictSensitiveToOwner &&
        this.settings.ownerVoicePrint &&
        !ownerCheck.isOwner
      ) {
        this.pendingAuthorization = null;
        await this.deliverResult(
          {
            text: "Authorization rejected. The enrolled owner voice was not recognized.",
            sources: [],
            latencyMs: 0
          },
          {
            state: AppState.ALERT,
            subtitle: "owner voice mismatch",
            status: "Rejected",
            headline: "Voice Guard Active",
            subheadline: "Authorization denied."
          }
        );
        return;
      }

      if (!text) {
        this.ui.updateResponse("Authorization not detected.");
        await this.voice.speak("Authorization not detected. Confirm or cancel.");
        this.voice.captureFollowUp("authorization");
        return;
      }

      if (AUTH_CANCEL_REGEX.test(text)) {
        const canceled = this.pendingAuthorization;
        this.pendingAuthorization = null;
        await this.deliverResult(
          {
            text: `${capitalize(canceled.label || "operation")} canceled.`,
            sources: [],
            latencyMs: 0
          },
          {
            state: AppState.SPEAKING,
            subtitle: "authorization canceled",
            status: "Canceled",
            headline: "Operation Halted",
            subheadline: "Protected operation canceled."
          }
        );
        return;
      }

      if (!AUTH_CONFIRM_REGEX.test(text)) {
        this.ui.updateResponse("Authorization phrase not recognized.");
        await this.voice.speak("Authorization phrase not recognized. Confirm or cancel.");
        this.voice.captureFollowUp("authorization");
        return;
      }

      const authorizedPlan = this.pendingAuthorization;
      this.pendingAuthorization = null;
      await this.processPlannedAction(
        {
          ...authorizedPlan,
          requiresAuthorization: false
        },
        voiceSignature
      );
    }

    async deliverResult(result, presentation) {
      this.memory.add("assistant", result.text);
      this.ui.renderMemory(this.memory.list());
      this.ui.updateResponse(result.text);
      this.ui.renderSources(result.sources);
      this.ui.updateLatency(
        result.latencyMs && result.latencyMs > 0 ? `${result.latencyMs} ms` : presentation.status
      );
      this.setState(
        presentation.state,
        presentation.subtitle,
        presentation.status,
        presentation.headline,
        presentation.subheadline
      );
      await this.voice.speak(result.text);
      await this.returnToIdle();
    }

    async returnToIdle(shouldStartPassiveListening = true) {
      const tapMode = this.voice.usesTapMode();
      const subtitle = tapMode ? "tap the avatar to speak" : "passive listening active";
      const subheadline = tapMode
        ? "Tap the avatar once, speak your command, and Matrix will process it."
        : "Passive listening active. Say Hey Matrix, Matrix, Omega, or Matrix Ultra to begin.";

      this.setState(AppState.IDLE, subtitle, "Standby", "Matrix Omega Ultra", subheadline);
      this.ui.updateTranscript(tapMode ? "Tap the avatar to begin." : "Wake phrase detection standing by.");
      this.ui.updateLatency("Standby");

      if (shouldStartPassiveListening && !tapMode) {
        this.voice.startPassiveListening();
      }
    }

    handleAlert(message) {
      const needsMicBanner = /microphone|speech recognition|voice capture|tap-to-talk|input/i.test(message);
      this.ui.showPermissionBanner(needsMicBanner, needsMicBanner ? message : undefined);
      this.ui.updateResponse(message);
      this.setState(
        AppState.ALERT,
        "attention required",
        "Attention",
        "Matrix Omega Ultra Requires Access",
        message
      );
    }

    handleAudio(level, values) {
      this.scene.setAudioLevel(level);
      this.ui.animateVisualizer(values, this.currentState);
    }
  }

  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function truncate(text, max) {
    return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
  }

  function capitalize(text) {
    return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : "";
  }

  function isMobilePlatform() {
    return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
  }

  function isIOSPlatform() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  }

  function isStandaloneDisplay() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  function extractPhoneTarget(message, pattern) {
    const match = message.match(pattern);
    return match?.[1]?.trim() || "";
  }

  function normalizePhoneDigits(target) {
    const digits = target.replace(/[^\d+]/g, "");
    return /\d{3,}/.test(digits) ? digits : "";
  }

  function formatPhoneForSpeech(digits) {
    return digits.replace(/^\+/, "plus ");
  }

  function extractSmsPayload(message) {
    const explicit = message.match(
      /\b(?:text|sms|message)\s+([+()\d\s-]{3,})(?:\s+(?:saying|with message|message|that says)\s+(.+))?/i
    );

    if (explicit) {
      return {
        target: explicit[1].trim(),
        body: explicit[2]?.trim() || ""
      };
    }

    return null;
  }

  function extractDestination(message) {
    const match = message.match(/\b(?:navigate to|get directions to|directions to|map)\s+(.+)/i);
    return match?.[1]?.trim() || "";
  }

  function buildMapsUrl(destination) {
    const encoded = encodeURIComponent(destination);
    if (isIOSPlatform()) {
      return `https://maps.apple.com/?q=${encoded}`;
    }
    return `https://www.google.com/maps/search/?api=1&query=${encoded}`;
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const input = document.createElement("textarea");
    input.value = text;
    input.setAttribute("readonly", "readonly");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    document.body.removeChild(input);
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => reject(new Error("Failed to read recorded audio."));
      reader.readAsDataURL(blob);
    });
  }

  function buildVoiceSignature(frames) {
    if (!Array.isArray(frames) || frames.length < 8) {
      return null;
    }

    const length = frames[0]?.length || 0;
    const bins = new Array(length).fill(0);

    for (const frame of frames) {
      for (let index = 0; index < length; index += 1) {
        bins[index] += frame[index];
      }
    }

    const averaged = bins.map((value) => value / frames.length);
    const total = averaged.reduce((sum, value) => sum + value, 0) || 1;
    const normalized = averaged.map((value) => value / total);
    const centroid =
      normalized.reduce((sum, value, index) => sum + value * (index / Math.max(1, normalized.length - 1)), 0);
    const energy = averaged.reduce((sum, value) => sum + value, 0) / averaged.length;

    return {
      bins: normalized,
      centroid,
      energy,
      frames: frames.length
    };
  }

  function evaluateOwnerVoice(settings, sample) {
    if (!settings.voiceRecognitionEnabled || !settings.ownerVoicePrint || !sample) {
      return {
        isOwner: !settings.voiceRecognitionEnabled || !settings.ownerVoicePrint,
        score: null
      };
    }

    const profile = settings.ownerVoicePrint;
    const binsLength = Math.min(profile.bins.length, sample.bins.length);
    let diff = 0;

    for (let index = 0; index < binsLength; index += 1) {
      diff += Math.abs(profile.bins[index] - sample.bins[index]);
    }

    diff /= Math.max(1, binsLength);
    diff += Math.abs(profile.centroid - sample.centroid) * 0.6;
    diff += Math.abs(profile.energy - sample.energy) * 0.25;

    return {
      isOwner: diff <= settings.ownerMatchThreshold,
      score: diff
    };
  }

  const app = new MatrixApp();
  window.addEventListener("DOMContentLoaded", () => {
    app.init();
  });
})();
