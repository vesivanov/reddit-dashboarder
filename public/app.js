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
  OPPORTUNITY_PRIORITY_PRESETS,
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
      const makeSyncToken = () => {
        try {
          return `sync_${crypto.randomUUID()}`;
        } catch {
          return `sync_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        }
      };
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
          if (saved === '0') return 0;
          if (saved) return Math.max(1, Math.min(30, Number(saved) || 5));
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
      const [onboardingOpen, setOnboardingOpen] = useState(() => {
        try {
          return localStorage.getItem('dashboard_onboarding_complete') !== '1';
        } catch {
          return true;
        }
      });
      const [onboardingStep, setOnboardingStep] = useState(0);
      const [onboardingCompleted, setOnboardingCompleted] = useState(() => {
        try {
          return localStorage.getItem('dashboard_onboarding_complete') === '1';
        } catch {
          return false;
        }
      });
      const [onboardingSubInput, setOnboardingSubInput] = useState('');
      const [addSubOpen, setAddSubOpen] = useState(false);
      const [addSubInput, setAddSubInput] = useState('');
      const [minUpvoteFilter, setMinUpvoteFilter] = useState('');
      const [minCommentFilter, setMinCommentFilter] = useState('');
      const [minPriorityFilter, setMinPriorityFilter] = useState('');
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
      const [notifyStrongOpportunities, setNotifyStrongOpportunities] = useState(() => {
        try {
          return (localStorage.getItem('dashboard_notify_strong_opportunities')
            ?? localStorage.getItem('dashboard_notify_high_relevance')) === '1';
        } catch { return false; }
      });
      const [priorityNotificationThreshold, setPriorityNotificationThreshold] = useState(() => {
        try { 
          const val = Number(
            localStorage.getItem('dashboard_strong_opportunity_threshold')
            ?? localStorage.getItem('dashboard_high_relevance_threshold')
          ) || 4;
          // Clamp to valid range 0-5 (AI scores only go up to 5)
          return Math.max(0, Math.min(5, val));
        } catch { return 4; }
      });
      const [notifiedStrongOpportunityPostIds, setNotifiedStrongOpportunityPostIds] = useState(() => new Set());
      
      // Validate threshold is within valid range (0-5)
      useEffect(() => {
        if (priorityNotificationThreshold > 5) {
          setPriorityNotificationThreshold(4);
        } else if (priorityNotificationThreshold < 0) {
          setPriorityNotificationThreshold(0);
        }
      }, [priorityNotificationThreshold]);
      const [mobileView, setMobileView] = useState('posts');
      const [touchStart, setTouchStart] = useState(null);
      const [opportunityBrief, setOpportunityBrief] = useState(() => {
        try { return localStorage.getItem('dashboard_ai_goals') || ''; } catch { return ''; }
      });
      const [opportunityContext, setOpportunityContext] = useState(() => {
        try { return localStorage.getItem('dashboard_ai_context') || ''; } catch { return ''; }
      });
      const [businessOffering, setBusinessOffering] = useState(() => {
        try { return localStorage.getItem('dashboard_business_offering') || ''; } catch { return ''; }
      });
      const [idealCustomer, setIdealCustomer] = useState(() => {
        try { return localStorage.getItem('dashboard_ideal_customer') || ''; } catch { return ''; }
      });
      const [problemsSolved, setProblemsSolved] = useState(() => {
        try { return localStorage.getItem('dashboard_problems_solved') || ''; } catch { return ''; }
      });
      const [preferredEngagement, setPreferredEngagement] = useState(() => {
        try { return localStorage.getItem('dashboard_preferred_engagement') || 'reply'; } catch { return 'reply'; }
      });
      const [strategyPreset, setStrategyPreset] = useState(() => {
        try { return localStorage.getItem('dashboard_strategy_preset') || 'balanced'; } catch { return 'balanced'; }
      });
      const [opportunityFocus, setOpportunityFocus] = useState(() => {
        try { return localStorage.getItem('dashboard_opportunity_focus') || 'lead,pain_point,tool_search'; } catch { return 'lead,pain_point,tool_search'; }
      });
      const [opportunityStrictness, setOpportunityStrictness] = useState(() => {
        try { return localStorage.getItem('dashboard_opportunity_strictness') || 'balanced'; } catch { return 'balanced'; }
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
      const [opportunityEngineEnabled, setOpportunityEngineEnabled] = useState(() => {
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
      const [postScoreProxies, setPostScoreProxies] = useState(new Map());
      const [postScoreMetadata, setPostScoreMetadata] = useState(new Map());
      const [postOpportunities, setPostOpportunities] = useState(new Map());
      const [scoresVersion, setScoresVersion] = useState(0); // Version counter to force useMemo recalculation
      const [opportunityScanLoading, setOpportunityScanLoading] = useState(false);
      const [aiScoresStale, setAiScoresStale] = useState(false);
      const [opportunityScanError, setOpportunityScanError] = useState(null);
      const [aiRateLimitPauseUntil, setAiRateLimitPauseUntil] = useState(null);
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
      const [syncToken, setSyncToken] = useState(() => {
        try {
          return localStorage.getItem('dashboard_sync_token') || makeSyncToken();
        } catch {
          return makeSyncToken();
        }
      });
      const [fetchSummary, setFetchSummary] = useState(null);
      const loadingRef = useRef(false);
      const addSubInputRef = useRef(null);
      const opportunityScanRequestIdRef = useRef(0);
      const hydratedOpportunityConfigRef = useRef(null);

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

      useEffect(() => {
        try {
          localStorage.setItem('dashboard_onboarding_complete', onboardingCompleted ? '1' : '0');
        } catch {}
      }, [onboardingCompleted]);

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
        try { localStorage.setItem('dashboard_notify_strong_opportunities', notifyStrongOpportunities ? '1' : '0'); } catch {}
      }, [notifyStrongOpportunities]);
      useEffect(() => {
        try { localStorage.setItem('dashboard_strong_opportunity_threshold', String(priorityNotificationThreshold)); } catch {}
      }, [priorityNotificationThreshold]);

      // AI settings persistence
      useEffect(() => {
        try { localStorage.setItem('dashboard_ai_goals', opportunityBrief); } catch {}
      }, [opportunityBrief]);
      useEffect(() => {
        try { localStorage.setItem('dashboard_ai_context', opportunityContext); } catch {}
      }, [opportunityContext]);
      useEffect(() => {
        try { localStorage.setItem('dashboard_business_offering', businessOffering); } catch {}
      }, [businessOffering]);
      useEffect(() => {
        try { localStorage.setItem('dashboard_ideal_customer', idealCustomer); } catch {}
      }, [idealCustomer]);
      useEffect(() => {
        try { localStorage.setItem('dashboard_problems_solved', problemsSolved); } catch {}
      }, [problemsSolved]);
      useEffect(() => {
        try { localStorage.setItem('dashboard_preferred_engagement', preferredEngagement); } catch {}
      }, [preferredEngagement]);
      useEffect(() => {
        try { localStorage.setItem('dashboard_strategy_preset', strategyPreset); } catch {}
      }, [strategyPreset]);
      useEffect(() => {
        try { localStorage.setItem('dashboard_opportunity_focus', opportunityFocus); } catch {}
      }, [opportunityFocus]);
      useEffect(() => {
        try { localStorage.setItem('dashboard_opportunity_strictness', opportunityStrictness); } catch {}
      }, [opportunityStrictness]);
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
        try { localStorage.setItem('dashboard_ai_enabled', opportunityEngineEnabled ? '1' : '0'); } catch {}
      }, [opportunityEngineEnabled]);
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

      const normalizedOpportunityFocus = useMemo(() => {
        return opportunityFocus
          .split(',')
          .map(item => item.trim())
          .filter(Boolean)
          .slice(0, 8);
      }, [opportunityFocus]);

      const effectiveGoalText = useMemo(() => {
        const lines = [];
        if (businessOffering.trim()) lines.push(`Offering: ${businessOffering.trim()}`);
        if (idealCustomer.trim()) lines.push(`Ideal customer: ${idealCustomer.trim()}`);
        if (problemsSolved.trim()) lines.push(`Problems solved: ${problemsSolved.trim()}`);
        if (normalizedOpportunityFocus.length) lines.push(`Prioritize opportunities: ${normalizedOpportunityFocus.join(', ')}`);
        if (opportunityBrief.trim()) lines.push(`Additional goal: ${opportunityBrief.trim()}`);
        return lines.join('\n');
      }, [businessOffering, idealCustomer, problemsSolved, normalizedOpportunityFocus, opportunityBrief]);

      const effectiveContextText = useMemo(() => {
        const parts = [];
        if (preferredEngagement === 'reply') parts.push('Preferred engagement style: public reply first.');
        if (preferredEngagement === 'dm') parts.push('Preferred engagement style: direct outreach or DM when appropriate.');
        if (preferredEngagement === 'either') parts.push('Preferred engagement style: either public reply or direct outreach.');
        if (preferredEngagement === 'research') parts.push('Preferred engagement style: research only, do not optimize for direct outreach.');
        if (strategyPreset === 'sales') parts.push('Ranking strategy: optimize for sales opportunities and likely client conversion.');
        if (strategyPreset === 'fast_wins') parts.push('Ranking strategy: optimize for easy engagement and quick response likelihood.');
        if (strategyPreset === 'research') parts.push('Ranking strategy: optimize for research value, pain points, and messaging insight.');
        if (strategyPreset === 'balanced') parts.push('Ranking strategy: balance engagement likelihood, fit, urgency, and conversion potential.');
        if (opportunityStrictness === 'strict') parts.push('Strictness: favor precision, be conservative with high scores.');
        if (opportunityStrictness === 'broad') parts.push('Strictness: favor recall, include weaker but potentially useful opportunities.');
        if (opportunityStrictness === 'balanced') parts.push('Strictness: balanced precision and recall.');
        if (opportunityContext.trim()) parts.push(opportunityContext.trim());
        return parts.join('\n');
      }, [preferredEngagement, strategyPreset, opportunityStrictness, opportunityContext]);

      const effectiveAvoidText = useMemo(() => {
        return aiAvoid.trim();
      }, [aiAvoid]);

      const hasOpportunityGoals = Boolean(effectiveGoalText.trim());

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

      useEffect(() => {
        try {
          if (syncToken) localStorage.setItem('dashboard_sync_token', syncToken);
        } catch {}
      }, [syncToken]);

      // Restore and apply AI scores on initial load with restored data
      const hasRestoredScoresRef = useRef(false);
      useEffect(() => {
        // Only run once when data is available, AI is enabled, and we haven't restored scores yet
        if (data.length > 0 && opportunityEngineEnabled && hasOpportunityGoals && postScoreProxies.size === 0 && !hasRestoredScoresRef.current) {
          hasRestoredScoresRef.current = true;
          // Load cached scores
          try {
            const cacheStr = localStorage.getItem('dashboard_ai_scores_cache');
            if (cacheStr) {
              const cache = JSON.parse(cacheStr);
              const now = Date.now();
              const CACHE_EXPIRY = AI_CACHE_EXPIRY_MS;
              const CACHE_VERSION_KEY = 'dashboard_ai_cache_version';
              const combinedGoals = `${effectiveGoalText.trim()}||${effectiveContextText.trim()}`;
              const currentGoalsHash = hashGoals(combinedGoals);
              const currentCacheVersion = `${currentGoalsHash}_${AI_PROMPT_VERSION}_${openRouterModel}`;
              const savedCacheVersion = localStorage.getItem(CACHE_VERSION_KEY);
              const cacheVersionMismatch = savedCacheVersion && savedCacheVersion !== currentCacheVersion;
              if (cacheVersionMismatch) {
                setAiScoresStale(true);
              }
              const rawScores = new Map();
              const metadata = new Map();
              const opportunities = new Map();
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
                  if (cachedData.opportunity && typeof cachedData.opportunity === 'object') {
                    opportunities.set(postId, cachedData.opportunity);
                  }
                }
              });
              
              if (rawScores.size > 0) {
                const highRelevanceCount = Array.from(rawScores.values()).filter(s => s !== null && s !== undefined && s >= 4).length;
                setPostScoreProxies(rawScores);
                setPostScoreMetadata(metadata);
                setPostOpportunities(opportunities);
                setScoresVersion(v => v + 1);
                setAiScoresStale(Boolean(cacheVersionMismatch || staleByAge));
              }
            }
          } catch (error) {}
        }
      }, [data, opportunityEngineEnabled, hasOpportunityGoals, effectiveGoalText, effectiveContextText, postScoreProxies.size, openRouterModel, AI_PROMPT_VERSION]); // Run when data or AI settings change

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

      useEffect(() => {
        if (!authenticated || !syncToken) return;
        if (hydratedOpportunityConfigRef.current === syncToken) return;

        let cancelled = false;
        async function loadOpportunityConfig() {
          try {
            const response = await fetch(`/api/settings/opportunity-config?token=${encodeURIComponent(syncToken)}`, {
              credentials: 'include',
              cache: 'no-store',
            });
            if (response.status === 404) {
              hydratedOpportunityConfigRef.current = syncToken;
              return;
            }
            if (!response.ok) return;

            const payload = await response.json();
            const config = payload?.config || {};
            const opportunityConfig = config.opportunityConfig || {};
            const scoringConfig = config.scoringConfig || {};
            const examples = scoringConfig.examples || {};

            if (cancelled) return;

            if (Array.isArray(config.subreddits) && config.subreddits.length > 0) setSubs(config.subreddits);
            setOpportunityBrief(config.goals || '');
            setOpportunityContext(config.aiContext || '');
            setBusinessOffering(opportunityConfig.businessOffering || '');
            setIdealCustomer(opportunityConfig.idealCustomer || '');
            setProblemsSolved(opportunityConfig.problemsSolved || '');
            setPreferredEngagement(opportunityConfig.preferredEngagement || 'reply');
            setStrategyPreset(opportunityConfig.strategyPreset || 'balanced');
            setOpportunityFocus(Array.isArray(opportunityConfig.opportunityTypes) ? opportunityConfig.opportunityTypes.join(',') : '');
            setOpportunityStrictness(opportunityConfig.strictness || 'balanced');
            setAiAvoid(scoringConfig.avoid || '');
            setAiExamplePerfect(examples.perfect || '');
            setAiExampleStrong(examples.strong || '');
            setAiExampleReject(examples.reject || '');
            if (config.threshold !== undefined && config.threshold !== null) {
              setPriorityNotificationThreshold(Math.max(0, Math.min(5, Number(config.threshold) || 4)));
            }
            if (config.model) setOpenRouterModel(config.model);
            if (config.opportunityConfig || config.goals || config.aiContext) setOpportunityEngineEnabled(true);

            hydratedOpportunityConfigRef.current = syncToken;
          } catch {}
        }

        loadOpportunityConfig();
        return () => { cancelled = true; };
      }, [authenticated, syncToken]);

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
        if (!settingsOpen || !opportunityEngineEnabled) return;
        loadOpenRouterModels();
      }, [settingsOpen, opportunityEngineEnabled, loadOpenRouterModels]);

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

      const getOpportunityForPost = useCallback((postId) => {
        return postOpportunities.get(String(postId)) || null;
      }, [postOpportunities]);

      const getPriorityScore = useCallback((postId) => {
        const opportunity = getOpportunityForPost(postId);
        if (opportunity?.scores?.priority !== undefined && opportunity?.scores?.priority !== null) {
          return Number(opportunity.scores.priority) || 0;
        }
        const relevance = postScoreProxies.get(String(postId));
        if (relevance !== undefined && relevance !== null) return (Number(relevance) || 0) / 5;
        return null;
      }, [getOpportunityForPost, postScoreProxies]);

      const getOpportunityTypeLabel = useCallback((postId) => {
        const type = getOpportunityForPost(postId)?.classification?.type || null;
        if (!type) return null;
        return String(type).replace(/_/g, ' ');
      }, [getOpportunityForPost]);

      const getRecommendedActionLabel = useCallback((postId) => {
        const action = getOpportunityForPost(postId)?.action?.recommended || null;
        if (!action) return null;
        return String(action).replace(/_/g, ' ');
      }, [getOpportunityForPost]);

      const formatSignalLabel = useCallback((key) => {
        return String(key || '')
          .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
          .replace(/_/g, ' ')
          .replace(/^./, (char) => char.toUpperCase());
      }, []);

      const getOpportunitySignalSummary = useCallback((opportunity) => {
        const signalEntries = Object.entries(opportunity?.signals || {})
          .filter(([_, value]) => Number.isFinite(Number(value)))
          .sort((a, b) => Number(b[1]) - Number(a[1]));

        if (!signalEntries.length) return '';

        return signalEntries
          .slice(0, 4)
          .map(([key, value]) => `${formatSignalLabel(key)} ${Math.round(Number(value) * 100)}`)
          .join(' • ');
      }, [formatSignalLabel]);

      const buildSyncSettings = useCallback(() => ({
        subreddits: subs.map(normalizeSubredditName).filter(Boolean),
        opportunityBrief,
        opportunityContext,
        aiAvoid,
        aiPrompt: opportunityBrief,
        aiThreshold: priorityNotificationThreshold,
        openRouterModel,
        scoringConfig: {
          lookingFor: effectiveGoalText.trim() || opportunityBrief.trim(),
          avoid: effectiveAvoidText.trim() || undefined,
          examples: {
            perfect: aiExamplePerfect.trim() || undefined,
            strong: aiExampleStrong.trim() || undefined,
            reject: aiExampleReject.trim() || undefined,
          },
        },
        opportunityConfig: {
          businessOffering: businessOffering.trim(),
          idealCustomer: idealCustomer.trim(),
          problemsSolved: problemsSolved.trim(),
          preferredEngagement,
          strategyPreset,
          opportunityTypes: normalizedOpportunityFocus,
          strictness: opportunityStrictness,
        },
      }), [
        subs,
        opportunityBrief,
        opportunityContext,
        aiAvoid,
        priorityNotificationThreshold,
        openRouterModel,
        effectiveGoalText,
        effectiveAvoidText,
        aiExamplePerfect,
        aiExampleStrong,
        aiExampleReject,
        businessOffering,
        idealCustomer,
        problemsSolved,
        preferredEngagement,
        strategyPreset,
        normalizedOpportunityFocus,
        opportunityStrictness,
        normalizeSubredditName,
      ]);

      const buildSyncFilters = useCallback(() => ({
        minScore: parseNumberFilter(minUpvoteFilter) ?? undefined,
        minComments: parseNumberFilter(minCommentFilter) ?? undefined,
        minPriority: parseNumberFilter(minPriorityFilter) ?? undefined,
        keyword: keyword.trim() || undefined,
      }), [minUpvoteFilter, minCommentFilter, minPriorityFilter, keyword]);

      const syncDashboardSnapshot = useCallback(async (groupsOverride) => {
        const groups = Array.isArray(groupsOverride) ? groupsOverride : data;
        if (!authenticated || !syncToken || !Array.isArray(groups) || groups.length === 0) return;

        const posts = groups.flatMap(group => (group.posts || []).map(post => {
          const postId = String(post.id);
          const opportunity = postOpportunities.get(postId) || null;
          const metadata = postScoreMetadata.get(postId) || post.aiMetadata || null;
          return {
            id: post.id,
            subreddit: post.subreddit,
            title: post.title,
            selftext: (post.selftext || '').slice(0, 2000),
            author: post.author || '',
            reddit_url: post.reddit_url,
            external_url: post.external_url,
            domain: post.domain,
            score: post.score,
            num_comments: post.num_comments,
            created_utc: post.created_utc,
            link_flair_text: post.link_flair_text || '',
            aiRelevance: postScoreProxies.get(postId) ?? post.aiRelevance ?? null,
            aiMetadata: metadata ? {
              source: metadata.source || null,
              confidence: metadata.confidence || null,
              reason: metadata.reason || null,
            } : null,
            aiOpportunity: opportunity ? {
              classification: opportunity.classification || null,
              scores: opportunity.scores || null,
              action: opportunity.action || null,
              explanation: opportunity.explanation ? { summary: opportunity.explanation.summary || '' } : null,
            } : (post.aiOpportunity || null),
            aiPriority: opportunity?.scores?.priority ?? post.aiPriority ?? null,
          };
        }));

        try {
          const response = await fetch('/api/sync', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token: syncToken,
              posts,
              settings: buildSyncSettings(),
              filters: buildSyncFilters(),
              timestamp: new Date().toISOString(),
            }),
          });
          if (response.ok) {
            setSnapshotInfo(prev => ({ ...(prev || {}), syncToken }));
          }
        } catch {}
      }, [
        data,
        authenticated,
        syncToken,
        postOpportunities,
        postScoreProxies,
        postScoreMetadata,
        buildSyncSettings,
        buildSyncFilters,
      ]);

      const syncOpportunityConfig = useCallback(async () => {
        if (!authenticated || !syncToken) return;
        try {
          await fetch('/api/settings/opportunity-config', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token: syncToken,
              subreddits: subs.map(normalizeSubredditName).filter(Boolean),
              goals: opportunityBrief,
              aiContext: opportunityContext,
              aiPrompt: opportunityBrief,
              opportunityConfig: buildSyncSettings().opportunityConfig,
              scoringConfig: buildSyncSettings().scoringConfig,
              threshold: priorityNotificationThreshold,
              model: openRouterModel,
            }),
          });
        } catch {}
      }, [
        authenticated,
        syncToken,
        subs,
        opportunityBrief,
        opportunityContext,
        priorityNotificationThreshold,
        openRouterModel,
        buildSyncSettings,
        normalizeSubredditName,
      ]);

      const filteredBySub = useMemo(() => {
        if (selectedSub === 'ALL') return allPosts;
        const selected = selectedSub.toLowerCase();
        return allPosts.filter(post => post.subreddit?.toLowerCase() === selected);
      }, [allPosts, selectedSub]);

      const visiblePosts = useMemo(() => {
        const q = keyword.trim().toLowerCase();
        const minScore = parseNumberFilter(minUpvoteFilter);
        const minCommentsValue = parseNumberFilter(minCommentFilter);
        const minAiScore = parseNumberFilter(minPriorityFilter);

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
          // Opportunity priority filter
          if (minAiScore !== null) {
            const aiScore = postScoreProxies.get(String(post.id));
            const priorityScore = getPriorityScore(post.id);
            const normalizedThreshold = minAiScore / 5;
            const passesPriority = priorityScore !== null && priorityScore >= normalizedThreshold;
            const passesLegacy = aiScore !== null && aiScore !== undefined && aiScore >= minAiScore;
            if (!passesPriority && !passesLegacy) return false;
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
            case 'priority': {
              const scoreA = getPriorityScore(a.id);
              const scoreB = getPriorityScore(b.id);
              const metaA = postScoreMetadata.get(String(a.id));
              const metaB = postScoreMetadata.get(String(b.id));
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
      }, [filteredBySub, keyword, minUpvoteFilter, minCommentFilter, minPriorityFilter, sortBy, sortOrder, hiddenPosts, postScoreProxies, postScoreMetadata, getPriorityScore, scoresVersion]);

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

      const selectedPostVelocity = useMemo(() => {
        if (!selectedPost) return null;
        return velocityMeta.map.get(String(selectedPost.id)) || null;
      }, [selectedPost, velocityMeta]);

      const selectedPostWhyItems = useMemo(() => {
        if (!selectedPost) return [];
        const meta = postScoreMetadata.get(String(selectedPost.id)) || null;
        const opportunity = getOpportunityForPost(selectedPost.id);
        const velocity = selectedPostVelocity;
        const items = [];
        if (opportunity?.classification?.type) {
          items.push({ label: 'Opportunity', value: String(opportunity.classification.type).replace(/_/g, ' ') });
        }
        if (opportunity?.action?.recommended) {
          items.push({ label: 'Recommended action', value: String(opportunity.action.recommended).replace(/_/g, ' ') });
        }
        if (opportunity?.explanation?.summary) {
          items.push({ label: 'Opportunity summary', value: opportunity.explanation.summary });
        }
        if (Array.isArray(opportunity?.explanation?.bullets) && opportunity.explanation.bullets.length > 0) {
          items.push({ label: 'Why now', value: opportunity.explanation.bullets.join(' • ') });
        }
        if (opportunity?.scores) {
          const scoreBits = [
            Number.isFinite(Number(opportunity.scores.priority)) ? `Priority ${Math.round(Number(opportunity.scores.priority) * 100)}` : null,
            Number.isFinite(Number(opportunity.scores.clientConversionLikelihood)) ? `Conversion ${Math.round(Number(opportunity.scores.clientConversionLikelihood) * 100)}` : null,
            Number.isFinite(Number(opportunity.scores.replyLikelihood)) ? `Reply ${Math.round(Number(opportunity.scores.replyLikelihood) * 100)}` : null,
          ].filter(Boolean);
          if (scoreBits.length) {
            items.push({ label: 'Engine scores', value: scoreBits.join(' • ') });
          }
        }
        const signalSummary = getOpportunitySignalSummary(opportunity);
        if (signalSummary) {
          items.push({ label: 'Signals', value: signalSummary });
        }
        if (meta?.reason) {
          items.push({ label: 'AI summary', value: meta.reason });
        }
        if (meta?.confidence || meta?.source) {
          items.push({
            label: 'Score source',
            value: [
              meta.source === 'llm' ? 'LLM-ranked' : meta?.source === 'heuristic' ? 'Heuristic-ranked' : null,
              meta?.confidence ? `${meta.confidence} confidence` : null
            ].filter(Boolean).join(' • ')
          });
        }
        if (meta?.debug?.matchedKeywords?.length) {
          items.push({ label: 'Matched signals', value: meta.debug.matchedKeywords.slice(0, 5).join(', ') });
        }
        if (velocity) {
          items.push({
            label: 'Momentum',
            value: `${formatVelocity(velocity.upvotesPerHour)}/h upvotes • ${formatVelocity(velocity.commentsPerHour)}/h comments`
          });
        }
        if (selectedPost.link_flair_text) {
          items.push({ label: 'Context', value: `Flair: ${selectedPost.link_flair_text}` });
        }
        if (!items.length) {
          items.push({
            label: 'Signal',
            value: buildWhyLine({
              post: selectedPost,
              relevanceMeta: meta,
              upvotesPerHour: velocity?.upvotesPerHour,
              commentsPerHour: velocity?.commentsPerHour,
            }),
          });
        }
        return items;
      }, [selectedPost, postScoreMetadata, selectedPostVelocity, getOpportunityForPost, getOpportunitySignalSummary]);

      const selectedPostNextAction = useMemo(() => {
        if (!selectedPost) return '';
        const opportunity = getOpportunityForPost(selectedPost.id);
        const recommended = opportunity?.action?.recommended || '';
        if (recommended === 'reply_now') return 'Recommended action: reply now while the thread is still active.';
        if (recommended === 'dm_if_possible') return 'Recommended action: consider direct outreach if the thread context allows it.';
        if (recommended === 'save_for_followup') return 'Recommended action: save for follow-up and revisit when you can engage well.';
        if (recommended === 'research') return 'Recommended action: use this as market research or messaging input.';
        if (recommended === 'ignore') return 'Recommended action: ignore unless the thread evolves.';
        const score = postScoreProxies.get(String(selectedPost.id));
        if (score >= 4) return 'High-priority thread. Open it now and decide whether to reply, DM, or save it.';
        if (score >= 3) return 'Worth a quick review. Check the thread for clear intent or follow-up context.';
        return 'Lower-confidence match. Keep it in view only if the discussion fits your goals.';
      }, [selectedPost, postScoreProxies, getOpportunityForPost]);

      const aiScoreStats = useMemo(() => {
        const stats = { total: allPosts.length, scored: 0, llm: 0, high: 0, visibleHigh: 0 };
        if (!allPosts.length) return stats;
        for (const post of allPosts) {
          const postId = String(post.id);
          const score = postScoreProxies.get(postId);
          if (score !== null && score !== undefined) {
            stats.scored += 1;
            if (score >= 4) stats.high += 1;
          }
          const meta = postScoreMetadata.get(postId);
          if (meta && meta.source === 'llm') stats.llm += 1;
        }
        for (const post of visiblePosts) {
          const score = postScoreProxies.get(String(post.id));
          if (score !== null && score !== undefined && score >= 4) stats.visibleHigh += 1;
        }
        return stats;
      }, [allPosts, visiblePosts, postScoreProxies, postScoreMetadata, scoresVersion]);

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
        if (!opportunityEngineEnabled || !hasOpportunityGoals) {
          setPostScoreProxies(new Map());
          setPostScoreMetadata(new Map());
          setPostOpportunities(new Map());
          setScoresVersion(v => v + 1);
          return;
        }

        const groups = Array.isArray(perSub) ? perSub : data;
        let effectiveLlmLimit = Math.max(10, Math.min(MAX_LLM_POST_LIMIT, Number(llmPostLimit) || DEFAULT_LLM_POST_LIMIT));
        if (groups.length >= 20) {
          effectiveLlmLimit = Math.min(effectiveLlmLimit, 40);
        } else if (groups.length >= 12) {
          effectiveLlmLimit = Math.min(effectiveLlmLimit, 60);
        }
        if (aiRateLimitPauseUntil && aiRateLimitPauseUntil > Date.now()) {
          if (triggeredByAuto) {
            setOpportunityScanError(`Opportunity ranking cooling down for ${formatTimeUntil(aiRateLimitPauseUntil)}.`);
          }
          return;
        }

        try {
          // Cache versioning: invalidate if goals, model, or prompt version changed
          const combinedGoals = `${effectiveGoalText.trim()}||${effectiveContextText.trim()}`;
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
          let cachedOpportunities = new Map();
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
                        reason: data.reason || 'Cached opportunity score',
                        debug: data.debug || null,
                      });
                    }
                    if (data.opportunity && typeof data.opportunity === 'object') {
                      cachedOpportunities.set(postId, data.opportunity);
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
            const thisRequestId = ++opportunityScanRequestIdRef.current;
            setOpportunityScanError(null);
            setOpportunityScanLoading(true);
            
            // Two-stage ranking: heuristic prefilter + LLM rerank
            const keywords = extractGoalKeywords(effectiveGoalText.trim());
            
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
            
            let scoresForHighRelevance = null;
            try {
              const allScores = new Map(cachedScores);
              const allMetadata = new Map(cachedMetadata); // Store metadata for all scored posts
              const allOpportunities = new Map(cachedOpportunities);
              const cache = {};
              
              // Load existing cache
              try {
                const existingCache = localStorage.getItem('dashboard_ai_scores_cache');
                if (existingCache) {
                  Object.assign(cache, JSON.parse(existingCache));
                }
              } catch {}
              
              const scoredPostMap = new Map(topPosts.map(p => [String(p.id), p]));
              const response = await fetch('/api/reddit/ai-rank', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  posts: topPosts.map(p => ({
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
                  userGoals: effectiveGoalText.trim(),
                  userContext: effectiveContextText && effectiveContextText.trim() ? effectiveContextText.trim() : undefined,
                  scoringConfig: {
                    lookingFor: effectiveGoalText.trim(),
                    avoid: effectiveAvoidText && effectiveAvoidText.trim() ? effectiveAvoidText.trim() : undefined,
                    examples: {
                      perfect: aiExamplePerfect && aiExamplePerfect.trim() ? aiExamplePerfect.trim() : undefined,
                      strong: aiExampleStrong && aiExampleStrong.trim() ? aiExampleStrong.trim() : undefined,
                      reject: aiExampleReject && aiExampleReject.trim() ? aiExampleReject.trim() : undefined,
                    },
                  },
                  openRouterApiKey: secureKeyStatus.hasKey ? undefined : (openRouterApiKey.trim() || undefined),
                  openRouterModel: openRouterModel.trim(),
                  modelTemperature: AI_FIXED_TEMPERATURE,
                  modelTopP: AI_FIXED_TOP_P
                }),
              });

              if (!response.ok) {
                let retryAfterSeconds = Number(response.headers.get('Retry-After')) || 0;
                let parsedError = null;
                try { parsedError = await response.json(); } catch {}
                retryAfterSeconds = Number(parsedError?.retryAfter) || retryAfterSeconds || 0;
                if (response.status === 429 && retryAfterSeconds > 0) {
                  const pauseUntil = Date.now() + retryAfterSeconds * 1000;
                  setAiRateLimitPauseUntil(pauseUntil);
                  setOpportunityScanError(`Opportunity ranking rate-limited. Cooling down ~${retryAfterSeconds}s.`);
                }
                throw new Error(parsedError?.message || `AI ranking failed with HTTP ${response.status}`);
              }

              setAiRateLimitPauseUntil(null);
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
              const scoresObj = result.scores || {};
              const metadataObj = result.metadata || {};
              const opportunitiesObj = result.opportunities || {};
              if (scoresObj && typeof scoresObj === 'object' && !Array.isArray(scoresObj)) {
                Object.entries(scoresObj).forEach(([postId, relevanceScore]) => {
                  const postIdStr = String(postId);
                  if (relevanceScore !== null && relevanceScore !== undefined) {
                    allScores.set(postIdStr, relevanceScore);
                    const meta = metadataObj[postId] || {};
                    const opportunity = opportunitiesObj[postId] || null;
                    const heuristicDetails = heuristicDetailsById.get(postIdStr);
                    allMetadata.set(postIdStr, {
                      source: 'llm',
                      confidence: meta.confidence || 'medium',
                      reason: meta.reason || 'LLM-ranked opportunity',
                      debug: buildRelevanceDebug({
                        postId: postIdStr,
                        heuristicDetails,
                        postMap: scoredPostMap,
                        llmReason: meta.reason,
                        llmConfidence: meta.confidence,
                        source: 'llm',
                      })
                    });
                    if (opportunity) {
                      allOpportunities.set(postIdStr, opportunity);
                    }
                    cache[postIdStr] = {
                      score: relevanceScore,
                      timestamp: Date.now(),
                      version: result.promptVersion || 'v3.1',
                      model: result.model || 'unknown',
                      confidence: meta.confidence || 'medium',
                      reason: meta.reason || 'LLM-ranked opportunity',
                      source: 'llm',
                      debug: allMetadata.get(postIdStr)?.debug || null,
                      opportunity: opportunity || null,
                    };
                  } else {
                    allScores.set(postIdStr, null);
                  }
                });
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
                    reason: 'Keyword-based opportunity',
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
                    reason: 'Keyword-based opportunity',
                    source: 'heuristic',
                    debug: allMetadata.get(postId)?.debug || null,
                    opportunity: null,
                  };
                }
              });
              
              const highRelevanceCount = Array.from(allScores.values()).filter(s => s !== null && s !== undefined && s >= 4).length;

              if (opportunityScanRequestIdRef.current !== thisRequestId) return;
              setPostScoreProxies(allScores);
              setPostScoreMetadata(allMetadata);
              setPostOpportunities(allOpportunities);
              setScoresVersion(v => v + 1); // Increment version to trigger useMemo recalculation
              setAiScoresStale(false);
              scoresForHighRelevance = allScores;
            } catch (aiError) {
              console.error('Error in AI ranking batch processing:', aiError);
              if (opportunityScanRequestIdRef.current !== thisRequestId) return;
              setPostScoreProxies(cachedScores);
              setPostScoreMetadata(cachedMetadata);
              setPostOpportunities(cachedOpportunities);
              setScoresVersion(v => v + 1); // Increment version to trigger useMemo recalculation
              scoresForHighRelevance = cachedScores;
            } finally {
              setOpportunityScanLoading(false);
            }
            // High-relevance notifications (use freshly computed scores)
            if (triggeredByAuto && notificationsEnabled && Notification.permission === 'granted' && notifyStrongOpportunities && scoresForHighRelevance && scoresForHighRelevance.size > 0) {
              const threshold = Number(priorityNotificationThreshold) || 4;
              const priorityThreshold = threshold / 5;
              const idToPost = new Map(allNewPosts.map(p => [String(p.id), p]));
              const toNotify = [];
              for (const [postId, score] of scoresForHighRelevance.entries()) {
                const opportunityPriority = Number(allOpportunities.get(postId)?.scores?.priority);
                const passesPriority = Number.isFinite(opportunityPriority) && opportunityPriority >= priorityThreshold;
                const passesLegacy = score != null && score >= threshold;
                if ((passesPriority || passesLegacy) && !notifiedStrongOpportunityPostIds.has(postId) && idToPost.has(postId)) {
                  toNotify.push({ postId, post: idToPost.get(postId) });
                }
              }
              toNotify.forEach(({ post }) => {
                new Notification('Strong opportunity found', { body: post.title, icon: '/favicon.ico' });
              });
              if (toNotify.length > 0) {
                const toAdd = toNotify.map(({ postId }) => postId);
                setNotifiedStrongOpportunityPostIds(prev => {
                  const n = new Set(prev);
                  toAdd.forEach(id => n.add(id));
                  return n.size <= 500 ? n : new Set([...n].slice(-500));
                });
              }
            }
          } else {
            // All posts are cached, use cached scores directly
            const highRelevanceCount = Array.from(cachedScores.values()).filter(s => s !== null && s !== undefined && s >= 4).length;
            setPostScoreProxies(cachedScores);
            setPostScoreMetadata(cachedMetadata);
            setPostOpportunities(cachedOpportunities);
            setScoresVersion(v => v + 1); // Increment version to trigger useMemo recalculation
            setAiScoresStale(false);
            // High-relevance notifications (use freshly computed scores)
            if (triggeredByAuto && notificationsEnabled && Notification.permission === 'granted' && notifyStrongOpportunities && cachedScores && cachedScores.size > 0) {
              const threshold = Number(priorityNotificationThreshold) || 4;
              const priorityThreshold = threshold / 5;
              const idToPost = new Map(allNewPosts.map(p => [String(p.id), p]));
              const toNotify = [];
              for (const [postId, score] of cachedScores.entries()) {
                const opportunityPriority = Number(cachedOpportunities.get(postId)?.scores?.priority);
                const passesPriority = Number.isFinite(opportunityPriority) && opportunityPriority >= priorityThreshold;
                const passesLegacy = score != null && score >= threshold;
                if ((passesPriority || passesLegacy) && !notifiedStrongOpportunityPostIds.has(postId) && idToPost.has(postId)) {
                  toNotify.push({ postId, post: idToPost.get(postId) });
                }
              }
              toNotify.forEach(({ post }) => {
                new Notification('Strong opportunity found', { body: post.title, icon: '/favicon.ico' });
              });
              if (toNotify.length > 0) {
                const toAdd = toNotify.map(({ postId }) => postId);
                setNotifiedStrongOpportunityPostIds(prev => {
                  const n = new Set(prev);
                  toAdd.forEach(id => n.add(id));
                  return n.size <= 500 ? n : new Set([...n].slice(-500));
                });
              }
            }
          }
        } catch (aiError) {
          console.error('Error in AI ranking integration:', aiError);
          setOpportunityScanLoading(false);
          if (triggeredByAuto) {
            setOpportunityScanError('Opportunity ranking failed during auto-refresh — scores may be stale.');
          }
        }
      }, [opportunityEngineEnabled, opportunityBrief, opportunityContext, aiAvoid, aiExamplePerfect, aiExampleStrong, aiExampleReject, aiLlmPostLimit, data, extractGoalKeywords, computeHeuristicScore, notificationsEnabled, notifyStrongOpportunities, priorityNotificationThreshold, notifiedStrongOpportunityPostIds, secureKeyStatus.hasKey, openRouterApiKey, openRouterModel, AI_PROMPT_VERSION, aiRateLimitPauseUntil, formatTimeUntil]);

      const refresh = useCallback(async (options = {}) => {
        const triggeredByAuto = Boolean(options.triggeredByAuto);
        const forceRefresh = Boolean(options.force);
        if (!subs.length) {
          setNeedsAuth(false);
          setError('Add at least one subreddit to get started.');
          setData([]);
          setFetchedAt(null);
          setSnapshotInfo(null);
          setFetchSummary(null);
          setNextRefreshAt(null);
          return;
        }

        const subsCount = subs.length;
        let effectiveMaxPages = maxPages;
        if (subsCount >= 20) {
          effectiveMaxPages = Math.min(effectiveMaxPages, 2);
        } else if (subsCount >= 12) {
          effectiveMaxPages = Math.min(effectiveMaxPages, 3);
        } else if (subsCount >= 8) {
          effectiveMaxPages = Math.min(effectiveMaxPages, 4);
        }
        const wantsDeepFetch = maxPages === 0 || maxPages > 4;

        let localPauseUntil = rateLimitPauseUntil;

        setLoading(true);
        setError('');
        setNeedsAuth(false);
        const controller = new AbortController();
        const timeoutMs = Math.min(65000, 10000 + subs.length * 3500);
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
          setFetchMethod('server');
          const determineChunkSize = () => {
            if (subsCount > 21) return wantsDeepFetch ? 6 : 7;
            if (subsCount > 14) return 7;
            if (subsCount > 7 && wantsDeepFetch) return 7;
            return subsCount;
          };
          const chunkSize = determineChunkSize();
          const subChunks = [];
          for (let i = 0; i < subs.length; i += chunkSize) {
            subChunks.push(subs.slice(i, i + chunkSize));
          }

          const shapeForChunk = (chunkLength) => {
            let chunkLimit = limit;
            let chunkMaxPages = maxPages;
            if (chunkLength >= 12) {
              chunkLimit = Math.min(25, chunkLimit);
            } else if (chunkLength >= 6) {
              chunkLimit = Math.min(25, chunkLimit);
            }
            if (chunkLength >= 20) {
              chunkMaxPages = Math.min(chunkMaxPages, 2);
            } else if (chunkLength >= 12) {
              chunkMaxPages = Math.min(chunkMaxPages, 3);
            } else if (chunkLength >= 8) {
              chunkMaxPages = Math.min(chunkMaxPages, 4);
            }
            return {
              chunkLimit,
              chunkMaxPages,
              chunkWasCapped: chunkLimit !== limit || chunkMaxPages !== maxPages,
            };
          };

          const mergedRequestStartedAt = Date.now();
          const mergedPayload = {
            mode,
            time,
            days,
            limit: limit,
            max_pages: maxPages,
            fetch_all_pages: maxPages === 0,
            results: [],
            fetched_at: Date.now(),
            request_capped: false,
            rate_limited: false,
            rate_limited_subreddits: [],
            retry_after_seconds: 0,
            timed_out: false,
            timed_out_subreddits: [],
            auth_mode: null,
            metrics: {
              subredditCount: 0,
              totalPosts: 0,
              rateLimitedCount: 0,
              durationMs: 0,
              timedOutCount: 0,
              retryAfterSeconds: 0,
              redditRequestCount: 0,
              sharedCooldownHit: false,
              requestCapped: false,
            },
          };
          let sawRateLimitedHeader = false;

          for (let chunkIdx = 0; chunkIdx < subChunks.length; chunkIdx++) {
            const chunkSubs = subChunks[chunkIdx];
            const { chunkLimit, chunkMaxPages, chunkWasCapped } = shapeForChunk(chunkSubs.length);
            const params = new URLSearchParams({
              subs: chunkSubs.join(','),
              mode,
              time,
              days: String(days),
              limit: String(chunkLimit)
            });
            params.set('max_pages', chunkMaxPages === 0 ? 'all' : String(chunkMaxPages));
            if (forceRefresh) {
              params.set('_ts', `${Date.now()}_${chunkIdx}`);
              params.set('fresh', '1');
            }

            const requestUrl = `${DEFAULT_API_URL}?${params.toString()}`;
            let response = await fetch(requestUrl, {
              signal: controller.signal,
              ...(forceRefresh ? { headers: { 'Cache-Control': 'no-cache' } } : {}),
            });

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
              setFetchSummary(null);
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
              setFetchSummary(null);
              setError(`${sourceLabel}: ${sourceMessage}${retryAfterSeconds > 0 ? ` Retry in ~${retryAfterSeconds}s.` : ''}`);
              return;
            }

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            sawRateLimitedHeader = sawRateLimitedHeader || response.headers.get('X-Rate-Limited') === '1';
            const chunkPayload = await response.json();
            const chunkRetryAfter = Number(chunkPayload?.retry_after_seconds) || Number(response.headers.get('Retry-After')) || 0;
            mergedPayload.results.push(...(Array.isArray(chunkPayload.results) ? chunkPayload.results : []));
            mergedPayload.rate_limited = mergedPayload.rate_limited || Boolean(chunkPayload.rate_limited);
            mergedPayload.timed_out = mergedPayload.timed_out || Boolean(chunkPayload.timed_out);
            mergedPayload.retry_after_seconds = Math.max(mergedPayload.retry_after_seconds, chunkRetryAfter);
            mergedPayload.rate_limited_subreddits.push(...(Array.isArray(chunkPayload.rate_limited_subreddits) ? chunkPayload.rate_limited_subreddits : []));
            mergedPayload.timed_out_subreddits.push(...(Array.isArray(chunkPayload.timed_out_subreddits) ? chunkPayload.timed_out_subreddits : []));
            mergedPayload.auth_mode = mergedPayload.auth_mode || chunkPayload?.auth_mode || null;
            mergedPayload.metrics.subredditCount += Number(chunkPayload?.metrics?.subredditCount) || chunkSubs.length;
            mergedPayload.metrics.totalPosts += Number(chunkPayload?.metrics?.totalPosts) || 0;
            mergedPayload.metrics.rateLimitedCount += Number(chunkPayload?.metrics?.rateLimitedCount) || 0;
            mergedPayload.metrics.timedOutCount += Number(chunkPayload?.metrics?.timedOutCount) || 0;
            mergedPayload.metrics.retryAfterSeconds = Math.max(mergedPayload.metrics.retryAfterSeconds, Number(chunkPayload?.metrics?.retryAfterSeconds) || chunkRetryAfter || 0);
            mergedPayload.metrics.redditRequestCount += Number(chunkPayload?.metrics?.redditRequestCount) || 0;
            mergedPayload.metrics.sharedCooldownHit = mergedPayload.metrics.sharedCooldownHit || Boolean(chunkPayload?.metrics?.sharedCooldownHit);
            mergedPayload.request_capped = mergedPayload.request_capped || Boolean(chunkPayload?.request_capped) || chunkWasCapped;
            mergedPayload.metrics.requestCapped = mergedPayload.metrics.requestCapped || Boolean(chunkPayload?.metrics?.requestCapped) || mergedPayload.request_capped;

            if (chunkPayload?.rate_limited || response.headers.get('X-Rate-Limited') === '1') {
              break;
            }

            if (chunkIdx < subChunks.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 400));
            }
          }

          mergedPayload.fetched_at = Date.now();
          mergedPayload.rate_limited_subreddits = Array.from(new Set(mergedPayload.rate_limited_subreddits));
          mergedPayload.timed_out_subreddits = Array.from(new Set(mergedPayload.timed_out_subreddits));
          mergedPayload.metrics.durationMs = Date.now() - mergedRequestStartedAt;

          const payload = mergedPayload;
          const retryAfterSeconds = Number(payload?.retry_after_seconds) || 0;
          const rateLimitedHeader = sawRateLimitedHeader;
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
          setAuthenticated(payload?.auth_mode !== 'public');
          setAuthChecking(false);
          setData(perSub);
          setFetchedAt(Number(payload?.fetched_at) || Date.now());
          setSnapshotInfo(payload?.snapshot || null);
          setFetchSummary(buildFetchSummary(payload, perSub, {
            requestedFetchAllPages: maxPages === 0 || Boolean(payload?.fetch_all_pages),
            depthAutoCapped: Boolean(payload?.request_capped),
            effectiveMaxPages: payload?.request_capped ? effectiveMaxPages : maxPages,
            subsCount,
          }));

          if (payload?.auth_mode !== 'public') {
            await syncDashboardSnapshot(perSub);
          }

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
          setFetchSummary(null);
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
      }, [subs, mode, time, days, limit, maxPages, autoRefreshEnabled, autoRefreshInterval, notificationsEnabled, upvoteThreshold, alertKeywords, previousPostScores, runAiRanking, aiLlmPostLimit, data, rateLimitPauseUntil, syncDashboardSnapshot]);

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

      useEffect(() => {
        if (!authenticated || data.length === 0 || !syncToken) return;
        const timeoutId = setTimeout(() => {
          syncDashboardSnapshot();
        }, 600);
        return () => clearTimeout(timeoutId);
      }, [
        authenticated,
        data,
        syncToken,
        subs,
        opportunityBrief,
        opportunityContext,
        aiAvoid,
        businessOffering,
        idealCustomer,
        problemsSolved,
        preferredEngagement,
        strategyPreset,
        opportunityFocus,
        opportunityStrictness,
        openRouterModel,
        priorityNotificationThreshold,
        postScoreProxies,
        postScoreMetadata,
        postOpportunities,
        minUpvoteFilter,
        minCommentFilter,
        minPriorityFilter,
        keyword,
        syncDashboardSnapshot,
      ]);

      useEffect(() => {
        if (!authenticated || !syncToken || !hasOpportunityGoals) return;
        const timeoutId = setTimeout(() => {
          syncOpportunityConfig();
        }, 700);
        return () => clearTimeout(timeoutId);
      }, [
        authenticated,
        syncToken,
        hasOpportunityGoals,
        subs,
        opportunityBrief,
        opportunityContext,
        businessOffering,
        idealCustomer,
        problemsSolved,
        preferredEngagement,
        strategyPreset,
        opportunityFocus,
        opportunityStrictness,
        aiAvoid,
        aiExamplePerfect,
        aiExampleStrong,
        aiExampleReject,
        priorityNotificationThreshold,
        openRouterModel,
        syncOpportunityConfig,
      ]);

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
        setOpportunityEngineEnabled(true);
        setOpportunityBrief(preset.goals || '');
        setAiAvoid(Array.isArray(preset.avoid) ? preset.avoid.join(', ') : '');
        setAiPresetId(preset.id || '');
        setAiPresetDismissed(true);
      }, []);

      const openOnboarding = useCallback((step = 0) => {
        setOnboardingStep(step);
        setOnboardingOpen(true);
      }, []);

      const closeOnboarding = useCallback(() => {
        setOnboardingOpen(false);
      }, []);

      const completeOnboarding = useCallback(async () => {
        setOnboardingCompleted(true);
        setOnboardingOpen(false);
        if (subs.length > 0 && !loading) {
          await refresh({ force: true });
        }
      }, [subs.length, loading, refresh]);

      const handleOnboardingAddSubs = useCallback(() => {
        const names = onboardingSubInput.split(/[,\n]+/).map(s => normalizeSubredditName(s)).filter(Boolean);
        if (names.length === 0) return;
        setSubs(prev => {
          const existing = new Set(prev.map(s => s.toLowerCase()));
          const newOnes = names.filter(n => !existing.has(n.toLowerCase()));
          return [...prev, ...newOnes];
        });
        setOnboardingSubInput('');
      }, [onboardingSubInput]);

      const rerankNow = useCallback(async () => {
        if (opportunityScanLoading || loading) return;
        if (!opportunityEngineEnabled || !hasOpportunityGoals) return;
        await runAiRanking({ perSub: data, triggeredByAuto: false, llmPostLimit: aiLlmPostLimit });
        setAiScoresStale(false);
      }, [opportunityScanLoading, loading, opportunityEngineEnabled, hasOpportunityGoals, data, aiLlmPostLimit, runAiRanking]);

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

      const aiGoalSummary = useMemo(() => truncateText(effectiveGoalText || '', 120), [effectiveGoalText]);
      const onboardingSteps = useMemo(() => ([
        {
          id: 'subs',
          title: 'Pick subreddits',
          description: 'Start with a few communities you want to monitor.',
        },
        {
          id: 'goal',
          title: 'Choose a goal',
          description: 'Tell the app what a useful post looks like.',
        },
        {
          id: 'ai',
          title: 'Choose engine mode',
          description: 'Run manual search only or enable the opportunity engine.',
        },
        {
          id: 'depth',
          title: 'Set fetch depth',
          description: 'Choose how much Reddit to scan on each refresh.',
        },
      ]), []);
      const onboardingCurrentStep = onboardingSteps[onboardingStep] || onboardingSteps[0];
      const onboardingCanContinue = useMemo(() => {
        if (onboardingCurrentStep?.id === 'subs') return subs.length > 0;
        if (onboardingCurrentStep?.id === 'goal') return !opportunityEngineEnabled || hasOpportunityGoals;
        return true;
      }, [onboardingCurrentStep, subs.length, opportunityEngineEnabled, hasOpportunityGoals]);
      const preFilterPostCount = filteredBySub.length;
      const activeFilterPills = useMemo(() => {
        const pills = [];
        if (keyword.trim()) pills.push({ key: 'keyword', label: `Keyword: ${truncateText(keyword.trim(), 24)}` });
        if (minUpvoteFilter) pills.push({ key: 'upvotes', label: `Upvotes: ${minUpvoteFilter}+` });
        if (minCommentFilter) pills.push({ key: 'comments', label: `Comments: ${minCommentFilter}+` });
        if (minPriorityFilter) pills.push({ key: 'ai', label: `Priority: ${minPriorityFilter}+` });
        return pills;
      }, [keyword, minUpvoteFilter, minCommentFilter, minPriorityFilter, truncateText]);
      const showingFilteredResults = visiblePosts.length !== preFilterPostCount;

      function clearFilterPill(key) {
        if (key === 'keyword') setKeyword('');
        if (key === 'upvotes') setMinUpvoteFilter('');
        if (key === 'comments') setMinCommentFilter('');
        if (key === 'ai') setMinPriorityFilter('');
      }

      function buildFetchSummary(payload, perSub, options = {}) {
        const requestedFetchAllPages = Boolean(options?.requestedFetchAllPages);
        const depthAutoCapped = Boolean(options?.depthAutoCapped);
        const effectiveMaxPages = Number(options?.effectiveMaxPages);
        const subsCount = Number(options?.subsCount) || 0;
        const timedOutSubs = Array.isArray(payload?.timed_out_subreddits) ? payload.timed_out_subreddits : [];
        const rateLimitedSubs = Array.isArray(payload?.rate_limited_subreddits) ? payload.rate_limited_subreddits : [];
        const partialSubs = Array.isArray(perSub) ? perSub.filter(group => group?.partial).map(group => group.subreddit) : [];
        const incompleteSubs = Array.from(new Set([
          ...timedOutSubs,
          ...rateLimitedSubs,
          ...partialSubs,
        ].filter(Boolean)));
        const attemptedSubs = Array.isArray(perSub) ? perSub.length : 0;
        const completedSubs = Math.max(0, attemptedSubs - incompleteSubs.length);

        if (timedOutSubs.length > 0) {
          return {
            tone: 'warning',
            status: 'Incomplete',
            detail: `Stopped early on ${timedOutSubs.length} subreddit${timedOutSubs.length === 1 ? '' : 's'} because the request timed out.`,
            completedSubs,
            attemptedSubs,
          };
        }

        if (rateLimitedSubs.length > 0) {
          return {
            tone: 'warning',
            status: 'Incomplete',
            detail: `Stopped early on ${rateLimitedSubs.length} subreddit${rateLimitedSubs.length === 1 ? '' : 's'} because Reddit rate-limited the request.`,
            completedSubs,
            attemptedSubs,
          };
        }

        if (partialSubs.length > 0) {
          return {
            tone: 'warning',
            status: 'Capped',
            detail: `Fetch depth stopped before the full timeframe was exhausted for ${partialSubs.length} subreddit${partialSubs.length === 1 ? '' : 's'}.`,
            completedSubs,
            attemptedSubs,
          };
        }

        if (depthAutoCapped && Number.isFinite(effectiveMaxPages)) {
          return {
            tone: 'warning',
            status: 'Capped',
            detail: `Fetch depth was auto-capped to ${effectiveMaxPages === 0 ? 'all pages' : `${effectiveMaxPages} page${effectiveMaxPages === 1 ? '' : 's'}`} across ${subsCount} subreddits to reduce timeouts.`,
            completedSubs,
            attemptedSubs,
          };
        }

        return {
          tone: 'success',
          status: 'Complete',
          detail: requestedFetchAllPages
            ? 'Fetched all available posts Reddit returned for the selected timeframe.'
            : 'Fetched the requested scope for the selected timeframe.',
          completedSubs: attemptedSubs,
          attemptedSubs,
        };
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
                disabled: !opportunityEngineEnabled,
                className: 'px-2 py-1 rounded-md text-xs font-medium bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-[#0284C7] dark:hover:bg-[#0369A1] disabled:opacity-50 disabled:cursor-not-allowed'
              }, selected ? 'Using' : 'Select')
            )
          ),
          !compact && model.description && h('p', { className: 'mt-2 text-xs text-zinc-600 dark:text-zinc-300' }, truncateText(model.description, 140)),
          detailBits.length > 0 && h('p', { className: 'mt-2 text-[11px] text-zinc-500 dark:text-zinc-400' }, detailBits.join(' • '))
        );
      };

      const filtersActive = minUpvoteFilter || minCommentFilter || minPriorityFilter || keyword;
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
                onClick: () => openOnboarding(0),
                className: 'hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-600 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900',
                title: 'Open onboarding'
              },
                renderGlyph('M12 6v6l4 2m5-2a9 9 0 11-18 0 9 9 0 0118 0z', 'w-3.5 h-3.5'),
                onboardingCompleted ? 'Setup' : 'Finish setup'
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
                      fetchSummary && !loading && renderStatusChip('Scope', fetchSummary.status, fetchSummary.tone),
                      snapshotInfo?.cached && !loading && renderStatusChip('Cache', `${snapshotInfo.age_seconds || 0}s old`),
                      staleSubCount > 0 && renderStatusChip('Stale', `${staleSubCount} subreddit${staleSubCount === 1 ? '' : 's'}`, 'warning'),
                      rateLimitPauseUntil && rateLimitPauseUntil > Date.now() && renderStatusChip('Cooldown', formatTimeUntil(rateLimitPauseUntil), 'warning'),
                      autoRefreshEnabled && nextRefreshAt && !loading && renderStatusChip('Next refresh', formatTimeUntil(nextRefreshAt)),
                      opportunityScanLoading && renderStatusChip('AI', 'Ranking…', 'success'),
                      !opportunityScanLoading && opportunityEngineEnabled && hasOpportunityGoals && renderStatusChip('Engine', 'On', 'success'),
                      !opportunityScanLoading && opportunityEngineEnabled && hasOpportunityGoals && aiScoreStats.total > 0 && renderStatusChip('Reviewed', `${aiScoreStats.llm}/${aiScoreStats.total}`, 'success'),
                      !opportunityScanLoading && (!opportunityEngineEnabled || !hasOpportunityGoals) && postScoreProxies.size === 0 && renderStatusChip('Engine', 'Off'),
                    ],
            (alertKeywords.trim() || notifyStrongOpportunities || notificationsEnabled) && h('button', {
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
        fetchSummary && !loading && !error && h('div', {
          className: `border-b px-4 py-2 text-xs sm:text-sm shrink-0 ${fetchSummary.tone === 'warning'
            ? 'bg-amber-50/80 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-900/60'
            : 'bg-emerald-50/70 text-emerald-800 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-900/60'}`
        },
          h('div', { className: 'flex flex-wrap items-center gap-x-3 gap-y-1' },
            h('span', { className: 'font-medium' }, fetchSummary.detail),
            fetchSummary.attemptedSubs > 0 && h('span', { className: 'opacity-80' }, `${fetchSummary.completedSubs}/${fetchSummary.attemptedSubs} subreddits complete`)
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
            subs.length > 0 && h('section', { className: 'bg-white dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 shrink-0' },
              h('div', { className: 'flex items-center gap-3 px-4 py-2.5 min-w-0' },

                // Status dot
                h('div', { className: `w-2 h-2 rounded-full shrink-0 ${
                  opportunityScanLoading ? 'bg-amber-400 animate-pulse' :
                  opportunityEngineEnabled && hasOpportunityGoals ? 'bg-emerald-400' :
                  'bg-zinc-300 dark:bg-zinc-600'
                }` }),

                // Status label + goal summary
                h('div', { className: 'flex items-center gap-2 min-w-0 flex-1' },
                  h('span', { className: 'text-xs font-medium shrink-0 ' + (
                    opportunityScanLoading ? 'text-amber-600 dark:text-amber-400' :
                    opportunityEngineEnabled && hasOpportunityGoals ? 'text-emerald-700 dark:text-emerald-400' :
                    'text-zinc-500 dark:text-zinc-400'
                  )},
                    opportunityScanLoading ? 'Ranking…' :
                    opportunityEngineEnabled && hasOpportunityGoals ? 'Opportunity engine on' :
                    'Opportunity engine off'
                  ),
                  opportunityEngineEnabled && hasOpportunityGoals && h('span', { className: 'text-zinc-300 dark:text-zinc-600 shrink-0 text-xs' }, '·'),
                  opportunityEngineEnabled && hasOpportunityGoals && h('span', { className: 'text-xs text-zinc-500 dark:text-zinc-400 truncate' },
                    aiGoalSummary || effectiveGoalText.trim()
                  )
                ),

                // Stats (when scored)
                postScoreProxies.size > 0 && h('div', { className: 'hidden sm:flex items-center gap-2.5 shrink-0' },
                  h('span', { className: 'font-mono text-xs text-zinc-500 dark:text-zinc-400' },
                    `${aiScoreStats.scored} / ${aiScoreStats.total}`
                  ),
                  aiScoreStats.high > 0 && h('span', { className: 'font-mono text-xs text-emerald-600 dark:text-emerald-400' },
                    `${aiScoreStats.high} strong`
                  ),
                  aiScoresStale && h('span', { className: 'font-mono text-[10px] text-amber-500 dark:text-amber-400' }, '~stale')
                ),

                // Actions
                h('div', { className: 'flex items-center gap-1.5 shrink-0' },
                  opportunityEngineEnabled && hasOpportunityGoals && h('button', {
                    onClick: rerankNow,
                    disabled: opportunityScanLoading || loading,
                    className: 'px-2.5 py-1 rounded-lg text-xs font-medium bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-[#0284C7] dark:hover:bg-[#0369A1] disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
                  }, opportunityScanLoading ? '…' : 'Refresh ranking'),
                  h('button', {
                    onClick: () => setSettingsOpen(true),
                    className: 'px-2.5 py-1 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors'
                  }, opportunityEngineEnabled && hasOpportunityGoals ? 'Edit engine' : 'Set up engine'),
                  postScoreProxies.size > 0 && h('button', {
                    onClick: () => setShowAiReasons(!showAiReasons),
                    className: `px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${showAiReasons ? 'border-[#0284C7] text-[#0284C7] dark:text-sky-400 dark:border-[#0284C7]' : 'border-zinc-200 dark:border-zinc-600 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700'}`
                  }, showAiReasons ? 'Reasons on' : 'Reasons')
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
              // Opportunity priority filter (legacy AI score thresholds still apply as fallback)
              opportunityEngineEnabled && hasOpportunityGoals && postScoreProxies.size > 0 && h('div', { className: 'hidden sm:flex items-center gap-1.5' },
                h('span', { className: 'text-xs font-medium text-zinc-500 dark:text-zinc-400 mr-1' }, 'Priority'),
                OPPORTUNITY_PRIORITY_PRESETS.map(preset =>
                  h('button', {
                    key: `ai-${preset.value}`,
                    onClick: () => setMinPriorityFilter(minPriorityFilter === preset.value ? '' : preset.value),
                    className: `px-2.5 py-1 rounded-full text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900 ${minPriorityFilter === preset.value ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600'}`
                  }, preset.label)
                )
              ),
              (alertKeywords.trim() || notifyStrongOpportunities || notificationsEnabled) && h('button', {
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
                  // Handle special case: "priority-desc" or legacy "ai-relevance-desc"
                  let by, order;
                  if (value.startsWith('priority-')) {
                    by = 'priority';
                    order = value.replace('priority-', '');
                  } else if (value.startsWith('ai-relevance-')) {
                    by = 'priority';
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
                opportunityEngineEnabled && hasOpportunityGoals && postScoreProxies.size > 0 && [
                  h('option', { key: 'priority-desc', value: 'priority-desc' }, 'Highest opportunity priority'),
                  h('option', { key: 'priority-asc', value: 'priority-asc' }, 'Lowest opportunity priority')
                ]
              ),
                filtersActive && h('button', {
                onClick: () => { setMinUpvoteFilter(''); setMinCommentFilter(''); setMinPriorityFilter(''); setKeyword(''); },
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
                onClick: () => { setMinUpvoteFilter(''); setMinCommentFilter(''); setMinPriorityFilter(''); setKeyword(''); },
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
                                onClick: () => { setMinUpvoteFilter(''); setMinCommentFilter(''); setMinPriorityFilter(''); setKeyword(''); },
                                className: 'px-4 py-2 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-[#0284C7] dark:hover:bg-[#0369A1] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900'
                              }, 'Clear filters'),
                              minPriorityFilter && h('button', {
                                onClick: () => setMinPriorityFilter(''),
                                className: 'px-4 py-2 rounded-lg text-sm font-medium border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                              }, 'Remove priority filter')
                            )
                          ]
                        : [
                            h('div', { key: 'icon', className: 'w-16 h-16 mb-4 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center' },
                              h('svg', { className: 'w-8 h-8 text-zinc-400', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                                h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z' })
                              )
                            ),
                            h('h3', { key: 'title', className: 'text-lg font-semibold text-zinc-900 dark:text-white mb-2' }, opportunityEngineEnabled && hasOpportunityGoals ? 'No strong opportunities yet' : 'No posts found'),
                            h('p', { key: 'desc', className: 'text-sm text-zinc-500 dark:text-zinc-400 text-center max-w-xs mb-4' }, opportunityEngineEnabled && hasOpportunityGoals
                              ? 'Try broadening your opportunity settings, lowering the priority filter, or fetching more posts.'
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
                              }, opportunityEngineEnabled && hasOpportunityGoals ? 'Adjust engine settings' : 'Open settings')
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
                        const relevanceScore = postScoreProxies.get(String(post.id));
                        const relevanceMeta = postScoreMetadata.get(String(post.id));
                        const opportunity = getOpportunityForPost(post.id);
                        const priorityScore = getPriorityScore(post.id);
                        const opportunityType = getOpportunityTypeLabel(post.id);
                        const recommendedAction = getRecommendedActionLabel(post.id);
                        const hasPriority = priorityScore !== null;
                        const isHighlyRelevant = hasPriority
                          ? priorityScore >= 0.65
                          : relevanceScore !== undefined && relevanceScore !== null && relevanceScore >= 4;
                        const isVeryHighRelevant = hasPriority
                          ? priorityScore >= 0.85
                          : relevanceScore !== undefined && relevanceScore !== null && relevanceScore >= 5;
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
                              opportunityType && h('span', {
                                className: 'px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 capitalize'
                              }, opportunityType),
                              recommendedAction && h('span', {
                                className: 'px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 capitalize'
                              }, recommendedAction),
                              isSpiking && h('span', {
                                className: 'px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-200'
                              }, 'Spiking'),
                              h('span', { className: 'inline-flex items-center gap-1 text-[10px] text-zinc-500 dark:text-zinc-400' },
                                renderGlyph('M13 2L4 14h6l-1 8 9-12h-6l1-8z', 'w-3 h-3'),
                                `${formatVelocity(upvotesPerHour)}/h`
                              ),
                              priorityScore !== null && h('span', {
                                className: 'px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-zinc-900 text-white dark:bg-sky-500 dark:text-zinc-950',
                                title: opportunity?.explanation?.summary || `Opportunity priority ${(priorityScore * 100).toFixed(0)}/100`
                              }, `P${Math.round(priorityScore * 100)}`),
                              !hasPriority && relevanceScore !== undefined && relevanceScore !== null && h('span', {
                                className: `px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${aiScoresStale ? 'opacity-50' : ''} ${
                                  relevanceScore >= 5 ? 'bg-emerald-600 text-white' :
                                  relevanceScore >= 4 ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-200' :
                                  relevanceScore >= 3 ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-200' :
                                  'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400'
                                }`,
                                title: aiScoresStale ? 'Cached score proxy (may be stale) — re-run ranking for fresh results' : relevanceMeta ? `Legacy score proxy: ${relevanceScore}/5 • ${relevanceMeta.confidence} confidence • ${relevanceMeta.reason}` : `Legacy score proxy: ${relevanceScore}/5`
                              }, `${aiScoresStale ? '~' : ''}${aiScoreLabel(relevanceScore)} (${relevanceScore}/5)`)
                            ),
                            h('h3', { className: 'text-sm font-semibold text-zinc-900 dark:text-white leading-snug line-clamp-2' }, post.title),
                            showAiReasons && h('p', { className: 'text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1 mt-0.5' },
                              opportunity?.explanation?.summary || buildWhyLine({
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
                        )),
                        h('div', { className: 'absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity' },
                          h('button', {
                            onClick: (e) => { e.stopPropagation(); setActivePostMenu(activePostMenu === post.id ? null : post.id); },
                            className: 'p-2 rounded-lg bg-white dark:bg-zinc-700 shadow-sm border border-zinc-200 dark:border-zinc-600 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-600 transition-colors'
                          },
                          h('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                            h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z' })
                          )),
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
                          'Open in Reddit'),
                          h('button', {
                            onClick: () => handleCopyLink(post),
                            className: 'w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2'
                          },
                          h('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                            h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3' })
                          ),
                          'Copy link'),
                          h('button', {
                            onClick: () => handleHidePost(post.id),
                            className: 'w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2'
                          },
                          h('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                            h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21' })
                          ),
                          'Hide post'))
                        ));
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
                      (() => {
                        const detailOpportunity = getOpportunityForPost(selectedPost.id);
                        const type = detailOpportunity?.classification?.type;
                        if (!type) return null;
                        return h('span', { className: 'px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 font-medium text-[11px] capitalize' }, String(type).replace(/_/g, ' '));
                      })(),
                      (() => {
                        const detailOpportunity = getOpportunityForPost(selectedPost.id);
                        const action = detailOpportunity?.action?.recommended;
                        if (!action) return null;
                        return h('span', { className: 'px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 font-medium text-[11px] capitalize' }, String(action).replace(/_/g, ' '));
                      })(),
                      selectedPost.link_flair_text && h('span', { 
                        className: 'px-1.5 py-0.5 rounded-full text-[10px] font-medium',
                        style: { backgroundColor: selectedPost.link_flair_background_color || '#e4e4e7', color: selectedPost.link_flair_text_color === 'light' ? '#fff' : '#18181b' }
                      }, selectedPost.link_flair_text),
                      h('span', null, timeAgo(selectedPost.created_utc))
                    ),
                    h('h2', { className: 'text-lg font-bold text-zinc-900 dark:text-white leading-snug' }, selectedPost.title),
                    (() => {
                      const detailRelevanceScore = postScoreProxies.get(String(selectedPost.id));
                      const detailRelevanceMeta = postScoreMetadata.get(String(selectedPost.id));
                      const detailOpportunity = getOpportunityForPost(selectedPost.id);
                      const detailPriority = getPriorityScore(selectedPost.id);
                      if (detailPriority !== null || (detailRelevanceScore !== undefined && detailRelevanceScore !== null)) {
                        return h('div', { 
                          className: 'flex items-center gap-2 py-1 flex-wrap',
                          title: detailOpportunity?.explanation?.summary || (detailRelevanceMeta ? `${detailRelevanceMeta.confidence} confidence • ${detailRelevanceMeta.reason}` : (detailPriority !== null ? `Opportunity priority ${Math.round(detailPriority * 100)}/100` : `Opportunity score: ${detailRelevanceScore}/5`))
                        },
                          detailPriority !== null && h('span', {
                            className: 'px-2 py-0.5 rounded text-xs font-bold font-mono bg-zinc-900 text-white dark:bg-sky-500 dark:text-zinc-950'
                          }, `Priority ${Math.round(detailPriority * 100)}`),
                          detailPriority === null && h('span', {
                            className: `px-2 py-0.5 rounded text-xs font-bold font-mono shadow-sm ${aiScoresStale ? 'opacity-50' : ''} ${
                              detailRelevanceScore >= 5 ? 'bg-emerald-600 text-white ring-2 ring-emerald-300 dark:ring-emerald-400/30' :
                              detailRelevanceScore >= 4 ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-200' :
                              detailRelevanceScore >= 3 ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-200' :
                              'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400'
                            }`
                          }, `${aiScoresStale ? '~' : ''}${aiScoreLabel(detailRelevanceScore)} (${detailRelevanceScore}/5)`),
                          detailPriority === null && h('div', { 
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
                          showAiReasons && (detailOpportunity?.explanation?.summary || detailRelevanceMeta?.reason) && h('span', { 
                            className: 'text-xs text-zinc-600 dark:text-zinc-400 line-clamp-1'
                          }, detailOpportunity?.explanation?.summary || detailRelevanceMeta.reason)
                        );
                      }
                      return null;
                    })(),
                    h('section', { className: 'sticky top-0 z-10 rounded-xl border border-sky-200/80 bg-sky-50/90 p-3 backdrop-blur dark:border-[#0284C7]/25 dark:bg-[#0284C7]/12' },
                      h('div', { className: 'flex items-start justify-between gap-3' },
                        h('div', { className: 'min-w-0' },
                          h('p', { className: 'text-[11px] font-mono font-medium uppercase tracking-[0.18em] text-[#0369A1] dark:text-sky-300' }, 'Opportunity Summary'),
                          h('p', { className: 'mt-1 text-sm font-medium text-zinc-900 dark:text-white' }, selectedPostNextAction)
                        ),
                        h('button', {
                          type: 'button',
                          onClick: () => {
                            setShowAiReasons(true);
                            if (mobileView !== 'detail') setMobileView('detail');
                          },
                          className: 'shrink-0 rounded-lg border border-sky-200 px-2.5 py-1 text-xs font-medium text-[#0369A1] hover:bg-sky-100 dark:border-[#0284C7]/30 dark:text-sky-300 dark:hover:bg-[#0284C7]/18 transition-colors'
                        }, 'Keep visible')
                      ),
                      h('div', { className: 'mt-3 space-y-2' },
                        selectedPostWhyItems.map(item =>
                          h('div', { key: item.label, className: 'rounded-lg bg-white/70 px-3 py-2 dark:bg-zinc-900/30' },
                            h('p', { className: 'text-[11px] font-mono uppercase tracking-wide text-zinc-500 dark:text-zinc-400' }, item.label),
                            h('p', { className: 'mt-1 text-sm text-zinc-700 dark:text-zinc-200' }, item.value)
                          )
                        )
                      ),
                      h('div', { className: 'mt-3 flex flex-wrap items-center gap-2' },
                        h('button', {
                          type: 'button',
                          onClick: () => handleCopyLink(selectedPost),
                          className: 'inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-200 dark:hover:bg-zinc-900/70 transition-colors'
                        },
                          renderGlyph('M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3', 'w-3.5 h-3.5'),
                          'Copy link'
                        ),
                        h('button', {
                          type: 'button',
                          onClick: () => handleHidePost(selectedPost.id),
                          className: 'inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-200 dark:hover:bg-zinc-900/70 transition-colors'
                        },
                          renderGlyph('M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21', 'w-3.5 h-3.5'),
                          'Hide post'
                        )
                      )
                    ),
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

        onboardingOpen && h('div', { className: 'fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4', onClick: closeOnboarding },
          h('div', {
            className: 'w-full max-w-3xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-800',
            onClick: (e) => e.stopPropagation()
          },
            h('div', { className: 'border-b border-zinc-200 px-5 py-4 dark:border-zinc-700' },
              h('div', { className: 'flex items-start justify-between gap-4' },
                h('div', null,
                  h('p', { className: 'text-[11px] font-mono font-medium uppercase tracking-[0.18em] text-[#0284C7] dark:text-sky-300' }, 'Quick Setup'),
                  h('h2', { className: 'mt-1 text-2xl font-bold tracking-tight text-zinc-900 dark:text-white' }, onboardingCurrentStep.title),
                  h('p', { className: 'mt-1 text-sm text-zinc-500 dark:text-zinc-400' }, onboardingCurrentStep.description)
                ),
                h('button', {
                  type: 'button',
                  onClick: closeOnboarding,
                  className: 'rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200'
                }, renderGlyph('M6 18L18 6M6 6l12 12', 'w-5 h-5'))
              ),
              h('div', { className: 'mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4' },
                onboardingSteps.map((step, index) =>
                  h('button', {
                    key: step.id,
                    type: 'button',
                    onClick: () => setOnboardingStep(index),
                    className: `rounded-xl border px-3 py-2 text-left transition-colors ${index === onboardingStep ? 'border-[#0284C7] bg-sky-50 dark:border-[#0284C7] dark:bg-[#0284C7]/15' : 'border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-700/60'}`
                  },
                    h('p', { className: `text-[11px] font-mono uppercase tracking-wide ${index === onboardingStep ? 'text-[#0284C7] dark:text-sky-300' : 'text-zinc-400 dark:text-zinc-500'}` }, `Step ${index + 1}`),
                    h('p', { className: `mt-1 text-sm font-medium ${index === onboardingStep ? 'text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-300'}` }, step.title)
                  )
                )
              )
            ),
            h('div', { className: 'p-5' },
              onboardingCurrentStep.id === 'subs' && h('div', { className: 'space-y-5' },
                h('div', null,
                  h('p', { className: 'text-sm font-medium text-zinc-900 dark:text-white' }, 'Selected subreddits'),
                  h('p', { className: 'mt-1 text-sm text-zinc-500 dark:text-zinc-400' }, 'Pick 3 to 5 to start. You can change them later.'),
                  h('div', { className: 'mt-3 flex min-h-12 flex-wrap gap-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-3 dark:border-zinc-600 dark:bg-zinc-900/40' },
                    subs.length
                      ? subs.map(sub =>
                          h('button', {
                            key: sub,
                            type: 'button',
                            onClick: () => handleRemoveSub(sub),
                            className: 'inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-[#0284C7]'
                          }, `r/${sub}`, renderGlyph('M6 18L18 6M6 6l12 12', 'w-3 h-3'))
                        )
                      : h('p', { className: 'text-sm text-zinc-400 dark:text-zinc-500' }, 'No subreddits selected yet.')
                  )
                ),
                h('div', { className: 'grid gap-5 lg:grid-cols-[1.1fr_0.9fr]' },
                  h('div', { className: 'rounded-xl border border-zinc-200 p-4 dark:border-zinc-700' },
                    h('p', { className: 'text-sm font-medium text-zinc-900 dark:text-white' }, 'Add your own list'),
                    h('textarea', {
                      value: onboardingSubInput,
                      onChange: (e) => setOnboardingSubInput(e.target.value),
                      placeholder: 'programming, webdev, javascript',
                      rows: 4,
                      className: 'mt-3 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#0284C7] dark:border-zinc-600 dark:bg-zinc-700 dark:text-white'
                    }),
                    h('div', { className: 'mt-3 flex items-center justify-between gap-3' },
                      h('p', { className: 'text-xs text-zinc-500 dark:text-zinc-400' }, 'Separate names with commas or new lines.'),
                      h('button', {
                        type: 'button',
                        onClick: handleOnboardingAddSubs,
                        disabled: !onboardingSubInput.trim(),
                        className: 'rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#0284C7] dark:hover:bg-[#0369A1]'
                      }, 'Add list')
                    )
                  ),
                  h('div', { className: 'rounded-xl border border-zinc-200 p-4 dark:border-zinc-700' },
                    h('p', { className: 'text-sm font-medium text-zinc-900 dark:text-white' }, 'Starter packs'),
                    h('div', { className: 'mt-3 space-y-2' },
                      STARTER_PACKS.map(pack =>
                        h('button', {
                          key: pack.id,
                          type: 'button',
                          onClick: () => handleApplyStarterPack(pack),
                          className: 'flex w-full items-center gap-3 rounded-xl border border-zinc-200 px-3 py-3 text-left transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-700/60'
                        },
                          renderStarterPackIcon(pack.id),
                          h('div', { className: 'min-w-0' },
                            h('p', { className: 'text-sm font-medium text-zinc-900 dark:text-white' }, pack.label),
                            h('p', { className: 'text-xs text-zinc-500 dark:text-zinc-400' }, pack.subs.map(sub => `r/${sub}`).join(', '))
                          )
                        )
                      )
                    )
                  )
                ),
                h('div', null,
                  h('p', { className: 'text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400' }, 'Popular'),
                  h('div', { className: 'mt-2 flex flex-wrap gap-2' },
                    POPULAR_SUBREDDITS.slice(0, 12).map(sub =>
                      h('button', {
                        key: sub,
                        type: 'button',
                        onClick: () => handleAddSub(sub),
                        disabled: subs.some(s => s.toLowerCase() === sub.toLowerCase()),
                        className: 'rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600'
                      }, `r/${sub}`)
                    )
                  )
                )
              ),
              onboardingCurrentStep.id === 'goal' && h('div', { className: 'space-y-5' },
                h('div', null,
                  h('p', { className: 'text-sm font-medium text-zinc-900 dark:text-white' }, 'Preset'),
                  h('div', { className: 'mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3' },
                    AI_PRESETS.map(preset =>
                      h('button', {
                        key: preset.id,
                        type: 'button',
                        onClick: () => applyPreset(preset),
                        className: `rounded-xl border p-4 text-left transition-colors ${aiPresetId === preset.id ? 'border-[#0284C7] bg-sky-50 dark:border-[#0284C7] dark:bg-[#0284C7]/15' : 'border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-700/60'}`
                      },
                        h('div', { className: 'flex items-center gap-2' },
                          renderPresetIcon(preset.id, aiPresetId === preset.id),
                          h('p', { className: 'text-sm font-semibold text-zinc-900 dark:text-white' }, preset.label)
                        ),
                        h('p', { className: 'mt-2 text-sm text-zinc-500 dark:text-zinc-400' }, truncateText(preset.goals, 110))
                      )
                    )
                  )
                ),
                h('div', { className: 'rounded-xl border border-zinc-200 p-4 dark:border-zinc-700' },
                  h('div', { className: 'flex items-center justify-between gap-3' },
                    h('div', null,
                      h('p', { className: 'text-sm font-medium text-zinc-900 dark:text-white' }, 'Opportunity brief'),
                      h('p', { className: 'mt-1 text-sm text-zinc-500 dark:text-zinc-400' }, opportunityEngineEnabled ? 'Describe the conversations and opportunities you want surfaced first.' : 'Optional if you plan to keep the engine off.')
                    ),
                    aiPresetSuggestion && aiPresetSuggestion.id !== aiPresetId && h('button', {
                      type: 'button',
                      onClick: () => applyPreset(aiPresetSuggestion),
                      className: 'rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-[#0369A1] transition-colors hover:bg-sky-100 dark:border-[#0284C7]/30 dark:bg-[#0284C7]/15 dark:text-sky-300'
                    }, `Use suggested: ${aiPresetSuggestion.label}`)
                  ),
                  h('textarea', {
                    value: opportunityBrief,
                    onChange: (e) => setOpportunityBrief(e.target.value),
                    rows: 4,
                    placeholder: 'I want to find high-intent posts from people actively asking for help.',
                    className: 'mt-3 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#0284C7] dark:border-zinc-600 dark:bg-zinc-700 dark:text-white'
                  })
                )
              ),
              onboardingCurrentStep.id === 'ai' && h('div', { className: 'grid gap-4 md:grid-cols-2' },
                h('button', {
                  type: 'button',
                  onClick: () => setOpportunityEngineEnabled(false),
                  className: `rounded-xl border p-5 text-left transition-colors ${!opportunityEngineEnabled ? 'border-[#0284C7] bg-sky-50 dark:border-[#0284C7] dark:bg-[#0284C7]/15' : 'border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-700/60'}`
                },
                  h('p', { className: 'text-sm font-semibold text-zinc-900 dark:text-white' }, 'Manual scan'),
                  h('p', { className: 'mt-2 text-sm text-zinc-500 dark:text-zinc-400' }, 'Browse Reddit posts with filters only. Best if you want a lightweight setup first.')
                ),
                h('button', {
                  type: 'button',
                  onClick: () => setOpportunityEngineEnabled(true),
                  className: `rounded-xl border p-5 text-left transition-colors ${opportunityEngineEnabled ? 'border-[#0284C7] bg-sky-50 dark:border-[#0284C7] dark:bg-[#0284C7]/15' : 'border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-700/60'}`
                },
                  h('p', { className: 'text-sm font-semibold text-zinc-900 dark:text-white' }, 'Opportunity engine'),
                  h('p', { className: 'mt-2 text-sm text-zinc-500 dark:text-zinc-400' }, 'Rank the feed against your business profile so the strongest opportunities rise to the top.')
                ),
                opportunityEngineEnabled && h('div', { className: 'md:col-span-2 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700' },
                  h('div', { className: 'flex flex-wrap items-start justify-between gap-3' },
                    h('div', null,
                      h('p', { className: 'text-sm font-medium text-zinc-900 dark:text-white' }, 'Model'),
                      h('p', { className: 'mt-1 text-sm text-zinc-500 dark:text-zinc-400' }, secureKeyStatus.hasKey ? 'You already have a secure key saved.' : 'You can save a key later in Settings if you want more model options.')
                    ),
                    selectedModelInfo && h('span', { className: 'rounded-full bg-zinc-100 px-3 py-1 text-xs font-mono text-zinc-600 dark:bg-zinc-700 dark:text-zinc-200' }, selectedModelInfo.name)
                  ),
                  h('div', { className: 'mt-3 grid gap-3 md:grid-cols-2' },
                    modelGroups.recommended.concat(modelGroups.latestFree.slice(0, 1)).filter((model, index, arr) => arr.findIndex(item => item.id === model.id) === index).map(model =>
                      h('button', {
                        key: model.id,
                        type: 'button',
                        onClick: () => setOpenRouterModel(model.id),
                        className: `rounded-xl border p-3 text-left transition-colors ${openRouterModel === model.id ? 'border-[#0284C7] bg-sky-50 dark:border-[#0284C7] dark:bg-[#0284C7]/15' : 'border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-700/60'}`
                      },
                        h('p', { className: 'text-sm font-semibold text-zinc-900 dark:text-white' }, model.name),
                        h('p', { className: 'mt-1 text-xs text-zinc-500 dark:text-zinc-400' }, model.hint || model.id)
                      )
                    )
                  )
                )
              ),
              onboardingCurrentStep.id === 'depth' && h('div', { className: 'grid gap-5 lg:grid-cols-[1fr_0.9fr]' },
                h('div', { className: 'rounded-xl border border-zinc-200 p-4 dark:border-zinc-700' },
                  h('p', { className: 'text-sm font-medium text-zinc-900 dark:text-white' }, 'Fetch depth'),
                  h('div', { className: 'mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3' },
                    [1, 3, 5, 10, 0].map(value =>
                      h('button', {
                        key: String(value),
                        type: 'button',
                        onClick: () => setMaxPages(value),
                        className: `rounded-xl border px-3 py-3 text-left transition-colors ${maxPages === value ? 'border-[#0284C7] bg-sky-50 dark:border-[#0284C7] dark:bg-[#0284C7]/15' : 'border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-700/60'}`
                      },
                        h('p', { className: 'text-sm font-semibold text-zinc-900 dark:text-white' }, value === 0 ? 'All pages' : `${value} page${value === 1 ? '' : 's'}`),
                        h('p', { className: 'mt-1 text-xs text-zinc-500 dark:text-zinc-400' }, value <= 1 ? 'Fastest' : value === 0 ? 'Deepest scan' : 'Balanced coverage')
                      )
                    )
                  ),
                  h('div', { className: 'mt-4 grid gap-4 sm:grid-cols-2' },
                    h('label', { className: 'block' },
                      h('span', { className: 'text-sm font-medium text-zinc-700 dark:text-zinc-300' }, 'Feed'),
                      h('select', {
                        value: mode,
                        onChange: (e) => setMode(e.target.value),
                        className: 'mt-2 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-white'
                      },
                        h('option', { value: 'new' }, 'Latest posts'),
                        h('option', { value: 'top' }, 'Top posts')
                      )
                    ),
                    h('label', { className: 'block' },
                      h('span', { className: 'text-sm font-medium text-zinc-700 dark:text-zinc-300' }, 'Auto-refresh'),
                      h('select', {
                        value: autoRefreshEnabled ? autoRefreshInterval : 0,
                        onChange: (e) => {
                          const nextValue = Number(e.target.value);
                          if (nextValue === 0) {
                            setAutoRefreshEnabled(false);
                          } else {
                            setAutoRefreshEnabled(true);
                            setAutoRefreshInterval(nextValue);
                          }
                        },
                        className: 'mt-2 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-white'
                      },
                        h('option', { value: 0 }, 'Off'),
                        AUTO_REFRESH_OPTIONS.map(opt => h('option', { key: opt, value: opt }, `Every ${opt} min`))
                      )
                    )
                  )
                ),
                h('div', { className: 'rounded-xl border border-zinc-200 p-4 dark:border-zinc-700' },
                  h('p', { className: 'text-sm font-medium text-zinc-900 dark:text-white' }, 'What happens next'),
                  h('ul', { className: 'mt-3 space-y-3 text-sm text-zinc-600 dark:text-zinc-300' },
                    h('li', null, `Scan ${subs.length || 0} subreddit${subs.length === 1 ? '' : 's'}.`),
                    h('li', null, opportunityEngineEnabled ? 'The opportunity engine will rank posts against your business profile.' : 'The feed will stay manual until you enable the opportunity engine.'),
                    h('li', null, `Fetch depth is set to ${maxPages === 0 ? 'all available pages' : `${maxPages} page${maxPages === 1 ? '' : 's'}`}.`)
                  )
                )
              )
            ),
            h('div', { className: 'flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 px-5 py-4 dark:border-zinc-700' },
              h('div', { className: 'flex items-center gap-2' },
                h('button', {
                  type: 'button',
                  onClick: () => {
                    setOnboardingCompleted(true);
                    setOnboardingOpen(false);
                  },
                  className: 'text-sm text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
                }, 'Skip for now'),
                onboardingStep > 0 && h('button', {
                  type: 'button',
                  onClick: () => setOnboardingStep(step => Math.max(0, step - 1)),
                  className: 'rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-700'
                }, 'Back')
              ),
              h('div', { className: 'flex items-center gap-2' },
                onboardingStep < onboardingSteps.length - 1
                  ? h('button', {
                      type: 'button',
                      onClick: () => setOnboardingStep(step => Math.min(onboardingSteps.length - 1, step + 1)),
                      disabled: !onboardingCanContinue,
                      className: 'rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#0284C7] dark:hover:bg-[#0369A1]'
                    }, 'Continue')
                  : h('button', {
                      type: 'button',
                      onClick: completeOnboarding,
                      disabled: !onboardingCanContinue || subs.length === 0 || loading,
                      className: 'rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#0284C7] dark:hover:bg-[#0369A1]'
                    }, loading ? 'Loading…' : 'Finish and fetch')
              )
            )
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
                      [
                        h('option', { key: 'all', value: 0 }, 'All pages'),
                        ...[1, 2, 3, 5, 7, 10, 15, 20, 30].map(n => h('option', { key: n, value: n }, n))
                      ]
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
                      h('p', { className: 'font-medium text-zinc-900 dark:text-white' }, 'Notify on strong opportunities'),
                      h('p', { className: 'text-sm text-zinc-500 dark:text-zinc-400' }, 'Get notified when a post reaches your threshold (opportunity engine must be enabled)')
                    ),
                    h('button', {
                      onClick: () => setNotifyStrongOpportunities(!notifyStrongOpportunities),
                      disabled: !opportunityEngineEnabled || !hasOpportunityGoals,
                      className: `relative w-11 h-6 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900 ${notifyStrongOpportunities ? 'bg-[#0284C7]' : 'bg-zinc-300 dark:bg-zinc-600'}`
                    },
                      h('span', { className: `absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${notifyStrongOpportunities ? 'translate-x-5' : ''}` })
                    )
                  ),
                  h('label', { className: 'block' },
                    h('span', { className: 'text-sm font-medium text-zinc-700 dark:text-zinc-300' }, 'Strong-opportunity threshold'),
                    h('p', { className: 'text-xs text-zinc-500 dark:text-zinc-400 mb-1' }, 'Minimum priority proxy (4 or 5) to trigger a notification'),
                    h('select', {
                      value: priorityNotificationThreshold,
                      onChange: (e) => setPriorityNotificationThreshold(Number(e.target.value) || 4),
                      disabled: !notifyStrongOpportunities || !opportunityEngineEnabled,
                      className: 'w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed'
                    },
                      h('option', { value: 4 }, '4+'),
                      h('option', { value: 5 }, '5+')
                    )
                  )
                )
              ),
              // Opportunity engine section
              h('div', { className: 'pt-4 border-t border-zinc-200 dark:border-zinc-700' },
                // Header: label + enable toggle
                h('div', { className: 'flex items-center justify-between mb-4' },
                  h('p', { className: 'text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide' }, 'Opportunity Engine'),
                  h('button', {
                    onClick: () => setOpportunityEngineEnabled(!opportunityEngineEnabled),
                    title: opportunityEngineEnabled ? 'Disable opportunity engine' : 'Enable opportunity engine',
                    className: `relative w-11 h-6 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900 ${opportunityEngineEnabled ? 'bg-[#0284C7]' : 'bg-zinc-300 dark:bg-zinc-600'}`
                  },
                    h('span', { className: `absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${opportunityEngineEnabled ? 'translate-x-5' : ''}` })
                  )
                ),
                h('div', { className: 'space-y-4' },

                  // 1. Business profile
                  h('div', null,
                    h('div', { className: 'flex flex-wrap gap-1.5 mb-2' },
                      AI_PRESETS.map(preset => h('button', {
                        key: preset.id,
                        type: 'button',
                        onClick: () => applyPreset(preset),
                        disabled: !opportunityEngineEnabled,
                        className: `px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${aiPresetId === preset.id ? 'bg-[#0284C7] text-white border-[#0284C7]' : 'border-zinc-200 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'} ${!opportunityEngineEnabled ? 'opacity-50 cursor-not-allowed' : ''}`
                      },
                        h('span', { className: 'inline-flex items-center gap-1.5' },
                          renderPresetIcon(preset.id, aiPresetId === preset.id),
                          h('span', null, preset.label)
                        )
                      ))
                    ),
                    h('div', { className: 'grid grid-cols-1 gap-3 sm:grid-cols-2 mb-3' },
                      h('label', { className: 'block sm:col-span-2' },
                        h('span', { className: 'text-sm font-medium text-zinc-700 dark:text-zinc-300' }, 'What do you sell?'),
                        h('input', {
                          type: 'text',
                          value: businessOffering,
                          onChange: (e) => setBusinessOffering(e.target.value),
                          placeholder: 'SEO consulting for B2B SaaS teams',
                          disabled: !opportunityEngineEnabled,
                          className: 'mt-1 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed'
                        })
                      ),
                      h('label', { className: 'block' },
                        h('span', { className: 'text-sm font-medium text-zinc-700 dark:text-zinc-300' }, 'Ideal customer'),
                        h('input', {
                          type: 'text',
                          value: idealCustomer,
                          onChange: (e) => setIdealCustomer(e.target.value),
                          placeholder: 'Founders and marketing leads at SMBs',
                          disabled: !opportunityEngineEnabled,
                          className: 'mt-1 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed'
                        })
                      ),
                      h('label', { className: 'block' },
                        h('span', { className: 'text-sm font-medium text-zinc-700 dark:text-zinc-300' }, 'Preferred engagement'),
                        h('select', {
                          value: preferredEngagement,
                          onChange: (e) => setPreferredEngagement(e.target.value),
                          disabled: !opportunityEngineEnabled,
                          className: 'mt-1 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed'
                        },
                          h('option', { value: 'reply' }, 'Public reply'),
                          h('option', { value: 'dm' }, 'DM / outreach'),
                          h('option', { value: 'either' }, 'Either'),
                          h('option', { value: 'research' }, 'Research only')
                        )
                      ),
                      h('label', { className: 'block sm:col-span-2' },
                        h('span', { className: 'text-sm font-medium text-zinc-700 dark:text-zinc-300' }, 'Problems you solve'),
                        h('textarea', {
                          value: problemsSolved,
                          onChange: (e) => setProblemsSolved(e.target.value),
                          placeholder: 'Traffic drops, poor search visibility, weak conversion pages',
                          disabled: !opportunityEngineEnabled,
                          rows: 2,
                          className: 'mt-1 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed resize-none'
                        })
                      ),
                      h('label', { className: 'block' },
                        h('span', { className: 'text-sm font-medium text-zinc-700 dark:text-zinc-300' }, 'Strategy'),
                        h('select', {
                          value: strategyPreset,
                          onChange: (e) => setStrategyPreset(e.target.value),
                          disabled: !opportunityEngineEnabled,
                          className: 'mt-1 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed'
                        },
                          h('option', { value: 'balanced' }, 'Balanced'),
                          h('option', { value: 'sales' }, 'Sales'),
                          h('option', { value: 'fast_wins' }, 'Fast wins'),
                          h('option', { value: 'research' }, 'Research')
                        )
                      ),
                      h('label', { className: 'block' },
                        h('span', { className: 'text-sm font-medium text-zinc-700 dark:text-zinc-300' }, 'Strictness'),
                        h('select', {
                          value: opportunityStrictness,
                          onChange: (e) => setOpportunityStrictness(e.target.value),
                          disabled: !opportunityEngineEnabled,
                          className: 'mt-1 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed'
                        },
                          h('option', { value: 'strict' }, 'Strict'),
                          h('option', { value: 'balanced' }, 'Balanced'),
                          h('option', { value: 'broad' }, 'Broad recall')
                        )
                      ),
                      h('label', { className: 'block sm:col-span-2' },
                        h('span', { className: 'text-sm font-medium text-zinc-700 dark:text-zinc-300' }, 'Opportunity types'),
                        h('input', {
                          type: 'text',
                          value: opportunityFocus,
                          onChange: (e) => setOpportunityFocus(e.target.value),
                          placeholder: 'lead, pain_point, tool_search',
                          disabled: !opportunityEngineEnabled,
                          className: 'mt-1 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed'
                        })
                      )
                    ),
                    h('textarea', {
                      value: opportunityBrief,
                      onChange: (e) => setOpportunityBrief(e.target.value),
                      placeholder: 'Optional: extra instructions or nuanced opportunities to prioritize',
                      disabled: !opportunityEngineEnabled,
                      rows: 3,
                      className: 'w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#0284C7] focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-900 focus:border-transparent resize-none'
                    })
                  ),

                  // 2. Tune (collapsible)
                  h('div', { className: 'rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden' },
                    h('button', {
                      type: 'button',
                      onClick: () => setAiAdvancedOpen(!aiAdvancedOpen),
                      disabled: !opportunityEngineEnabled,
                      className: 'w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                    },
                      h('span', null, 'Advanced tuning'),
                      h('svg', { className: `w-4 h-4 text-zinc-400 transition-transform ${aiAdvancedOpen ? 'rotate-180' : ''}`, fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                        h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M19 9l-7 7-7-7' })
                      )
                    ),
                    aiAdvancedOpen && h('div', { className: 'px-3 pb-3 pt-3 space-y-3 border-t border-zinc-200 dark:border-zinc-700' },
                      h('label', { className: 'block' },
                        h('span', { className: 'text-xs font-medium text-zinc-700 dark:text-zinc-300' }, 'Avoid'),
                        h('p', { className: 'text-xs text-zinc-500 dark:text-zinc-400 mb-1' }, 'What should score low? e.g. job posts, memes, ads'),
                        h('input', {
                          type: 'text',
                          value: aiAvoid,
                          onChange: (e) => setAiAvoid(e.target.value),
                          placeholder: 'job postings, memes, generic questions without intent',
                          disabled: !opportunityEngineEnabled,
                          className: 'w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#0284C7] focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-900 focus:border-transparent'
                        })
                      ),
                      h('div', null,
                        h('p', { className: 'text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2' }, 'Few-shot examples'),
                        h('div', { className: 'space-y-2' },
                          h('label', { className: 'flex items-start gap-2' },
                            h('span', { className: 'w-14 shrink-0 text-[10px] font-mono font-medium text-emerald-600 dark:text-emerald-400 pt-2' }, 'PERFECT'),
                            h('textarea', {
                              value: aiExamplePerfect,
                              onChange: (e) => setAiExamplePerfect(e.target.value),
                              rows: 2,
                              disabled: !opportunityEngineEnabled,
                              placeholder: 'Traffic dropped 50%, need SEO help, budget ready',
                              className: 'flex-1 px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-xs disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#0284C7] resize-none'
                            })
                          ),
                          h('label', { className: 'flex items-start gap-2' },
                            h('span', { className: 'w-14 shrink-0 text-[10px] font-mono font-medium text-sky-600 dark:text-sky-400 pt-2' }, 'STRONG'),
                            h('textarea', {
                              value: aiExampleStrong,
                              onChange: (e) => setAiExampleStrong(e.target.value),
                              rows: 2,
                              disabled: !opportunityEngineEnabled,
                              placeholder: 'How can we improve our local rankings?',
                              className: 'flex-1 px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-xs disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#0284C7] resize-none'
                            })
                          ),
                          h('label', { className: 'flex items-start gap-2' },
                            h('span', { className: 'w-14 shrink-0 text-[10px] font-mono font-medium text-zinc-400 dark:text-zinc-500 pt-2' }, 'REJECT'),
                            h('textarea', {
                              value: aiExampleReject,
                              onChange: (e) => setAiExampleReject(e.target.value),
                              rows: 2,
                              disabled: !opportunityEngineEnabled,
                              placeholder: 'Hiring SEO specialist, $20/hr',
                              className: 'flex-1 px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-xs disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#0284C7] resize-none'
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
                      disabled: !opportunityEngineEnabled,
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
                                disabled: !opportunityEngineEnabled,
                                className: 'flex-1 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#0284C7] focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-900 focus:border-transparent font-mono'
                              }),
                              openRouterApiKey.trim() && h('button', {
                                onClick: saveSecureApiKey,
                                disabled: savingSecureKey || !opportunityEngineEnabled,
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
                            disabled: !opportunityEngineEnabled,
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
                            disabled: !opportunityEngineEnabled,
                            className: 'text-xs text-[#0284C7] dark:text-sky-400 hover:underline disabled:opacity-50 whitespace-nowrap shrink-0'
                          }, showAllModels ? 'Fewer' : 'All models')
                        ),
                        modelsLoading && h('p', { className: 'text-xs text-zinc-500 dark:text-zinc-400 mt-1' }, 'Loading models...'),
                        modelsError && h('p', { className: 'text-xs text-rose-600 dark:text-rose-400 mt-1' }, modelsError)
                      )
                    )
                  ),

                  // 4. Prompt preview (toggle link)
                  h('div', null,
                    h('button', {
                      type: 'button',
                      onClick: () => setAiShowPromptPreview(!aiShowPromptPreview),
                      className: 'text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors flex items-center gap-1.5'
                    },
                      h('svg', { className: `w-3 h-3 transition-transform ${aiShowPromptPreview ? 'rotate-90' : ''}`, fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                        h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M9 5l7 7-7 7' })
                      ),
                      'Preview engine prompt',
                      h('span', { className: 'px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-700 font-mono text-[10px]' }, AI_PROMPT_VERSION)
                    ),
                    aiShowPromptPreview && h('pre', { className: 'mt-2 max-h-44 overflow-auto whitespace-pre-wrap rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 p-2 text-[11px] text-zinc-700 dark:text-zinc-200' },
                      buildScoringPromptPreview({ goals: effectiveGoalText, context: effectiveContextText, avoid: effectiveAvoidText, examples: { perfect: aiExamplePerfect, strong: aiExampleStrong, reject: aiExampleReject } })
                    )
                  ),

                  // 6. Status banners
                  opportunityScanError && h('div', { className: 'p-2 rounded-lg border border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-900/20 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between gap-2' },
                    h('span', null, opportunityScanError),
                    h('button', { onClick: () => setOpportunityScanError(null), className: 'text-rose-400 hover:text-rose-600 dark:hover:text-rose-200 shrink-0 font-medium' }, '\u00d7')
                  ),
                  aiScoresStale && !opportunityScanError && h('div', { className: 'p-2 rounded-lg border border-amber-200 dark:border-amber-700/60 bg-amber-50/60 dark:bg-amber-900/20 text-xs text-amber-700 dark:text-amber-300' },
                    'Scores are cached \u2014 badges show ~ prefix. Re-run for fresh results.'
                  ),

                  // 7. Run ranking
                  h('div', { className: 'flex items-center gap-3' },
                    h('button', {
                      type: 'button',
                      onClick: rerankNow,
                      disabled: !opportunityEngineEnabled || !hasOpportunityGoals || opportunityScanLoading || loading || data.length === 0,
                      className: 'flex-1 px-3 py-2 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-[#0284C7] dark:hover:bg-[#0369A1] disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
                    }, opportunityScanLoading ? 'Analyzing\u2026' : 'Run opportunity scan'),
                    opportunityScanLoading && h('div', { className: 'flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 shrink-0' },
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
