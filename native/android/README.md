# Android Starter

This starter is for a native Android wrapper around the Matrix web shell.

## Primary user experience

- User says `Hey Google, open Matrix`
- Android launches the Matrix app
- The wrapper opens:
  - `https://your-domain.vercel.app/?matrix_source=native`
  - or `https://your-domain.vercel.app/?matrix_source=native&matrix_intent=listen&matrix_listen=1`

## Files

- `app/src/main/res/xml/shortcuts.xml`
  - Google Assistant / App Actions shortcuts
- `app/src/main/AndroidManifest.snippet.xml`
  - required manifest pieces to connect shortcuts and deep links

## Shipping path

1. Create a real Android app package, for example `com.matrixomega.ultra`
2. Load the Matrix web shell in a hardened `WebView` or a Trusted Web Activity
3. Replace `your-domain.vercel.app`
4. Add your signing config
5. Test phrases on a real device with Google Assistant

## Important limitation

`Hey Google` is the wake phrase. Android does not let a normal app invent a private always-on hotword without a deeper system-assistant implementation.
