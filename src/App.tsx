import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Home, Clock, Film, Tv, Monitor, Clapperboard, Search, Play,
         ChevronLeft, Volume2, VolumeX, SkipBack, SkipForward, Heart,
         X, Trash2, ChevronLeft as Prev, ChevronRight as Next, RefreshCw } from 'lucide-react';
import {
  createGroup, joinGroup, pushToGroup, subscribeToGroup,
  getSavedGroupName, getSavedGroupPin, disconnectGroup, SyncData
} from './firebase';

const lockOrientation = () => {
  const ori = screen.orientation as any;
  if (ori?.lock) { ori.lock('landscape').catch(() => { ori.lock('landscape-primary').catch(() => {}); }); }
};

interface Episodio { titolo_episodio: string; url_video: string; }
interface VideoData { is_serie: boolean; url_video?: string; episodi?: Episodio[]; }
interface Project {
  id_progetto: string; url_poster_verticale: string; titolo: string;
  generi: string[]; attori: string[]; descrizione: string;
  macro_categoria: string; sub_categoria: string; video_data: VideoData;
}
interface HistoryItem { projectId: string; episodeIndex: number; timestamp: number; }

const rKey = (id: string, ep: number) => `mdl_r_${id}_${ep}`;
const C = { primary: '#FF1493', secondary: '#8B008B' };
const BG = 'https://wh1373514.ispot.cc/wp/wp-content/MY%20DRAMA%20TV/FILEAPP/background.png';
const LOGO = 'https://wh1373514.ispot.cc/wp/wp-content/MY%20DRAMA%20TV/FILEAPP/logo.svg';
const NO_FOUND = 'https://wh1373514.ispot.cc/wp/wp-content/MY%20DRAMA%20TV/FILEAPP/No_Found_loop.gif';

