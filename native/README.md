# Matrix Native Launch Pack

This folder scaffolds the native phone layer that the web app cannot provide by itself.

## What this enables

- `Android`: launch Matrix with Google Assistant phrases like `Hey Google, open Matrix`
- `Android`: open Matrix straight into listening mode
- `iPhone`: launch Matrix with Siri phrases like `Siri, open Matrix`
- `iPhone`: expose Siri shortcuts for opening Matrix, starting listening, and opening settings

## What this does not enable by itself

- a custom always-on wake phrase like just `Matrix` while the app is fully closed
- background microphone capture from a web app
- full OS control on iPhone without native entitlements and platform APIs

## Shared launch contract

The web shell now understands these query parameters:

- `/?matrix_source=native`
- `/?matrix_source=native&matrix_intent=listen&matrix_listen=1`
- `/?matrix_source=native&matrix_route=settings`

Use those URLs from the native wrappers so Matrix can open directly into:

- home
- live listening
- settings

## Replace before shipping

Update any placeholder domain such as `your-domain.vercel.app` to your real production host before building Android or iPhone apps.
