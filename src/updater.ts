// ── Auto-updater per GitHub Releases ────────────────────────────────
const GITHUB_API = 'https://api.github.com/repos/mydramasubita-boop/appmydramatv-mobile/releases/latest';
const CURRENT_VERSION = '1.0.0';

interface GithubRelease {
  tag_name: string;
  assets: { name: string; browser_download_url: string }[];
  body: string;
}

const compareVersions = (a: string, b: string): number => {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i]||0) > (pb[i]||0)) return 1;
    if ((pa[i]||0) < (pb[i]||0)) return -1;
  }
  return 0;
};

export const checkForUpdate = async (): Promise<{
  hasUpdate: boolean;
  version?: string;
  downloadUrl?: string;
  notes?: string;
}> => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    
    const res = await fetch(GITHUB_API, {
      headers: { 'Accept': 'application/vnd.github.v3+json' },
      signal: controller.signal,
      cache: 'no-cache',
    });
    clearTimeout(timeout);
    
    if (!res.ok) {
      console.warn('Update check failed:', res.status);
      return { hasUpdate: false };
    }
    
    const release: GithubRelease = await res.json();
    console.log('Latest release:', release.tag_name, 'Current:', CURRENT_VERSION);
    
    const newVersion = release.tag_name.replace(/^v/, '');
    if (compareVersions(newVersion, CURRENT_VERSION) <= 0) {
      console.log('No update needed');
      return { hasUpdate: false };
    }
    
    const apk = release.assets.find(a => a.name.endsWith('.apk'));
    if (!apk) {
      console.warn('No APK asset found');
      return { hasUpdate: false };
    }
    
    console.log('Update available:', newVersion, apk.browser_download_url);
    return {
      hasUpdate: true,
      version: newVersion,
      downloadUrl: apk.browser_download_url,
      notes: release.body,
    };
  } catch(e) {
    console.warn('Update check error:', e);
    return { hasUpdate: false };
  }
};
