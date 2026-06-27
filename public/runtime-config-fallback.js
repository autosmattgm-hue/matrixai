window.MATRIX_RUNTIME = {
  apiEndpoint: "/api/matrix/respond",
  healthEndpoint: "/api/health",
  provider: "nvidia",
  executionMode: "browser-shell",
  wakeWords: ["Hey Matrix", "Matrix", "Omega"],
  model: "meta/llama-4-maverick-17b-128e-instruct",
  asrEndpoint: "/api/matrix/transcribe",
  asrModel: "microsoft/phi-4-multimodal-instruct",
  providerConfigured: false,
  runtimeConfigVersion: 2
};