const HeartIcon = ({ filled, size = 16 }: { filled: boolean; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24"
    fill={filled ? 'white' : 'none'} stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>
);

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const isTablet = () => Math.max(window.innerWidth, window.innerHeight) >= 600;

const MENU_W = 160;

const MyDramaApp = () => {
  const [loading, setLoading] = useState(true);
  const [showApp, setShowApp] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentPage, setCurrentPage] = useState('home');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [playing, setPlaying] = useState<Project | null>(null);
  const [playingProject, setPlayingProject] = useState<Project | null>(null);
  const [currentEpisode, setCurrentEpisode] = useState(0);
  const [muted, setMuted] = useState(false);
  const [showNextButton, setShowNextButton] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [playerReady, setPlayerReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showExitMsg, setShowExitMsg] = useState(false);
  const [tablet, setTablet] = useState(isTablet());
  const [showEpisodePanel, setShowEpisodePanel] = useState(false);

  // Sync
  const [isPortrait, setIsPortrait] = useState(() => window.innerHeight > window.innerWidth);
  const [groupName, setGroupName] = useState<string | null>(getSavedGroupName);
  const [groupPin, setGroupPin] = useState<string | null>(getSavedGroupPin);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncView, setSyncView] = useState<'main' | 'create' | 'join'>('main');
  const [syncGroupInput, setSyncGroupInput] = useState('');
  const [syncPinInput, setSyncPinInput] = useState('');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [syncError, setSyncError] = useState('');

  // Aggiornamenti

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const preloaderRef = useRef<HTMLVideoElement | null>(null);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const resumeTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const backTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backCountRef = useRef(0);
  const mainScrollRef = useRef<HTMLDivElement | null>(null);
  const seekBarRef = useRef<HTMLDivElement | null>(null);
  const syncUnsub = useRef<(() => void) | null>(null);
  const isSyncing = useRef(false);

  const menuItems = [
    { id: 'home',      label: 'Home',       Icon: Home },
    { id: 'history',   label: 'Continua',   Icon: Clock },
    { id: 'favorites', label: 'Preferiti',  Icon: Heart },
    { id: 'film',      label: 'Film',       Icon: Film },
    { id: 'drama',     label: 'Drama',      Icon: Tv },
    { id: 'mini',      label: 'Mini & Web', Icon: Monitor },
    { id: 'altro',     label: 'Altro',      Icon: Clapperboard },
    { id: 'search',    label: 'Cerca',      Icon: Search },
  ];

  const pagesWithSub = ['film', 'drama', 'mini', 'altro'];
  const getSubCats = (): string[] => ({
    film:  ['Cina', 'Corea', 'Giappone', 'Hong Kong', 'Taiwan', 'Thailandia'],
    drama: ['Cina', 'Corea', 'Giappone', 'Hong Kong', 'Taiwan', 'Thailandia'],
    mini:  ['Cina', 'Corea', 'Giappone', 'Hong Kong', 'Taiwan', 'Thailandia'],
    altro: ['Cortometraggi', 'Teaser Trailer', 'Pubblicità'],
  } as Record<string, string[]>)[currentPage] ?? [];

  // Ricerca: stringa intera su tutto
  const getFilteredProjects = useCallback((): Project[] => {
    let f = projects;
    if (currentPage === 'home') return projects.slice(0, 20);
    if (currentPage === 'favorites') f = f.filter(p => favorites.includes(p.id_progetto));
    else if (currentPage === 'history') f = history.map(h => projects.find(p => p.id_progetto === h.projectId)).filter((p): p is Project => !!p);
    else if (currentPage === 'film')  f = f.filter(p => p.macro_categoria === 'film');
    else if (currentPage === 'drama') f = f.filter(p => p.macro_categoria === 'drama');
    else if (currentPage === 'mini')  f = f.filter(p => p.macro_categoria === 'mini-e-web-drama');
    else if (currentPage === 'altro') f = f.filter(p => p.macro_categoria === 'altro');
    if (selectedCategory) f = f.filter(p => p.sub_categoria.toLowerCase() === selectedCategory.toLowerCase());
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      f = f.filter(p => (
        p.titolo.toLowerCase().includes(q) ||
        p.descrizione.toLowerCase().includes(q) ||
        p.generi.some(g => g.toLowerCase().includes(q)) ||
        p.attori.some(a => a.toLowerCase().includes(q)) ||
        p.macro_categoria.toLowerCase().includes(q) ||
        p.sub_categoria.toLowerCase().includes(q)
      ));
    }
    return f;
  }, [projects, currentPage, favorites, history, selectedCategory, searchQuery]);

  const goToSearch = (query: string) => {
    setCurrentPage('search'); setSelectedCategory(null); setSearchQuery(query);
  };
  const goToPage = (page: string) => {
    setCurrentPage(page); setSelectedCategory(null); setSearchQuery('');
    mainScrollRef.current?.scrollTo({ top: 0 });
  };

  // Sync helpers
  const getLocalSyncData = (): SyncData => {
    const positions: Record<string, number> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('mdl_r_')) {
        const val = localStorage.getItem(k);
        if (val) positions[k] = parseInt(val);
      }
    }
    return { favorites, history, positions, lastUpdated: Date.now() };
  };

  const applyRemoteData = useCallback((data: SyncData) => {
    if (isSyncing.current) return;
    isSyncing.current = true;

    // Merge preferiti
    const mergedFav = [...new Set([...favorites, ...(data.favorites || [])])];
    setFavorites(mergedFav);
    localStorage.setItem('mdl_fav', JSON.stringify(mergedFav));

    // Merge cronologia
    const allHist = [...history, ...(data.history || [])];
    const histMap = new Map<string, HistoryItem>();
    allHist.forEach(h => {
      const existing = histMap.get(h.projectId);
      if (!existing || h.timestamp > existing.timestamp) histMap.set(h.projectId, h);
    });
    const mergedHist = Array.from(histMap.values()).sort((a, b) => b.timestamp - a.timestamp).slice(0, 50);
    setHistory(mergedHist);
    localStorage.setItem('mdl_hist', JSON.stringify(mergedHist));

    // Merge posizioni
    Object.entries(data.positions || {}).forEach(([k, v]) => {
      const local = parseInt(localStorage.getItem(k) || '0');
      if (v > local) localStorage.setItem(k, String(v));
    });

    isSyncing.current = false;
  }, [favorites, history]);

  const pushSync = useCallback((favs: string[], hist: HistoryItem[]) => {
    const checkOrientation = () => setIsPortrait(window.innerHeight > window.innerWidth);
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    const gn = getSavedGroupName();
    if (!gn) return;
    const positions: Record<string, number> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('mdl_r_')) { const val = localStorage.getItem(k); if (val) positions[k] = parseInt(val); }
    }
    pushToGroup(gn, { favorites: favs, history: hist, positions, lastUpdated: Date.now() });
  }, []);

  const startGroupListener = useCallback((gn: string) => {
    if (syncUnsub.current) syncUnsub.current();
    syncUnsub.current = subscribeToGroup(gn, applyRemoteData);
  }, [applyRemoteData]);

  // Data
  const loadProjects = async () => {
    try {
      const r = await fetch('https://raw.githubusercontent.com/mydramasubita-boop/listaprogettimydramafansub/refs/heads/main/metadati_fansub_test.json');
      setProjects(await r.json());
    } catch {}
  };
  const loadFavorites = () => { try { const s = localStorage.getItem('mdl_fav'); if (s) setFavorites(JSON.parse(s)); } catch {} };
  const loadHistory = () => { try { const s = localStorage.getItem('mdl_hist'); if (s) setHistory(JSON.parse(s)); } catch {} };

  const toggleFavorite = (id: string) => {
    const n = favorites.includes(id) ? favorites.filter(x => x !== id) : [...favorites, id];
    setFavorites(n); localStorage.setItem('mdl_fav', JSON.stringify(n)); pushSync(n, history);
  };
  const addToHistory = (project: Project, ep = 0) => {
    const n = [{ projectId: project.id_progetto, episodeIndex: ep, timestamp: Date.now() },
               ...history.filter(h => h.projectId !== project.id_progetto)].slice(0, 20);
    setHistory(n); localStorage.setItem('mdl_hist', JSON.stringify(n)); pushSync(favorites, n);
  };
  const clearHistory = () => { setHistory([]); localStorage.setItem('mdl_hist', '[]'); pushSync(favorites, []); };
  const removeFromHistory = (id: string) => {
    const n = history.filter(h => h.projectId !== id);
    setHistory(n); localStorage.setItem('mdl_hist', JSON.stringify(n)); pushSync(favorites, n);
  };



  const playVideo = (project: Project, ep = 0) => {
    setPlayingProject(project); setPlaying(project); setCurrentEpisode(ep);
    addToHistory(project, ep); setShowNextButton(false); setPlayerReady(false); setIsPlaying(true); setShowControls(true);
    setTimeout(() => {
      lockOrientation();
      document.documentElement.requestFullscreen?.().catch(() => {});
      const saved = localStorage.getItem(rKey(project.id_progetto, ep));
      if (videoRef.current && saved && parseInt(saved) > 5) videoRef.current.currentTime = parseInt(saved);
    }, 300);
  };
  const nextEpisode = () => {
    if (!playing?.video_data.episodi || currentEpisode >= playing.video_data.episodi.length - 1) return;
    const n = currentEpisode + 1; setCurrentEpisode(n); setShowNextButton(false); addToHistory(playing, n); setPlayerReady(false);
    setTimeout(() => { const s = localStorage.getItem(rKey(playing.id_progetto, n)); if (videoRef.current && s && parseInt(s) > 5) videoRef.current.currentTime = parseInt(s); }, 300);
  };
  const prevEpisode = () => {
    if (!playing || currentEpisode <= 0) return;
    const n = currentEpisode - 1; setCurrentEpisode(n); setShowNextButton(false); addToHistory(playing, n); setPlayerReady(false);
  };
  const togglePlayPause = () => {
    if (!videoRef.current) return;
    if (isPlaying) videoRef.current.pause(); else videoRef.current.play();
    setIsPlaying(!isPlaying);
  };

  const seekTo = (clientX: number, rect: DOMRect) => {
    const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    if (videoRef.current) videoRef.current.currentTime = pos * duration;
  };
  const handleSeekTouch = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!seekBarRef.current || !duration) return;
    seekTo(e.touches[0].clientX, seekBarRef.current.getBoundingClientRect()); resetControlsTimer();
  };
  const handleSeekClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return; seekTo(e.clientX, e.currentTarget.getBoundingClientRect());
  };

  const resetControlsTimer = () => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setShowControls(false), 4000);
  };

  useEffect(() => {
    lockOrientation(); loadProjects(); loadFavorites(); loadHistory();
    window.addEventListener('resize', () => setTablet(isTablet()));
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', '#000000');
    document.documentElement.style.background = '#000';
    document.body.style.background = '#000';

    const checkOrientation = () => setIsPortrait(window.innerHeight > window.innerWidth);
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    const gn = getSavedGroupName();
    if (gn) {
      startGroupListener(gn);
    }
    setTimeout(() => setShowApp(true), 300);



    return () => { if (syncUnsub.current) syncUnsub.current(); };
  }, []);

  useEffect(() => {
    if (playing) {
      resumeTimer.current = setInterval(() => {
        if (videoRef.current && !videoRef.current.paused) {
          localStorage.setItem(rKey(playing.id_progetto, currentEpisode), String(Math.floor(videoRef.current.currentTime)));
          if (Math.floor(videoRef.current.currentTime) % 30 === 0) pushSync(favorites, history);
        }
      }, 5000);
    }
    return () => { if (resumeTimer.current) clearInterval(resumeTimer.current); };
  }, [playing, currentEpisode]);

  useEffect(() => {
    if (!videoRef.current || !playing) return;
    const v = videoRef.current;
    const onTime = () => {
      setCurrentTime(v.currentTime);
      const left = v.duration - v.currentTime;
      if (left <= 20 && left > 0 && playing.video_data.episodi && currentEpisode < playing.video_data.episodi.length - 1) setShowNextButton(true);
    };
    const onMeta = () => setDuration(v.duration);
    v.addEventListener('timeupdate', onTime); v.addEventListener('loadedmetadata', onMeta);
    return () => { v.removeEventListener('timeupdate', onTime); v.removeEventListener('loadedmetadata', onMeta); };
  }, [playing, currentEpisode]);

  useEffect(() => {
    if (playing && showControls) {
      if (controlsTimer.current) clearTimeout(controlsTimer.current);
      controlsTimer.current = setTimeout(() => setShowControls(false), 4000);
    }
    return () => { if (controlsTimer.current) clearTimeout(controlsTimer.current); };
  }, [showControls, playing]);

  useEffect(() => {
    const isBack = (e: KeyboardEvent) => e.keyCode === 8 || e.keyCode === 27 || e.key === 'GoBack' || e.keyCode === 10009 || e.keyCode === 461;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isBack(e)) return; e.preventDefault();
      if (playing) {
        if (videoRef.current) localStorage.setItem(rKey(playing.id_progetto, currentEpisode), String(Math.floor(videoRef.current.currentTime)));
        setPlaying(null); setShowNextButton(false); setIsPlaying(true); setPlayerReady(false); setSelectedProject(playingProject); return;
      }
      if (selectedProject) { setSelectedProject(null); return; }
      backCountRef.current += 1;
      if (backCountRef.current >= 2) { try { (window as any).Android?.exitApp?.(); } catch (_) {} window.history.back(); backCountRef.current = 0; return; }
      setShowExitMsg(true);
      if (backTimerRef.current) clearTimeout(backTimerRef.current);
      backTimerRef.current = setTimeout(() => { backCountRef.current = 0; setShowExitMsg(false); }, 2500);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [playing, selectedProject, playingProject, currentEpisode]);

  // ── PRELOADER ───────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
      <div id="pc" style={{ position: 'absolute', inset: 0, background: '#000', zIndex: 10, transition: 'opacity 0.2s' }} />
      <video ref={preloaderRef} autoPlay muted playsInline
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        onCanPlay={() => { const c = document.getElementById('pc'); if (c) { c.style.opacity = '0'; setTimeout(() => { if (c) c.style.display = 'none'; }, 200); } }}
        onTimeUpdate={(e) => { const v = e.target as HTMLVideoElement; const l = v.duration - v.currentTime; if (l <= 0.75 && l > 0) v.style.opacity = String(l / 0.75); }}
        onEnded={() => setLoading(false)} onError={() => setLoading(false)}>
        <source src="/preloader.mp4" type="video/mp4" />
      </video>
    </div>
  );

  // ── PLAYER ──────────────────────────────────────────────────────────
  if (playing) {
    const url = playing.video_data.is_serie ? playing.video_data.episodi![currentEpisode].url_video : playing.video_data.url_video;
    const hasPrev = currentEpisode > 0;
    const hasNext = !!(playing.video_data.episodi && currentEpisode < playing.video_data.episodi.length - 1);
    const doBack = () => {
      if (videoRef.current) localStorage.setItem(rKey(playing.id_progetto, currentEpisode), String(Math.floor(videoRef.current.currentTime)));
      setPlaying(null); setShowNextButton(false); setIsPlaying(true); setPlayerReady(false); setSelectedProject(playingProject);
    };
    return (
      <div style={{ width: '100%', height: '100vh', background: '#000', position: 'relative', userSelect: 'none' }}
        onTouchStart={resetControlsTimer} onClick={resetControlsTimer}>
        <style>{`@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}@keyframes spin{to{transform:rotate(360deg)}}video::-webkit-media-controls,video::-webkit-media-controls-enclosure,video::-webkit-media-controls-panel{display:none!important;}video{outline:none;background:#000;}button{outline:none!important;-webkit-tap-highlight-color:transparent;}`}</style>
        {!playerReady && (
          <div style={{ position: 'absolute', inset: 0, background: '#000', zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '56px', height: '56px', border: '4px solid rgba(255,255,255,.15)', borderTopColor: C.primary, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        )}
        <video ref={videoRef} src={url} autoPlay muted={muted} playsInline
          style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: playerReady ? 1 : 0, transition: 'opacity 0.4s' }}
          onCanPlay={() => setPlayerReady(true)} onClick={togglePlayPause}
          onTouchEnd={(e) => { e.preventDefault(); togglePlayPause(); resetControlsTimer(); }} />
        <div style={{ position: 'absolute', inset: 0, background: showControls ? 'linear-gradient(to bottom,rgba(0,0,0,.8) 0%,transparent 30%,transparent 60%,rgba(0,0,0,.85) 100%)' : 'transparent', opacity: showControls ? 1 : 0, transition: 'all 0.35s', pointerEvents: showControls ? 'auto' : 'none' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '14px 16px 10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button onTouchEnd={(e) => { e.preventDefault(); doBack(); }} onClick={doBack}
              style={{ padding: '10px 18px', background: 'rgba(0,0,0,.7)', border: `2px solid ${C.primary}`, borderRadius: '10px', color: 'white', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', cursor: 'pointer', fontWeight: 'bold', flexShrink: 0 }}>
              <ChevronLeft size={18} /> Indietro
            </button>
            {playing.video_data.is_serie && playing.video_data.episodi && (
              <button onTouchEnd={(e) => { e.preventDefault(); setShowEpisodePanel(p => !p); resetControlsTimer(); }} onClick={() => setShowEpisodePanel(p => !p)}
                style={{ flex: 1, textAlign: 'center', fontSize: '13px', fontWeight: 'bold', color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: showEpisodePanel ? `linear-gradient(135deg,${C.primary},${C.secondary})` : 'rgba(0,0,0,.5)', border: `1px solid ${C.primary}`, borderRadius: '8px', padding: '6px 10px', cursor: 'pointer' }}>
                {playing.video_data.episodi[currentEpisode].titolo_episodio} <span style={{ fontSize: '11px', opacity: .8 }}>▶ Lista</span>
              </button>
            )}
            <button onTouchEnd={(e) => { e.preventDefault(); setMuted(m => { if (videoRef.current) videoRef.current.muted = !m; return !m; }); resetControlsTimer(); }}
              onClick={() => setMuted(m => { if (videoRef.current) videoRef.current.muted = !m; return !m; })}
              style={{ width: '44px', height: '44px', background: 'rgba(0,0,0,.7)', border: `2px solid ${C.primary}`, borderRadius: '50%', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
          </div>
          <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', padding: '0 16px' }}>
            {hasPrev && <button onTouchEnd={(e) => { e.preventDefault(); prevEpisode(); }} onClick={prevEpisode} style={{ width: '48px', height: '48px', background: 'rgba(0,0,0,.6)', border: `2px solid ${C.primary}`, borderRadius: '50%', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Prev size={22} /></button>}
            <button onTouchEnd={(e) => { e.preventDefault(); if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10); resetControlsTimer(); }}
              onClick={() => { if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10); }}
              style={{ width: '52px', height: '52px', background: 'rgba(0,0,0,.6)', border: `2px solid ${C.primary}`, borderRadius: '50%', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', gap: '1px' }}>
              <SkipBack size={18} fill="white" /><span style={{ fontSize: '9px', fontWeight: 'bold' }}>-10s</span>
            </button>
            <button onTouchEnd={(e) => { e.preventDefault(); togglePlayPause(); resetControlsTimer(); }} onClick={togglePlayPause}
              style={{ width: '70px', height: '70px', background: `linear-gradient(135deg,${C.primary},${C.secondary})`, border: 'none', borderRadius: '50%', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              {isPlaying ? <div style={{ display: 'flex', gap: '5px' }}><div style={{ width: '5px', height: '26px', background: 'white', borderRadius: '2px' }} /><div style={{ width: '5px', height: '26px', background: 'white', borderRadius: '2px' }} /></div> : <Play size={30} fill="white" style={{ marginLeft: '3px' }} />}
            </button>
            <button onTouchEnd={(e) => { e.preventDefault(); if (videoRef.current) videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 10); resetControlsTimer(); }}
              onClick={() => { if (videoRef.current) videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 10); }}
              style={{ width: '52px', height: '52px', background: 'rgba(0,0,0,.6)', border: `2px solid ${C.primary}`, borderRadius: '50%', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', gap: '1px' }}>
              <SkipForward size={18} fill="white" /><span style={{ fontSize: '9px', fontWeight: 'bold' }}>+10s</span>
            </button>
            {hasNext && <button onTouchEnd={(e) => { e.preventDefault(); nextEpisode(); }} onClick={nextEpisode} style={{ width: '48px', height: '48px', background: 'rgba(0,0,0,.6)', border: `2px solid ${C.primary}`, borderRadius: '50%', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Next size={22} /></button>}
          </div>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '10px 16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <span style={{ fontSize: '13px', fontWeight: 'bold', minWidth: '44px', color: 'white' }}>{fmt(currentTime)}</span>
              <div ref={seekBarRef} style={{ flex: 1, height: '8px', background: 'rgba(255,255,255,.25)', borderRadius: '4px', cursor: 'pointer', position: 'relative', touchAction: 'none' }}
                onTouchStart={handleSeekTouch} onTouchMove={handleSeekTouch} onClick={handleSeekClick}>
                <div style={{ width: `${duration ? (currentTime / duration * 100) : 0}%`, height: '100%', background: `linear-gradient(90deg,${C.primary},${C.secondary})`, borderRadius: '4px', position: 'relative' }}>
                  <div style={{ position: 'absolute', right: '-7px', top: '50%', transform: 'translateY(-50%)', width: '16px', height: '16px', background: 'white', borderRadius: '50%' }} />
                </div>
              </div>
              <span style={{ fontSize: '13px', fontWeight: 'bold', minWidth: '44px', textAlign: 'right', color: 'white' }}>{fmt(duration)}</span>
            </div>
          </div>
        </div>
        {showNextButton && playing.video_data.episodi && currentEpisode < playing.video_data.episodi.length - 1 && (
          <div style={{ position: 'absolute', bottom: '80px', right: '16px' }}>
            <button onTouchEnd={(e) => { e.preventDefault(); nextEpisode(); }} onClick={nextEpisode}
              style={{ padding: '13px 24px', background: `linear-gradient(135deg,${C.primary},${C.secondary})`, border: 'none', borderRadius: '12px', color: 'white', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', cursor: 'pointer', fontWeight: 'bold', animation: 'pulse 1.5s infinite' }}>
              Ep. successivo <SkipForward size={16} />
            </button>
          </div>
        )}
        {showEpisodePanel && playing.video_data.is_serie && playing.video_data.episodi && (
          <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: tablet ? '300px' : '240px', background: 'rgba(0,0,0,.97)', borderLeft: `3px solid ${C.primary}`, zIndex: 50, overflowY: 'auto' } as React.CSSProperties}>
            <div style={{ padding: '12px 14px', borderBottom: `2px solid rgba(255,255,255,.1)`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '14px', fontWeight: 'bold', color: 'white' }}>Episodi</span>
              <button onTouchEnd={(e) => { e.preventDefault(); setShowEpisodePanel(false); }} onClick={() => setShowEpisodePanel(false)} style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '20px', cursor: 'pointer', padding: '4px 8px' }}>✕</button>
            </div>
            {playing.video_data.episodi.map((ep, i) => {
              const isCur = i === currentEpisode;
              return (
                <button key={i} onTouchEnd={(e) => { e.preventDefault(); playVideo(playing, i); setShowEpisodePanel(false); }} onClick={() => { playVideo(playing, i); setShowEpisodePanel(false); }}
                  style={{ width: '100%', padding: '11px 14px', background: isCur ? `linear-gradient(135deg,${C.primary},${C.secondary})` : 'transparent', border: 'none', borderLeft: isCur ? '4px solid white' : '4px solid transparent', color: 'white', textAlign: 'left', cursor: 'pointer', fontSize: '13px', fontWeight: isCur ? 'bold' : 'normal', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '26px', height: '26px', background: isCur ? 'rgba(255,255,255,.3)' : 'rgba(255,20,147,.2)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '11px', fontWeight: 'bold' }}>
                    {isCur ? <Play size={11} fill="white" /> : i + 1}
                  </div>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ep.titolo_episodio}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── DETTAGLIO ───────────────────────────────────────────────────────
  if (selectedProject) {
    const isFav = favorites.includes(selectedProject.id_progetto);
    return (
      <div ref={(el) => { if (el) el.scrollTop = 0; }} style={{ position: 'fixed', inset: 0, zIndex: 200, overflowY: 'auto', background: `url(${BG})`, backgroundSize: 'cover', color: 'white' }}>
        <style>{`button{outline:none!important;-webkit-tap-highlight-color:transparent;}*::-webkit-scrollbar{display:none;}`}</style>
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 0 }} />
        <div style={{ position: 'relative', zIndex: 1, padding: '16px 16px 80px' }}>
          <button onClick={() => setSelectedProject(null)}
            style={{ padding: '10px 18px', background: 'rgba(0,0,0,.85)', border: `2px solid ${C.primary}`, borderRadius: '10px', color: 'white', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px', cursor: 'pointer', marginBottom: '16px', fontWeight: 'bold' }}>
            <ChevronLeft size={19} /> Indietro
          </button>
          <div style={{ display: 'flex', gap: '18px', marginBottom: '18px', alignItems: 'flex-start' }}>
            <img src={selectedProject.url_poster_verticale} alt={selectedProject.titolo}
              style={{ width: tablet ? '180px' : '130px', height: tablet ? '270px' : '195px', objectFit: 'cover', borderRadius: '11px', boxShadow: `0 10px 36px rgba(255,20,147,.5)`, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ fontSize: tablet ? '22px' : '17px', marginBottom: '10px', lineHeight: '1.25' }}>{selectedProject.titolo}</h1>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
                {selectedProject.generi.map((g, i) => (
                  <button key={i} onClick={() => { goToSearch(g); setSelectedProject(null); }}
                    style={{ padding: '5px 12px', background: `linear-gradient(135deg,${C.primary},${C.secondary})`, borderRadius: '12px', fontSize: '13px', cursor: 'pointer', fontWeight: 'bold', color: 'white', border: 'none' }}>{g}</button>
                ))}
              </div>
              <p style={{ fontSize: '14px', lineHeight: '1.65', marginBottom: '14px', opacity: .9 }}>{selectedProject.descrizione}</p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button onClick={() => toggleFavorite(selectedProject.id_progetto)}
                  style={{ padding: '10px 18px', background: isFav ? `linear-gradient(135deg,${C.primary},${C.secondary})` : 'rgba(255,255,255,.15)', border: `2px solid ${C.primary}`, borderRadius: '10px', color: 'white', display: 'flex', alignItems: 'center', gap: '7px', fontSize: '15px', cursor: 'pointer', fontWeight: 'bold' }}>
                  <HeartIcon filled={isFav} size={15} /> {isFav ? 'Rimuovi' : 'Preferiti'}
                </button>
                {!selectedProject.video_data.is_serie && (
                  <button onClick={() => playVideo(selectedProject)}
                    style={{ padding: '10px 22px', background: `linear-gradient(135deg,${C.primary},${C.secondary})`, border: 'none', borderRadius: '10px', color: 'white', display: 'flex', alignItems: 'center', gap: '7px', fontSize: '15px', cursor: 'pointer', fontWeight: 'bold' }}>
                    <Play size={16} fill="white" /> GUARDA
                  </button>
                )}
              </div>
            </div>
          </div>
          {selectedProject.attori.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <h3 style={{ fontSize: '15px', marginBottom: '8px', opacity: .85 }}>Cast:</h3>
              <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '6px' } as React.CSSProperties}>
                {selectedProject.attori.map((a, i) => (
                  <button key={i} onClick={() => { goToSearch(a); setSelectedProject(null); }}
                    style={{ padding: '6px 14px', background: 'rgba(255,20,147,.85)', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: 'bold', color: 'white', border: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}>{a}</button>
                ))}
              </div>
            </div>
          )}
          {selectedProject.video_data.is_serie && selectedProject.video_data.episodi && (
            <div>
              <h2 style={{ fontSize: '18px', marginBottom: '10px' }}>Episodi</h2>
              <div style={{ display: 'grid', gridTemplateColumns: tablet ? 'repeat(auto-fill,minmax(220px,1fr))' : 'repeat(auto-fill,minmax(160px,1fr))', gap: '8px' }}>
                {selectedProject.video_data.episodi.map((ep, i) => (
                  <button key={i} onClick={() => playVideo(selectedProject, i)}
                    style={{ padding: '10px 12px', background: 'rgba(26,26,26,.95)', border: `2px solid ${C.primary}`, borderRadius: '9px', color: 'white', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '9px', fontSize: '14px', fontWeight: 'bold' }}>
                    <div style={{ width: '28px', height: '28px', background: `linear-gradient(135deg,${C.primary},${C.secondary})`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Play size={13} fill="white" /></div>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ep.titolo_episodio}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── SCHERMATA PRINCIPALE ────────────────────────────────────────────
  const fp = getFilteredProjects();
  const cardMin = tablet ? '140px' : '110px';

  return (
    <>
    {isPortrait && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.95)', zIndex: 99999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white', textAlign: 'center', padding: '40px' }}>
        <div style={{ fontSize: '64px', marginBottom: '24px' }}>📱➡️</div>
        <p style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '12px' }}>Ruota il telefono</p>
        <p style={{ fontSize: '15px', opacity: .7, lineHeight: '1.5' }}>My Drama Life TV funziona in orizzontale.<br/>Ruota il telefono e disattiva il blocco rotazione.</p>
      </div>
    )}
    <div style={{ width: '100%', height: '100vh', display: 'flex', background: `url(${BG})`, backgroundSize: 'cover', backgroundPosition: 'center', color: 'white', opacity: showApp ? 1 : 0, transition: 'opacity 0.5s' }}>
      <style>{`*{-ms-overflow-style:none;scrollbar-width:none;box-sizing:border-box;}*::-webkit-scrollbar{display:none;}button,input{outline:none!important;-webkit-tap-highlight-color:transparent;}@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* ── MENU LATERALE ── */}
      <nav style={{ width: `${MENU_W}px`, flexShrink: 0, position: 'fixed', top: 0, left: 0, bottom: 0, background: 'rgba(0,0,0,.95)', borderRight: `2px solid ${C.primary}`, display: 'flex', flexDirection: 'column', overflowY: 'scroll', overflowX: 'hidden', WebkitOverflowScrolling: 'touch', zIndex: 10 } as React.CSSProperties}>
        <div style={{ padding: '12px 8px 8px', borderBottom: `1px solid rgba(255,255,255,.1)`, textAlign: 'center' }}>
          <img src={LOGO} alt="My Drama Life" style={{ height: '48px', width: 'auto', maxWidth: '100%' }} />
        </div>
        <div style={{ flex: 1, padding: '8px 4px', display: 'flex', flexDirection: 'column', gap: '2px', overflowY: 'auto', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
          {menuItems.map((item) => {
            const Icon = item.Icon;
            const isAct = currentPage === item.id;
            return (
              <button key={item.id} onClick={() => goToPage(item.id)} onTouchEnd={(e) => { e.preventDefault(); goToPage(item.id); }}
                style={{ width: '100%', padding: '10px 10px', background: isAct ? `linear-gradient(135deg,${C.primary},${C.secondary})` : 'transparent', border: 'none', borderRadius: '10px', color: 'white', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: isAct ? 'bold' : 'normal', fontSize: '13px', transition: 'all 0.15s' }}>
                <Icon size={18} style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
              </button>
            );
          })}
        </div>
        <div style={{ padding: '8px 4px', borderTop: `1px solid rgba(255,255,255,.1)` }}>
          <button onClick={() => setShowSyncModal(true)}
            style={{ width: '100%', padding: '10px', background: groupName ? `linear-gradient(135deg,${C.primary},${C.secondary})` : 'rgba(255,255,255,.08)', border: `1px solid ${C.primary}`, borderRadius: '10px', color: 'white', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
            <RefreshCw size={18} />
            <span>{groupName ? `Sync: ${groupName}` : '🔄 Sync'}</span>
          </button>
          <p style={{ fontSize: '9px', opacity: .4, textAlign: 'center', margin: '6px 0 0' }}>My Drama Life TV © 2025</p>
        </div>
      </nav>

      {/* ── CONTENUTO ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Subcategorie */}
        {pagesWithSub.includes(currentPage) && (
          <div style={{ background: 'rgba(0,0,0,.9)', borderBottom: `1px solid rgba(255,255,255,.1)`, padding: '6px 10px', display: 'flex', gap: '6px', overflowX: 'auto', flexShrink: 0 } as React.CSSProperties}>
            {['Tutte', ...getSubCats()].map(opt => {
              const isSel = opt === 'Tutte' ? !selectedCategory : opt === selectedCategory;
              return <button key={opt} onClick={() => setSelectedCategory(opt === 'Tutte' ? null : opt)}
                style={{ padding: '5px 12px', background: isSel ? C.primary : 'rgba(26,26,26,.9)', border: `1px solid ${isSel ? C.primary : 'transparent'}`, borderRadius: '8px', color: 'white', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap', flexShrink: 0 }}>{opt}</button>;
            })}
          </div>
        )}

        {/* Campo cerca */}
        {currentPage === 'search' && (
          <div style={{ background: 'rgba(0,0,0,.9)', padding: '8px 12px', borderBottom: `1px solid rgba(255,255,255,.1)`, flexShrink: 0 }}>
            <div style={{ position: 'relative' }}>
              <input ref={searchRef} type="text" placeholder="Cerca titolo, genere, attore, descrizione..."
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                autoFocus
                style={{ width: '100%', padding: '10px 36px 10px 12px', fontSize: '14px', background: 'rgba(26,26,26,.95)', border: `2px solid ${C.primary}`, borderRadius: '10px', color: 'white', boxSizing: 'border-box' as any }} />
              {searchQuery && <button onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'rgba(255,255,255,.7)', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>×</button>}
            </div>
          </div>
        )}

        {/* Cronologia header */}
        {currentPage === 'history' && history.length > 0 && (
          <div style={{ background: 'rgba(0,0,0,.9)', padding: '6px 12px', borderBottom: `1px solid rgba(255,255,255,.1)`, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
            <button onClick={clearHistory}
              style={{ padding: '7px 16px', background: `linear-gradient(135deg,${C.primary},${C.secondary})`, border: 'none', borderRadius: '9px', color: 'white', fontSize: '13px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Trash2 size={13} /> Cancella tutta la cronologia
            </button>
          </div>
        )}

        {/* Griglia */}
        <div ref={mainScrollRef} style={{ flex: 1, overflowY: 'auto', padding: '10px 12px 20px', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
          {currentPage === 'home' && <h1 style={{ fontSize: '17px', textAlign: 'center', marginBottom: '10px' }}>Ultime uscite</h1>}
          {fp.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
              <img src={NO_FOUND} alt="" style={{ width: '140px', borderRadius: '10px' }} />
              <p style={{ fontSize: '16px', fontWeight: 'bold', opacity: .85 }}>Ci dispiace, non c'è ancora nulla qui</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill,minmax(${cardMin},1fr))`, gap: '10px' }}>
              {fp.map((project) => {
                const isFav = favorites.includes(project.id_progetto);
                const isOnAir = project.generi.some(g => g.toLowerCase() === 'onair' || g.toLowerCase() === 'on air');
                const lastEp = history.find(h => h.projectId === project.id_progetto);
                const savedPos = lastEp ? parseInt(localStorage.getItem(rKey(project.id_progetto, lastEp.episodeIndex)) || '0') : 0;
                const savedDur = parseInt(localStorage.getItem(`${project.id_progetto}_dur`) || '0');
                const progressPct = savedDur > 0 && savedPos > 0 ? Math.min(98, (savedPos / savedDur) * 100) : (savedPos > 0 ? 15 : 0);
                return (
                  <div key={project.id_progetto} style={{ background: 'rgba(26,26,26,.9)', borderRadius: '9px', overflow: 'hidden', cursor: 'pointer' }}
                    onClick={() => { if (currentPage === 'history' && lastEp) playVideo(project, lastEp.episodeIndex); else { setSelectedProject(project); window.scrollTo(0, 0); } }}>
                    <div style={{ position: 'relative' }}>
                      <img src={project.url_poster_verticale} alt={project.titolo} style={{ width: '100%', aspectRatio: '2/3', objectFit: 'cover', display: 'block' }} />
                      <button onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); toggleFavorite(project.id_progetto); }}
                        onClick={(e) => { e.stopPropagation(); toggleFavorite(project.id_progetto); }}
                        style={{ position: 'absolute', top: '5px', left: '5px', background: 'rgba(0,0,0,.8)', border: 'none', borderRadius: '50%', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 2 }}>
                        <HeartIcon filled={isFav} size={14} />
                      </button>
                      {progressPct > 0 && (
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '3px', background: 'rgba(0,0,0,.3)' }}>
                          <div style={{ height: '100%', width: `${progressPct}%`, background: C.primary }} />
                        </div>
                      )}
                      {isOnAir && <div style={{ position: 'absolute', top: '5px', right: '5px', background: '#FF0000', borderRadius: '4px', padding: '2px 5px', fontSize: '8px', fontWeight: 'bold', color: 'white' }}>LIVE</div>}
                    </div>
                    <div style={{ padding: '6px 8px' }}>
                      <h3 style={{ fontSize: '12px', marginBottom: '2px', lineHeight: '1.3', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as React.CSSProperties}>{project.titolo}</h3>
                      {currentPage === 'history' && lastEp && project.video_data.is_serie && project.video_data.episodi && (
                        <div style={{ fontSize: '10px', color: C.primary, marginBottom: '2px', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>▶ {project.video_data.episodi[lastEp.episodeIndex]?.titolo_episodio || `Ep. ${lastEp.episodeIndex + 1}`}</div>
                      )}
                      <div style={{ fontSize: '11px', opacity: .65 }}>{project.macro_categoria} • {project.sub_categoria}</div>
                      <div style={{ fontSize: '11px', opacity: .6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {project.generi.filter(g => g.toLowerCase() !== 'onair' && g.toLowerCase() !== 'on air').slice(0, 2).join(', ')}
                      </div>
                      {currentPage === 'history' && (
                        <button onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); removeFromHistory(project.id_progetto); }}
                          onClick={(e) => { e.stopPropagation(); removeFromHistory(project.id_progetto); }}
                          style={{ marginTop: '5px', width: '100%', padding: '4px 0', background: 'rgba(255,20,147,.12)', border: `1px solid ${C.primary}`, borderRadius: '5px', color: C.primary, fontSize: '10px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                          <X size={10} /> Cancella
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Toast exit */}
      {showExitMsg && (
        <div style={{ position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,.96)', border: `2px solid ${C.primary}`, borderRadius: '14px', padding: '12px 26px', fontSize: '15px', fontWeight: 'bold', color: 'white', zIndex: 9999, whiteSpace: 'nowrap', animation: 'toastIn 0.3s ease-out' }}>
          Premi ancora <span style={{ color: C.primary }}>Indietro</span> per uscire
        </div>
      )}



      {/* Modale Sync */}
      {showSyncModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.92)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px' }}>
          <div style={{ background: '#1a0010', border: `2px solid ${C.primary}`, borderRadius: '14px', padding: '20px', width: '100%', maxWidth: '380px', color: 'white' }}>
            <h2 style={{ fontSize: '16px', marginBottom: '16px', textAlign: 'center' }}>🔄 Sincronizzazione</h2>

            {groupName ? (
              <>
                <div style={{ background: 'rgba(255,20,147,.1)', border: `1px solid ${C.primary}`, borderRadius: '8px', padding: '12px', marginBottom: '16px', textAlign: 'center' }}>
                  <p style={{ fontSize: '11px', opacity: .7, margin: '0 0 4px' }}>Gruppo attivo</p>
                  <p style={{ fontSize: '20px', fontWeight: 'bold', color: C.primary, margin: '0 0 4px' }}>{groupName}</p>
                  <p style={{ fontSize: '13px', opacity: .8, margin: 0 }}>PIN: <strong>{groupPin}</strong></p>
                </div>
                <button onClick={() => { pushToGroup(groupName, getLocalSyncData()); setSyncStatus('ok'); setTimeout(() => setSyncStatus('idle'), 1500); }}
                  style={{ width: '100%', padding: '11px', background: syncStatus === 'ok' ? '#22c55e' : `linear-gradient(135deg,${C.primary},${C.secondary})`, border: 'none', borderRadius: '8px', color: 'white', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', marginBottom: '8px' }}>
                  {syncStatus === 'ok' ? '✅ Inviato!' : 'Invia dati ora'}
                </button>
                <button onClick={() => { disconnectGroup(); setGroupName(null); setGroupPin(null); setShowSyncModal(false); }}
                  style={{ width: '100%', padding: '10px', background: 'transparent', border: `1px solid rgba(255,255,255,.3)`, borderRadius: '8px', color: 'white', fontSize: '13px', cursor: 'pointer', marginBottom: '8px' }}>
                  Disconnetti
                </button>
              </>
            ) : syncView === 'main' ? (
              <>
                <p style={{ fontSize: '13px', opacity: .8, textAlign: 'center', marginBottom: '16px' }}>Sincronizza preferiti, cronologia e posizioni video tra tutti i tuoi dispositivi.</p>
                <button onClick={() => setSyncView('create')}
                  style={{ width: '100%', padding: '12px', background: `linear-gradient(135deg,${C.primary},${C.secondary})`, border: 'none', borderRadius: '10px', color: 'white', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', marginBottom: '10px' }}>
                  Crea nuovo gruppo
                </button>
                <button onClick={() => setSyncView('join')}
                  style={{ width: '100%', padding: '12px', background: 'transparent', border: `2px solid ${C.primary}`, borderRadius: '10px', color: 'white', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer' }}>
                  Unisciti a gruppo esistente
                </button>
              </>
            ) : syncView === 'create' ? (
              <>
                <p style={{ fontSize: '13px', opacity: .8, marginBottom: '10px' }}>Scegli un nome per il tuo gruppo:</p>
                <input type="text" placeholder="es. Valentina, FamigliaRossi..." value={syncGroupInput} onChange={e => setSyncGroupInput(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', fontSize: '15px', background: 'rgba(26,26,26,.95)', border: `2px solid ${C.primary}`, borderRadius: '8px', color: 'white', boxSizing: 'border-box' as any, marginBottom: '10px' }} />
                {syncError && <p style={{ color: '#ff6b6b', fontSize: '12px', marginBottom: '8px' }}>{syncError}</p>}
                <button onClick={async () => {
                  if (syncGroupInput.trim().length < 3) { setSyncError('Nome troppo corto (min. 3 caratteri)'); return; }
                  setSyncStatus('loading'); setSyncError('');
                  const result = await createGroup(syncGroupInput.trim());
                  if (result.success && result.pin) {
                    setGroupName(syncGroupInput.trim().toLowerCase().replace(/ /g, '_'));
                    setGroupPin(result.pin);
                    startGroupListener(syncGroupInput.trim().toLowerCase().replace(/ /g, '_'));
                    pushToGroup(syncGroupInput.trim().toLowerCase().replace(/ /g, '_'), getLocalSyncData());
                    setSyncStatus('ok');
                    setTimeout(() => { setSyncStatus('idle'); setShowSyncModal(false); setSyncView('main'); setSyncGroupInput(''); }, 2000);
                    alert(`✅ Gruppo creato!\nNome: ${syncGroupInput.trim()}\nPIN: ${result.pin}\n\nSalva questi dati per connettere altri dispositivi!`);
                  } else { setSyncError(result.error || 'Errore'); setSyncStatus('idle'); }
                }} disabled={syncStatus === 'loading'}
                  style={{ width: '100%', padding: '12px', background: syncStatus === 'ok' ? '#22c55e' : `linear-gradient(135deg,${C.primary},${C.secondary})`, border: 'none', borderRadius: '10px', color: 'white', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', marginBottom: '8px' }}>
                  {syncStatus === 'loading' ? 'Creazione...' : syncStatus === 'ok' ? '✅ Creato!' : 'Crea gruppo'}
                </button>
                <button onClick={() => { setSyncView('main'); setSyncGroupInput(''); setSyncError(''); }}
                  style={{ width: '100%', padding: '10px', background: 'transparent', border: `1px solid rgba(255,255,255,.3)`, borderRadius: '8px', color: 'white', fontSize: '13px', cursor: 'pointer' }}>← Indietro</button>
              </>
            ) : (
              <>
                <p style={{ fontSize: '13px', opacity: .8, marginBottom: '10px' }}>Nome gruppo:</p>
                <input type="text" placeholder="Nome gruppo" value={syncGroupInput} onChange={e => setSyncGroupInput(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', fontSize: '15px', background: 'rgba(26,26,26,.95)', border: `2px solid ${C.primary}`, borderRadius: '8px', color: 'white', boxSizing: 'border-box' as any, marginBottom: '10px' }} />
                <p style={{ fontSize: '13px', opacity: .8, marginBottom: '10px' }}>PIN (6 cifre):</p>
                <input type="number" placeholder="000000" value={syncPinInput} onChange={e => setSyncPinInput(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', fontSize: '20px', background: 'rgba(26,26,26,.95)', border: `2px solid ${C.primary}`, borderRadius: '8px', color: 'white', boxSizing: 'border-box' as any, textAlign: 'center', letterSpacing: '4px', marginBottom: '10px' }} />
                {syncError && <p style={{ color: '#ff6b6b', fontSize: '12px', marginBottom: '8px' }}>{syncError}</p>}
                <button onClick={async () => {
                  if (syncGroupInput.trim().length < 3 || syncPinInput.length !== 6) { setSyncError('Inserisci nome e PIN a 6 cifre'); return; }
                  setSyncStatus('loading'); setSyncError('');
                  const result = await joinGroup(syncGroupInput.trim(), syncPinInput);
                  if (result.success) {
                    const gn = syncGroupInput.trim().toLowerCase().replace(/ /g, '_');
                    setGroupName(gn); setGroupPin(syncPinInput);
                    if (result.data) applyRemoteData(result.data);
                    startGroupListener(gn);
                    pushToGroup(gn, getLocalSyncData());
                    setSyncStatus('ok');
                    setTimeout(() => { setSyncStatus('idle'); setShowSyncModal(false); setSyncView('main'); setSyncGroupInput(''); setSyncPinInput(''); }, 1500);
                  } else { setSyncError(result.error || 'Errore'); setSyncStatus('idle'); }
                }} disabled={syncStatus === 'loading'}
                  style={{ width: '100%', padding: '12px', background: syncStatus === 'ok' ? '#22c55e' : `linear-gradient(135deg,${C.primary},${C.secondary})`, border: 'none', borderRadius: '10px', color: 'white', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', marginBottom: '8px' }}>
                  {syncStatus === 'loading' ? 'Connessione...' : syncStatus === 'ok' ? '✅ Connesso!' : 'Unisciti'}
                </button>
                <button onClick={() => { setSyncView('main'); setSyncGroupInput(''); setSyncPinInput(''); setSyncError(''); }}
                  style={{ width: '100%', padding: '10px', background: 'transparent', border: `1px solid rgba(255,255,255,.3)`, borderRadius: '8px', color: 'white', fontSize: '13px', cursor: 'pointer' }}>← Indietro</button>
              </>
            )}

            {!groupName && (
              <button onClick={() => { setShowSyncModal(false); setSyncView('main'); setSyncGroupInput(''); setSyncPinInput(''); setSyncError(''); setSyncStatus('idle'); }}
                style={{ width: '100%', padding: '10px', background: 'transparent', border: `1px solid rgba(255,255,255,.2)`, borderRadius: '8px', color: 'white', fontSize: '13px', cursor: 'pointer', marginTop: '8px' }}>
                Chiudi
              </button>
            )}
            {groupName && (
              <button onClick={() => setShowSyncModal(false)}
                style={{ width: '100%', padding: '10px', background: 'transparent', border: `1px solid rgba(255,255,255,.2)`, borderRadius: '8px', color: 'white', fontSize: '13px', cursor: 'pointer', marginTop: '0' }}>
                Chiudi
              </button>
            )}
          </div>
        </div>
      )}
    </div>
    </>
  );
};

export default MyDramaApp;
