# My Drama Life — Mobile App (Capacitor + React + TypeScript)

## Requisiti
- Node.js 18+
- Android Studio con SDK
- Java: `C:\Program Files\Eclipse Adoptium\jdk-17.0.18.8-hotspot`

## Build completa

```bash
# 1. Installa dipendenze
npm install

# 2. Build web
npm run build

# 3. Init Capacitor (solo la prima volta)
npx cap init MyDramaLife com.mydramalife.mobile --web-dir=dist

# 4. Aggiungi piattaforma Android (solo la prima volta)
npx cap add android

# 5. Setup patch (MainAcivity.kt, manifest, styles, icona)
npm run cap:setup

# 6. Copia web build in android
npx cap copy android

# 7. Apri Android Studio
npx cap open android

# In Android Studio: Build → Build Bundle(s)/APK(s) → Build APK(s)
```

## Rebuild dopo modifiche al codice

```bash
npm run build && npx cap copy android
# poi Build APK in Android Studio
```

## Note

- `paddingRight: 50px` su header, main e footer evita che la barra sistema Android copra i contenuti
- Il tasto Indietro Android è intercettato da `MainActivity.kt` e inviato come keyCode 10009 alla WebView
- Doppio back entro 2.5s per uscire dall'app
- Orientamento forzato landscape tramite AndroidManifest.xml
- La barra navigazione Android è impostata a #000000 in styles.xml
