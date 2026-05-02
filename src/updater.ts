// PWA iOS — aggiornamenti automatici non applicabili
// Gli aggiornamenti avvengono automaticamente tramite GitHub Pages
export const checkForUpdate = async (): Promise<{
  hasUpdate: boolean;
  version?: string;
  downloadUrl?: string;
  notes?: string;
}> => {
  return { hasUpdate: false };
};
