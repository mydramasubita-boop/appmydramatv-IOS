import { writeFileSync, readFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// ── 1. Verifica cartella android ──────────────────────────────────────
if (!existsSync(join(root, 'android'))) {
  console.error('❌ Esegui prima: npx cap add android');
  process.exit(1);
}

// ── 2. Copia MainActivity.kt ─────────────────────────────────────────
const srcKt  = join(root, 'android-patches', 'MainActivity.kt');
const destKt = join(root, 'android', 'app', 'src', 'main', 'java', 'com', 'mydramalife', 'mobile', 'MainActivity.kt');
const destDir = dirname(destKt);
if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
copyFileSync(srcKt, destKt);
console.log('✅ MainActivity.kt copiato');

// ── 3. AndroidManifest.xml — screenOrientation landscape ────────────
const manifestPath = join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
if (existsSync(manifestPath)) {
  let manifest = readFileSync(manifestPath, 'utf8');
  // Aggiungi screenOrientation se non presente
  if (!manifest.includes('screenOrientation')) {
    manifest = manifest.replace(
      /android:configChanges="[^"]*"/,
      (match) => match + '\n            android:screenOrientation="landscape"'
    );
    writeFileSync(manifestPath, manifest);
    console.log('✅ screenOrientation=landscape aggiunto al manifest');
  } else {
    // Forza landscape se già presente ma con valore diverso
    manifest = manifest.replace(
      /android:screenOrientation="[^"]*"/,
      'android:screenOrientation="landscape"'
    );
    writeFileSync(manifestPath, manifest);
    console.log('✅ screenOrientation=landscape aggiornato');
  }
}

// ── 4. styles.xml — barra navigazione nera ───────────────────────────
const stylesPath = join(root, 'android', 'app', 'src', 'main', 'res', 'values', 'styles.xml');
if (existsSync(stylesPath)) {
  let styles = readFileSync(stylesPath, 'utf8');
  const navBarItems = `
        <item name="android:navigationBarColor">#000000</item>
        <item name="android:windowLightNavigationBar">false</item>`;
  if (!styles.includes('navigationBarColor')) {
    styles = styles.replace('</style>', navBarItems + '\n    </style>');
    writeFileSync(stylesPath, styles);
    console.log('✅ NavigationBarColor impostato a nero');
  } else {
    console.log('ℹ️  NavigationBarColor già presente');
  }
}

// ── 5. Copia icona app ───────────────────────────────────────────────
const iconSrc = join(root, 'public', 'icon.png');
if (existsSync(iconSrc)) {
  // Copia nei drawable (usa una sola risoluzione come launcher icon base)
  const drawablePath = join(root, 'android', 'app', 'src', 'main', 'res', 'mipmap-xxxhdpi');
  if (existsSync(drawablePath)) {
    copyFileSync(iconSrc, join(drawablePath, 'ic_launcher.png'));
    copyFileSync(iconSrc, join(drawablePath, 'ic_launcher_round.png'));
    console.log('✅ Icona app copiata in mipmap-xxxhdpi');
  }
}

// ── 6. local.properties ─────────────────────────────────────────────
const localProps = join(root, 'android', 'local.properties');
writeFileSync(localProps, `sdk.dir=C\\:\\\\Users\\\\valen\\\\AppData\\\\Local\\\\Android\\\\Sdk\n`);
console.log('✅ local.properties creato');

console.log('\n✅ Setup completato! Ora esegui:');
console.log('   npx cap copy android');
console.log('   npx cap open android');
console.log('   → Build APK in Android Studio');
