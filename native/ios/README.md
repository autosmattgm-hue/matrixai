# iPhone Starter

This starter is for a native iPhone wrapper around the Matrix web shell.

## Primary user experience

- User says `Siri, open Matrix`
- Siri launches the Matrix app
- The app loads:
  - `https://your-domain.vercel.app/?matrix_source=native`
  - or `https://your-domain.vercel.app/?matrix_source=native&matrix_intent=listen&matrix_listen=1`

## Files

- `MatrixIntents.swift`
  - App Intents and Siri shortcut phrases

## Shipping path

1. Create an iOS app target, for example bundle id `com.matrixomega.ultra`
2. Embed a hardened `WKWebView`
3. Add the App Intents file to the target
4. Route each intent to the correct Matrix URL
5. Test with Siri on a physical iPhone

## Important limitation

On iPhone, the real wake phrase is `Siri`. A third-party app cannot stay fully closed, hear `Matrix`, and wake itself on its own.
