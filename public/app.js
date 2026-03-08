(function initDashboardRuntime() {
const { useCallback, useEffect, useMemo, useRef, useState } = React;
const { createRoot } = ReactDOM;
const h = React.createElement;
const authModule = window.RDDAppAuth || {};
const helpers = window.RDDHelpers || {};
const {
  extractGoalKeywords,
  computeHeuristicScore,
  computeHeuristicDetails,
  getAutoRefreshPlan,
} = helpers;
const {
  DEFAULT_API_URL,
  DEFAULT_SUBS,
  STARTER_PACKS,
  POPULAR_SUBREDDITS,
  UPVOTE_PRESETS,
  COMMENT_PRESETS,
  AI_RELEVANCE_PRESETS,
  AUTO_REFRESH_OPTIONS,
  MIN_AUTO_REFRESH_MINUTES,
  DEFAULT_OPENROUTER_MODEL,
  AI_PROMPT_VERSION,
  DEFAULT_LLM_POST_LIMIT,
  LLM_SCORE_MORE_STEP,
  MAX_LLM_POST_LIMIT,
  LATEST_MODEL_COUNT,
  AI_CACHE_EXPIRY_MS,
  AI_PRESETS,
  FALLBACK_MODELS,
} = window.RDDAppConfig || {};
const {
  formatTimeUntil,
  normalizeSubredditName,
  timeAgo,
  formatSubs,
  formatNumber,
  truncateText,
  formatModelDate,
  getModelTimestamp,
  hashGoals,
  getPostAgeHours,
  buildRelevanceDebug,
  suggestPreset,
  percentileValue,
  formatVelocity,
  buildScoringPromptPreview,
  aiScoreLabel,
  buildWhyLine,
  isFreePricing,
  inferModelSpeed,
  formatCostHint,
  parseNumberFilter,
  renderBody,
} = window.RDDAppUtils || {};
    function App() {
      const [subs, setSubs] = useState(() => {
        try {
          let saved = localStorage.getItem('dashboard_subs');
          if (saved) return JSON.parse(saved);
          saved = localStorage.getItem('dashboard_subs_backup');
          if (saved) {
            const parsed = JSON.parse(saved);
            localStorage.setItem('dashboard_subs', saved);
            return parsed;
          }
        } catch (error) {}
        return DEFAULT_SUBS;
      });
      const [mode, setMode] = useState('new');
      const [time, setTime] = useState('day');
      const [days, setDays] = useState(1);
      const [limit, setLimit] = useState(100);
      const [maxPages, setMaxPages] = useState(() => {
        try {
          const saved = localStorage.getItem('dashboard_max_pages');
          if (saved) return Math.max(1, Math.min(10, Number(saved) || 5));
        } catch (error) {}
        return 5;
      });
      const [loading, setLoading] = useState(false);
      const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(() => {
        try {
          return localStorage.getItem('dashboard_auto_refresh_enabled') === '1';
        } catch (error) { return false; }
      });
      const [autoRefreshInterval, setAutoRefreshInterval] = useState(() => {
        try {
          const saved = Number(localStorage.getItem('dashboard_auto_refresh_interval'));
          if (Number.isFinite(saved)) {
            return Math.min(60, Math.max(MIN_AUTO_REFRESH_MINUTES, Math.round(saved)));
          }
        } catch (error) {}
        return 10;
      });
      const [error, setError] = useState('');
      const [needsAuth, setNeedsAuth] = useState(false);
      const [data, setData] = useState(() => {
        try {
          const saved = localStorage.getItem('dashboard_data');
          if (saved) {
            const parsed = JSON.parse(saved);
            // Validate structure
            if (Array.isArray(parsed) && parsed.every(item => item.subreddit && Array.isArray(item.posts))) {
              return parsed;
            }
          }
        } catch (error) {}
        return [];
      });
      const [selectedSub, setSelectedSub] = useState('ALL');
      const [selectedPost, setSelectedPost] = useState(null);
      const [fetchedAt, setFetchedAt] = useState(() => {
        try {
          const saved = localStorage.getItem('dashboard_fetched_at');
          if (saved) {
            const timestamp = Number(saved);
            if (timestamp > 0) return timestamp;
          }
        } catch (error) {}
        return null;
      });
      const [keyword, setKeyword] = useState('');
      const [fetchMethod, setFetchMethod] = useState('server');
      const [authenticated, setAuthenticated] = useState(false);
      const [authChecking, setAuthChecking] = useState(true);
      const [settingsOpen, setSettingsOpen] = useState(false);
      const [addSubOpen, setAddSubOpen] = useState(false);
      const [addSubInput, setAddSubInput] = useState('');
      const [minUpvoteFilter, setMinUpvoteFilter] = useState('');
      const [minCommentFilter, setMinCommentFilter] = useState('');
      const [minAiRelevance, setMinAiRelevance] = useState('');
      const [sortBy, setSortBy] = useState('date');
      const [sortOrder, setSortOrder] = useState('desc');
      const [nextRefreshAt, setNextRefreshAt] = useState(null);
      const [lastAutoRefreshAt, setLastAutoRefreshAt] = useState(null);
      const [rateLimitPauseUntil, setRateLimitPauseUntil] = useState(null);
      const [detailCollapsed, setDetailCollapsed] = useState(false);
      const [darkMode, setDarkMode] = useState(() => {
        try {
          const saved = localStorage.getItem('dashboard_dark_mode');
          if (saved !== null) return saved === '1';
          return window.matchMedia('(prefers-color-scheme: dark)').matches;
        } catch { return false; }
      });
      const [hiddenPosts, setHiddenPosts] = useState(() => {
        try {
          const saved = localStorage.getItem('dashboard_hidden_posts');
          if (saved) {
            const arr = JSON.parse(saved);
            return new Set(Array.isArray(arr) ? arr : []);
          }
        } catch {}
        return new Set();
      });
      const [activePostMenu, setActivePostMenu] = useState(null);
      const [hoverPost, setHoverPost] = useState(null);
      const hoverTimeoutRef = useRef(null);
      const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
        try { return localStorage.getItem('dashboard_notifications') === '1'; } catch { return false; }
      });
      const [upvoteThreshold, setUpvoteThreshold] = useState(() => {
        try { return Number(localStorage.getItem('dashboard_upvote_threshold')) || 100; } catch { return 100; }
      });
      const [alertKeywords, setAlertKeywords] = useState(() => {
        try { return localStorage.getItem('dashboard_alert_keywords') || ''; } catch { return ''; }
      });
      const [previousPostScores, setPreviousPostScores] = useState(new Map());
      const [notifyHighRelevance, setNotifyHighRelevance] = useState(() => {
        try { return localStorage.getItem('dashboard_notify_high_relevance') === '1'; } catch { return false; }
      });
      const [highRelevanceThreshold, setHighRelevanceThreshold] = useState(() => {
        try { 
          const val = Number(localStorage.getItem('dashboard_high_relevance_threshold')) || 4;
          // Clamp to valid range 0-5 (AI scores only go up to 5)
          return Math.max(0, Math.min(5, val));
        } catch { return 4; }
      });
      const [notifiedHighRelevancePostIds, setNotifiedHighRelevancePostIds] = useState(() => new Set());
      
      // Validate threshold is within valid range (0-5)
      useEffect(() => {
        if (highRelevanceThreshold > 5) {
          setHighRelevanceThreshold(4);
        } else if (highRelevanceThreshold < 0) {
          setHighRelevanceThreshold(0);
        }
      }, [highRelevanceThreshold]);
      const [mobileView, setMobileView] = useState('posts');
      const [touchStart, setTouchStart] = useState(null);
      const [aiGoals, setAiGoals] = useState(() => {
        try { return localStorage.getItem('dashboard_ai_goals') || ''; } catch { return ''; }
      });
      const [aiContext, setAiContext] = useState(() => {
        try { return localStorage.getItem('dashboard_ai_context') || ''; } catch { return ''; }
      });
      const [aiAvoid, setAiAvoid] = useState(() => {
        try { return localStorage.getItem('dashboard_ai_avoid') || ''; } catch { return ''; }
      });
      const [aiExamplePerfect, setAiExamplePerfect] = useState(() => {
        try { return localStorage.getItem('dashboard_ai_example_perfect') || ''; } catch { return ''; }
      });
      const [aiExampleStrong, setAiExampleStrong] = useState(() => {
        try { return localStorage.getItem('dashboard_ai_example_strong') || ''; } catch { return ''; }
      });
      const [aiExampleReject, setAiExampleReject] = useState(() => {
        try { return localStorage.getItem('dashboard_ai_example_reject') || ''; } catch { return ''; }
      });
      const [aiEnabled, setAiEnabled] = useState(() => {
        try {
          const saved = localStorage.getItem('dashboard_ai_enabled');
          return saved !== null ? saved === '1' : Boolean(localStorage.getItem('dashboard_ai_goals'));
        } catch { return false; }
      });
      const [aiPresetDismissed, setAiPresetDismissed] = useState(() => {
        try { return localStorage.getItem('dashboard_ai_preset_dismissed') === '1'; } catch { return false; }
      });
      const [aiPresetId, setAiPresetId] = useState(() => {
        try { return localStorage.getItem('dashboard_ai_preset_id') || ''; } catch { return ''; }
      });
      const [openRouterApiKey, setOpenRouterApiKey] = useState('');
      const [secureKeyStatus, setSecureKeyStatus] = useState({ hasKey: false, keyPreview: null, source: 'none', checking: true });
      const [savingSecureKey, setSavingSecureKey] = useState(false);
      const [openRouterModel, setOpenRouterModel] = useState(() => {
        try { return localStorage.getItem('dashboard_openrouter_model') || DEFAULT_OPENROUTER_MODEL; } catch { return DEFAULT_OPENROUTER_MODEL; }
      });
      const [aiLlmPostLimit, setAiLlmPostLimit] = useState(() => {
        try { return Number(localStorage.getItem('dashboard_ai_llm_limit')) || DEFAULT_LLM_POST_LIMIT; } catch { return DEFAULT_LLM_POST_LIMIT; }
      });
      const AI_FIXED_TEMPERATURE = 0;
      const AI_FIXED_TOP_P = 1;
      const [showAiReasons, setShowAiReasons] = useState(() => {
        try { return localStorage.getItem('dashboard_show_ai_reasons') === '1'; } catch { return true; }
      });
      const [postRelevanceScores, setPostRelevanceScores] = useState(new Map());
      const [postRelevanceMetadata, setPostRelevanceMetadata] = useState(new Map());
      const [scoresVersion, setScoresVersion] = useState(0); // Version counter to force useMemo recalculation
      const [aiRankingLoading, setAiRankingLoading] = useState(false);
      const [aiScoresStale, setAiScoresStale] = useState(false);
      const [aiRankingError, setAiRankingError] = useState(null);
      const [aiShowModelKey, setAiShowModelKey] = useState(() => !secureKeyStatus.hasKey);
      const [aiShowPromptPreview, setAiShowPromptPreview] = useState(false);
      const [availableModels, setAvailableModels] = useState([]);
      const [modelsLoading, setModelsLoading] = useState(false);
      const [modelsError, setModelsError] = useState('');
      const [showAllModels, setShowAllModels] = useState(false);
      const [aiAdvancedOpen, setAiAdvancedOpen] = useState(false);
      const [snapshotInfo, setSnapshotInfo] = useState(() => {
        try {
          const saved = localStorage.getItem('dashboard_snapshot_info');
          return saved ? JSON.parse(saved) : null;
        } catch {
          return null;
        }
      });
      const loadingRef = useRef(false);
      const addSubInputRef = useRef(null);
      const aiRankingRequestIdRef = useRef(0);

      useEffect(() => { loadingRef.current = loading; }, [loading]);

      // Persist subs
      useEffect(() => {
        try {
          const subsJson = JSON.stringify(subs);
          localStorage.setItem('dashboard_subs', subsJson);
          localStorage.setItem('dashboard_subs_backup', subsJson);
        } catch (e) {}
      }, [subs]);

      useEffect(() => {
        try { localStorage.setItem('dashboard_max_pages', String(maxPages)); } catch {}
      }, [maxPages]);

      useEffect(() => {
        try { localStorage.setItem('dashboard_auto_refresh_enabled', autoRefreshEnabled ? '1' : '0'); } catch {}
      }, [autoRefreshEnabled]);

      useEffect(() => {
        try { localStorage.setItem('dashboard_auto_refresh_interval', String(autoRefreshInterval)); } catch {}
      }, [autoRefreshInterval]);

      // Dark mode persistence and class toggle
      useEffect(() => {
        try { localStorage.setItem('dashboard_dark_mode', darkMode ? '1' : '0'); } catch {}
        if (darkMode) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }, [darkMode]);

      // Hidden posts persistence (limit to 1000 entries)
      useEffect(() => {
        try {
          const MAX_HIDDEN_POSTS = 1000;
          let arr = Array.from(hiddenPosts);
          if (arr.length > MAX_HIDDEN_POSTS) {
            arr = arr.slice(-MAX_HIDDEN_POSTS);
          }
          localStorage.setItem('dashboard_hidden_posts', JSON.stringify(arr));
        } catch {}
      }, [hiddenPosts]);

      // Notification settings persistence
      useEffect(() => {
        try { localStorage.setItem('dashboard_notifications', notificationsEnabled ? '1' : '0'); } catch {}
      }, [notificationsEnabled]);
      useEffect(() => {
        try { localStorage.setItem('dashboard_upvote_threshold', String(upvoteThreshold)); } catch {}
      }, [upvoteThreshold]);
      useEffect(() => {
        try { localStorage.setItem('dashboard_alert_keywords', alertKeywords); } catch {}
      }, [alertKeywords]);
      useEffect(() => {
        try { localStorage.setItem('dashboard_notify_high_relevance', notifyHighRelevance ? '1' : '0'); } catch {}
      }, [notifyHighRelevance]);
      useEffect(() => {
        try { localStorage.setItem('dashboard_high_relevance_threshold', String(highRelevanceThreshold)); } catch {}
      }, [highRelevanceThreshold]);

      // AI settings persistence
      useEffect(() => {
        try { localStorage.setItem('dashboard_ai_goals', aiGoals); } catch {}
      }, [aiGoals]);
      useEffect(() => {
        try { localStorage.setItem('dashboard_ai_context', aiContext); } catch {}
      }, [aiContext]);
      useEffect(() => {
        try { localStorage.setItem('dashboard_ai_avoid', aiAvoid); } catch {}
      }, [aiAvoid]);
      useEffect(() => {
        try { localStorage.setItem('dashboard_ai_example_perfect', aiExamplePerfect); } catch {}
      }, [aiExamplePerfect]);
      useEffect(() => {
        try { localStorage.setItem('dashboard_ai_example_strong', aiExampleStrong); } catch {}
      }, [aiExampleStrong]);
      useEffect(() => {
        try { localStorage.setItem('dashboard_ai_example_reject', aiExampleReject); } catch {}
      }, [aiExampleReject]);
      useEffect(() => {
        try { localStorage.setItem('dashboard_ai_enabled', aiEnabled ? '1' : '0'); } catch {}
      }, [aiEnabled]);
      useEffect(() => {
        try { localStorage.setItem('dashboard_ai_preset_dismissed', aiPresetDismissed ? '1' : '0'); } catch {}
      }, [aiPresetDismissed]);
      useEffect(() => {
        try { localStorage.setItem('dashboard_ai_preset_id', aiPresetId); } catch {}
      }, [aiPresetId]);
      useEffect(() => {
        try { localStorage.setItem('dashboard_openrouter_model', openRouterModel); } catch {}
      }, [openRouterModel]);
      useEffect(() => {
        try { localStorage.setItem('dashboard_ai_llm_limit', String(aiLlmPostLimit)); } catch {}
      }, [aiLlmPostLimit]);

      useEffect(() => {
        try { localStorage.removeItem('dashboard_openrouter_api_key'); } catch {}
      }, []);

      // Persist fetched data and timestamp
      useEffect(() => {
        try {
          if (data && data.length > 0) {
            localStorage.setItem('dashboard_data', JSON.stringify(data));
          }
        } catch (e) {}
      }, [data]);

      useEffect(() => {
        try {
          if (fetchedAt) {
            localStorage.setItem('dashboard_fetched_at', String(fetchedAt));
          }
        } catch {}
      }, [fetchedAt]);

      useEffect(() => {
        try {
          if (snapshotInfo) {
            localStorage.setItem('dashboard_snapshot_info', JSON.stringify(snapshotInfo));
          } else {
            localStorage.removeItem('dashboard_snapshot_info');
          }
        } catch {}
      }, [snapshotInfo]);

      // Restore and apply AI scores on initial load with restored data
      const hasRestoredScoresRef = useRef(false);
      useEffect(() => {
        // Only run once when data is available, AI is enabled, and we haven't restored scores yet
        if (data.length > 0 && aiEnabled && aiGoals && aiGoals.trim() && postRelevanceScores.size === 0 && !hasRestoredScoresRef.current) {
          hasRestoredScoresRef.current = true;
          // Load cached scores
          try {
            const cacheStr = localStorage.getItem('dashboard_ai_scores_cache');
            if (cacheStr) {
              const cache = JSON.parse(cacheStr);
              const now = Date.now();
              const CACHE_EXPIRY = AI_CACHE_EXPIRY_MS;
              const CACHE_VERSION_KEY = 'dashboard_ai_cache_version';
              const combinedGoals = `${aiGoals.trim()}||${(aiContext || '').trim()}`;
              const currentGoalsHash = hashGoals(combinedGoals);
              const currentCacheVersion = `${currentGoalsHash}_${AI_PROMPT_VERSION}_${openRouterModel}`;
              const savedCacheVersion = localStorage.getItem(CACHE_VERSION_KEY);
              const cacheVersionMismatch = savedCacheVersion && savedCacheVersion !== currentCacheVersion;
              if (cacheVersionMismatch) {
                setAiScoresStale(true);
              }
              const rawScores = new Map();
              const metadata = new Map();
              let staleByAge = false;
              
              // Get all post IDs from current data
              const allPosts = data.flatMap(group => group.posts || []);
              
              // Load cached scores for posts that exist in cache
              allPosts.forEach(post => {
                const postId = String(post.id || post.data?.id || '');
                if (!postId || !cache[postId]) return;
                const cachedData = cache[postId];
                if (cachedData.timestamp && cachedData.score !== null && cachedData.score !== undefined) {
                  if ((now - cachedData.timestamp) >= CACHE_EXPIRY) {
                    staleByAge = true;
                  }
                  rawScores.set(postId, cachedData.score);
                  metadata.set(postId, {
                    confidence: cachedData.confidence || 'medium',
                    reason: cachedData.reason || '',
                    source: cachedData.source || 'cache-restored',
                    debug: cachedData.debug || null,
                  });
                }
              });
              
              if (rawScores.size > 0) {
                const highRelevanceCount = Array.from(rawScores.values()).filter(s => s !== null && s !== undefined && s >= 4).length;
                setPostRelevanceScores(rawScores);
                setPostRelevanceMetadata(metadata);
                setScoresVersion(v => v + 1);
                setAiScoresStale(Boolean(cacheVersionMismatch || staleByAge));
              }
            }
          } catch (error) {}
        }
      }, [data, aiEnabled, aiGoals, aiContext, postRelevanceScores.size, openRouterModel, AI_PROMPT_VERSION]); // Run when data or AI settings change

      // Touch/swipe gesture handlers
      const handleTouchStart = useCallback((e) => {
        setTouchStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
      }, []);
      const handleTouchEnd = useCallback((e) => {
        if (!touchStart) return;
        const deltaX = e.changedTouches[0].clientX - touchStart.x;
        const deltaY = e.changedTouches[0].clientY - touchStart.y;
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
          if (deltaX < 0) {
            // Swipe left
            if (mobileView === 'subs') setMobileView('posts');
            else if (mobileView === 'posts') setMobileView('detail');
          } else {
            // Swipe right
            if (mobileView === 'detail') setMobileView('posts');
            else if (mobileView === 'posts') setMobileView('subs');
          }
        }
        setTouchStart(null);
      }, [touchStart, mobileView]);

      // Request notification permission
      const requestNotificationPermission = useCallback(async () => {
        if (!('Notification' in window)) {
          alert('This browser does not support notifications');
          return;
        }
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          setNotificationsEnabled(true);
        }
      }, []);

      // Send notification
      const sendNotification = useCallback((title, body) => {
        if (notificationsEnabled && Notification.permission === 'granted') {
          new Notification(title, { body, icon: '/favicon.ico' });
        }
      }, [notificationsEnabled]);

      // Check auth on mount
      useEffect(() => {
        let cancelled = false;
        async function checkAuth() {
          setAuthChecking(true);
          try {
            const response = await fetch('/api/auth/status', { cache: 'no-store' });
            if (!response.ok) throw new Error('Failed to check auth status');
            const payload = await response.json();
            if (!cancelled) setAuthenticated(Boolean(payload.authenticated));
          } catch (e) {
            if (!cancelled) setAuthenticated(false);
          } finally {
            if (!cancelled) setAuthChecking(false);
          }
        }
        checkAuth();
        return () => { cancelled = true; };
      }, []);

      // Check secure API key status on mount
      useEffect(() => {
        let cancelled = false;
        async function checkSecureKey() {
          try {
            const response = await fetch('/api/settings/openrouter-key', {
              credentials: 'include',
              cache: 'no-store'
            });
            if (response.ok) {
              const data = await response.json();
              if (!cancelled) {
                setSecureKeyStatus({
                  hasKey: data.hasKey,
                  keyPreview: data.keyPreview,
                  source: data.source || 'none',
                  checking: false
                });
              }
            } else {
              if (!cancelled) setSecureKeyStatus({ hasKey: false, keyPreview: null, source: 'none', checking: false });
            }
          } catch (e) {
            if (!cancelled) setSecureKeyStatus({ hasKey: false, keyPreview: null, source: 'none', checking: false });
          }
        }
        checkSecureKey();
        return () => { cancelled = true; };
      }, []); // Only run on mount - no dependencies needed

      const modelsFetchRef = useRef({ inFlight: false, loaded: false });
      const loadOpenRouterModels = useCallback(async () => {
        if (modelsFetchRef.current.inFlight) return;
        if (modelsFetchRef.current.loaded || availableModels.length > 0) return;
        modelsFetchRef.current.inFlight = true;
        setModelsLoading(true);
        setModelsError('');
        try {
          const response = await fetch('/api/openrouter/models', {
            credentials: 'include',
            cache: 'no-store'
          });
          if (!response.ok) {
            let message = '';
            try {
              const errorJson = await response.json();
              message = errorJson.message || errorJson.error || '';
            } catch {
              message = await response.text();
            }
            throw new Error(message || `HTTP ${response.status}`);
          }
          const data = await response.json();
          const models = Array.isArray(data.models) ? data.models : [];
          setAvailableModels(models);
          modelsFetchRef.current.loaded = true;
        } catch (error) {
          setAvailableModels([]);
          setModelsError(error.message || 'Failed to load models');
        } finally {
          modelsFetchRef.current.inFlight = false;
          setModelsLoading(false);
        }
      }, [availableModels.length]);

      useEffect(() => {
        if (!settingsOpen || !aiEnabled) return;
        loadOpenRouterModels();
      }, [settingsOpen, aiEnabled, loadOpenRouterModels]);

      const allPosts = useMemo(() => {
        const rows = [];
        for (const group of data) {
          for (const post of group.posts || []) rows.push(post);
        }
        rows.sort((a, b) => (b.created_utc || 0) - (a.created_utc || 0));
        return rows;
      }, [data]);

      const aiPresetSuggestion = useMemo(() => {
        return suggestPreset({
          subs,
          posts: allPosts,
          presets: AI_PRESETS,
        });
      }, [subs, allPosts]);

      const filteredBySub = useMemo(() => {
        if (selectedSub === 'ALL') return allPosts;
        const selected = selectedSub.toLowerCase();
        return allPosts.filter(post => post.subreddit?.toLowerCase() === selected);
      }, [allPosts, selectedSub]);

      const visiblePosts = useMemo(() => {
        const q = keyword.trim().toLowerCase();
        const minScore = parseNumberFilter(minUpvoteFilter);
        const minCommentsValue = parseNumberFilter(minCommentFilter);
        const minAiScore = parseNumberFilter(minAiRelevance);

        const filtered = filteredBySub.filter(post => {
          if (hiddenPosts.has(post.id)) return false;
          if (q) {
            const title = post.title ? post.title.toLowerCase() : '';
            const selftext = post.selftext ? post.selftext.toLowerCase() : '';
            if (!title.includes(q) && !selftext.includes(q)) return false;
          }
          const score = Number(post.score) || 0;
          if (minScore !== null && score < minScore) return false;
          const comments = Number(post.num_comments) || 0;
          if (minCommentsValue !== null && comments < minCommentsValue) return false;
          // AI relevance filter
          if (minAiScore !== null) {
            const aiScore = postRelevanceScores.get(String(post.id));
            if (aiScore === null || aiScore === undefined || aiScore < minAiScore) return false;
          }
          return true;
        });

        const shouldSort = sortBy !== 'date' || sortOrder !== 'desc';
        if (!shouldSort) return filtered;

        const multiplier = sortOrder === 'asc' ? 1 : -1;
        const nowSeconds = Date.now() / 1000;
        const sorted = [...filtered].sort((a, b) => {
          let delta = 0;
          let ignoreMultiplier = false;
          switch (sortBy) {
            case 'upvotes': delta = (Number(a.score) || 0) - (Number(b.score) || 0); break;
            case 'comments': delta = (Number(a.num_comments) || 0) - (Number(b.num_comments) || 0); break;
            case 'velocity-upvotes': {
              const ageA = getPostAgeHours(a, nowSeconds);
              const ageB = getPostAgeHours(b, nowSeconds);
              const velA = (Number(a.score) || 0) / ageA;
              const velB = (Number(b.score) || 0) / ageB;
              delta = velA - velB;
              break;
            }
            case 'velocity-comments': {
              const ageA = getPostAgeHours(a, nowSeconds);
              const ageB = getPostAgeHours(b, nowSeconds);
              const velA = (Number(a.num_comments) || 0) / ageA;
              const velB = (Number(b.num_comments) || 0) / ageB;
              delta = velA - velB;
              break;
            }
            case 'ai-relevance': {
              const scoreA = postRelevanceScores.get(String(a.id));
              const scoreB = postRelevanceScores.get(String(b.id));
              const metaA = postRelevanceMetadata.get(String(a.id));
              const metaB = postRelevanceMetadata.get(String(b.id));
              const sourceRank = (meta) => {
                if (meta?.source === 'llm') return 0;
                if (meta?.source === 'heuristic') return 1;
                return 2;
              };
              const rankA = sourceRank(metaA);
              const rankB = sourceRank(metaB);
              // Posts without scores (undefined or null) go to the end
              const hasScoreA = scoreA !== undefined && scoreA !== null;
              const hasScoreB = scoreB !== undefined && scoreB !== null;
              if (!hasScoreA && !hasScoreB) {
                delta = 0; // Both have no score, maintain order
              } else if (!hasScoreA) {
                delta = 1; // a has no score, should go after b
                ignoreMultiplier = true;
              } else if (!hasScoreB) {
                delta = -1; // b has no score, should go after a
                ignoreMultiplier = true;
              } else {
                delta = scoreA - scoreB; // Compare all scored posts together first
                if (delta === 0 && rankA !== rankB) {
                  delta = rankA - rankB; // Use source only as a tie-breaker
                  ignoreMultiplier = true;
                }
              }
              break;
            }
            default: delta = (Number(a.created_utc) || 0) - (Number(b.created_utc) || 0); break;
          }
          if (delta === 0) return 0;
          return ignoreMultiplier ? delta : delta * multiplier;
        });
        return sorted;
      }, [filteredBySub, keyword, minUpvoteFilter, minCommentFilter, minAiRelevance, sortBy, sortOrder, hiddenPosts, postRelevanceScores, scoresVersion]);

      const velocityMeta = useMemo(() => {
        const nowSeconds = Date.now() / 1000;
        const entries = visiblePosts.map(post => {
          const ageHours = getPostAgeHours(post, nowSeconds);
          const upvotesPerHour = (Number(post.score) || 0) / ageHours;
          const commentsPerHour = (Number(post.num_comments) || 0) / ageHours;
          return {
            id: String(post.id),
            ageHours,
            upvotesPerHour,
            commentsPerHour,
          };
        });

        const upvoteRates = entries.map(e => e.upvotesPerHour).sort((a, b) => a - b);
        const commentRates = entries.map(e => e.commentsPerHour).sort((a, b) => a - b);
        const upvoteThreshold = percentileValue(upvoteRates, 0.9);
        const commentThreshold = percentileValue(commentRates, 0.9);
        const map = new Map(entries.map(e => [e.id, e]));
        const spiking = new Set(entries.filter(e =>
          e.ageHours <= 24 &&
          (e.upvotesPerHour >= upvoteThreshold || e.commentsPerHour >= commentThreshold)
        ).map(e => e.id));

        return { map, spiking, upvoteThreshold, commentThreshold };
      }, [visiblePosts]);

      const aiScoreStats = useMemo(() => {
        const stats = { total: allPosts.length, scored: 0, llm: 0, high: 0, visibleHigh: 0 };
        if (!allPosts.length) return stats;
        for (const post of allPosts) {
          const postId = String(post.id);
          const score = postRelevanceScores.get(postId);
          if (score !== null && score !== undefined) {
            stats.scored += 1;
            if (score >= 4) stats.high += 1;
          }
          const meta = postRelevanceMetadata.get(postId);
          if (meta && meta.source === 'llm') stats.llm += 1;
        }
        for (const post of visiblePosts) {
          const score = postRelevanceScores.get(String(post.id));
          if (score !== null && score !== undefined && score >= 4) stats.visibleHigh += 1;
        }
        return stats;
      }, [allPosts, visiblePosts, postRelevanceScores, postRelevanceMetadata, scoresVersion]);

      const { maxScore, maxComments } = useMemo(() => {
        let maxScore = 0, maxComments = 0;
        for (const post of allPosts) {
          const score = Number(post.score);
          const comments = Number(post.num_comments);
          if (Number.isFinite(score)) maxScore = Math.max(maxScore, score);
          if (Number.isFinite(comments)) maxComments = Math.max(maxComments, comments);
        }
        return { maxScore, maxComments };
      }, [allPosts]);

      const subMetaMap = useMemo(() => {
        const map = new Map();
        for (const group of data) map.set(group.subreddit, group.meta || null);
        return map;
      }, [data]);

      const subPartialMap = useMemo(() => {
        const map = new Map();
        for (const group of data) map.set(group.subreddit, Boolean(group.partial));
        return map;
      }, [data]);

      const runAiRanking = useCallback(async ({ perSub, triggeredByAuto = false, llmPostLimit = aiLlmPostLimit } = {}) => {
        if (!aiEnabled || !aiGoals || !aiGoals.trim()) {
          setPostRelevanceScores(new Map());
          setPostRelevanceMetadata(new Map());
          setScoresVersion(v => v + 1);
          return;
        }

        const groups = Array.isArray(perSub) ? perSub : data;
        const effectiveLlmLimit = Math.max(10, Math.min(MAX_LLM_POST_LIMIT, Number(llmPostLimit) || DEFAULT_LLM_POST_LIMIT));

        try {
          // Cache versioning: invalidate if goals, model, or prompt version changed
          const combinedGoals = `${aiGoals.trim()}||${(aiContext || '').trim()}`;
          const currentGoalsHash = hashGoals(combinedGoals);
          const CACHE_VERSION_KEY = 'dashboard_ai_cache_version';
          const MODEL_KEY = 'dashboard_ai_model';
          const PROMPT_VERSION_KEY = 'dashboard_ai_prompt_version';
          const currentCacheVersion = `${currentGoalsHash}_${AI_PROMPT_VERSION}_${openRouterModel}`;
          let latestPromptVersion = AI_PROMPT_VERSION;
          let latestModel = openRouterModel;
          
          try {
            const savedCacheVersion = localStorage.getItem(CACHE_VERSION_KEY);
            if (savedCacheVersion && savedCacheVersion !== currentCacheVersion) {
              localStorage.removeItem('dashboard_ai_scores_cache');
            }
            localStorage.setItem(CACHE_VERSION_KEY, currentCacheVersion);
          } catch {}

          // Load cached scores and metadata with version check
          // NOTE: We cache raw LLM scores (0-5) and always recalibrate on load
          // This ensures scores are relative to the current visible feed
          let cachedScores = new Map();
          let cachedMetadata = new Map();
          try {
            const cacheStr = localStorage.getItem('dashboard_ai_scores_cache');
            if (cacheStr) {
              const cache = JSON.parse(cacheStr);
              const now = Date.now();
              const CACHE_EXPIRY = AI_CACHE_EXPIRY_MS;
              Object.entries(cache).forEach(([postId, data]) => {
                if (data.timestamp && (now - data.timestamp) < CACHE_EXPIRY) {
                  if (data.score !== null && data.score !== undefined) {
                    cachedScores.set(postId, data.score);
                    // Load metadata if available
                    if (data.source || data.confidence || data.reason) {
                      cachedMetadata.set(postId, {
                        source: data.source || 'llm',
                        confidence: data.confidence || 'medium',
                        reason: data.reason || 'Cached relevance',
                        debug: data.debug || null,
                      });
                    }
                  }
                }
              });
              
              // Clean up expired entries
              const validEntries = Object.entries(cache).filter(([_, data]) => 
                data.timestamp && (now - data.timestamp) < CACHE_EXPIRY && data.score !== null && data.score !== undefined
              );
              if (validEntries.length < Object.keys(cache).length) {
                localStorage.setItem('dashboard_ai_scores_cache', JSON.stringify(Object.fromEntries(validEntries)));
              }
            }
          } catch (cacheError) {}

          // Get all posts
          const allNewPosts = groups.flatMap(g => g.posts || []);
          // Filter out posts that already have cached scores
          const uncachedPosts = allNewPosts.filter(post => !cachedScores.has(String(post.id)));

          if (uncachedPosts.length > 0) {
            const thisRequestId = ++aiRankingRequestIdRef.current;
            setAiRankingError(null);
            setAiRankingLoading(true);
            
            // Two-stage ranking: heuristic prefilter + LLM rerank
            const keywords = extractGoalKeywords(aiGoals.trim());
            
            // Compute heuristic scores for all uncached posts
            const postsWithHeuristic = uncachedPosts.map(post => {
              const details = computeHeuristicDetails
                ? computeHeuristicDetails(post, keywords)
                : { score: computeHeuristicScore(post, keywords), matchedTitle: [], matchedSelftext: [], matchedSubreddit: [], keywordScore: 0, engagementScore: 0, domainBonus: 0 };
              return {
                post,
                heuristicScore: details.score,
                heuristicDetails: details,
              };
            });
            
            // Sort by heuristic score and take top N for LLM ranking
            const MAX_LLM_POSTS = Math.min(effectiveLlmLimit, postsWithHeuristic.length);
            postsWithHeuristic.sort((a, b) => b.heuristicScore - a.heuristicScore);
            const topPosts = postsWithHeuristic.slice(0, MAX_LLM_POSTS).map(x => x.post);
            const remainingPosts = postsWithHeuristic.slice(MAX_LLM_POSTS);
            const heuristicDetailsById = new Map(
              postsWithHeuristic.map(entry => [String(entry.post.id), entry.heuristicDetails])
            );
            
            // Batch posts into chunks of 50 to avoid payload size limits
            const BATCH_SIZE = 50;
            const batches = [];
            for (let i = 0; i < topPosts.length; i += BATCH_SIZE) {
              batches.push(topPosts.slice(i, i + BATCH_SIZE));
            }
            let scoresForHighRelevance = null;
            try {
              const allScores = new Map(cachedScores);
              const allMetadata = new Map(cachedMetadata); // Store metadata for all scored posts
              const cache = {};
              
              // Load existing cache
              try {
                const existingCache = localStorage.getItem('dashboard_ai_scores_cache');
                if (existingCache) {
                  Object.assign(cache, JSON.parse(existingCache));
                }
              } catch {}
              
              // Process batches sequentially to avoid overwhelming the API
              for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
                const batch = batches[batchIdx];
                const batchPostMap = new Map(batch.map(p => [String(p.id), p]));
                try {
                  const response = await fetch('/api/reddit/ai-rank', {
                    method: 'POST',
                    credentials: 'include', // Include cookies for secure API key
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      posts: batch.map(p => ({
                        id: p.id,
                        title: p.title,
                        selftext: p.selftext || '',
                        subreddit: p.subreddit,
                        url: p.reddit_url,
                        external_url: p.external_url,
                        domain: p.domain,
                        score: p.score,
                        num_comments: p.num_comments,
                        created_utc: p.created_utc,
                        link_flair_text: p.link_flair_text,
                      })),
                      userGoals: aiGoals.trim(),
                      userContext: aiContext && aiContext.trim() ? aiContext.trim() : undefined,
                      scoringConfig: {
                        lookingFor: aiGoals.trim(),
                        avoid: aiAvoid && aiAvoid.trim() ? aiAvoid.trim() : undefined,
                        examples: {
                          perfect: aiExamplePerfect && aiExamplePerfect.trim() ? aiExamplePerfect.trim() : undefined,
                          strong: aiExampleStrong && aiExampleStrong.trim() ? aiExampleStrong.trim() : undefined,
                          reject: aiExampleReject && aiExampleReject.trim() ? aiExampleReject.trim() : undefined,
                        },
                      },
                      // Only send key in body if not stored securely (fallback for migration)
                      openRouterApiKey: secureKeyStatus.hasKey ? undefined : (openRouterApiKey.trim() || undefined),
                      openRouterModel: openRouterModel.trim(), // Always required - has default in useState
                      modelTemperature: AI_FIXED_TEMPERATURE,
                      modelTopP: AI_FIXED_TOP_P
                    }),
                  });

                  if (response.ok) {
                    const result = await response.json();
                    const resultPromptVersion = result.promptVersion || AI_PROMPT_VERSION;
                    const resultModel = result.model || openRouterModel;
                    latestPromptVersion = resultPromptVersion;
                    latestModel = resultModel;
                    if (result.model) localStorage.setItem(MODEL_KEY, result.model);
                    if (result.promptVersion) localStorage.setItem(PROMPT_VERSION_KEY, result.promptVersion);
                    const updatedCacheVersion = `${currentGoalsHash}_${resultPromptVersion}_${resultModel}`;
                    if (updatedCacheVersion !== currentCacheVersion) {
                      localStorage.removeItem('dashboard_ai_scores_cache');
                      localStorage.setItem(CACHE_VERSION_KEY, updatedCacheVersion);
                    }
                    // Current format: scores is an object map {postId: score}
                    const scoresObj = result.scores || {};
                    const metadataObj = result.metadata || {};
                    if (scoresObj && typeof scoresObj === 'object' && !Array.isArray(scoresObj)) {
                      Object.entries(scoresObj).forEach(([postId, relevanceScore]) => {
                        const postIdStr = String(postId);
                        // Only cache non-null scores (null means failed to score)
                        if (relevanceScore !== null && relevanceScore !== undefined) {
                          allScores.set(postIdStr, relevanceScore);
                          
                          // Extract metadata if available
                          const meta = metadataObj[postId] || {};
                          const heuristicDetails = heuristicDetailsById.get(postIdStr);
                          allMetadata.set(postIdStr, {
                            source: 'llm',
                            confidence: meta.confidence || 'medium',
                            reason: meta.reason || 'LLM-scored relevance',
                            debug: buildRelevanceDebug({
                              postId: postIdStr,
                              heuristicDetails,
                              postMap: batchPostMap,
                              llmReason: meta.reason,
                              llmConfidence: meta.confidence,
                              source: 'llm',
                            })
                          });
                          
                          cache[postIdStr] = { 
                            score: relevanceScore, 
                            timestamp: Date.now(),
                            version: result.promptVersion || 'v3.1',
                            model: result.model || 'unknown',
                            confidence: meta.confidence || 'medium',
                            reason: meta.reason || 'LLM-scored relevance',
                            source: 'llm',
                            debug: allMetadata.get(postIdStr)?.debug || null,
                          };
                        } else {
                          // Track null scores but don't cache them
                          allScores.set(postIdStr, null);
                        }
                      });
                    }
                    
                  } else {
                    const errorText = await response.text();
                    console.error(`AI ranking API error for batch ${batchIdx + 1}:`, response.status, errorText);
                  }
                } catch (batchError) {
                  console.error(`Error processing batch ${batchIdx + 1}:`, batchError);
                }
                
                // Small delay between batches to avoid rate limiting
                if (batchIdx < batches.length - 1) {
                  await new Promise(resolve => setTimeout(resolve, 500));
                }
              }
              
              // Save updated cache with LRU eviction (max 5000 entries)
              try {
                const MAX_CACHE_ENTRIES = 5000;
                const entries = Object.entries(cache);
                if (entries.length > MAX_CACHE_ENTRIES) {
                  // Sort by timestamp (oldest first) and keep only newest entries
                  entries.sort((a, b) => (a[1].timestamp || 0) - (b[1].timestamp || 0));
                  const toKeep = entries.slice(-MAX_CACHE_ENTRIES);
                  const trimmedCache = Object.fromEntries(toKeep);
                  localStorage.setItem('dashboard_ai_scores_cache', JSON.stringify(trimmedCache));
                } else {
                  localStorage.setItem('dashboard_ai_scores_cache', JSON.stringify(cache));
                }
              } catch (cacheError) {
                // If quota exceeded, clear cache and retry
                if (cacheError.name === 'QuotaExceededError') {
                  try {
                    localStorage.removeItem('dashboard_ai_scores_cache');
                  } catch {}
                }
              }
              
              // Add heuristic scores for remaining posts (map to 0-5 range, will be calibrated)
              remainingPosts.forEach(({ post, heuristicScore, heuristicDetails }) => {
                const postId = String(post.id);
                if (!allScores.has(postId)) {
                  // Heuristic-only scores are capped lower than LLM scores
                  const normalizedScore = Math.min(3, Math.round(heuristicScore * 0.3));
                  allScores.set(postId, normalizedScore);
                  allMetadata.set(postId, { 
                    source: 'heuristic', 
                    confidence: 'low', 
                    reason: 'Keyword-based relevance',
                    debug: buildRelevanceDebug({
                      postId,
                      heuristicDetails,
                      postMap: new Map(allNewPosts.map(p => [String(p.id), p])),
                      source: 'heuristic',
                    })
                  });
                  cache[postId] = {
                    score: normalizedScore,
                    timestamp: Date.now(),
                    version: latestPromptVersion || AI_PROMPT_VERSION,
                    model: latestModel || openRouterModel,
                    confidence: 'low',
                    reason: 'Keyword-based relevance',
                    source: 'heuristic',
                    debug: allMetadata.get(postId)?.debug || null,
                  };
                }
              });
              
              const highRelevanceCount = Array.from(allScores.values()).filter(s => s !== null && s !== undefined && s >= 4).length;

              if (aiRankingRequestIdRef.current !== thisRequestId) return;
              setPostRelevanceScores(allScores);
              setPostRelevanceMetadata(allMetadata);
              setScoresVersion(v => v + 1); // Increment version to trigger useMemo recalculation
              setAiScoresStale(false);
              scoresForHighRelevance = allScores;
            } catch (aiError) {
              console.error('Error in AI ranking batch processing:', aiError);
              if (aiRankingRequestIdRef.current !== thisRequestId) return;
              setPostRelevanceScores(cachedScores);
              setPostRelevanceMetadata(cachedMetadata);
              setScoresVersion(v => v + 1); // Increment version to trigger useMemo recalculation
              scoresForHighRelevance = cachedScores;
            } finally {
              setAiRankingLoading(false);
            }
            // High-relevance notifications (use freshly computed scores)
            if (triggeredByAuto && notificationsEnabled && Notification.permission === 'granted' && notifyHighRelevance && scoresForHighRelevance && scoresForHighRelevance.size > 0) {
                  const threshold = Number(highRelevanceThreshold) || 4;
              const idToPost = new Map(allNewPosts.map(p => [String(p.id), p]));
              const toNotify = [];
              for (const [postId, score] of scoresForHighRelevance.entries()) {
                if (score != null && score >= threshold && !notifiedHighRelevancePostIds.has(postId) && idToPost.has(postId)) {
                  toNotify.push({ postId, post: idToPost.get(postId) });
                }
              }
              toNotify.forEach(({ post }) => {
                new Notification('High relevance post', { body: post.title, icon: '/favicon.ico' });
              });
              if (toNotify.length > 0) {
                const toAdd = toNotify.map(({ postId }) => postId);
                setNotifiedHighRelevancePostIds(prev => {
                  const n = new Set(prev);
                  toAdd.forEach(id => n.add(id));
                  return n.size <= 500 ? n : new Set([...n].slice(-500));
                });
              }
            }
          } else {
            // All posts are cached, use cached scores directly
            const highRelevanceCount = Array.from(cachedScores.values()).filter(s => s !== null && s !== undefined && s >= 4).length;
            setPostRelevanceScores(cachedScores);
            setPostRelevanceMetadata(cachedMetadata);
            setScoresVersion(v => v + 1); // Increment version to trigger useMemo recalculation
            setAiScoresStale(false);
            // High-relevance notifications (use freshly computed scores)
            if (triggeredByAuto && notificationsEnabled && Notification.permission === 'granted' && notifyHighRelevance && cachedScores && cachedScores.size > 0) {
              const threshold = Number(highRelevanceThreshold) || 4;
              const idToPost = new Map(allNewPosts.map(p => [String(p.id), p]));
              const toNotify = [];
              for (const [postId, score] of cachedScores.entries()) {
                if (score != null && score >= threshold && !notifiedHighRelevancePostIds.has(postId) && idToPost.has(postId)) {
                  toNotify.push({ postId, post: idToPost.get(postId) });
                }
              }
              toNotify.forEach(({ post }) => {
                new Notification('High relevance post', { body: post.title, icon: '/favicon.ico' });
              });
              if (toNotify.length > 0) {
                const toAdd = toNotify.map(({ postId }) => postId);
                setNotifiedHighRelevancePostIds(prev => {
                  const n = new Set(prev);
                  toAdd.forEach(id => n.add(id));
                  return n.size <= 500 ? n : new Set([...n].slice(-500));
                });
              }
            }
          }
        } catch (aiError) {
          console.error('Error in AI ranking integration:', aiError);
          setAiRankingLoading(false);
          if (triggeredByAuto) {
            setAiRankingError('AI ranking failed during auto-refresh — scores may be stale.');
          }
        }
      }, [aiEnabled, aiGoals, aiContext, aiAvoid, aiExamplePerfect, aiExampleStrong, aiExampleReject, aiLlmPostLimit, data, extractGoalKeywords, computeHeuristicScore, notificationsEnabled, notifyHighRelevance, highRelevanceThreshold, notifiedHighRelevancePostIds, secureKeyStatus.hasKey, openRouterApiKey, openRouterModel, AI_PROMPT_VERSION]);

      const refresh = useCallback(async (options = {}) => {
        const triggeredByAuto = Boolean(options.triggeredByAuto);
        const forceRefresh = Boolean(options.force);
        if (!subs.length) {
          setNeedsAuth(false);
          setError('Add at least one subreddit to get started.');
          setData([]);
          setFetchedAt(null);
          setSnapshotInfo(null);
          setNextRefreshAt(null);
          return;
        }

        const subsCount = subs.length;
        let effectiveLimit = limit;
        let effectiveMaxPages = maxPages;
        if (subsCount >= 12) {
          effectiveLimit = Math.min(25, effectiveLimit);
          effectiveMaxPages = Math.min(1, effectiveMaxPages);
        } else if (subsCount >= 6) {
          effectiveLimit = Math.min(25, effectiveLimit);
          effectiveMaxPages = Math.min(2, effectiveMaxPages);
        }

        let localPauseUntil = rateLimitPauseUntil;

        setLoading(true);
        setError('');
        setNeedsAuth(false);
        const controller = new AbortController();
        const timeoutMs = Math.min(45000, 5000 + subs.length * 3000);
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const params = new URLSearchParams({
            subs: subs.join(','),
            mode,
            time,
            days: String(days),
            limit: String(effectiveLimit)
          });
          if (mode === 'new') {
            params.set('max_pages', String(effectiveMaxPages));
          }
          if (forceRefresh) {
            params.set('_ts', String(Date.now()));
            params.set('fresh', '1');
          }

          setFetchMethod('server');
          const requestUrl = `${DEFAULT_API_URL}?${params.toString()}`;
          let response = await fetch(requestUrl, {
            signal: controller.signal,
            ...(forceRefresh ? { headers: { 'Cache-Control': 'no-cache' } } : {}),
          });

          // Forced fresh fetch can exceed backend limits for large subreddit sets.
          // Fall back to snapshot cache instead of surfacing a hard 500 to the UI.
          if (forceRefresh && response.status >= 500) {
            const fallbackParams = new URLSearchParams(params);
            fallbackParams.delete('_ts');
            fallbackParams.delete('fresh');
            const fallbackUrl = `${DEFAULT_API_URL}?${fallbackParams.toString()}`;
            const fallbackResponse = await fetch(fallbackUrl, { signal: controller.signal });
            if (fallbackResponse.ok) {
              response = fallbackResponse;
            }
          }

          if (response.status === 401) {
            setNeedsAuth(true);
            setAuthenticated(false);
            setAuthChecking(false);
            setError('Sign in with Reddit to fetch your dashboard.');
            return;
          }

          if (response.status === 429) {
            let responseBody = null;
            try { responseBody = await response.json(); } catch (e) {}
            const retryHeader = Number(response.headers.get('Retry-After')) || 0;
            const retryAfterSeconds = Number(responseBody?.retryAfter) || retryHeader || 0;
            if (retryAfterSeconds > 0) {
              localPauseUntil = Date.now() + retryAfterSeconds * 1000;
              setRateLimitPauseUntil(localPauseUntil);
            }
            const isAppLimit = responseBody?.source === 'app';
            const sourceLabel = isAppLimit ? '⚡ App throttle' : '🔒 Rate limit';
            const sourceMessage = responseBody?.message || (isAppLimit ? 'Too many requests from this browser.' : 'Dashboard request limit reached.');
            setError(`${sourceLabel}: ${sourceMessage}${retryAfterSeconds > 0 ? ` Retry in ~${retryAfterSeconds}s.` : ''}`);
            return;
          }

          if (!response.ok) throw new Error(`HTTP ${response.status}`);

          const rateLimitedHeader = response.headers.get('X-Rate-Limited') === '1';
          const payload = await response.json();
          const retryAfterHeader = Number(response.headers.get('Retry-After')) || 0;
          const retryAfterSeconds = Number(payload?.retry_after_seconds) || retryAfterHeader || 0;
          if (rateLimitedHeader || payload.rate_limited) {
            if (retryAfterSeconds > 0) {
              localPauseUntil = Date.now() + retryAfterSeconds * 1000;
              setRateLimitPauseUntil(localPauseUntil);
            }
            const affected = Array.isArray(payload.rate_limited_subreddits) ? payload.rate_limited_subreddits.length : 0;
            const affectedMsg = affected ? ` on ${affected} subreddit${affected === 1 ? '' : 's'}` : '';
            const cooldownMsg = retryAfterSeconds > 0 ? `Cooling down ~${retryAfterSeconds}s.` : 'Try fewer subs or smaller fetch depth.';
            setError(`🔒 Reddit rate limit${affectedMsg}. ${cooldownMsg}`);
          } else {
            localPauseUntil = null;
            setRateLimitPauseUntil(null);
          }
          const results = Array.isArray(payload.results) ? payload.results : [];
          const previousBySub = new Map((data || []).map(item => [String(item.subreddit || '').toLowerCase(), item]));
          const perSub = subs.map(sub => {
            const subKey = sub.toLowerCase();
            const match = results.find(r => (r.subreddit || '').toLowerCase() === subKey);
            const previous = previousBySub.get(subKey);

            if (!match && previous) {
              return { ...previous, subreddit: sub, stale: true, stale_reason: 'missing_result' };
            }

            if (match?.error && previous) {
              return {
                ...previous,
                subreddit: sub,
                stale: true,
                stale_reason: match.error_code || 'fetch_error',
                error: match.error || null,
              };
            }

            if (match) {
              return {
                subreddit: match.subreddit,
                meta: match.meta || previous?.meta || null,
                posts: Array.isArray(match.posts) ? match.posts : [],
                partial: Boolean(match.partial),
                error: match.error || null,
                stale: false,
              };
            }

            return {
              subreddit: sub,
              posts: previous?.posts || [],
              meta: previous?.meta || null,
              partial: false,
              error: null,
              stale: Boolean(previous),
              stale_reason: previous ? 'fallback_previous' : null,
            };
          });
          setNeedsAuth(false);
          setAuthenticated(true);
          setAuthChecking(false);
          setData(perSub);
          setFetchedAt(Number(payload?.fetched_at) || Date.now());
          setSnapshotInfo(payload?.snapshot || null);

          await runAiRanking({ perSub, triggeredByAuto, llmPostLimit: aiLlmPostLimit });

          // Check for notifications on auto-refresh
          if (triggeredByAuto) {
            const allNewPosts = perSub.flatMap(g => g.posts || []);
            const newScores = new Map();
            allNewPosts.forEach(post => newScores.set(post.id, Number(post.score) || 0));
            setPreviousPostScores(newScores);

            if (Notification.permission === 'granted') {
              if (notificationsEnabled) {
                // Check for upvote threshold crossing
                allNewPosts.forEach(post => {
                  const prevScore = previousPostScores.get(post.id);
                  const currentScore = Number(post.score) || 0;
                  if (prevScore !== undefined && prevScore < upvoteThreshold && currentScore >= upvoteThreshold) {
                    new Notification('Post crossed threshold!', { body: `"${post.title}" now has ${currentScore} upvotes`, icon: '/favicon.ico' });
                  }
                });
              }
              if (alertKeywords.trim()) {
                const keywords = alertKeywords.toLowerCase().split(',').map(k => k.trim()).filter(Boolean);
                allNewPosts.forEach(post => {
                  if (!previousPostScores.has(post.id)) {
                    const title = (post.title || '').toLowerCase();
                    const selftext = (post.selftext || '').toLowerCase();
                    const matchedKeyword = keywords.find(kw => title.includes(kw) || selftext.includes(kw));
                    if (matchedKeyword) {
                      new Notification(`Keyword "${matchedKeyword}" found!`, { body: post.title, icon: '/favicon.ico' });
                    }
                  }
                });
              }
            }
          }
        } catch (fetchError) {
          setNeedsAuth(false);
          setSnapshotInfo(null);
          if (fetchError?.name === 'AbortError') {
            setError(`Request timed out. Reddit may be slow. Try again.`);
          } else {
            setError(fetchError.message || 'Failed to fetch');
          }
        } finally {
          clearTimeout(timeoutId);
          setLoading(false);
          const plan = getAutoRefreshPlan({
            autoRefreshEnabled,
            subsLength: subs.length,
            intervalMinutes: autoRefreshInterval,
            now: Date.now(),
            minMinutes: MIN_AUTO_REFRESH_MINUTES,
          });
          const pausedNext = localPauseUntil && localPauseUntil > Date.now() ? localPauseUntil : null;
          setNextRefreshAt(pausedNext || plan.nextRefreshAt);
          if (triggeredByAuto) setLastAutoRefreshAt(Date.now());
        }
      }, [subs, mode, time, days, limit, maxPages, autoRefreshEnabled, autoRefreshInterval, notificationsEnabled, upvoteThreshold, alertKeywords, previousPostScores, runAiRanking, aiLlmPostLimit, data, rateLimitPauseUntil]);

      const refreshRef = useRef(refresh);
      useEffect(() => { refreshRef.current = refresh; }, [refresh]);

      useEffect(() => {
        if (!autoRefreshEnabled) setLastAutoRefreshAt(null);
      }, [autoRefreshEnabled]);

      useEffect(() => {
        const now = Date.now();
        const isPaused = rateLimitPauseUntil && rateLimitPauseUntil > now;

        if (isPaused) {
          setNextRefreshAt(rateLimitPauseUntil);
          const unpauseId = setTimeout(() => {
            setRateLimitPauseUntil((prev) => (prev && prev <= Date.now() ? null : prev));
          }, Math.max(250, rateLimitPauseUntil - now + 100));
          return () => clearTimeout(unpauseId);
        }

        const plan = getAutoRefreshPlan({
          autoRefreshEnabled,
          subsLength: subs.length,
          intervalMinutes: autoRefreshInterval,
          now,
          minMinutes: MIN_AUTO_REFRESH_MINUTES,
        });
        if (!plan.shouldSchedule) {
          setNextRefreshAt(null);
          return () => {};
        }
        setNextRefreshAt(plan.nextRefreshAt);
        let cancelled = false;
        const triggerRefresh = () => {
          if (cancelled || loadingRef.current || !subs.length) return;
          if (rateLimitPauseUntil && rateLimitPauseUntil > Date.now()) return;
          refreshRef.current({ triggeredByAuto: true });
        };
        // Only use interval - no immediate kickoff to avoid race conditions
        const intervalId = setInterval(triggerRefresh, plan.intervalMs);
        return () => { cancelled = true; clearInterval(intervalId); };
      }, [autoRefreshEnabled, autoRefreshInterval, subs.length, rateLimitPauseUntil]);

      const handleAddSub = useCallback((name) => {
        const normalized = normalizeSubredditName(name);
        if (!normalized) return;
        setSubs(prev => {
          if (prev.some(s => s.toLowerCase() === normalized.toLowerCase())) return prev;
          return [...prev, normalized];
        });
      }, []);

      const handleRemoveSub = useCallback((name) => {
        setSubs(prev => prev.filter(s => s.toLowerCase() !== name.toLowerCase()));
        if (selectedSub.toLowerCase() === name.toLowerCase()) setSelectedSub('ALL');
      }, [selectedSub]);

      const handleAddSubSubmit = useCallback(() => {
        const names = addSubInput.split(/[,\n]+/).map(s => normalizeSubredditName(s)).filter(Boolean);
        if (names.length === 0) return;
        setSubs(prev => {
          const existing = new Set(prev.map(s => s.toLowerCase()));
          const newOnes = names.filter(n => !existing.has(n.toLowerCase()));
          return [...prev, ...newOnes];
        });
        setAddSubInput('');
        setAddSubOpen(false);
      }, [addSubInput]);

      const handleApplyStarterPack = useCallback((pack) => {
        if (!pack?.subs) return;
        setSubs(prev => {
          const existing = new Set(prev.map(s => s.toLowerCase()));
          const newOnes = pack.subs.filter(s => !existing.has(s.toLowerCase()));
          return [...prev, ...newOnes];
        });
      }, []);

      // Keyboard shortcut for search
      useEffect(() => {
        const handler = (e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            document.getElementById('search-input')?.focus();
          }
          if (e.key === 'Escape') {
            setActivePostMenu(null);
            setHoverPost(null);
          }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
      }, []);

      // Close menu when clicking outside
      useEffect(() => {
        const handler = () => setActivePostMenu(null);
        if (activePostMenu) {
          document.addEventListener('click', handler);
          return () => document.removeEventListener('click', handler);
        }
      }, [activePostMenu]);

      // Quick action handlers
      const handleCopyLink = useCallback((post) => {
        const url = post.reddit_url || post.external_url || '';
        navigator.clipboard.writeText(url);
        setActivePostMenu(null);
      }, []);

      const handleHidePost = useCallback((postId) => {
        setHiddenPosts(prev => new Set([...prev, postId]));
        setActivePostMenu(null);
        if (selectedPost?.id === postId) setSelectedPost(null);
      }, [selectedPost]);

      const handlePostHoverStart = useCallback((post) => {
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = setTimeout(() => setHoverPost(post), 500);
      }, []);

      const handlePostHoverEnd = useCallback(() => {
        if (hoverTimeoutRef.current) {
          clearTimeout(hoverTimeoutRef.current);
          hoverTimeoutRef.current = null;
        }
        setHoverPost(null);
      }, []);

      // Cleanup hover timeout on unmount
      useEffect(() => {
        return () => {
          if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
          }
        };
      }, []);

      // Save API key securely (HttpOnly cookie)
      const saveSecureApiKey = useCallback(async () => {
        if (!openRouterApiKey.trim()) return;
        setSavingSecureKey(true);
        try {
          const response = await fetch('/api/settings/openrouter-key', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey: openRouterApiKey.trim() })
          });
          if (response.ok) {
            const data = await response.json();
            setSecureKeyStatus({ hasKey: true, keyPreview: data.keyPreview, source: 'cookie', checking: false });
            // Clear localStorage version for security
            try { localStorage.removeItem('dashboard_openrouter_api_key'); } catch {}
            setOpenRouterApiKey(''); // Clear from state too
            alert('API key saved securely! It is now stored in an HttpOnly cookie and cannot be accessed by JavaScript.');
          } else {
            const error = await response.json();
            alert('Failed to save API key: ' + (error.error || 'Unknown error'));
          }
        } catch (e) {
          alert('Failed to save API key: ' + e.message);
        } finally {
          setSavingSecureKey(false);
        }
      }, [openRouterApiKey]);

      // Delete secure API key
      const deleteSecureApiKey = useCallback(async () => {
        if (!confirm('Remove the securely stored API key?')) return;
        try {
          const response = await fetch('/api/settings/openrouter-key', {
            method: 'DELETE',
            credentials: 'include'
          });
          if (response.ok) {
            setSecureKeyStatus({ hasKey: false, keyPreview: null, source: 'none', checking: false });
          }
        } catch (e) {
          alert('Failed to remove API key: ' + e.message);
        }
      }, []);

      const applyPreset = useCallback((preset) => {
        if (!preset) return;
        setAiEnabled(true);
        setAiGoals(preset.goals || '');
        setAiAvoid(Array.isArray(preset.avoid) ? preset.avoid.join(', ') : '');
        setAiPresetId(preset.id || '');
        setAiPresetDismissed(true);
      }, []);

      const rerankNow = useCallback(async () => {
        if (aiRankingLoading || loading) return;
        if (!aiEnabled || !aiGoals || !aiGoals.trim()) return;
        await runAiRanking({ perSub: data, triggeredByAuto: false, llmPostLimit: aiLlmPostLimit });
        setAiScoresStale(false);
      }, [aiRankingLoading, loading, aiEnabled, aiGoals, data, aiLlmPostLimit, runAiRanking]);

      const modelGroups = useMemo(() => {
        const source = availableModels.length ? availableModels : FALLBACK_MODELS;
        const normalized = source.map(model => {
          const id = model.id || model.model || model.name;
          const name = model.name || id;
          const pricing = model.pricing || null;
          const tier = model.tier || (isFreePricing(pricing) ? 'free' : 'paid');
          const speed = model.speed || inferModelSpeed(id || '');
          const costHint = formatCostHint(pricing);
          const contextHint = model.context_length ? `${formatNumber(model.context_length)} ctx` : '';
          const tierHint = tier === 'free' ? 'free' : (pricing ? costHint : 'paid');
          const hintParts = [tierHint, speed, contextHint].filter(Boolean);
          const provider = model.top_provider?.name || model.top_provider?.id || model.top_provider || '';
          const architecture = typeof model.architecture === 'string'
            ? model.architecture
            : (model.architecture?.modality || model.architecture?.name || '');
          const updatedAt = getModelTimestamp(model);
          return {
            id,
            name,
            tier,
            speed,
            hint: hintParts.join(' • '),
            pricing,
            context_length: model.context_length || null,
            description: (model.description || '').trim(),
            provider,
            architecture,
            updatedAt,
          };
        }).filter(model => model.id);

        const recommended = normalized.filter(m => m.id === DEFAULT_OPENROUTER_MODEL);
        const free = normalized.filter(m => m.tier === 'free' && m.id !== DEFAULT_OPENROUTER_MODEL);
        const paid = normalized.filter(m => m.tier === 'paid');
        const sortLatest = (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) || a.name.localeCompare(b.name);
        const latestFree = [...free].sort(sortLatest).slice(0, LATEST_MODEL_COUNT);
        const latestPaid = [...paid].sort(sortLatest).slice(0, LATEST_MODEL_COUNT);
        const all = [...normalized].sort(sortLatest);

        return { recommended, free, paid, latestFree, latestPaid, all };
      }, [availableModels]);

      const selectedModelInfo = useMemo(() => {
        return modelGroups.all.find(model => model.id === openRouterModel) || null;
      }, [modelGroups, openRouterModel]);

      const aiGoalSummary = useMemo(() => truncateText(aiGoals || '', 120), [aiGoals]);
      const preFilterPostCount = filteredBySub.length;
      const activeFilterPills = useMemo(() => {
        const pills = [];
        if (keyword.trim()) pills.push({ key: 'keyword', label: `Keyword: ${truncateText(keyword.trim(), 24)}` });
        if (minUpvoteFilter) pills.push({ key: 'upvotes', label: `Upvotes: ${minUpvoteFilter}+` });
        if (minCommentFilter) pills.push({ key: 'comments', label: `Comments: ${minCommentFilter}+` });
        if (minAiRelevance) pills.push({ key: 'ai', label: `AI score: ${minAiRelevance}+` });
        return pills;
      }, [keyword, minUpvoteFilter, minCommentFilter, minAiRelevance, truncateText]);
      const showingFilteredResults = visiblePosts.length !== preFilterPostCount;

      function clearFilterPill(key) {
        if (key === 'keyword') setKeyword('');
        if (key === 'upvotes') setMinUpvoteFilter('');
        if (key === 'comments') setMinCommentFilter('');
        if (key === 'ai') setMinAiRelevance('');
      }

      function renderStatusChip(label, value, tone = 'neutral') {
        const toneClass =
          tone === 'success'
            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
            : tone === 'warning'
              ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
              : tone === 'accent'
                ? 'bg-sky-50 text-[#0369A1] dark:bg-[#0284C7]/15 dark:text-sky-300'
                : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300';
        return h('span', {
          className: `inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${toneClass}`
        },
          h('span', { className: 'uppercase tracking-wide opacity-70' }, label),
          h('span', null, value)
        );
      }

      function renderGlyph(path, className = 'w-4 h-4') {
        return h('svg', { className, fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', 'aria-hidden': 'true' },
          h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: path })
        );
      }

      function renderStarterPackIcon(packId) {
        const iconMap = {
          'tech-news': 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 4h14a2 2 0 012 2v7H3V6a2 2 0 012-2z',
          'design-inspo': 'M7 7h.01M7 3h10l4 4v10a2 2 0 01-2 2H7a4 4 0 01-4-4V7a4 4 0 014-4z',
          'data-ai': 'M9.75 3v2.25M14.25 3v2.25M9 18h6M10 21h4M7.5 6.75h9A2.25 2.25 0 0118.75 9v5.25A2.25 2.25 0 0116.5 16.5h-9A2.25 2.25 0 015.25 14.25V9A2.25 2.25 0 017.5 6.75zM9 11.25h.008v.008H9v-.008zm6 0h.008v.008H15v-.008z'
        };
        return h('span', { className: 'inline-flex items-center justify-center w-7 h-7 rounded-md bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 shrink-0' },
          renderGlyph(iconMap[packId] || iconMap['tech-news'], 'w-4 h-4')
        );
      }

      function renderPresetIcon(presetId, isActive = false) {
        const iconMap = {
          leads: 'M21 12l-7.5 7.5-3-3-6 6M21 12V3h-9',
          research: 'M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z',
          hiring: 'M17 21v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2M10 7a4 4 0 100-8 4 4 0 000 8zm11 8h-6m3-3v6',
          feedback: 'M8 10h8M8 14h5m-9 7l2.5-2.5H19a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v11a2 2 0 002 2h1.5L4 21z',
          trends: 'M3 17l6-6 4 4 7-8M14 7h6v6'
        };
        return h('span', {
          className: `inline-flex items-center justify-center w-4 h-4 ${isActive ? 'text-white' : 'text-zinc-500 dark:text-zinc-400'}`
        }, renderGlyph(iconMap[presetId] || iconMap.research, 'w-4 h-4'));
      }

      const renderModelCard = (model, options = {}) => {
        if (!model) return null;
        const { compact = false, emphasize = false } = options;
        const selected = model.id === openRouterModel;
        const detailBits = [];
        const pricingHint = model.tier === 'free' ? 'Free' : formatCostHint(model.pricing);
        if (pricingHint) detailBits.push(pricingHint);
        if (model.speed) detailBits.push(`Speed: ${model.speed}`);
        if (model.context_length) detailBits.push(`${formatNumber(model.context_length)} ctx`);
        if (model.provider) detailBits.push(`Provider: ${model.provider}`);
        if (model.architecture) detailBits.push(`Arch: ${model.architecture}`);
        if (model.updatedAt) detailBits.push(`Updated ${formatModelDate(model.updatedAt)}`);

        const containerClass = [
          'p-3 rounded-lg border transition-colors',
          selected
            ? 'border-sky-400 bg-sky-50 dark:border-[#0284C7]/55 dark:bg-[#0284C7]/15'
            : 'border-zinc-200 dark:border-zinc-700 bg-white/70 dark:bg-zinc-800/60',
          emphasize ? 'shadow-sm' : '',
        ].join(' ');

        return h('div', { key: model.id, className: containerClass },
          h('div', { className: 'flex items-start justify-between gap-2' },
            h('div', { className: 'min-w-0' },
              h('p', { className: 'text-sm font-semibold text-zinc-900 dark:text-white truncate' }, model.name),
              h('p', { className: 'text-xs text-zinc-500 dark:text-zinc-400 truncate' }, model.id)
            ),
            h('div', { className: 'flex items-center gap-2 shrink-0' },
              selected && h('span', { className: 'px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#0284C7] text-white' }, 'Selected'),
              h('button', {
                type: 'button',
                onClick: () => setOpenRouterModel(model.id),
                disabled: !aiEnabled,
                className: 'px-2 py-1 rounded-md text-xs font-medium bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-[#0284C7] dark:hover:bg-[#0369A1] disabled:opacity-50 disabled:cursor-not-allowed'
              }, selected ? 'Using' : 'Select')
            )
          ),
          !compact && model.description && h('p', { className: 'mt-2 text-xs text-zinc-600 dark:text-zinc-300' }, truncateText(model.description, 140)),
          detailBits.length > 0 && h('p', { className: 'mt-2 text-[11px] text-zinc-500 dark:text-zinc-400' }, detailBits.join(' • '))
        );
      };

      const filtersActive = minUpvoteFilter || minCommentFilter || minAiRelevance || keyword;
      const staleSubCount = (data || []).filter(group => group?.stale).length;

      return h('div', { 
        className: 'h-screen flex flex-col',
        onTouchStart: handleTouchStart,
        onTouchEnd: handleTouchEnd
      },
        // Header
        h('header', { className: 'bg-white dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 px-4 py-3 flex items-center justify-between gap-4 shrink-0' },
            h('div', { className: 'flex items-center gap-3' },
            h('h1', { className: 'text-lg font-bold text-zinc-900 dark:text-white' }, 'Reddit Dashboarder'),
            ),
            h('div', { className: 'flex items-center gap-2' },
              // Dark mode toggle
              h('button', {
                onClick: () => setDarkMode(!darkMode),
                className: 'p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900',
                title: darkMode ? 'Light mode' : 'Dark mode'
              }, darkMode 
                ? h('svg', { className: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                    h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z' })
                  )
                : h('svg', { className: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                    h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z' })
                  )
              ),
              h('button', {
                onClick: () => setSettingsOpen(true),
              className: 'p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900',
              title: 'Settings'
            }, h('svg', { className: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                  h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' }),
                  h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z' })
            )),
              authChecking
              ? h('div', { className: 'px-3 py-1.5 text-sm text-zinc-500' }, 'Checking…')
                : authenticated
                  ? h('button', {
                      onClick: () => { window.location.href = '/api/auth/logout'; },
                    className: 'px-3 py-1.5 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900'
                    }, 'Sign out')
                  : h('button', {
                      onClick: () => { window.location.href = '/api/auth/start'; },
                    className: 'px-3 py-1.5 rounded-lg text-sm font-medium bg-zinc-900 dark:bg-[#0284C7] text-white hover:bg-zinc-800 dark:hover:bg-[#0369A1] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900'
                    }, 'Sign in')
          )
        ),

        // Status bar
        h('div', { className: 'bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700 px-4 py-2 flex items-center justify-between gap-4 text-sm shrink-0' },
          h('div', { className: 'flex flex-wrap items-center gap-2' },
            loading
              ? h('span', { className: 'flex items-center gap-2 text-zinc-600 dark:text-zinc-400' },
                  h('div', { className: 'w-3 h-3 border-2 border-zinc-300 dark:border-zinc-600 border-t-zinc-600 dark:border-t-zinc-300 rounded-full animate-spin' }),
                  'Fetching…'
                )
              : error
                ? h('span', { className: 'text-rose-600 dark:text-rose-400 font-medium' }, error)
                : needsAuth
                  ? h('span', { className: 'text-amber-700 dark:text-amber-400 font-medium' }, 'Sign in required')
                  : [
                      renderStatusChip('Posts', visiblePosts.length > 0 ? visiblePosts.length : 0),
                      fetchedAt && !loading && renderStatusChip('Updated', timeAgo(fetchedAt / 1000)),
                      snapshotInfo?.cached && !loading && renderStatusChip('Cache', `${snapshotInfo.age_seconds || 0}s old`),
                      staleSubCount > 0 && renderStatusChip('Stale', `${staleSubCount} subreddit${staleSubCount === 1 ? '' : 's'}`, 'warning'),
                      rateLimitPauseUntil && rateLimitPauseUntil > Date.now() && renderStatusChip('Cooldown', formatTimeUntil(rateLimitPauseUntil), 'warning'),
                      autoRefreshEnabled && nextRefreshAt && !loading && renderStatusChip('Next refresh', formatTimeUntil(nextRefreshAt)),
                      aiRankingLoading && renderStatusChip('AI', 'Ranking…', 'success'),
                      !aiRankingLoading && aiEnabled && aiGoals && aiGoals.trim() && renderStatusChip('AI', 'On', 'success'),
                      !aiRankingLoading && aiEnabled && aiGoals && aiGoals.trim() && aiScoreStats.total > 0 && renderStatusChip('AI-reviewed', `${aiScoreStats.llm}/${aiScoreStats.total}`, 'success'),
                      !aiRankingLoading && (!aiEnabled || !aiGoals || !aiGoals.trim()) && postRelevanceScores.size === 0 && renderStatusChip('AI', 'Off'),
                    ],
            (alertKeywords.trim() || notifyHighRelevance || notificationsEnabled) && h('button', {
              onClick: () => setSettingsOpen(true),
              className: 'text-[#0284C7] dark:text-sky-400 hover:text-[#0369A1] dark:hover:text-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900 rounded'
            }, renderStatusChip('Alerts', 'On', 'accent'))
          ),
          h('div', { className: 'flex items-center gap-2' },
            h('button', {
              onClick: () => refresh({ force: true }),
              disabled: loading,
              className: 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-[#0284C7] text-white text-sm font-medium hover:bg-zinc-800 dark:hover:bg-[#0369A1] disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900'
            },
              h('svg', { className: `w-4 h-4 ${loading ? 'animate-spin' : ''}`, fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15' })
              ),
              'Refresh'
            ),
            h('button', {
              onClick: () => refresh({ force: true }),
              disabled: loading,
              className: 'px-2.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900'
            }, 'Force refresh')
          )
        ),

        // Main content area
        h('div', { className: 'flex-1 flex overflow-hidden' },
          // Left sidebar - Subreddits
          h('aside', { className: `w-52 bg-white dark:bg-zinc-800 border-r border-zinc-200 dark:border-zinc-700 flex-col shrink-0 ${mobileView === 'subs' ? 'flex' : 'hidden lg:flex'}` },
            h('div', { className: 'p-3 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between' },
              h('span', { className: 'text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400' }, 'Subreddits'),
                h('button', {
                onClick: () => { setAddSubOpen(true); setTimeout(() => addSubInputRef.current?.focus(), 50); },
                className: 'p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900',
                title: 'Add subreddit'
              }, h('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M12 4v16m8-8H4' })
              ))
            ),
            h('div', { className: 'flex-1 overflow-auto scrollbar-thin p-2 space-y-1' },
              subs.length === 0
                ? h('div', { className: 'p-4 text-center' },
                    // Better empty state with icon
                    h('div', { className: 'w-16 h-16 mx-auto mb-4 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center' },
                      h('svg', { className: 'w-8 h-8 text-zinc-400', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                        h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9' })
                      )
                    ),
                    h('h3', { className: 'text-lg font-semibold text-zinc-900 dark:text-white mb-2' }, 'Start by adding a few subreddits'),
                    h('p', { className: 'text-sm text-zinc-500 dark:text-zinc-400 text-center max-w-xs mb-4' }, 'Pick a starter pack below or click "Add custom" to enter 3 to 5 subreddit names.'),
                    h('div', { className: 'space-y-2' },
                      STARTER_PACKS.map(pack =>
                        h('button', {
                          key: pack.id,
                          onClick: () => handleApplyStarterPack(pack),
                          className: 'w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 hover:border-zinc-300 dark:hover:border-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-left text-sm transition-colors'
                        },
                          h('span', { className: 'flex items-center gap-2.5' },
                            renderStarterPackIcon(pack.id),
                            h('span', { className: 'min-w-0' },
                              h('span', { className: 'block font-medium text-zinc-700 dark:text-zinc-300' }, pack.label),
                              h('span', { className: 'block text-xs text-zinc-500 dark:text-zinc-400' }, `${pack.subs.length} starter subreddits`)
                            )
                          )
                        )
                      )
                    ),
                    h('button', {
                      onClick: () => { setAddSubOpen(true); setTimeout(() => addSubInputRef.current?.focus(), 50); },
                      className: 'mt-3 text-xs text-[#0284C7] dark:text-sky-400 hover:text-[#0369A1] dark:hover:text-sky-300 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900'
                    }, 'Add custom subreddits')
                  )
                : [
                    h('button', {
                      key: 'all',
                      onClick: () => setSelectedSub('ALL'),
                      className: `w-full px-3 py-2 rounded-lg text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900 ${selectedSub === 'ALL' ? 'bg-sky-50 dark:bg-[#0284C7]/15 text-[#0369A1] dark:text-sky-400' : 'hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300'}`
                    },
                      h('div', { className: 'flex items-center justify-between' },
                        h('span', null, 'All'),
                        h('span', { className: 'text-xs text-zinc-400 dark:text-zinc-500' }, allPosts.length)
                      )
                    ),
                    ...subs.map(sub => {
                      const postCount = allPosts.filter(p => p.subreddit?.toLowerCase() === sub.toLowerCase()).length;
                      const isSelected = selectedSub.toLowerCase() === sub.toLowerCase();
                    const meta = subMetaMap.get(sub) || {};
                      return h('div', {
                      key: sub,
                        className: `group rounded-lg transition-colors ${isSelected ? 'bg-sky-50 dark:bg-[#0284C7]/15' : 'hover:bg-zinc-50 dark:hover:bg-zinc-700'}`
                      },
                        h('button', {
                      onClick: () => setSelectedSub(sub),
                          className: `w-full px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900`
                    },
                      h('div', { className: 'flex items-center justify-between' },
                            h('span', { className: `text-sm font-medium ${isSelected ? 'text-[#0369A1] dark:text-sky-400' : 'text-zinc-700 dark:text-zinc-300'}` }, `r/${sub}`),
                        h('div', { className: 'flex items-center gap-2' },
                              h('span', { className: 'text-xs text-zinc-400 dark:text-zinc-500' }, postCount),
                          h('button', {
                                onClick: (e) => { e.stopPropagation(); handleRemoveSub(sub); },
                                className: 'opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-600 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900',
                            title: 'Remove'
                              }, h('svg', { className: 'w-3 h-3', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                              h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M6 18L18 6M6 6l12 12' })
                              ))
                            )
                          ),
                          meta.subscribers && h('div', { className: 'text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5' }, `${formatSubs(meta.subscribers)} members`)
                        )
                      );
                    })
                  ]
            )
          ),

          // Center - Post list
          h('main', { className: `flex-1 flex-col bg-zinc-50 dark:bg-zinc-900 min-w-0 ${detailCollapsed ? '' : 'lg:border-r lg:border-zinc-200 dark:lg:border-zinc-700'} ${mobileView === 'posts' ? 'flex' : 'hidden lg:flex'}` },
            subs.length > 0 && h('section', { className: 'bg-white dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 px-4 py-4 shrink-0' },
              h('div', { className: 'rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-gradient-to-br from-white via-sky-50/40 to-zinc-50 dark:from-zinc-800 dark:via-zinc-800 dark:to-zinc-900 px-4 py-4 shadow-sm' },
                h('div', { className: 'flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between' },
                h('div', { className: 'min-w-0 lg:max-w-[48%]' },
                  h('div', { className: 'flex items-center gap-2 flex-wrap' },
                    h('span', { className: 'px-2 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' }, 'AI Control'),
                    aiEnabled && aiGoals && aiGoals.trim() && h('span', { className: 'px-2 py-1 rounded-full text-[11px] font-semibold bg-sky-100 dark:bg-[#0284C7]/20 text-[#0369A1] dark:text-sky-300' }, 'Active'),
                    aiScoresStale && h('span', { className: 'px-2 py-1 rounded-full text-[11px] font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' }, 'Scores stale'),
                    aiRankingLoading && h('span', { className: 'px-2 py-1 rounded-full text-[11px] font-semibold bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300' }, 'Ranking...')
                  ),
                  h('h2', { className: 'mt-2 text-base font-semibold text-zinc-900 dark:text-white leading-snug' },
                    aiEnabled && aiGoals && aiGoals.trim()
                      ? (aiGoalSummary || 'AI ranking active')
                      : 'AI ranking is available but not configured'
                  ),
                  h('p', { className: 'mt-1 text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed' },
                    aiEnabled && aiGoals && aiGoals.trim()
                      ? `Model: ${(selectedModelInfo && selectedModelInfo.name) || openRouterModel}`
                      : 'Set goals, exclusions, and examples to rank posts by fit instead of raw score.'
                  )
                ),
                h('div', { className: 'grid grid-cols-2 gap-2 lg:grid-cols-4 lg:min-w-[420px]' },
                  h('div', { className: 'rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white/80 dark:bg-zinc-900 px-3 py-3 shadow-sm' },
                    h('div', { className: 'text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400' }, 'Scored'),
                    h('div', { className: 'mt-1 text-lg font-semibold font-mono text-zinc-900 dark:text-white' }, `${aiScoreStats.scored}/${aiScoreStats.total}`)
                  ),
                  h('div', { className: 'rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white/80 dark:bg-zinc-900 px-3 py-3 shadow-sm' },
                    h('div', { className: 'text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400' }, 'AI-reviewed'),
                    h('div', { className: 'mt-1 text-lg font-semibold font-mono text-zinc-900 dark:text-white' }, aiScoreStats.llm)
                  ),
                  h('div', { className: 'rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white/80 dark:bg-zinc-900 px-3 py-3 shadow-sm' },
                    h('div', { className: 'text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400' }, 'Strong matches'),
                    h('div', { className: 'mt-1 text-lg font-semibold font-mono text-zinc-900 dark:text-white' }, aiScoreStats.high)
                  ),
                  h('div', { className: 'rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white/80 dark:bg-zinc-900 px-3 py-3 shadow-sm' },
                    h('div', { className: 'text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400' }, 'Strong matches in view'),
                    h('div', { className: 'mt-1 text-lg font-semibold font-mono text-zinc-900 dark:text-white' }, aiScoreStats.visibleHigh)
                  )
                )
              ),
                h('div', { className: 'mt-4 flex flex-wrap items-center gap-2.5 border-t border-zinc-200/80 dark:border-zinc-700 pt-4' },
                h('button', {
                  onClick: rerankNow,
                  disabled: aiRankingLoading || loading || !aiEnabled || !aiGoals || !aiGoals.trim(),
                  className: 'px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-[#0284C7] dark:hover:bg-[#0369A1] disabled:opacity-50 disabled:cursor-not-allowed'
                }, aiRankingLoading ? 'Ranking…' : 'Rerank now'),
                h('button', {
                  onClick: () => setSettingsOpen(true),
                  className: 'px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                }, aiEnabled && aiGoals && aiGoals.trim() ? 'Edit AI' : 'Set up AI'),
                h('button', {
                  onClick: () => setShowAiReasons(!showAiReasons),
                  disabled: !aiEnabled || !aiGoals || !aiGoals.trim(),
                  className: 'px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed'
                }, showAiReasons ? 'Hide reasons' : 'Show reasons'),
                h('span', { className: `px-2.5 py-1 rounded-full text-[11px] font-medium ${
                  secureKeyStatus.source === 'cookie'
                    ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                    : secureKeyStatus.source === 'env'
                      ? 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300'
                      : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                }` },
                  secureKeyStatus.source === 'cookie'
                    ? 'Secure key saved'
                    : secureKeyStatus.source === 'env'
                      ? 'Server env key'
                      : 'No secure key'
                ),
                selectedModelInfo && h('span', { className: 'px-2.5 py-1 rounded-full text-[11px] font-medium bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300' },
                  selectedModelInfo.hint || selectedModelInfo.name
                ),
                h('span', { className: 'text-[11px] text-zinc-500 dark:text-zinc-400' }, `Prompt ${AI_PROMPT_VERSION}`)
                )
              )
            ),
            // Filter toolbar
            h('div', { className: 'bg-white dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 px-4 py-3 flex items-center gap-3 shrink-0 flex-wrap' },
              h('div', { className: 'relative flex-1 min-w-[120px] max-w-[180px]' },
                h('svg', { className: 'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                  h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' })
                ),
                h('input', {
                  id: 'search-input',
                  type: 'text',
                  value: keyword,
                  onChange: (e) => setKeyword(e.target.value),
                  placeholder: 'Search keywords… (⌘K)',
                  className: 'w-full pl-9 pr-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[#0284C7] focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-900 focus:border-transparent'
                })
              ),
              h('div', { className: 'hidden sm:flex items-center gap-1.5' },
                h('span', { className: 'text-xs font-medium text-zinc-500 dark:text-zinc-400 mr-1' }, 'Upvotes'),
                UPVOTE_PRESETS.map(preset =>
                  h('button', {
                    key: `upvote-${preset.value}`,
                    onClick: () => setMinUpvoteFilter(minUpvoteFilter === preset.value ? '' : preset.value),
                    className: `px-2.5 py-1 rounded-full text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900 ${minUpvoteFilter === preset.value ? 'bg-sky-50 dark:bg-[#0284C7]/15 text-[#0369A1] dark:text-sky-300' : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600'}`
                  }, preset.label)
                )
              ),
              h('div', { className: 'hidden sm:flex items-center gap-1.5' },
                h('span', { className: 'text-xs font-medium text-zinc-500 dark:text-zinc-400 mr-1' }, 'Comments'),
                COMMENT_PRESETS.map(preset =>
                  h('button', {
                    key: `comment-${preset.value}`,
                    onClick: () => setMinCommentFilter(minCommentFilter === preset.value ? '' : preset.value),
                    className: `px-2.5 py-1 rounded-full text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900 ${minCommentFilter === preset.value ? 'bg-sky-50 dark:bg-[#0284C7]/15 text-[#0369A1] dark:text-sky-300' : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600'}`
                  }, preset.label)
                )
              ),
              // AI relevance filter (only show when AI is enabled and scores are available)
              aiEnabled && aiGoals && aiGoals.trim() && postRelevanceScores.size > 0 && h('div', { className: 'hidden sm:flex items-center gap-1.5' },
                h('span', { className: 'text-xs font-medium text-zinc-500 dark:text-zinc-400 mr-1' }, 'AI score'),
                AI_RELEVANCE_PRESETS.map(preset =>
                  h('button', {
                    key: `ai-${preset.value}`,
                    onClick: () => setMinAiRelevance(minAiRelevance === preset.value ? '' : preset.value),
                    className: `px-2.5 py-1 rounded-full text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900 ${minAiRelevance === preset.value ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600'}`
                  }, preset.label)
                )
              ),
              (alertKeywords.trim() || notifyHighRelevance || notificationsEnabled) && h('button', {
                onClick: () => setSettingsOpen(true),
                className: 'hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-sky-50 dark:bg-[#0284C7]/15 text-[#0369A1] dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-[#0284C7]/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900',
                title: 'Alerts settings'
              }, h('svg', { className: 'w-3.5 h-3.5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' })
              ), 'Alerts'),
              h('select', {
                value: `${sortBy}-${sortOrder}`,
                onChange: (e) => {
                  const value = e.target.value;
                  // Handle special case: "ai-relevance-desc" or "ai-relevance-asc"
                  let by, order;
                  if (value.startsWith('ai-relevance-')) {
                    by = 'ai-relevance';
                    order = value.replace('ai-relevance-', '');
                  } else {
                    // For other sorts like "date-desc", "upvotes-asc", etc.
                    const lastDashIndex = value.lastIndexOf('-');
                    by = value.substring(0, lastDashIndex);
                    order = value.substring(lastDashIndex + 1);
                  }
                  setSortBy(by);
                  setSortOrder(order);
                },
                className: 'px-2.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-600 text-xs bg-white dark:bg-zinc-700 dark:text-white shadow-sm'
                },
                h('option', { value: 'date-desc' }, 'Latest posts'),
                h('option', { value: 'date-asc' }, 'Oldest posts'),
                h('option', { value: 'upvotes-desc' }, 'Most upvotes'),
                h('option', { value: 'upvotes-asc' }, 'Least upvotes'),
                h('option', { value: 'comments-desc' }, 'Most comments'),
                h('option', { value: 'comments-asc' }, 'Least comments'),
                h('option', { value: 'velocity-upvotes-desc' }, 'Highest upvote velocity'),
                h('option', { value: 'velocity-comments-desc' }, 'Highest comment velocity'),
                aiEnabled && aiGoals && aiGoals.trim() && postRelevanceScores.size > 0 && [
                  h('option', { key: 'ai-desc', value: 'ai-relevance-desc' }, 'Highest AI relevance'),
                  h('option', { key: 'ai-asc', value: 'ai-relevance-asc' }, 'Lowest AI relevance')
                ]
              ),
                filtersActive && h('button', {
                onClick: () => { setMinUpvoteFilter(''); setMinCommentFilter(''); setMinAiRelevance(''); setKeyword(''); },
                className: 'text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
              }, 'Clear all')
            ),
            activeFilterPills.length > 0 && h('div', { className: 'bg-zinc-50/80 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-700 px-4 py-2.5 flex items-center justify-between gap-3 shrink-0 flex-wrap' },
              h('div', { className: 'flex items-center gap-2 flex-wrap' },
                h('span', { className: 'text-xs font-medium text-zinc-500 dark:text-zinc-400' }, `Showing ${visiblePosts.length} of ${preFilterPostCount} posts`),
                ...activeFilterPills.map(pill => h('button', {
                  key: pill.key,
                  onClick: () => clearFilterPill(pill.key),
                  className: 'inline-flex items-center gap-1 rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-2.5 py-1 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                },
                  h('span', null, pill.label),
                  h('span', { 'aria-hidden': 'true', className: 'text-zinc-400' }, 'x')
                ))
              ),
              h('button', {
                onClick: () => { setMinUpvoteFilter(''); setMinCommentFilter(''); setMinAiRelevance(''); setKeyword(''); },
                className: 'text-xs font-medium text-[#0284C7] dark:text-sky-400 hover:text-[#0369A1] dark:hover:text-sky-300'
              }, 'Clear filters')
            ),

            // Post list
            h('div', { className: 'flex-1 overflow-auto scrollbar-thin relative' },
              visiblePosts.length === 0
                ? h('div', { className: 'flex flex-col items-center justify-center h-full p-10' },
                    subs.length === 0 
                      ? [
                          h('div', { key: 'icon', className: 'w-16 h-16 mb-4 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center' },
                            h('svg', { className: 'w-8 h-8 text-zinc-400', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                              h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' })
                            )
                          ),
                          h('h3', { key: 'title', className: 'text-lg font-semibold text-zinc-900 dark:text-white mb-2' }, 'No subreddits yet'),
                          h('p', { key: 'desc', className: 'text-sm text-zinc-500 dark:text-zinc-400 text-center max-w-sm' }, 'Click "Add custom subreddits" in the left sidebar or choose a starter pack to build your feed.')
                        ]
                      : loading 
                        ? h('span', { className: 'text-zinc-500 dark:text-zinc-400 text-sm' }, 'Loading…')
                        : filtersActive || showingFilteredResults
                        ? [
                            h('div', { key: 'icon', className: 'w-16 h-16 mb-4 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center' },
                              h('svg', { className: 'w-8 h-8 text-zinc-400', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                                h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z' })
                              )
                            ),
                            h('h3', { key: 'title', className: 'text-lg font-semibold text-zinc-900 dark:text-white mb-2' }, 'No posts match your current filters'),
                            h('p', { key: 'desc', className: 'text-sm text-zinc-500 dark:text-zinc-400 text-center max-w-sm mb-4' }, 'Clear one or more filters to bring posts back into view.'),
                            h('div', { key: 'actions', className: 'flex items-center gap-2 flex-wrap justify-center' },
                              h('button', {
                                onClick: () => { setMinUpvoteFilter(''); setMinCommentFilter(''); setMinAiRelevance(''); setKeyword(''); },
                                className: 'px-4 py-2 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-[#0284C7] dark:hover:bg-[#0369A1] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900'
                              }, 'Clear filters'),
                              minAiRelevance && h('button', {
                                onClick: () => setMinAiRelevance(''),
                                className: 'px-4 py-2 rounded-lg text-sm font-medium border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                              }, 'Remove AI score filter')
                            )
                          ]
                        : [
                            h('div', { key: 'icon', className: 'w-16 h-16 mb-4 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center' },
                              h('svg', { className: 'w-8 h-8 text-zinc-400', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                                h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z' })
                              )
                            ),
                            h('h3', { key: 'title', className: 'text-lg font-semibold text-zinc-900 dark:text-white mb-2' }, aiEnabled && aiGoals && aiGoals.trim() ? 'No strong matches yet' : 'No posts found'),
                            h('p', { key: 'desc', className: 'text-sm text-zinc-500 dark:text-zinc-400 text-center max-w-xs mb-4' }, aiEnabled && aiGoals && aiGoals.trim()
                              ? 'Try broadening your AI goals, lowering the AI score filter, or fetching more posts.'
                              : 'Try a different fetch mode or add more subreddits.'
                            ),
                            h('div', { key: 'actions', className: 'flex items-center gap-2 flex-wrap justify-center' },
                              h('button', { 
                                onClick: () => refresh({ force: true }),
                                className: 'px-4 py-2 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-[#0284C7] dark:hover:bg-[#0369A1] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900'
                              }, 'Refresh posts'),
                              h('button', {
                                onClick: () => setSettingsOpen(true),
                                className: 'px-4 py-2 rounded-lg text-sm font-medium border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                              }, aiEnabled && aiGoals && aiGoals.trim() ? 'Adjust AI settings' : 'Open settings')
                            )
                          ]
                  )
                : h('div', { className: 'divide-y divide-zinc-200 dark:divide-zinc-700 bg-zinc-50/70 dark:bg-zinc-900' },
                    visiblePosts.map(post => {
                        const isSelected = selectedPost?.id === post.id;
                        const score = Number(post.score) || 0;
                        const comments = Number(post.num_comments) || 0;
                        const flair = post.link_flair_text;
                        const flairBg = post.link_flair_background_color || '#e4e4e7';
                        const flairTextColor = post.link_flair_text_color === 'light' ? '#fff' : '#18181b';
                        const relevanceScore = postRelevanceScores.get(String(post.id));
                        const relevanceMeta = postRelevanceMetadata.get(String(post.id));
                        const isHighlyRelevant = relevanceScore !== undefined && relevanceScore !== null && relevanceScore >= 4;
                        const isVeryHighRelevant = relevanceScore !== undefined && relevanceScore !== null && relevanceScore >= 5;
                        const velocity = velocityMeta.map.get(String(post.id));
                        const isSpiking = velocityMeta.spiking.has(String(post.id));
                        const upvotesPerHour = velocity?.upvotesPerHour || 0;
                        const commentsPerHour = velocity?.commentsPerHour || 0;
                        const borderClass = isSelected 
                          ? 'border-l-2 border-[#0284C7]' 
                          : isHighlyRelevant 
                            ? 'border-l-4 border-emerald-500' 
                            : '';
                        const bgClass = isSelected 
                          ? 'bg-white dark:bg-zinc-800'
                          : isVeryHighRelevant
                            ? 'bg-emerald-50/50 dark:bg-emerald-950/20'
                            : 'bg-zinc-50 dark:bg-zinc-900';
                        return h('div', {
                          key: post.id,
                          className: `group relative w-full text-left px-4 py-3.5 hover:bg-white dark:hover:bg-zinc-800 transition-colors ${bgClass} ${borderClass}`,
                          onMouseEnter: () => handlePostHoverStart(post),
                          onMouseLeave: handlePostHoverEnd
                        },
                          h('button', {
                            onClick: () => { setSelectedPost(post); setDetailCollapsed(false); setMobileView('detail'); },
                            className: 'w-full text-left'
                          },
                            h('div', { className: 'flex gap-3' },
                              post.thumbnail && post.thumbnail !== 'self' && post.thumbnail !== 'default' && post.thumbnail !== 'nsfw' && h('img', {
                                src: post.thumbnail,
                                alt: '',
                                className: 'w-16 h-16 object-cover rounded-lg shrink-0 bg-zinc-200 dark:bg-zinc-700'
                              }),
                              h('div', { className: 'flex-1 min-w-0' },
                                h('div', { className: 'flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 mb-1.5 flex-wrap' },
                                  h('span', null, `r/${post.subreddit}`),
                                  flair && h('span', { 
                                    className: 'px-1.5 py-0.5 rounded-full text-[10px] font-medium',
                                    style: { backgroundColor: flairBg, color: flairTextColor }
                                  }, flair),
                                  h('span', null, '•'),
                                  h('span', null, timeAgo(post.created_utc)),
                                  isSpiking && h('span', {
                                    className: 'px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-200'
                                  }, 'Spiking'),
                                  h('span', { className: 'inline-flex items-center gap-1 text-[10px] text-zinc-500 dark:text-zinc-400' },
                                    renderGlyph('M13 2L4 14h6l-1 8 9-12h-6l1-8z', 'w-3 h-3'),
                                    `${formatVelocity(upvotesPerHour)}/h`
                                  ),
                                  relevanceScore !== undefined && relevanceScore !== null && h('span', {
                                    className: `px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${aiScoresStale ? 'opacity-50' : ''} ${
                                      relevanceScore >= 5 ? 'bg-emerald-600 text-white' :
                                      relevanceScore >= 4 ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-200' :
                                      relevanceScore >= 3 ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-200' :
                                      'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400'
                                    }`,
                                    title: aiScoresStale ? `Cached score (may be stale) — re-run ranking for fresh results` : relevanceMeta ? `AI Relevance: ${relevanceScore}/5 • ${relevanceMeta.confidence} confidence • ${relevanceMeta.reason}` : `AI Relevance: ${relevanceScore}/5`
                                  }, `${aiScoresStale ? '~' : ''}${aiScoreLabel(relevanceScore)} (${relevanceScore}/5)`)
                                ),
                                h('h3', { className: 'text-sm font-semibold text-zinc-900 dark:text-white leading-snug line-clamp-2' }, post.title),
                                showAiReasons && h('p', { className: 'text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1 mt-0.5' },
                                  buildWhyLine({
                                    post,
                                    relevanceMeta,
                                    upvotesPerHour,
                                    commentsPerHour
                                  })
                                ),
                                h('div', { className: 'flex items-center gap-3 mt-2 text-xs' },
                                  h('span', { className: 'inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium' },
                                    renderGlyph('M7 14l5-5 5 5', 'w-3 h-3'),
                                    score
                                  ),
                                  h('span', { className: 'inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-medium' },
                                    renderGlyph('M8 10h8M8 14h5m-9 7l2.5-2.5H19a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v11a2 2 0 002 2h1.5L4 21z', 'w-3 h-3'),
                                    comments
                                  ),
                                  commentsPerHour > 0 && h('span', { className: 'inline-flex items-center gap-1 text-zinc-500 dark:text-zinc-400' },
                                    renderGlyph('M8 10h8M8 14h5m-9 7l2.5-2.5H19a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v11a2 2 0 002 2h1.5L4 21z', 'w-3 h-3'),
                                    `${formatVelocity(commentsPerHour)}/h`
                                  ),
                                  h('span', { className: 'text-zinc-400 dark:text-zinc-500' }, `u/${post.author}`)
                                )
                              )
                            )
                          ),
                          // Quick actions menu button
                          h('div', { className: 'absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity' },
                            h('button', {
                              onClick: (e) => { e.stopPropagation(); setActivePostMenu(activePostMenu === post.id ? null : post.id); },
                              className: 'p-2 rounded-lg bg-white dark:bg-zinc-700 shadow-sm border border-zinc-200 dark:border-zinc-600 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-600 transition-colors'
                            }, h('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                              h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z' })
                            )),
                            // Dropdown menu
                            activePostMenu === post.id && h('div', { 
                              className: 'absolute right-0 mt-1 w-40 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700 py-1 z-20 animate-fadeIn',
                              onClick: (e) => e.stopPropagation()
                            },
                              h('button', {
                                onClick: () => { window.open(post.reddit_url || post.external_url, '_blank'); setActivePostMenu(null); },
                                className: 'w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2'
                              }, 
                                h('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                                  h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14' })
                                ),
                                'Open in Reddit'
                              ),
                              h('button', {
                                onClick: () => handleCopyLink(post),
                                className: 'w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2'
                              },
                                h('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                                  h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3' })
                                ),
                                'Copy link'
                              ),
                              h('button', {
                                onClick: () => handleHidePost(post.id),
                                className: 'w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2'
                              },
                                h('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                                  h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21' })
                                ),
                                'Hide post'
                              )
                            )
                          )
                        );
                      })
                    ),
              // Hover preview tooltip
              hoverPost && h('div', { 
                className: 'fixed z-50 max-w-sm bg-white dark:bg-zinc-800 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-700 p-4 pointer-events-none animate-fadeIn',
                style: { top: '50%', right: '420px', transform: 'translateY(-50%)' }
              },
                hoverPost.preview?.images?.[0]?.source?.url && h('img', {
                  src: hoverPost.preview.images[0].source.url.replace(/&amp;/g, '&'),
                  alt: '',
                  className: 'w-full h-40 object-cover rounded-lg mb-3 bg-zinc-200 dark:bg-zinc-700'
                }),
                h('p', { className: 'text-sm text-zinc-700 dark:text-zinc-300 line-clamp-4' }, 
                  hoverPost.selftext ? hoverPost.selftext.substring(0, 200) + (hoverPost.selftext.length > 200 ? '...' : '') : 'Link post — no preview available'
                )
              )
            )
          ),

          // Right - Post detail
          !detailCollapsed && h('aside', { className: `w-96 bg-white dark:bg-zinc-800 flex-col shrink-0 ${mobileView === 'detail' ? 'flex' : 'hidden lg:flex'}` },
            h('div', { className: 'p-3 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between' },
              h('div', { className: 'flex items-center gap-2' },
                h('button', {
                  onClick: () => setMobileView('posts'),
                  className: 'lg:hidden p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 transition-colors',
                  title: 'Back to posts'
                }, h('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                  h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M15 19l-7-7 7-7' })
                )),
                h('span', { className: 'text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400' }, 'Post Detail')
              ),
              h('button', {
                onClick: () => setDetailCollapsed(true),
                className: 'hidden lg:block p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 transition-colors',
                title: 'Collapse'
              }, h('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M13 5l7 7-7 7M5 5l7 7-7 7' })
              ))
            ),
            h('div', { className: 'flex-1 overflow-auto scrollbar-thin p-4' },
            !selectedPost
                ? h('div', { className: 'flex flex-col items-center justify-center h-full' },
                    h('div', { className: 'w-16 h-16 mb-4 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center' },
                      h('svg', { className: 'w-8 h-8 text-zinc-400', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                        h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z' }),
                        h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z' })
                      )
                    ),
                    h('p', { className: 'text-zinc-400 dark:text-zinc-500 text-sm' }, 'Select a post to view')
                  )
                : h('article', { className: 'space-y-4' },
                    h('div', { className: 'flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 flex-wrap' },
                      h('span', { className: 'px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-medium text-xs' }, `r/${selectedPost.subreddit}`),
                      selectedPost.link_flair_text && h('span', { 
                        className: 'px-1.5 py-0.5 rounded-full text-[10px] font-medium',
                        style: { backgroundColor: selectedPost.link_flair_background_color || '#e4e4e7', color: selectedPost.link_flair_text_color === 'light' ? '#fff' : '#18181b' }
                      }, selectedPost.link_flair_text),
                      h('span', null, timeAgo(selectedPost.created_utc))
                    ),
                    h('h2', { className: 'text-lg font-bold text-zinc-900 dark:text-white leading-snug' }, selectedPost.title),
                    (() => {
                      const detailRelevanceScore = postRelevanceScores.get(String(selectedPost.id));
                      const detailRelevanceMeta = postRelevanceMetadata.get(String(selectedPost.id));
                      if (detailRelevanceScore !== undefined && detailRelevanceScore !== null) {
                        return h('div', { 
                          className: 'flex items-center gap-2 py-1',
                          title: detailRelevanceMeta ? `${detailRelevanceMeta.confidence} confidence • ${detailRelevanceMeta.reason}` : `AI Relevance: ${detailRelevanceScore}/5`
                        },
                          h('span', {
                            className: `px-2 py-0.5 rounded text-xs font-bold font-mono shadow-sm ${aiScoresStale ? 'opacity-50' : ''} ${
                              detailRelevanceScore >= 5 ? 'bg-emerald-600 text-white ring-2 ring-emerald-300 dark:ring-emerald-400/30' :
                              detailRelevanceScore >= 4 ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-200' :
                              detailRelevanceScore >= 3 ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-200' :
                              'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400'
                            }`
                          }, `${aiScoresStale ? '~' : ''}${aiScoreLabel(detailRelevanceScore)} (${detailRelevanceScore}/5)`),
                          h('div', { 
                            className: 'w-16 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden'
                          },
                            h('div', { 
                              className: `h-full rounded-full transition-all ${
                                detailRelevanceScore >= 5 ? 'bg-emerald-600' :
                                detailRelevanceScore >= 4 ? 'bg-emerald-500 dark:bg-emerald-400' :
                                detailRelevanceScore >= 3 ? 'bg-amber-500 dark:bg-amber-400' :
                                'bg-zinc-400 dark:bg-zinc-500'
                              }`,
                              style: { width: `${Math.min(100, Math.max(0, (detailRelevanceScore / 5) * 100))}%` }
                            })
                          ),
                          showAiReasons && detailRelevanceMeta?.reason && h('span', { 
                            className: 'text-xs text-zinc-600 dark:text-zinc-400 line-clamp-1'
                          }, detailRelevanceMeta.reason)
                        );
                      }
                      return null;
                    })(),
                    h('div', { className: 'flex items-center gap-3 text-sm' },
                      h('span', { className: 'text-emerald-700 dark:text-emerald-400 font-medium' }, `▲ ${selectedPost.score}`),
                      h('span', { className: 'text-amber-700 dark:text-amber-400 font-medium' }, `💬 ${selectedPost.num_comments}`),
                      h('span', { className: 'text-zinc-500 dark:text-zinc-400' }, `u/${selectedPost.author}`)
                    ),
                    h('a', {
                      href: selectedPost.reddit_url || selectedPost.external_url,
                      target: '_blank',
                      rel: 'noreferrer',
                      className: 'inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 dark:bg-[#0284C7] text-white text-sm font-medium hover:bg-zinc-800 dark:hover:bg-[#0369A1] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900'
                    },
                      'Open on Reddit',
                      h('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                        h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14' })
                      )
                    ),
                    h('div', { className: 'border-t border-zinc-200 dark:border-zinc-700 pt-4' },
                      renderBody(selectedPost)
                  )
                )
          )
        ),

          // Collapsed detail toggle
          detailCollapsed && h('button', {
            onClick: () => setDetailCollapsed(false),
            className: 'hidden lg:flex items-center justify-center w-8 bg-white dark:bg-zinc-800 border-l border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors',
            title: 'Expand detail panel'
          }, h('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
            h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M11 19l-7-7 7-7m8 14l-7-7 7-7' })
          ))
        ),

        // Mobile bottom navigation
        h('nav', { className: 'lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-zinc-800 border-t border-zinc-200 dark:border-zinc-700 px-4 py-2 flex items-center justify-around z-40' },
          h('button', {
            onClick: () => setMobileView('subs'),
            className: `flex flex-col items-center gap-1 px-4 py-1 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900 ${mobileView === 'subs' ? 'text-[#0284C7] dark:text-sky-400' : 'text-zinc-500 dark:text-zinc-400'}`
          },
            h('svg', { className: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
              h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' })
            ),
            h('span', { className: 'text-xs font-medium' }, 'Subreddits')
          ),
          h('button', {
            onClick: () => setMobileView('posts'),
            className: `flex flex-col items-center gap-1 px-4 py-1 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900 ${mobileView === 'posts' ? 'text-[#0284C7] dark:text-sky-400' : 'text-zinc-500 dark:text-zinc-400'}`
          },
            h('svg', { className: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
              h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M4 6h16M4 10h16M4 14h16M4 18h16' })
            ),
            h('span', { className: 'text-xs font-medium' }, 'Posts')
          ),
          h('button', {
            onClick: () => setMobileView('detail'),
            className: `flex flex-col items-center gap-1 px-4 py-1 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900 ${mobileView === 'detail' ? 'text-[#0284C7] dark:text-sky-400' : 'text-zinc-500 dark:text-zinc-400'}`
          },
            h('svg', { className: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
              h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' })
            ),
            h('span', { className: 'text-xs font-medium' }, 'Detail')
          )
        ),

        // Add subreddit modal
        addSubOpen && h('div', { className: 'fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4', onClick: () => setAddSubOpen(false) },
          h('div', {
            className: 'w-full max-w-md bg-white dark:bg-zinc-800 rounded-xl shadow-xl',
            onClick: (e) => e.stopPropagation()
          },
            h('div', { className: 'p-4 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between' },
              h('h3', { className: 'font-semibold text-zinc-900 dark:text-white' }, 'Add Subreddits'),
                h('button', {
                  onClick: () => setAddSubOpen(false),
                  className: 'p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 transition-colors'
                }, h('svg', { className: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                  h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M6 18L18 6M6 6l12 12' })
              ))
            ),
            h('div', { className: 'p-4 space-y-4' },
              h('div', null,
                h('label', { className: 'block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5' }, 'Subreddit names'),
                h('textarea', {
                  ref: addSubInputRef,
                  value: addSubInput,
                  onChange: (e) => setAddSubInput(e.target.value),
                  placeholder: 'programming, webdev, javascript...',
                  className: 'w-full px-3 py-2 border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0284C7] focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-900 focus:border-transparent',
                  rows: 3
                }),
                h('p', { className: 'mt-1 text-xs text-zinc-500 dark:text-zinc-400' }, 'Separate with commas or new lines')
              ),
              h('div', null,
                h('p', { className: 'text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2' }, 'Popular'),
                h('div', { className: 'flex flex-wrap gap-1.5' },
                  POPULAR_SUBREDDITS.slice(0, 10).map(sub =>
                    h('button', {
                      key: sub,
                      onClick: () => { handleAddSub(sub); setAddSubOpen(false); },
                      disabled: subs.some(s => s.toLowerCase() === sub.toLowerCase()),
                      className: 'px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors'
                    }, sub)
                  )
                )
              )
            ),
            h('div', { className: 'p-4 border-t border-zinc-200 dark:border-zinc-700 flex justify-end gap-2' },
              h('button', {
                onClick: () => setAddSubOpen(false),
                className: 'px-4 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors'
              }, 'Cancel'),
              h('button', {
                onClick: handleAddSubSubmit,
                disabled: !addSubInput.trim(),
                className: 'px-4 py-2 rounded-lg text-sm font-medium bg-zinc-900 dark:bg-[#0284C7] text-white hover:bg-zinc-800 dark:hover:bg-[#0369A1] disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900'
              }, 'Add')
            )
          )
        ),

        // Settings modal
        settingsOpen && h('div', { className: 'fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4', onClick: () => setSettingsOpen(false) },
          h('div', {
            className: 'w-full max-w-lg bg-white dark:bg-zinc-800 rounded-xl shadow-xl max-h-[90vh] overflow-auto',
            onClick: (e) => e.stopPropagation()
          },
            h('div', { className: 'p-4 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between sticky top-0 bg-white dark:bg-zinc-800' },
              h('h3', { className: 'font-semibold text-zinc-900 dark:text-white' }, 'Settings'),
                h('button', {
                onClick: () => setSettingsOpen(false),
                className: 'p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 transition-colors'
              }, h('svg', { className: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M6 18L18 6M6 6l12 12' })
              ))
            ),
            h('div', { className: 'p-4 space-y-5' },
              h('div', { className: 'flex items-center justify-between' },
                h('div', null,
                  h('p', { className: 'font-medium text-zinc-900 dark:text-white' }, 'Auto-refresh'),
                  h('p', { className: 'text-sm text-zinc-500 dark:text-zinc-400' }, 'Automatically fetch new posts')
                ),
                h('div', { className: 'flex items-center gap-3' },
                  h('select', {
                    value: autoRefreshInterval,
                    onChange: (e) => setAutoRefreshInterval(Number(e.target.value)),
                    disabled: !autoRefreshEnabled,
                    className: 'px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed'
                  },
                    AUTO_REFRESH_OPTIONS.map(opt => h('option', { key: opt, value: opt }, `${opt} min`))
                  ),
                  h('button', {
                    onClick: () => setAutoRefreshEnabled(!autoRefreshEnabled),
                    className: `relative w-11 h-6 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900 ${autoRefreshEnabled ? 'bg-[#0284C7]' : 'bg-zinc-300 dark:bg-zinc-600'}`
                  },
                    h('span', { className: `absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${autoRefreshEnabled ? 'translate-x-5' : ''}` })
                  )
                )
              ),
              h('div', { className: 'grid grid-cols-2 gap-4' },
                h('label', { className: 'block' },
                  h('span', { className: 'text-sm font-medium text-zinc-700 dark:text-zinc-300' }, 'Feed type'),
                    h('select', {
                      value: mode,
                    onChange: (e) => setMode(e.target.value),
                    className: 'mt-1 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm'
                    },
                      h('option', { value: 'new' }, 'Latest posts'),
                      h('option', { value: 'top' }, 'Top posts')
                    )
                  ),
                  h('label', { className: 'block' },
                  h('span', { className: 'text-sm font-medium text-zinc-700 dark:text-zinc-300' }, 'Top posts time range'),
                    h('select', {
                      value: time,
                    onChange: (e) => setTime(e.target.value),
                      disabled: mode !== 'top',
                    className: 'mt-1 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed'
                    },
                      h('option', { value: 'hour' }, 'Hour'),
                      h('option', { value: 'day' }, 'Day'),
                      h('option', { value: 'week' }, 'Week'),
                      h('option', { value: 'month' }, 'Month')
                    )
                  ),
                h('label', { className: 'block' },
                  h('span', { className: 'text-sm font-medium text-zinc-700 dark:text-zinc-300' }, 'Time window'),
                    h('select', {
                      value: days,
                    onChange: (e) => setDays(Number(e.target.value)),
                    className: 'mt-1 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm'
                    },
                    h('option', { value: 1 }, 'Day'),
                      h('option', { value: 3 }, '3 Days'),
                    h('option', { value: 7 }, 'Week')
                    )
                  ),
                h('label', { className: 'block' },
                  h('span', { className: 'text-sm font-medium text-zinc-700 dark:text-zinc-300' }, 'Fetch depth'),
                    h('select', {
                      value: maxPages,
                    onChange: (e) => setMaxPages(Number(e.target.value)),
                    className: 'mt-1 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm'
                    },
                      [1, 2, 3, 5, 7, 10].map(n => h('option', { key: n, value: n }, n))
                  )
                )
              ),
              // Notifications section
              h('div', { className: 'pt-4 border-t border-zinc-200 dark:border-zinc-700' },
                h('p', { className: 'text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-3' }, 'Notifications'),
                h('div', { className: 'space-y-4' },
                  h('div', { className: 'flex items-center justify-between' },
                    h('div', null,
                      h('p', { className: 'font-medium text-zinc-900 dark:text-white' }, 'Enable alerts'),
                      h('p', { className: 'text-sm text-zinc-500 dark:text-zinc-400' }, 'Get notified on auto-refresh')
                    ),
                    h('div', { className: 'flex items-center gap-2' },
                      Notification.permission !== 'granted' && h('button', {
                        onClick: requestNotificationPermission,
                        className: 'px-2.5 py-1 text-xs font-medium rounded-full bg-sky-50 text-[#0369A1] dark:bg-[#0284C7]/15 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-[#0284C7]/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900'
                      }, 'Allow notifications'),
                      h('button', {
                        onClick: () => setNotificationsEnabled(!notificationsEnabled),
                        disabled: Notification.permission !== 'granted',
                        className: `relative w-11 h-6 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900 ${notificationsEnabled ? 'bg-[#0284C7]' : 'bg-zinc-300 dark:bg-zinc-600'}`
                      },
                        h('span', { className: `absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${notificationsEnabled ? 'translate-x-5' : ''}` })
                      )
                    )
                  ),
                  h('label', { className: 'block' },
                    h('span', { className: 'text-sm font-medium text-zinc-700 dark:text-zinc-300' }, 'Upvote threshold'),
                    h('p', { className: 'text-xs text-zinc-500 dark:text-zinc-400 mb-1' }, 'Alert when a post crosses this score'),
                    h('input', {
                      type: 'number',
                      value: upvoteThreshold,
                      onChange: (e) => setUpvoteThreshold(Number(e.target.value) || 100),
                      disabled: !notificationsEnabled,
                      className: 'w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed'
                    })
                  ),
                  h('label', { className: 'block' },
                    h('span', { className: 'text-sm font-medium text-zinc-700 dark:text-zinc-300' }, 'Alert keywords'),
                    h('p', { className: 'text-xs text-zinc-500 dark:text-zinc-400 mb-1' }, 'Notify when new posts contain these (comma-separated). Works even if Enable alerts is off.'),
                    h('input', {
                      type: 'text',
                      value: alertKeywords,
                      onChange: (e) => setAlertKeywords(e.target.value),
                      placeholder: 'breaking, launch, announcement...',
                      disabled: Notification.permission !== 'granted',
                      className: 'w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed'
                    })
                  ),
                  h('div', { className: 'flex items-center justify-between' },
                    h('div', null,
                      h('p', { className: 'font-medium text-zinc-900 dark:text-white' }, 'Notify on strong AI matches'),
                      h('p', { className: 'text-sm text-zinc-500 dark:text-zinc-400' }, 'Get notified when a post reaches your AI threshold (AI ranking must be enabled)')
                    ),
                    h('button', {
                      onClick: () => setNotifyHighRelevance(!notifyHighRelevance),
                      disabled: !aiEnabled || !aiGoals || !aiGoals.trim(),
                      className: `relative w-11 h-6 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900 ${notifyHighRelevance ? 'bg-[#0284C7]' : 'bg-zinc-300 dark:bg-zinc-600'}`
                    },
                      h('span', { className: `absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${notifyHighRelevance ? 'translate-x-5' : ''}` })
                    )
                  ),
                  h('label', { className: 'block' },
                    h('span', { className: 'text-sm font-medium text-zinc-700 dark:text-zinc-300' }, 'Strong-match threshold'),
                    h('p', { className: 'text-xs text-zinc-500 dark:text-zinc-400 mb-1' }, 'Minimum AI score (4 or 5) to trigger a notification'),
                    h('select', {
                      value: highRelevanceThreshold,
                      onChange: (e) => setHighRelevanceThreshold(Number(e.target.value) || 4),
                      disabled: !notifyHighRelevance || !aiEnabled,
                      className: 'w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed'
                    },
                      h('option', { value: 4 }, '4+'),
                      h('option', { value: 5 }, '5+')
                    )
                  )
                )
              ),
              // AI Relevance Ranking section
              h('div', { className: 'pt-4 border-t border-zinc-200 dark:border-zinc-700' },
                // Header: label + enable toggle
                h('div', { className: 'flex items-center justify-between mb-4' },
                  h('p', { className: 'text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide' }, 'AI Relevance Ranking'),
                  h('button', {
                    onClick: () => setAiEnabled(!aiEnabled),
                    title: aiEnabled ? 'Disable AI ranking' : 'Enable AI ranking',
                    className: `relative w-11 h-6 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900 ${aiEnabled ? 'bg-[#0284C7]' : 'bg-zinc-300 dark:bg-zinc-600'}`
                  },
                    h('span', { className: `absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${aiEnabled ? 'translate-x-5' : ''}` })
                  )
                ),
                h('div', { className: 'space-y-4' },

                  // 1. Goal
                  h('div', null,
                    h('div', { className: 'flex flex-wrap gap-1.5 mb-2' },
                      AI_PRESETS.map(preset => h('button', {
                        key: preset.id,
                        type: 'button',
                        onClick: () => applyPreset(preset),
                        disabled: !aiEnabled,
                        className: `px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${aiPresetId === preset.id ? 'bg-[#0284C7] text-white border-[#0284C7]' : 'border-zinc-200 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'} ${!aiEnabled ? 'opacity-50 cursor-not-allowed' : ''}`
                      },
                        h('span', { className: 'inline-flex items-center gap-1.5' },
                          renderPresetIcon(preset.id, aiPresetId === preset.id),
                          h('span', null, preset.label)
                        )
                      ))
                    ),
                    h('textarea', {
                      value: aiGoals,
                      onChange: (e) => setAiGoals(e.target.value),
                      placeholder: "Describe what you're looking for — e.g., \"I run an SEO agency and am looking for small business owners asking about SEO\"",
                      disabled: !aiEnabled,
                      rows: 3,
                      className: 'w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#0284C7] focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-900 focus:border-transparent resize-none'
                    })
                  ),

                  // 2. Tune (collapsible)
                  h('div', { className: 'rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden' },
                    h('button', {
                      type: 'button',
                      onClick: () => setAiAdvancedOpen(!aiAdvancedOpen),
                      disabled: !aiEnabled,
                      className: 'w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                    },
                      h('span', null, 'Tune'),
                      h('svg', { className: `w-4 h-4 text-zinc-400 transition-transform ${aiAdvancedOpen ? 'rotate-180' : ''}`, fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                        h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M19 9l-7 7-7-7' })
                      )
                    ),
                    aiAdvancedOpen && h('div', { className: 'px-3 pb-3 pt-3 space-y-3 border-t border-zinc-200 dark:border-zinc-700' },
                      h('label', { className: 'block' },
                        h('span', { className: 'text-xs font-medium text-zinc-700 dark:text-zinc-300' }, 'Exclude'),
                        h('p', { className: 'text-xs text-zinc-500 dark:text-zinc-400 mb-1' }, 'What should score low? e.g. job posts, memes, ads'),
                        h('input', {
                          type: 'text',
                          value: aiAvoid,
                          onChange: (e) => setAiAvoid(e.target.value),
                          placeholder: 'job postings, memes, generic questions without intent',
                          disabled: !aiEnabled,
                          className: 'w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#0284C7] focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-900 focus:border-transparent'
                        })
                      ),
                      h('label', { className: 'block' },
                        h('span', { className: 'text-xs font-medium text-zinc-700 dark:text-zinc-300' }, 'Extra context'),
                        h('p', { className: 'text-xs text-zinc-500 dark:text-zinc-400 mb-1' }, 'Optional constraints, e.g. "prefer posts with urgency or a budget mentioned"'),
                        h('input', {
                          type: 'text',
                          value: aiContext,
                          onChange: (e) => setAiContext(e.target.value),
                          placeholder: 'prioritize recent posts with active comments',
                          disabled: !aiEnabled,
                          className: 'w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#0284C7] focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-900 focus:border-transparent'
                        })
                      ),
                      h('div', null,
                        h('p', { className: 'text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1' }, 'Examples'),
                        h('p', { className: 'text-xs text-zinc-500 dark:text-zinc-400 mb-2' }, 'Give the model concrete references — optional but improves accuracy'),
                        h('div', { className: 'grid gap-2 sm:grid-cols-3' },
                          h('label', { className: 'block' },
                            h('span', { className: 'text-xs text-zinc-500 dark:text-zinc-400' }, 'Perfect (5)'),
                            h('textarea', {
                              value: aiExamplePerfect,
                              onChange: (e) => setAiExamplePerfect(e.target.value),
                              rows: 2,
                              disabled: !aiEnabled,
                              placeholder: 'Traffic dropped 50%, need SEO help, budget ready',
                              className: 'mt-1 w-full px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-xs disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#0284C7] resize-none'
                            })
                          ),
                          h('label', { className: 'block' },
                            h('span', { className: 'text-xs text-zinc-500 dark:text-zinc-400' }, 'Strong (4)'),
                            h('textarea', {
                              value: aiExampleStrong,
                              onChange: (e) => setAiExampleStrong(e.target.value),
                              rows: 2,
                              disabled: !aiEnabled,
                              placeholder: 'How can we improve local rankings?',
                              className: 'mt-1 w-full px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-xs disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#0284C7] resize-none'
                            })
                          ),
                          h('label', { className: 'block' },
                            h('span', { className: 'text-xs text-zinc-500 dark:text-zinc-400' }, 'Reject (0–1)'),
                            h('textarea', {
                              value: aiExampleReject,
                              onChange: (e) => setAiExampleReject(e.target.value),
                              rows: 2,
                              disabled: !aiEnabled,
                              placeholder: 'Hiring SEO specialist, $20/hr',
                              className: 'mt-1 w-full px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-xs disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#0284C7] resize-none'
                            })
                          )
                        )
                      )
                    )
                  ),

                  // 3. Model & Key (collapsible)
                  h('div', { className: 'rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden' },
                    h('button', {
                      type: 'button',
                      onClick: () => setAiShowModelKey(!aiShowModelKey),
                      disabled: !aiEnabled,
                      className: 'w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                    },
                      h('span', { className: 'flex items-center gap-2' },
                        'Model & Key',
                        secureKeyStatus.hasKey && h('span', { className: 'text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-medium' }, '\u2713 key saved')
                      ),
                      h('svg', { className: `w-4 h-4 text-zinc-400 transition-transform ${aiShowModelKey ? 'rotate-180' : ''}`, fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                        h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M19 9l-7 7-7-7' })
                      )
                    ),
                    aiShowModelKey && h('div', { className: 'px-3 pb-3 pt-3 space-y-4 border-t border-zinc-200 dark:border-zinc-700' },
                      // API Key
                      h('div', null,
                        h('p', { className: 'text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1' }, 'OpenRouter API Key'),
                        h('p', { className: 'text-xs text-zinc-500 dark:text-zinc-400 mb-2' },
                          'Get a free key at ',
                          h('a', { href: 'https://openrouter.ai/keys', target: '_blank', rel: 'noopener noreferrer', className: 'text-[#0284C7] dark:text-sky-400 hover:underline' }, 'openrouter.ai/keys')
                        ),
                        secureKeyStatus.hasKey
                          ? h('div', { className: 'flex items-center gap-2 p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800' },
                              h('svg', { className: 'w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                                h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' })
                              ),
                              h('div', { className: 'flex-1 min-w-0' },
                                h('p', { className: 'text-xs font-medium text-emerald-700 dark:text-emerald-300' }, 'Secure key stored'),
                                h('p', { className: 'text-xs text-emerald-600 dark:text-emerald-400 font-mono truncate' }, secureKeyStatus.keyPreview)
                              ),
                              h('button', {
                                onClick: deleteSecureApiKey,
                                className: 'p-1 text-emerald-600 dark:text-emerald-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors',
                                title: 'Remove key'
                              }, h('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                                h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' })
                              ))
                            )
                          : h('div', { className: 'flex gap-2' },
                              h('input', {
                                type: 'password',
                                value: openRouterApiKey,
                                onChange: (e) => setOpenRouterApiKey(e.target.value),
                                placeholder: 'sk-or-v1-...',
                                disabled: !aiEnabled,
                                className: 'flex-1 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#0284C7] focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-900 focus:border-transparent font-mono'
                              }),
                              openRouterApiKey.trim() && h('button', {
                                onClick: saveSecureApiKey,
                                disabled: savingSecureKey || !aiEnabled,
                                className: 'px-3 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap',
                                title: 'Save key securely (HttpOnly cookie)'
                              }, savingSecureKey ? 'Saving...' : 'Save securely')
                            ),
                        !secureKeyStatus.hasKey && openRouterApiKey.trim() && h('p', { className: 'mt-1 text-xs text-amber-600 dark:text-amber-400' },
                          '\u26a0\ufe0f Click "Save securely" to protect your key from XSS attacks'
                        )
                      ),
                      // Model
                      h('div', null,
                        h('p', { className: 'text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-2' }, 'Model'),
                        modelGroups.recommended.length > 0 && h('div', { className: 'mb-3 p-2.5 rounded-lg border border-sky-200 dark:border-[#0369A1]/55 bg-sky-50 dark:bg-[#0284C7]/10' },
                          h('p', { className: 'text-[10px] font-semibold text-[#0369A1] dark:text-sky-300 uppercase tracking-wide mb-1.5' }, 'Recommended'),
                          renderModelCard(modelGroups.recommended[0], { emphasize: true })
                        ),
                        h('div', { className: 'grid gap-2 sm:grid-cols-2' },
                          modelGroups.latestFree.length > 0
                            ? modelGroups.latestFree.map(model => renderModelCard(model, { compact: true }))
                            : h('p', { className: 'text-xs text-zinc-500 dark:text-zinc-400' }, 'No free models found.')
                        ),
                        showAllModels && h('div', { className: 'mt-2' },
                          h('select', {
                            value: openRouterModel,
                            onChange: (e) => setOpenRouterModel(e.target.value),
                            disabled: !aiEnabled,
                            className: 'w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#0284C7] focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-900 focus:border-transparent'
                          },
                            modelGroups.all.map(model =>
                              h('option', { key: `all-${model.id}`, value: model.id }, `${model.name} \u2014 ${model.hint}`)
                            )
                          )
                        ),
                        h('div', { className: 'mt-2 flex items-center justify-between gap-2' },
                          h('p', { className: 'text-xs text-zinc-500 dark:text-zinc-400 font-mono truncate' }, openRouterModel),
                          h('button', {
                            type: 'button',
                            onClick: () => setShowAllModels(!showAllModels),
                            disabled: !aiEnabled,
                            className: 'text-xs text-[#0284C7] dark:text-sky-400 hover:underline disabled:opacity-50 whitespace-nowrap shrink-0'
                          }, showAllModels ? 'Fewer' : 'All models')
                        ),
                        modelsLoading && h('p', { className: 'text-xs text-zinc-500 dark:text-zinc-400 mt-1' }, 'Loading models...'),
                        modelsError && h('p', { className: 'text-xs text-rose-600 dark:text-rose-400 mt-1' }, modelsError)
                      )
                    )
                  ),

                  // 4. Display options
                  h('div', { className: 'flex items-center justify-between text-sm' },
                    h('span', { className: 'text-zinc-600 dark:text-zinc-400' }, 'Score explanations in feed'),
                    h('button', {
                      onClick: () => setShowAiReasons(!showAiReasons),
                      disabled: !aiEnabled,
                      className: `px-2.5 py-1 rounded-full text-xs font-medium transition-colors disabled:opacity-50 ${showAiReasons ? 'bg-sky-100 dark:bg-[#0284C7]/20 text-[#0369A1] dark:text-sky-300' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300'}`
                    }, showAiReasons ? 'On' : 'Off')
                  ),

                  // 5. Prompt preview (toggle link)
                  h('div', null,
                    h('button', {
                      type: 'button',
                      onClick: () => setAiShowPromptPreview(!aiShowPromptPreview),
                      className: 'text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors flex items-center gap-1.5'
                    },
                      h('svg', { className: `w-3 h-3 transition-transform ${aiShowPromptPreview ? 'rotate-90' : ''}`, fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                        h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M9 5l7 7-7 7' })
                      ),
                      'Preview scoring prompt',
                      h('span', { className: 'px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-700 font-mono text-[10px]' }, AI_PROMPT_VERSION)
                    ),
                    aiShowPromptPreview && h('pre', { className: 'mt-2 max-h-44 overflow-auto whitespace-pre-wrap rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 p-2 text-[11px] text-zinc-700 dark:text-zinc-200' },
                      buildScoringPromptPreview({ goals: aiGoals, context: aiContext, avoid: aiAvoid, examples: { perfect: aiExamplePerfect, strong: aiExampleStrong, reject: aiExampleReject } })
                    )
                  ),

                  // 6. Status banners
                  aiRankingError && h('div', { className: 'p-2 rounded-lg border border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-900/20 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between gap-2' },
                    h('span', null, aiRankingError),
                    h('button', { onClick: () => setAiRankingError(null), className: 'text-rose-400 hover:text-rose-600 dark:hover:text-rose-200 shrink-0 font-medium' }, '\u00d7')
                  ),
                  aiScoresStale && !aiRankingError && h('div', { className: 'p-2 rounded-lg border border-amber-200 dark:border-amber-700/60 bg-amber-50/60 dark:bg-amber-900/20 text-xs text-amber-700 dark:text-amber-300' },
                    'Scores are cached \u2014 badges show ~ prefix. Re-run for fresh results.'
                  ),

                  // 7. Run ranking
                  h('div', { className: 'flex items-center gap-3' },
                    h('button', {
                      type: 'button',
                      onClick: rerankNow,
                      disabled: !aiEnabled || !aiGoals || !aiGoals.trim() || aiRankingLoading || loading || data.length === 0,
                      className: 'flex-1 px-3 py-2 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-[#0284C7] dark:hover:bg-[#0369A1] disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
                    }, aiRankingLoading ? 'Analyzing\u2026' : 'Run ranking'),
                    aiRankingLoading && h('div', { className: 'flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 shrink-0' },
                      h('div', { className: 'w-3 h-3 border-2 border-zinc-300 dark:border-zinc-600 border-t-zinc-600 dark:border-t-zinc-300 rounded-full animate-spin' })
                    )
                  )
                )
              )
            ),
            h('div', { className: 'p-4 border-t border-zinc-200 dark:border-zinc-700 flex justify-end sticky bottom-0 bg-white dark:bg-zinc-800' },
                h('button', {
                onClick: () => setSettingsOpen(false),
                className: 'px-4 py-2 rounded-lg text-sm font-medium bg-zinc-900 dark:bg-[#0284C7] text-white hover:bg-zinc-800 dark:hover:bg-[#0369A1] transition-colors'
              }, 'Done')
            )
          )
        )
      );
    }
    const AppWithAuth = authModule.createAppWithAuth
      ? authModule.createAppWithAuth({ App, h, useState, useEffect })
      : App;
    const root = createRoot(document.getElementById('root'));
    root.render(h(AppWithAuth));
})();
