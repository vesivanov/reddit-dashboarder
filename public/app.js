(function initDashboardRuntime() {
const { useCallback, useEffect, useMemo, useRef, useState } = React;
const { createRoot } = ReactDOM;
const h = React.createElement;
const authModule = window.RDDAppAuth || {};
const helpers = window.RDDHelpers || {};
const storageModule = window.RDDAppStorage || {};
const workspaceClient = window.RDDWorkspaceClient || {};
const fetchClient = window.RDDFetchClient || {};
const aiClient = window.RDDAiClient || {};
const refreshController = window.RDDRefreshController || {};
const aiController = window.RDDAiController || {};
const postView = window.RDDPostView || {};
const onboardingView = window.RDDOnboardingView || {};
const settingsView = window.RDDSettingsView || {};
const shellView = window.RDDShellView || {};
const sidebarView = window.RDDSidebarView || {};
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
  BUILD_INFO,
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
  absoluteDate,
} = window.RDDAppUtils || {};
const {
  readString = (_key, fallback = '') => fallback,
  readBooleanFlag = (_key, fallback = false) => fallback,
  readNumber = (_key, fallback = 0) => fallback,
  readJSON = (_key, fallback = null) => fallback,
  writeString = () => {},
  removeItem = () => {},
  loadSubs = (defaultSubs) => defaultSubs,
  persistSubs = () => {},
  loadDashboardData = () => [],
  loadHiddenPosts = () => new Set(),
  persistHiddenPosts = () => {},
  loadThemePreference = () => false,
  persistThemePreference = () => {},
  loadSnapshotInfo = () => null,
  persistSnapshotInfo = () => {},
  loadSyncToken = (buildToken) => buildToken(),
} = storageModule;
const {
  makeSyncToken = () => `sync_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
  getConfigIdentity = ({ syncToken }) => syncToken,
  loadOpportunityConfig: loadWorkspaceOpportunityConfig = null,
  getPayloadSizeBytes = (payload) => new TextEncoder().encode(JSON.stringify(payload)).length,
  buildSyncSettings: buildWorkspaceSyncSettings = null,
  buildSyncFilters: buildWorkspaceSyncFilters = null,
  buildSyncPosts: buildWorkspaceSyncPosts = null,
  syncDashboardSnapshot: postWorkspaceSnapshot = null,
  syncOpportunityConfig: postWorkspaceOpportunityConfig = null,
} = workspaceClient;
const {
  buildCoverageQuery = ({ subs, mode, time, days, targetWindowDays }) => new URLSearchParams({
    subs: subs.join(','),
    mode,
    time,
    days: String(days),
    target_window_days: String(targetWindowDays),
  }),
  requestCoverage = null,
  requestCoverageAdvance = null,
  getEffectiveMaxPages = (maxPages) => maxPages,
  determineSnapshotChunkSize = ({ subsCount }) => subsCount,
  shapeSnapshotChunk = ({ limit, maxPages }) => ({ chunkLimit: limit, chunkMaxPages: maxPages, chunkWasCapped: false }),
  isCoverageComplete = () => false,
  isCoveragePageCapped = () => false,
  computeCoverageProgress = () => ({ completedSubs: 0, totalPosts: 0 }),
  buildCoverageCounts = () => ({ complete1dCount: 0, complete3dCount: 0, complete5dCount: 0 }),
  buildFetchSummary = () => null,
  buildSnapshotParams = null,
  requestSnapshotChunk = null,
  requestAiRank = null,
} = fetchClient;
const {
  buildAiCacheVersion = ({ goalText, contextText, promptVersion, model, hashGoals }) => `${hashGoals(`${goalText}||${contextText}`)}_${promptVersion}_${model}`,
  getAiCacheVersionStatus = () => ({ savedVersion: '', mismatched: false }),
  ensureAiCacheVersion = () => ({ savedVersion: '', mismatched: false }),
  persistAiModelInfo = () => {},
  loadAiScoreCache = () => ({ scores: new Map(), metadata: new Map(), opportunities: new Map(), cacheObject: {}, hadExpiredRequestedEntries: false }),
  persistAiScoreCache = () => {},
  buildHeuristicRankingPlan = ({ posts = [] }) => ({ keywords: [], postsWithHeuristic: [], topPosts: posts, remainingPosts: [], heuristicDetailsById: new Map() }),
  buildAiRankRequestPayload = (payload) => payload,
  collectStrongOpportunityNotifications = () => [],
  mergeAiRankResponse = ({ scores, metadata, opportunities, cacheObject }) => ({ scores, metadata, opportunities, cacheObject }),
  appendHeuristicScores = ({ scores, metadata, cacheObject }) => ({ scores, metadata, cacheObject }),
  appendNotifiedPostIds = (previousIds) => new Set(previousIds || []),
} = aiClient;
const {
  runAiRankingFlow = async () => {},
} = aiController;
const {
  runSnapshotRefreshFlow = async ({ localPauseUntil }) => localPauseUntil,
  startCoverageRefreshFlow = async () => false,
} = refreshController;
const {
  getPriorityScore: getPriorityScoreValue = ({ postId, getOpportunityForPost, postScoreProxies }) => {
    const opportunity = getOpportunityForPost(postId);
    if (opportunity?.scores?.priority !== undefined && opportunity?.scores?.priority !== null) {
      return Number(opportunity.scores.priority) || 0;
    }
    const relevance = postScoreProxies.get(String(postId));
    if (relevance !== undefined && relevance !== null) return (Number(relevance) || 0) / 5;
    return null;
  },
  formatOpportunityLabel = (value) => (value ? String(value).replace(/_/g, ' ') : null),
  buildSelectedPostWhyItems: buildPostWhyItems = ({ selectedPost }) => (selectedPost ? [] : []),
  buildSelectedPostNextAction: buildPostNextAction = () => '',
  renderPostList = () => null,
  renderPostDetailPane = () => null,
} = postView;
const {
  renderOnboardingModal = () => null,
} = onboardingView;
const {
  renderSettingsModal = () => null,
} = settingsView;
const {
  renderMobileBottomNav = () => null,
  renderAddSubredditModal = () => null,
} = shellView;
const {
  renderSidebar = () => null,
} = sidebarView;
    function App() {
      const [subs, setSubs] = useState(() => {
        return loadSubs(DEFAULT_SUBS);
      });
      const [mode, setMode] = useState('new');
      const [time, setTime] = useState('day');
      const [days, setDays] = useState(1);
      const [limit, setLimit] = useState(100);
      const [maxPages, setMaxPages] = useState(() => {
        const saved = readString('dashboard_max_pages', '');
        if (saved === '0') return 0;
        if (saved) return Math.max(1, Math.min(30, Number(saved) || 5));
        return 5;
      });
      const [loading, setLoading] = useState(false);
      const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(() => {
        return readBooleanFlag('dashboard_auto_refresh_enabled', false);
      });
      const [autoRefreshInterval, setAutoRefreshInterval] = useState(() => {
        const saved = readNumber('dashboard_auto_refresh_interval', NaN);
        if (Number.isFinite(saved)) {
          return Math.min(60, Math.max(MIN_AUTO_REFRESH_MINUTES, Math.round(saved)));
        }
        return 10;
      });
      const [error, setError] = useState('');
      const [needsAuth, setNeedsAuth] = useState(false);
      const [data, setData] = useState(() => {
        return loadDashboardData();
      });
      const [selectedSub, setSelectedSub] = useState('ALL');
      const [selectedPost, setSelectedPost] = useState(null);
      const [fetchedAt, setFetchedAt] = useState(() => {
        const timestamp = readNumber('dashboard_fetched_at', 0);
        if (timestamp > 0) return timestamp;
        return null;
      });
      const [keyword, setKeyword] = useState('');
      const [fetchMethod, setFetchMethod] = useState('server');
      const [storageStatus, setStorageStatus] = useState(null);
      const [authenticated, setAuthenticated] = useState(false);
      const [authChecking, setAuthChecking] = useState(true);
      const [settingsOpen, setSettingsOpen] = useState(false);
      const [onboardingOpen, setOnboardingOpen] = useState(() => {
        return !readBooleanFlag('dashboard_onboarding_complete', false);
      });
      const [onboardingStep, setOnboardingStep] = useState(0);
      const [onboardingCompleted, setOnboardingCompleted] = useState(() => {
        return readBooleanFlag('dashboard_onboarding_complete', false);
      });
      const [onboardingSubInput, setOnboardingSubInput] = useState('');
      const [addSubOpen, setAddSubOpen] = useState(false);
      const [addSubInput, setAddSubInput] = useState('');
      const [minUpvoteFilter, setMinUpvoteFilter] = useState('');
      const [minCommentFilter, setMinCommentFilter] = useState('');
      const [minPriorityFilter, setMinPriorityFilter] = useState('');
      const [filterPresets, setFilterPresets] = useState(() => {
        return readJSON('dashboard_filter_presets', [], Array.isArray);
      });
      const [sortBy, setSortBy] = useState('date');
      const [sortOrder, setSortOrder] = useState('desc');
      const [postPageLimit, setPostPageLimit] = useState(150);
      const [nextRefreshAt, setNextRefreshAt] = useState(null);
      const [lastAutoRefreshAt, setLastAutoRefreshAt] = useState(null);
      const [rateLimitPauseUntil, setRateLimitPauseUntil] = useState(null);
      const [detailCollapsed, setDetailCollapsed] = useState(false);
      const [darkMode, setDarkMode] = useState(() => {
        return loadThemePreference();
      });
      const [hiddenPosts, setHiddenPosts] = useState(() => {
        return loadHiddenPosts();
      });
      const [activePostMenu, setActivePostMenu] = useState(null);
      const [hoverPost, setHoverPost] = useState(null);
      const [lastHiddenPost, setLastHiddenPost] = useState(null);
      const hoverTimeoutRef = useRef(null);
      const hideUndoTimeoutRef = useRef(null);
      const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
        return readBooleanFlag('dashboard_notifications', false);
      });
      const [upvoteThreshold, setUpvoteThreshold] = useState(() => {
        return readNumber('dashboard_upvote_threshold', 100) || 100;
      });
      const [alertKeywords, setAlertKeywords] = useState(() => {
        return readString('dashboard_alert_keywords', '');
      });
      const [previousPostScores, setPreviousPostScores] = useState(new Map());
      const [notifyStrongOpportunities, setNotifyStrongOpportunities] = useState(() => {
        return readString('dashboard_notify_strong_opportunities',
          readString('dashboard_notify_high_relevance', '')
        ) === '1';
      });
      const [priorityNotificationThreshold, setPriorityNotificationThreshold] = useState(() => {
        const val = readNumber(
          'dashboard_strong_opportunity_threshold',
          readNumber('dashboard_high_relevance_threshold', 4)
        ) || 4;
        return Math.max(0, Math.min(5, val));
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
        return readString('dashboard_ai_goals', '');
      });
      const [opportunityContext, setOpportunityContext] = useState(() => {
        return readString('dashboard_ai_context', '');
      });
      const [businessOffering, setBusinessOffering] = useState(() => {
        return readString('dashboard_business_offering', '');
      });
      const [idealCustomer, setIdealCustomer] = useState(() => {
        return readString('dashboard_ideal_customer', '');
      });
      const [problemsSolved, setProblemsSolved] = useState(() => {
        return readString('dashboard_problems_solved', '');
      });
      const [preferredEngagement, setPreferredEngagement] = useState(() => {
        return readString('dashboard_preferred_engagement', 'reply');
      });
      const [strategyPreset, setStrategyPreset] = useState(() => {
        return readString('dashboard_strategy_preset', 'balanced');
      });
      const [opportunityFocus, setOpportunityFocus] = useState(() => {
        return readString('dashboard_opportunity_focus', 'lead,pain_point,tool_search');
      });
      const [opportunityStrictness, setOpportunityStrictness] = useState(() => {
        return readString('dashboard_opportunity_strictness', 'balanced');
      });
      const [aiAvoid, setAiAvoid] = useState(() => {
        return readString('dashboard_ai_avoid', '');
      });
      const [aiExamplePerfect, setAiExamplePerfect] = useState(() => {
        return readString('dashboard_ai_example_perfect', '');
      });
      const [aiExampleStrong, setAiExampleStrong] = useState(() => {
        return readString('dashboard_ai_example_strong', '');
      });
      const [aiExampleReject, setAiExampleReject] = useState(() => {
        return readString('dashboard_ai_example_reject', '');
      });
      const [opportunityEngineEnabled, setOpportunityEngineEnabled] = useState(() => {
        const saved = readString('dashboard_ai_enabled', '');
        return saved !== '' ? saved === '1' : Boolean(readString('dashboard_ai_goals', ''));
      });
      const [aiPresetDismissed, setAiPresetDismissed] = useState(() => {
        return readBooleanFlag('dashboard_ai_preset_dismissed', false);
      });
      const [aiPresetId, setAiPresetId] = useState(() => {
        return readString('dashboard_ai_preset_id', '');
      });
      const [openRouterApiKey, setOpenRouterApiKey] = useState('');
      const [secureKeyStatus, setSecureKeyStatus] = useState({ hasKey: false, keyPreview: null, source: 'none', checking: true });
      const [savingSecureKey, setSavingSecureKey] = useState(false);
      const [openRouterModel, setOpenRouterModel] = useState(() => {
        return readString('dashboard_openrouter_model', DEFAULT_OPENROUTER_MODEL);
      });
      const [aiLlmPostLimit, setAiLlmPostLimit] = useState(() => {
        return readNumber('dashboard_ai_llm_limit', DEFAULT_LLM_POST_LIMIT) || DEFAULT_LLM_POST_LIMIT;
      });
      const AI_FIXED_TEMPERATURE = 0;
      const AI_FIXED_TOP_P = 1;
      const [showAiReasons, setShowAiReasons] = useState(() => {
        return readBooleanFlag('dashboard_show_ai_reasons', true);
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
        return loadSnapshotInfo();
      });
      const [syncToken, setSyncToken] = useState(() => {
        return loadSyncToken(makeSyncToken);
      });
      const [fetchSummary, setFetchSummary] = useState(null);
      const [fetchActivity, setFetchActivity] = useState(null);
      const [aiActivity, setAiActivity] = useState(null);
      const [syncPauseUntil, setSyncPauseUntil] = useState(null);
      const [configSyncPauseUntil, setConfigSyncPauseUntil] = useState(null);
      const [sidecarSyncSuppressedUntil, setSidecarSyncSuppressedUntil] = useState(null);
      const loadingRef = useRef(false);
      const coverageRunIdRef = useRef(0);
      const coverageAbortRef = useRef(null);
      const addSubInputRef = useRef(null);
      const opportunityScanRequestIdRef = useRef(0);
      const hydratedOpportunityConfigRef = useRef(null);

      useEffect(() => { loadingRef.current = loading; }, [loading]);

      // Persist subs
      useEffect(() => {
        persistSubs(subs);
      }, [subs]);

      useEffect(() => {
        writeString('dashboard_max_pages', String(maxPages));
      }, [maxPages]);

      useEffect(() => {
        writeString('dashboard_auto_refresh_enabled', autoRefreshEnabled ? '1' : '0');
      }, [autoRefreshEnabled]);

      useEffect(() => {
        writeString('dashboard_auto_refresh_interval', String(autoRefreshInterval));
      }, [autoRefreshInterval]);

      useEffect(() => {
        storageModule.writeJSON('dashboard_filter_presets', filterPresets);
      }, [filterPresets]);

      useEffect(() => {
        writeString('dashboard_onboarding_complete', onboardingCompleted ? '1' : '0');
      }, [onboardingCompleted]);

      // Dark mode persistence and class toggle
      useEffect(() => {
        persistThemePreference(darkMode);
      }, [darkMode]);

      // Hidden posts persistence (limit to 1000 entries)
      useEffect(() => {
        persistHiddenPosts(hiddenPosts);
      }, [hiddenPosts]);

      // Notification settings persistence
      useEffect(() => {
        writeString('dashboard_notifications', notificationsEnabled ? '1' : '0');
      }, [notificationsEnabled]);
      useEffect(() => {
        writeString('dashboard_upvote_threshold', String(upvoteThreshold));
      }, [upvoteThreshold]);
      useEffect(() => {
        writeString('dashboard_alert_keywords', alertKeywords);
      }, [alertKeywords]);
      useEffect(() => {
        writeString('dashboard_notify_strong_opportunities', notifyStrongOpportunities ? '1' : '0');
      }, [notifyStrongOpportunities]);
      useEffect(() => {
        writeString('dashboard_strong_opportunity_threshold', String(priorityNotificationThreshold));
      }, [priorityNotificationThreshold]);

      // AI settings persistence
      useEffect(() => {
        writeString('dashboard_ai_goals', opportunityBrief);
      }, [opportunityBrief]);
      useEffect(() => {
        writeString('dashboard_ai_context', opportunityContext);
      }, [opportunityContext]);
      useEffect(() => {
        writeString('dashboard_business_offering', businessOffering);
      }, [businessOffering]);
      useEffect(() => {
        writeString('dashboard_ideal_customer', idealCustomer);
      }, [idealCustomer]);
      useEffect(() => {
        writeString('dashboard_problems_solved', problemsSolved);
      }, [problemsSolved]);
      useEffect(() => {
        writeString('dashboard_preferred_engagement', preferredEngagement);
      }, [preferredEngagement]);
      useEffect(() => {
        writeString('dashboard_strategy_preset', strategyPreset);
      }, [strategyPreset]);
      useEffect(() => {
        writeString('dashboard_opportunity_focus', opportunityFocus);
      }, [opportunityFocus]);
      useEffect(() => {
        writeString('dashboard_opportunity_strictness', opportunityStrictness);
      }, [opportunityStrictness]);
      useEffect(() => {
        writeString('dashboard_ai_avoid', aiAvoid);
      }, [aiAvoid]);
      useEffect(() => {
        writeString('dashboard_ai_example_perfect', aiExamplePerfect);
      }, [aiExamplePerfect]);
      useEffect(() => {
        writeString('dashboard_ai_example_strong', aiExampleStrong);
      }, [aiExampleStrong]);
      useEffect(() => {
        writeString('dashboard_ai_example_reject', aiExampleReject);
      }, [aiExampleReject]);
      useEffect(() => {
        writeString('dashboard_ai_enabled', opportunityEngineEnabled ? '1' : '0');
      }, [opportunityEngineEnabled]);
      useEffect(() => {
        writeString('dashboard_ai_preset_dismissed', aiPresetDismissed ? '1' : '0');
      }, [aiPresetDismissed]);
      useEffect(() => {
        writeString('dashboard_ai_preset_id', aiPresetId);
      }, [aiPresetId]);
      useEffect(() => {
        writeString('dashboard_openrouter_model', openRouterModel);
      }, [openRouterModel]);
      useEffect(() => {
        writeString('dashboard_ai_llm_limit', String(aiLlmPostLimit));
      }, [aiLlmPostLimit]);

      useEffect(() => {
        removeItem('dashboard_openrouter_api_key');
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
        if (data && data.length > 0) {
          storageModule.writeJSON('dashboard_data', data);
        }
      }, [data]);

      useEffect(() => {
        if (fetchedAt) {
          writeString('dashboard_fetched_at', String(fetchedAt));
        }
      }, [fetchedAt]);

      useEffect(() => {
        persistSnapshotInfo(snapshotInfo);
      }, [snapshotInfo]);

      useEffect(() => {
        if (syncToken) writeString('dashboard_sync_token', syncToken);
      }, [syncToken]);

      // Restore and apply AI scores on initial load with restored data
      const hasRestoredScoresRef = useRef(false);
      useEffect(() => {
        // Only run once when data is available, AI is enabled, and we haven't restored scores yet
        if (data.length > 0 && opportunityEngineEnabled && hasOpportunityGoals && postScoreProxies.size === 0 && !hasRestoredScoresRef.current) {
          hasRestoredScoresRef.current = true;
          const currentCacheVersion = buildAiCacheVersion({
            goalText: effectiveGoalText,
            contextText: effectiveContextText,
            promptVersion: AI_PROMPT_VERSION,
            model: openRouterModel,
            hashGoals,
          });
          const cacheVersionStatus = getAiCacheVersionStatus(currentCacheVersion);
          const allPosts = data.flatMap(group => group.posts || []);
          const cacheState = loadAiScoreCache({
            posts: allPosts,
            expiryMs: AI_CACHE_EXPIRY_MS,
            fallbackSource: 'cache-restored',
            fallbackReason: '',
          });

          if (cacheState.scores.size > 0) {
            setPostScoreProxies(cacheState.scores);
            setPostScoreMetadata(cacheState.metadata);
            setPostOpportunities(cacheState.opportunities);
            setScoresVersion(v => v + 1);
            setAiScoresStale(Boolean(cacheVersionStatus.mismatched || cacheState.hadExpiredRequestedEntries));
          }
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
        const configIdentity = getConfigIdentity({ snapshotInfo, syncToken });
        if (hydratedOpportunityConfigRef.current === configIdentity) return;

        let cancelled = false;
        async function loadOpportunityConfig() {
          try {
            const result = loadWorkspaceOpportunityConfig
              ? await loadWorkspaceOpportunityConfig({ snapshotInfo, syncToken })
              : { ok: false, status: 500, payload: null };
            if (result.status === 404) {
              hydratedOpportunityConfigRef.current = configIdentity;
              return;
            }
            if (!result.ok) {
              try {
                console.warn('Failed to load opportunity config', result.status, result.payload);
              } catch {
                console.warn('Failed to load opportunity config', result.status);
              }
              return;
            }

            const config = result.payload?.config || {};
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

            hydratedOpportunityConfigRef.current = configIdentity;
          } catch {}
        }

        loadOpportunityConfig();
        return () => { cancelled = true; };
      }, [authenticated, syncToken, snapshotInfo]);

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
        return getPriorityScoreValue({
          postId,
          getOpportunityForPost,
          postScoreProxies,
        });
      }, [getOpportunityForPost, postScoreProxies]);

      const getOpportunityTypeLabel = useCallback((postId) => {
        return formatOpportunityLabel(getOpportunityForPost(postId)?.classification?.type || null);
      }, [getOpportunityForPost]);

      const getRecommendedActionLabel = useCallback((postId) => {
        return formatOpportunityLabel(getOpportunityForPost(postId)?.action?.recommended || null);
      }, [getOpportunityForPost]);

      const buildSyncSettings = useCallback(() => buildWorkspaceSyncSettings({
        subs,
        normalizeSubredditName,
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
      }), [
        subs,
        normalizeSubredditName,
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
      ]);

      const buildSyncFilters = useCallback(() => buildWorkspaceSyncFilters({
        parseNumberFilter,
        minUpvoteFilter,
        minCommentFilter,
        minPriorityFilter,
        keyword,
      }), [parseNumberFilter, minUpvoteFilter, minCommentFilter, minPriorityFilter, keyword]);

      const buildSyncPosts = useCallback((groups) => buildWorkspaceSyncPosts({
        groups,
        postOpportunities,
        postScoreMetadata,
        postScoreProxies,
      }), [postOpportunities, postScoreMetadata, postScoreProxies]);

      const syncDashboardSnapshot = useCallback(async (groupsOverride) => {
        const groups = Array.isArray(groupsOverride) ? groupsOverride : data;
        if (!authenticated || !syncToken || !Array.isArray(groups) || groups.length === 0) return;
        if (syncPauseUntil && syncPauseUntil > Date.now()) return;
        if (sidecarSyncSuppressedUntil && sidecarSyncSuppressedUntil > Date.now()) return;
        const posts = buildSyncPosts(groups);
        const payload = {
          token: syncToken,
          posts,
          settings: buildSyncSettings(),
          filters: buildSyncFilters(),
          timestamp: new Date().toISOString(),
        };

        if (getPayloadSizeBytes(payload) > 200000) {
          setSyncPauseUntil(Date.now() + 10 * 60 * 1000);
          return;
        }

        try {
          const result = postWorkspaceSnapshot
            ? await postWorkspaceSnapshot({
                syncToken,
                posts,
                settings: payload.settings,
                filters: payload.filters,
              })
            : { ok: false, status: 500, body: null };
          if (result.ok) {
            setSyncPauseUntil(null);
            setSnapshotInfo(prev => ({
              ...(prev || {}),
              syncToken,
              workspaceId: result.body?.workspaceId || prev?.workspaceId || null,
            }));
          } else if (result.status === 413) {
            setSyncPauseUntil(Date.now() + 15 * 60 * 1000);
          } else if (result.status >= 500) {
            setSyncPauseUntil(Date.now() + 10 * 60 * 1000);
          }
        } catch {}
      }, [
        data,
        authenticated,
        syncToken,
        syncPauseUntil,
        sidecarSyncSuppressedUntil,
        buildSyncPosts,
        buildSyncSettings,
        buildSyncFilters,
      ]);

      const syncOpportunityConfig = useCallback(async () => {
        if (!authenticated || !syncToken) return;
        if (configSyncPauseUntil && configSyncPauseUntil > Date.now()) return;
        if (sidecarSyncSuppressedUntil && sidecarSyncSuppressedUntil > Date.now()) return;
        if (snapshotInfo?.syncToken !== syncToken) return;
        try {
          const settings = buildSyncSettings();
          const result = postWorkspaceOpportunityConfig
            ? await postWorkspaceOpportunityConfig({
                snapshotInfo,
                syncToken,
                subreddits: subs.map(normalizeSubredditName).filter(Boolean).slice(0, 50),
                goals: opportunityBrief.trim().slice(0, 500),
                aiContext: opportunityContext.trim().slice(0, 600),
                aiPrompt: opportunityBrief.trim().slice(0, 500),
                opportunityConfig: settings.opportunityConfig,
                scoringConfig: settings.scoringConfig,
                threshold: Math.max(0, Math.min(5, Number(priorityNotificationThreshold) || 4)),
                model: String(openRouterModel || '').slice(0, 100),
              })
            : { ok: false, status: 500, payload: null };
          if (result.ok) {
            setConfigSyncPauseUntil(null);
          } else if (result.status === 400 || result.status === 413) {
            try {
              console.warn('Failed to sync opportunity config', result.status, result.payload);
            } catch {
              console.warn('Failed to sync opportunity config', result.status);
            }
            setConfigSyncPauseUntil(Date.now() + 15 * 60 * 1000);
          } else if (result.status >= 500) {
            setConfigSyncPauseUntil(Date.now() + 10 * 60 * 1000);
          }
        } catch {}
      }, [
        authenticated,
        configSyncPauseUntil,
        sidecarSyncSuppressedUntil,
        syncToken,
        snapshotInfo,
        subs,
        opportunityBrief,
        opportunityContext,
        priorityNotificationThreshold,
        openRouterModel,
        buildSyncSettings,
        normalizeSubredditName,
      ]);

      // Reset page limit when filters/sort/sub changes
      useEffect(() => {
        setPostPageLimit(150);
      }, [selectedSub, keyword, minUpvoteFilter, minCommentFilter, minPriorityFilter, sortBy, sortOrder]);

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
        return buildPostWhyItems({
          selectedPost,
          meta,
          opportunity,
          velocity,
          formatVelocity,
          buildWhyLine,
        });
      }, [selectedPost, postScoreMetadata, selectedPostVelocity, getOpportunityForPost]);

      const selectedPostNextAction = useMemo(() => {
        if (!selectedPost) return '';
        const opportunity = getOpportunityForPost(selectedPost.id);
        const score = postScoreProxies.get(String(selectedPost.id));
        return buildPostNextAction({
          selectedPost,
          opportunity,
          score,
        });
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
        await runAiRankingFlow({
          perSub,
          data,
          triggeredByAuto,
          llmPostLimit,
          opportunityEngineEnabled,
          hasOpportunityGoals,
          maxLlmPostLimit: MAX_LLM_POST_LIMIT,
          defaultLlmPostLimit: DEFAULT_LLM_POST_LIMIT,
          aiRateLimitPauseUntil,
          formatTimeUntil,
          effectiveGoalText,
          effectiveContextText,
          effectiveAvoidText,
          aiPromptVersion: AI_PROMPT_VERSION,
          openRouterModel,
          hashGoals,
          aiCacheExpiryMs: AI_CACHE_EXPIRY_MS,
          secureKeyAvailable: secureKeyStatus.hasKey,
          openRouterApiKey,
          aiFixedTemperature: AI_FIXED_TEMPERATURE,
          aiFixedTopP: AI_FIXED_TOP_P,
          aiExamplePerfect,
          aiExampleStrong,
          aiExampleReject,
          extractGoalKeywords,
          computeHeuristicDetails,
          computeHeuristicScore,
          buildRelevanceDebug,
          setPostScoreProxies,
          setPostScoreMetadata,
          setPostOpportunities,
          setScoresVersion,
          setAiActivity,
          setOpportunityScanError,
          setOpportunityScanLoading,
          setAiRateLimitPauseUntil,
          setAiScoresStale,
          notificationsEnabled,
          notifyStrongOpportunities,
          priorityNotificationThreshold,
          notifiedStrongOpportunityPostIds,
          setNotifiedStrongOpportunityPostIds,
          opportunityScanRequestIdRef,
        });
      }, [data, opportunityEngineEnabled, hasOpportunityGoals, aiLlmPostLimit, aiRateLimitPauseUntil, formatTimeUntil, effectiveGoalText, effectiveContextText, effectiveAvoidText, openRouterModel, secureKeyStatus.hasKey, openRouterApiKey, aiExamplePerfect, aiExampleStrong, aiExampleReject, notificationsEnabled, notifyStrongOpportunities, priorityNotificationThreshold, notifiedStrongOpportunityPostIds]);

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
          setFetchActivity(null);
          setNextRefreshAt(null);
          return;
        }

        const subsCount = subs.length;
        let effectiveMaxPages = getEffectiveMaxPages(maxPages, subsCount);
        const wantsDeepFetch = maxPages === 0 || maxPages > 4;
        const shouldUseCheckpointedCoverage = true;

        let localPauseUntil = rateLimitPauseUntil;

        setLoading(true);
        setFetchActivity({
          status: 'Preparing',
          detail: `Preparing a ${mode} fetch across ${subsCount} subreddit${subsCount === 1 ? '' : 's'}.`,
        });
        setError('');
        setNeedsAuth(false);
        if (coverageAbortRef.current) {
          try { coverageAbortRef.current.abort(); } catch {}
        }
        const controller = new AbortController();
        coverageAbortRef.current = controller;
        const refreshRunId = Date.now();
        coverageRunIdRef.current = refreshRunId;
        const timeoutMs = shouldUseCheckpointedCoverage
          ? 30 * 60 * 1000
          : Math.min(65000, 10000 + subs.length * 3500);
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        let keepCoverageController = false;

        try {
          if (shouldUseCheckpointedCoverage) {
            keepCoverageController = await startCoverageRefreshFlow({
              subs,
              subsCount,
              mode,
              time,
              days,
              limit,
              maxPages,
              forceRefresh,
              triggeredByAuto,
              effectiveMaxPages,
              controller,
              refreshRunId,
              coverageAbortRef,
              coverageRunIdRef,
              data,
              authenticated,
              autoRefreshEnabled,
              autoRefreshInterval,
              minAutoRefreshMinutes: MIN_AUTO_REFRESH_MINUTES,
              getAutoRefreshPlan,
              aiLlmPostLimit,
              buildCoverageQuery,
              requestCoverage,
              requestCoverageAdvance,
              isCoverageComplete,
              isCoveragePageCapped,
              computeCoverageProgress,
              buildCoverageCounts,
              buildFetchSummary,
              setFetchMethod,
              setSidecarSyncSuppressedUntil,
              setFetchSummary,
              setFetchActivity,
              setData,
              setFetchedAt,
              setSnapshotInfo,
              setStorageStatus,
              setNeedsAuth,
              setAuthenticated,
              setAuthChecking,
              setError,
              setRateLimitPauseUntil,
              setLoading,
              setNextRefreshAt,
              setLastAutoRefreshAt,
              syncDashboardSnapshot,
              runAiRanking,
            });
            return;
          }

          localPauseUntil = await runSnapshotRefreshFlow({
            subs,
            subsCount,
            mode,
            time,
            days,
            limit,
            maxPages,
            forceRefresh,
            triggeredByAuto,
            wantsDeepFetch,
            effectiveMaxPages,
            controller,
            defaultApiUrl: DEFAULT_API_URL,
            data,
            previousPostScores,
            notificationsEnabled,
            upvoteThreshold,
            alertKeywords,
            aiLlmPostLimit,
            determineSnapshotChunkSize,
            shapeSnapshotChunk,
            buildSnapshotParams,
            requestSnapshotChunk,
            buildFetchSummary,
            setFetchMethod,
            setSidecarSyncSuppressedUntil,
            setFetchActivity,
            setNeedsAuth,
            setAuthenticated,
            setAuthChecking,
            setFetchSummary,
            setError,
            setStorageStatus,
            setRateLimitPauseUntil,
            setData,
            setFetchedAt,
            setSnapshotInfo,
            setPreviousPostScores,
            syncDashboardSnapshot,
            runAiRanking,
            localPauseUntil,
          });
        } catch (fetchError) {
          setNeedsAuth(false);
          setSnapshotInfo(null);
          setFetchSummary(null);
          setFetchActivity({
            status: 'Failed',
            detail: fetchError?.name === 'AbortError'
              ? 'The fetch timed out before it completed.'
              : (fetchError.message || 'Fetch failed.'),
          });
          if (fetchError?.name === 'AbortError') {
            setError(`Request timed out. Reddit may be slow. Try again.`);
          } else {
            setError(fetchError.message || 'Fetch failed — check your connection and try again');
          }
        } finally {
          clearTimeout(timeoutId);
          if (!keepCoverageController && coverageAbortRef.current === controller) {
            coverageAbortRef.current = null;
          }
          if (!keepCoverageController) {
            setLoading(false);
            setFetchActivity(null);
          }
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
        const post = allPosts.find(p => p.id === postId);
        setHiddenPosts(prev => new Set([...prev, postId]));
        setActivePostMenu(null);
        if (selectedPost?.id === postId) setSelectedPost(null);
        setLastHiddenPost(post ? { id: postId, title: post.title } : { id: postId, title: null });
        if (hideUndoTimeoutRef.current) clearTimeout(hideUndoTimeoutRef.current);
        hideUndoTimeoutRef.current = setTimeout(() => setLastHiddenPost(null), 5000);
      }, [selectedPost, allPosts]);

      const handleUnhidePost = useCallback((postId) => {
        setHiddenPosts(prev => {
          const next = new Set(prev);
          next.delete(postId);
          return next;
        });
        setLastHiddenPost(null);
        if (hideUndoTimeoutRef.current) {
          clearTimeout(hideUndoTimeoutRef.current);
          hideUndoTimeoutRef.current = null;
        }
      }, []);

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

      // Cleanup hide-undo timeout on unmount
      useEffect(() => {
        return () => {
          if (hideUndoTimeoutRef.current) {
            clearTimeout(hideUndoTimeoutRef.current);
          }
        };
      }, []);

      useEffect(() => {
        if (!authenticated || data.length === 0 || !syncToken) return;
        if (sidecarSyncSuppressedUntil && sidecarSyncSuppressedUntil > Date.now()) return;
        const timeoutId = setTimeout(() => {
          syncDashboardSnapshot();
        }, 600);
        return () => clearTimeout(timeoutId);
      }, [
        authenticated,
        data,
        syncToken,
        sidecarSyncSuppressedUntil,
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
        if (sidecarSyncSuppressedUntil && sidecarSyncSuppressedUntil > Date.now()) return;
        if (snapshotInfo?.syncToken !== syncToken) return;
        const timeoutId = setTimeout(() => {
          syncOpportunityConfig();
        }, 700);
        return () => clearTimeout(timeoutId);
      }, [
        authenticated,
        syncToken,
        hasOpportunityGoals,
        sidecarSyncSuppressedUntil,
        snapshotInfo,
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

      function renderStatusChip(label, value, tone = 'neutral', title = undefined) {
        const toneClass =
          tone === 'success'
            ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-800/60'
            : tone === 'warning'
              ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-800/60'
              : tone === 'accent'
                ? 'bg-sky-100 text-sky-800 ring-1 ring-sky-200 dark:bg-sky-900/30 dark:text-sky-200 dark:ring-sky-800/60'
                : 'bg-white text-zinc-700 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700';
        return h('span', {
          className: `inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${toneClass}`,
          title: title || undefined,
        },
          h('span', { className: 'uppercase tracking-[0.08em] opacity-60' }, label),
          h('span', null, value)
        );
      }

      function renderGlyph(path, className = 'w-4 h-4') {
        return h('svg', { className, fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', 'aria-hidden': 'true' },
          h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: path })
        );
      }

      function renderCoveragePill(label, active) {
        const depthTitles = { '1d': 'Posts from the last 1 day fetched', '3d': 'Posts from the last 3 days fetched', '5d': 'Posts from the last 5 days fetched' };
        return h('span', {
          title: active ? depthTitles[label] || label : `${depthTitles[label] || label} — not yet complete`,
          className: `inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${active
            ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:ring-emerald-800/60'
            : 'bg-white text-zinc-500 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-500 dark:ring-zinc-700'}`
        }, label);
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
            : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800',
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
      const coverageStateBySub = new Map((data || []).map(group => [
        String(group?.subreddit || '').toLowerCase(),
        group?.coverage_state || null,
      ]));
      const coverageCounts = Array.from(coverageStateBySub.values()).reduce((acc, state) => {
        if (state?.complete_1d) acc.complete1d += 1;
        if (state?.complete_3d) acc.complete3d += 1;
        if (state?.complete_5d) acc.complete5d += 1;
        return acc;
      }, { complete1d: 0, complete3d: 0, complete5d: 0 });

      return h('div', { 
        className: 'h-screen flex flex-col bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100',
        onTouchStart: handleTouchStart,
        onTouchEnd: handleTouchEnd
      },
        // Header
        h('header', { className: 'bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-700 px-4 py-3 flex items-center justify-between gap-4 shrink-0' },
            h('div', { className: 'flex items-center gap-2.5' },
              h('svg', { width: 20, height: 20, viewBox: '0 0 20 20', fill: 'none', className: 'shrink-0', 'aria-hidden': 'true' },
                h('rect', { x: 1.5, y: 2.5, width: 17, height: 11, rx: 2, stroke: '#0284C7', strokeWidth: 1.5 }),
                h('path', { d: 'M7 19h6M10 13.5V19', stroke: '#0284C7', strokeWidth: 1.5, strokeLinecap: 'round' }),
                h('path', { d: 'M5 9.5l2-2.5 2.5 2.5 2-2 3 3', stroke: '#38BDF8', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' })
              ),
              h('h1', { className: 'text-lg font-bold text-zinc-900 dark:text-white' }, 'Reddit Dashboarder')
            ),
            h('div', { className: 'flex items-center gap-2' },
              // Dark mode toggle
              h('button', {
                onClick: () => setDarkMode(!darkMode),
                'aria-label': darkMode ? 'Switch to light mode' : 'Switch to dark mode',
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
                'aria-label': 'Open settings',
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
        h('div', { className: 'bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-700 px-4 py-2 flex items-center justify-between gap-4 text-sm shrink-0' },
          h('div', { className: 'flex flex-wrap items-center gap-2' },
            loading
              ? h('span', { className: 'flex items-center gap-2 text-zinc-600 dark:text-zinc-400' },
                  h('div', { className: 'w-3 h-3 border-2 border-zinc-300 dark:border-zinc-600 border-t-zinc-600 dark:border-t-zinc-300 rounded-full animate-spin' }),
                  'Fetching…'
                )
              : error
                ? h('span', { className: 'flex items-center gap-2 flex-wrap' },
                    h('span', { className: 'text-rose-600 dark:text-rose-400 font-medium' }, error),
                    h('button', {
                      onClick: () => refresh({ force: true }),
                      className: 'text-xs font-semibold text-rose-700 dark:text-rose-400 underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded'
                    }, 'Retry')
                  )
                : needsAuth
                  ? h('span', { className: 'text-amber-700 dark:text-amber-400 font-medium' }, 'Sign in required')
                  : [
                      renderStatusChip('Posts', visiblePosts.length > 0 ? visiblePosts.length : 0, 'neutral', 'Total visible posts after filters'),
                      fetchedAt && !loading && renderStatusChip('Updated', timeAgo(fetchedAt / 1000), 'neutral', `Last fetched: ${absoluteDate(fetchedAt / 1000)}`),
                      fetchSummary && !loading && renderStatusChip('Scope', fetchSummary.status, fetchSummary.tone),
                      data.length > 0 && !loading && renderStatusChip('1d', `${coverageCounts.complete1d}/${data.length}`, coverageCounts.complete1d === data.length ? 'success' : 'neutral', `1-day depth: ${coverageCounts.complete1d} of ${data.length} subreddits have posts from the last 24h`),
                      data.length > 0 && !loading && renderStatusChip('3d', `${coverageCounts.complete3d}/${data.length}`, coverageCounts.complete3d === data.length ? 'success' : 'neutral', `3-day depth: ${coverageCounts.complete3d} of ${data.length} subreddits have posts from the last 3 days`),
                      data.length > 0 && !loading && renderStatusChip('5d', `${coverageCounts.complete5d}/${data.length}`, coverageCounts.complete5d === data.length ? 'success' : 'neutral', `5-day depth: ${coverageCounts.complete5d} of ${data.length} subreddits have posts from the last 5 days`),
                      storageStatus && !loading && !storageStatus.persistent && renderStatusChip('Storage', 'Memory', 'warning', 'Posts stored in memory only — data will be lost on page reload'),
                      snapshotInfo?.cached && !loading && renderStatusChip('Cache', `${snapshotInfo.age_seconds || 0}s old`),
                      staleSubCount > 0 && renderStatusChip('Stale', `${staleSubCount} subreddit${staleSubCount === 1 ? '' : 's'}`, 'warning', `${staleSubCount} subreddit${staleSubCount === 1 ? ' has' : 's have'} cached data from a previous session`),
                      rateLimitPauseUntil && rateLimitPauseUntil > Date.now() && renderStatusChip('Cooldown', formatTimeUntil(rateLimitPauseUntil), 'warning', 'Reddit rate limit — fetching paused temporarily'),
                      autoRefreshEnabled && nextRefreshAt && !loading && renderStatusChip('Next refresh', formatTimeUntil(nextRefreshAt), 'neutral', 'Scheduled auto-refresh time'),
                      BUILD_INFO?.commit && !loading && renderStatusChip('Build', BUILD_INFO.commit),
                      opportunityScanLoading && renderStatusChip('AI', 'Ranking…', 'success', 'AI opportunity scan in progress'),
                      !opportunityScanLoading && opportunityEngineEnabled && hasOpportunityGoals && renderStatusChip('Engine', 'On', 'success', 'Opportunity engine is active and scoring posts'),
                      !opportunityScanLoading && opportunityEngineEnabled && hasOpportunityGoals && aiScoreStats.total > 0 && renderStatusChip('Reviewed', `${aiScoreStats.llm}/${aiScoreStats.total}`, 'success', `${aiScoreStats.llm} posts scored by AI out of ${aiScoreStats.total} total`),
                      !opportunityScanLoading && aiScoresStale && renderStatusChip('AI Scores', 'Stale', 'warning', 'Cached AI scores — goals or model changed since last scan. Re-run to get fresh scores.'),
                      !opportunityScanLoading && (!opportunityEngineEnabled || !hasOpportunityGoals) && postScoreProxies.size === 0 && renderStatusChip('Engine', 'Off', 'neutral', 'Opportunity engine is off — configure it in Settings'),
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
              'aria-label': 'Refresh posts',
              className: 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-[#0284C7] text-white text-sm font-medium hover:bg-zinc-800 dark:hover:bg-[#0369A1] disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900'
            },
              h('svg', { className: `w-4 h-4 ${loading ? 'animate-spin' : ''}`, fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', 'aria-hidden': 'true' },
                h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15' })
              ),
              'Refresh'
            ),
          )
        ),
        loading && fetchActivity && h('div', {
          className: 'border-b border-sky-200 bg-sky-50 px-4 py-2 text-xs text-sky-900 dark:border-sky-800/60 dark:bg-sky-900/20 dark:text-sky-200'
        },
          h('div', { className: 'flex flex-wrap items-center gap-x-3 gap-y-1' },
            h('span', { className: 'font-medium' }, `${fetchActivity.status}: ${fetchActivity.detail}`),
            fetchMethod && h('span', { className: 'opacity-70 uppercase tracking-[0.08em]' }, fetchMethod)
          )
        ),
        fetchSummary && !loading && !error && h('div', {
          className: `border-b px-4 py-2 text-xs sm:text-sm shrink-0 ${fetchSummary.tone === 'warning'
            ? 'bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-800/60'
            : fetchSummary.tone === 'accent'
              ? 'bg-sky-100 text-sky-900 border-sky-200 dark:bg-sky-900/30 dark:text-sky-200 dark:border-sky-800/60'
              : 'bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-800/60'}`
        },
          h('div', { className: 'flex flex-wrap items-center gap-x-3 gap-y-1' },
            h('span', { className: 'font-medium' }, fetchSummary.detail),
            fetchSummary.attemptedSubs > 0 && h('span', { className: 'opacity-80' }, `${fetchSummary.completedSubs}/${fetchSummary.attemptedSubs} subreddits complete`)
          )
        ),

        // Main content area
        h('div', { className: 'flex-1 flex overflow-hidden' },
          renderSidebar({
            h,
            mobileView,
            subs,
            setAddSubOpen,
            addSubInputRef,
            STARTER_PACKS,
            handleApplyStarterPack,
            renderStarterPackIcon,
            setSelectedSub,
            selectedSub,
            allPosts,
            subMetaMap,
            coverageStateBySub,
            formatSubs,
            renderCoveragePill,
            handleRemoveSub,
          }),

          // Center - Post list
          h('main', { className: `flex-1 flex-col bg-zinc-100 dark:bg-zinc-900 min-w-0 ${detailCollapsed ? '' : 'lg:border-r lg:border-zinc-200 dark:lg:border-zinc-700'} ${mobileView === 'posts' ? 'flex' : 'hidden lg:flex'}` },
            subs.length > 0 && h('section', { className: 'bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-700 shrink-0' },
              h('div', { className: 'flex items-center gap-3 px-4 py-2.5 min-w-0' },

                // Status dot
                h('div', { className: `w-2 h-2 rounded-full shrink-0 ${
                  opportunityScanLoading ? 'bg-amber-400 animate-pulse' :
                  opportunityEngineEnabled && hasOpportunityGoals ? 'bg-emerald-400' :
                  'bg-zinc-300 dark:bg-zinc-600'
                }` }),

                // Status label + goal summary
                h('div', { className: 'min-w-0 flex-1' },
                  h('div', { className: 'flex items-center gap-2 min-w-0' },
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
                  aiActivity?.detail && h('div', { className: 'mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400 truncate' },
                    `${aiActivity.status}: ${aiActivity.detail}`
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
                  aiScoresStale && h('span', { className: 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-800/60', title: 'Goals or model changed since last scan — re-run to refresh scores' }, 'Stale')
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
                h('label', { htmlFor: 'search-input', className: 'sr-only' }, 'Search posts'),
                h('svg', { className: 'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', 'aria-hidden': 'true' },
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
              h('div', { className: 'flex items-center gap-1.5' },
                h('span', { className: 'font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-400 dark:text-zinc-500 mr-1' }, 'Upvotes'),
                UPVOTE_PRESETS.map(preset =>
                  h('button', {
                    key: `upvote-${preset.value}`,
                    onClick: () => setMinUpvoteFilter(minUpvoteFilter === preset.value ? '' : preset.value),
                    'aria-pressed': minUpvoteFilter === preset.value,
                    className: `px-2.5 py-1 rounded-full text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900 ${minUpvoteFilter === preset.value ? 'bg-sky-50 dark:bg-[#0284C7]/15 text-[#0369A1] dark:text-sky-300' : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600'}`
                  }, preset.label)
                )
              ),
              h('div', { className: 'flex items-center gap-1.5' },
                h('span', { className: 'font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-400 dark:text-zinc-500 mr-1' }, 'Comments'),
                COMMENT_PRESETS.map(preset =>
                  h('button', {
                    key: `comment-${preset.value}`,
                    onClick: () => setMinCommentFilter(minCommentFilter === preset.value ? '' : preset.value),
                    'aria-pressed': minCommentFilter === preset.value,
                    className: `px-2.5 py-1 rounded-full text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900 ${minCommentFilter === preset.value ? 'bg-sky-50 dark:bg-[#0284C7]/15 text-[#0369A1] dark:text-sky-300' : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600'}`
                  }, preset.label)
                )
              ),
              // Opportunity priority filter (legacy AI score thresholds still apply as fallback)
              opportunityEngineEnabled && hasOpportunityGoals && postScoreProxies.size > 0 && h('div', { className: 'flex items-center gap-1.5' },
                h('span', { className: 'font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-400 dark:text-zinc-500 mr-1' }, 'Priority'),
                OPPORTUNITY_PRIORITY_PRESETS.map(preset =>
                  h('button', {
                    key: `ai-${preset.value}`,
                    onClick: () => setMinPriorityFilter(minPriorityFilter === preset.value ? '' : preset.value),
                    'aria-pressed': minPriorityFilter === preset.value,
                    className: `px-2.5 py-1 rounded-full text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900 ${minPriorityFilter === preset.value ? 'bg-sky-50 dark:bg-[#0284C7]/15 text-[#0369A1] dark:text-sky-300' : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600'}`
                  }, preset.label)
                )
              ),
              (alertKeywords.trim() || notifyStrongOpportunities || notificationsEnabled) && h('button', {
                onClick: () => setSettingsOpen(true),
                className: 'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-sky-50 dark:bg-[#0284C7]/15 text-[#0369A1] dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-[#0284C7]/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900',
                title: 'Alerts settings'
              }, h('svg', { className: 'w-3.5 h-3.5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', 'aria-hidden': 'true' },
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
                className: 'px-2.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-600 text-xs bg-white dark:bg-zinc-700 dark:text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#0284C7] focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-900 focus:border-transparent'
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
              }, 'Clear all'),
              filtersActive && filterPresets.length < 5 && h('button', {
                onClick: () => {
                  const label = [
                    minUpvoteFilter && `▲${minUpvoteFilter}+`,
                    minCommentFilter && `💬${minCommentFilter}+`,
                    minPriorityFilter && `P${minPriorityFilter}+`,
                    keyword && `"${truncateText(keyword, 12)}"`,
                  ].filter(Boolean).join(' ');
                  setFilterPresets(prev => [...prev, {
                    id: Date.now(),
                    label: label || `Preset ${prev.length + 1}`,
                    upvote: minUpvoteFilter,
                    comment: minCommentFilter,
                    priority: minPriorityFilter,
                    keyword,
                  }]);
                },
                title: 'Save current filters as a reusable preset',
                className: 'text-xs text-[#0284C7] dark:text-sky-400 hover:text-[#0369A1] dark:hover:text-sky-300 font-medium shrink-0'
              }, '+ Save filters'),
              filterPresets.length > 0 && h('div', { className: 'flex items-center gap-1.5 flex-wrap' },
                filterPresets.map(preset =>
                  h('span', { key: preset.id, className: 'inline-flex items-center gap-1 rounded-full bg-sky-50 dark:bg-[#0284C7]/15 border border-sky-200 dark:border-[#0284C7]/30 text-[11px] font-medium text-[#0369A1] dark:text-sky-300' },
                    h('button', {
                      onClick: () => { setMinUpvoteFilter(preset.upvote); setMinCommentFilter(preset.comment); setMinPriorityFilter(preset.priority); setKeyword(preset.keyword); },
                      title: `Apply: ${preset.label}`,
                      className: 'pl-2.5 pr-1 py-1 hover:text-[#0284C7] dark:hover:text-sky-100 transition-colors'
                    }, preset.label),
                    h('button', {
                      onClick: () => setFilterPresets(prev => prev.filter(p => p.id !== preset.id)),
                      'aria-label': `Remove preset "${preset.label}"`,
                      className: 'pr-2 py-1 text-sky-400 hover:text-[#0369A1] dark:hover:text-sky-100 transition-colors'
                    }, '×')
                  )
                )
              )
            ),
            activeFilterPills.length > 0 && h('div', { className: 'bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-700 px-4 py-2.5 flex items-center justify-between gap-3 shrink-0 flex-wrap' },
              h('div', { className: 'flex items-center gap-2 flex-wrap' },
                h('span', { className: 'text-xs font-medium text-zinc-500 dark:text-zinc-400' }, `Showing ${visiblePosts.length} of ${preFilterPostCount} posts`),
                ...activeFilterPills.map(pill => h('button', {
                  key: pill.key,
                  onClick: () => clearFilterPill(pill.key),
                  className: 'inline-flex items-center gap-1 rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-2.5 py-1 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                },
                  h('span', null, pill.label),
                  renderGlyph('M6 18L18 6M6 6l12 12', 'w-3 h-3 text-zinc-400')
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
                ? h('div', { className: 'flex flex-col items-center justify-center h-full p-10 text-center' },
                    subs.length === 0
                      ? [
                          h('div', { key: 'icon', className: 'w-14 h-14 mb-4 rounded-2xl bg-sky-50 dark:bg-[#0284C7]/15 border border-sky-200 dark:border-[#0284C7]/30 flex items-center justify-center' },
                            h('svg', { className: 'w-6 h-6 text-[#0284C7] dark:text-sky-400', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                              h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 1.5, d: 'M12 4v16m8-8H4' })
                            )
                          ),
                          h('h3', { key: 'title', className: 'text-base font-semibold text-zinc-900 dark:text-white mb-1' }, 'No subreddits yet'),
                          h('p', { key: 'desc', className: 'text-sm text-zinc-500 dark:text-zinc-400 max-w-xs' }, 'Pick a starter pack from the sidebar or add your own subreddits to get started.')
                        ]
                      : loading
                        ? h('div', { className: 'w-full' },
                            [0,1,2,3,4,5].map(i => h('div', { key: i, className: 'px-4 py-3.5 border-b border-zinc-200 dark:border-zinc-700 animate-pulse' },
                              h('div', { className: 'flex gap-3' },
                                h('div', { className: 'w-16 h-16 rounded-lg bg-zinc-200 dark:bg-zinc-700 shrink-0' }),
                                h('div', { className: 'flex-1 space-y-2 py-1' },
                                  h('div', { className: 'h-2.5 bg-zinc-200 dark:bg-zinc-700 rounded w-1/4' }),
                                  h('div', { className: 'h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-4/5' }),
                                  h('div', { className: 'h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-3/5' }),
                                  h('div', { className: 'h-2.5 bg-zinc-200 dark:bg-zinc-700 rounded w-1/3 mt-1' })
                                )
                              )
                            ))
                          )
                        : filtersActive || showingFilteredResults
                        ? [
                            h('div', { key: 'icon', className: 'w-14 h-14 mb-4 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 flex items-center justify-center' },
                              h('svg', { className: 'w-6 h-6 text-amber-500 dark:text-amber-400', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                                h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 1.5, d: 'M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z' })
                              )
                            ),
                            h('h3', { key: 'title', className: 'text-base font-semibold text-zinc-900 dark:text-white mb-1' }, 'No posts match these filters'),
                            h('p', { key: 'desc', className: 'text-sm text-zinc-500 dark:text-zinc-400 max-w-xs mb-4' }, 'Clear one or more filters to bring posts back into view.'),
                            h('div', { key: 'actions', className: 'flex items-center gap-2 flex-wrap justify-center' },
                              h('button', {
                                onClick: () => { setMinUpvoteFilter(''); setMinCommentFilter(''); setMinPriorityFilter(''); setKeyword(''); },
                                className: 'px-4 py-2 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-[#0284C7] dark:hover:bg-[#0369A1] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900'
                              }, 'Clear all filters'),
                              minPriorityFilter && h('button', {
                                onClick: () => setMinPriorityFilter(''),
                                className: 'px-4 py-2 rounded-lg text-sm font-medium border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                              }, 'Remove priority filter')
                            )
                          ]
                        : [
                            h('div', { key: 'icon', className: 'w-14 h-14 mb-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center' },
                              h('svg', { className: 'w-6 h-6 text-zinc-400 dark:text-zinc-500', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                                h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 1.5, d: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' })
                              )
                            ),
                            h('h3', { key: 'title', className: 'text-base font-semibold text-zinc-900 dark:text-white mb-1' }, opportunityEngineEnabled && hasOpportunityGoals ? 'No strong opportunities yet' : 'No posts found'),
                            h('p', { key: 'desc', className: 'text-sm text-zinc-500 dark:text-zinc-400 max-w-xs mb-4' }, opportunityEngineEnabled && hasOpportunityGoals
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
                : renderPostList({
                    h,
                    visiblePosts,
                    postPageLimit,
                    selectedPostId: selectedPost?.id || null,
                    postScoreProxies,
                    postScoreMetadata,
                    velocityMeta,
                    getOpportunityForPost,
                    getPriorityScore,
                    getOpportunityTypeLabel,
                    getRecommendedActionLabel,
                    handlePostHoverStart,
                    handlePostHoverEnd,
                    onSelectPost: (post) => { setSelectedPost(post); setDetailCollapsed(false); setMobileView('detail'); },
                    activePostMenu,
                    setActivePostMenu,
                    handleCopyLink,
                    handleHidePost,
                    setPostPageLimit,
                    showAiReasons,
                    aiScoresStale,
                    aiScoreLabel,
                    buildWhyLine,
                    formatVelocity,
                    renderGlyph,
                    timeAgo,
                    absoluteDate,
                  }),
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
          renderPostDetailPane({
            h,
            detailCollapsed,
            mobileView,
            setMobileView,
            setDetailCollapsed,
            selectedPost,
            getOpportunityForPost,
            getPriorityScore,
            postScoreProxies,
            postScoreMetadata,
            aiScoresStale,
            aiScoreLabel,
            showAiReasons,
            setShowAiReasons,
            selectedPostNextAction,
            selectedPostWhyItems,
            handleCopyLink,
            handleHidePost,
            renderGlyph,
            absoluteDate,
            timeAgo,
            renderBody,
          }),

          // Collapsed detail toggle
          detailCollapsed && h('button', {
            onClick: () => setDetailCollapsed(false),
            className: 'hidden lg:flex items-center justify-center w-8 bg-white dark:bg-zinc-800 border-l border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors',
            title: 'Expand detail panel'
          }, h('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
            h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M11 19l-7-7 7-7m8 14l-7-7 7-7' })
          ))
        ),

        renderMobileBottomNav({
          h,
          mobileView,
          setMobileView,
        }),

        renderOnboardingModal({
          h,
          onboardingOpen,
          closeOnboarding,
          onboardingCurrentStep,
          renderGlyph,
          onboardingSteps,
          onboardingStep,
          setOnboardingStep,
          subs,
          handleRemoveSub,
          onboardingSubInput,
          setOnboardingSubInput,
          handleOnboardingAddSubs,
          STARTER_PACKS,
          handleApplyStarterPack,
          renderStarterPackIcon,
          POPULAR_SUBREDDITS,
          handleAddSub,
          AI_PRESETS,
          applyPreset,
          aiPresetId,
          renderPresetIcon,
          truncateText,
          opportunityEngineEnabled,
          setOpportunityEngineEnabled,
          aiPresetSuggestion,
          setOpportunityBrief,
          opportunityBrief,
          hasOpportunityGoals,
          secureKeyStatus,
          selectedModelInfo,
          modelGroups,
          setOpenRouterModel,
          openRouterModel,
          maxPages,
          setMaxPages,
          mode,
          setMode,
          autoRefreshEnabled,
          autoRefreshInterval,
          setAutoRefreshEnabled,
          setAutoRefreshInterval,
          AUTO_REFRESH_OPTIONS,
          onboardingCanContinue,
          completeOnboarding,
          loading,
          onSkip: () => {
            setOnboardingCompleted(true);
            setOnboardingOpen(false);
          },
        }),

        renderAddSubredditModal({
          h,
          addSubOpen,
          setAddSubOpen,
          addSubInputRef,
          addSubInput,
          setAddSubInput,
          POPULAR_SUBREDDITS,
          subs,
          handleAddSub,
          handleAddSubSubmit,
        }),

        // Hide undo toast
        lastHiddenPost && h('div', {
          className: 'fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-900 dark:bg-zinc-700 text-white shadow-xl text-sm',
          role: 'status',
          'aria-live': 'polite',
        },
          h('span', null, lastHiddenPost.title ? `Post hidden: "${truncateText(lastHiddenPost.title, 40)}"` : 'Post hidden'),
          h('button', {
            onClick: () => handleUnhidePost(lastHiddenPost.id),
            className: 'font-semibold text-sky-300 hover:text-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded'
          }, 'Undo'),
          h('button', {
            onClick: () => setLastHiddenPost(null),
            'aria-label': 'Dismiss',
            className: 'text-zinc-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded ml-1'
          }, '×')
        ),

        renderSettingsModal({
          h,
          settingsOpen,
          setSettingsOpen,
          AUTO_REFRESH_OPTIONS,
          autoRefreshInterval,
          setAutoRefreshInterval,
          autoRefreshEnabled,
          setAutoRefreshEnabled,
          mode,
          setMode,
          time,
          setTime,
          days,
          setDays,
          maxPages,
          setMaxPages,
          requestNotificationPermission,
          notificationsEnabled,
          setNotificationsEnabled,
          upvoteThreshold,
          setUpvoteThreshold,
          alertKeywords,
          setAlertKeywords,
          notifyStrongOpportunities,
          setNotifyStrongOpportunities,
          opportunityEngineEnabled,
          setOpportunityEngineEnabled,
          hasOpportunityGoals,
          priorityNotificationThreshold,
          setPriorityNotificationThreshold,
          AI_PRESETS,
          applyPreset,
          aiPresetId,
          renderPresetIcon,
          businessOffering,
          setBusinessOffering,
          idealCustomer,
          setIdealCustomer,
          preferredEngagement,
          setPreferredEngagement,
          problemsSolved,
          setProblemsSolved,
          strategyPreset,
          setStrategyPreset,
          opportunityStrictness,
          setOpportunityStrictness,
          opportunityFocus,
          setOpportunityFocus,
          opportunityBrief,
          setOpportunityBrief,
          aiAdvancedOpen,
          setAiAdvancedOpen,
          aiAvoid,
          setAiAvoid,
          aiExamplePerfect,
          setAiExamplePerfect,
          aiExampleStrong,
          setAiExampleStrong,
          aiExampleReject,
          setAiExampleReject,
          aiShowModelKey,
          setAiShowModelKey,
          secureKeyStatus,
          deleteSecureApiKey,
          openRouterApiKey,
          setOpenRouterApiKey,
          saveSecureApiKey,
          savingSecureKey,
          modelGroups,
          openRouterModel,
          setOpenRouterModel,
          showAllModels,
          setShowAllModels,
          modelsLoading,
          modelsError,
          renderModelCard,
          aiShowPromptPreview,
          setAiShowPromptPreview,
          AI_PROMPT_VERSION,
          buildScoringPromptPreview,
          effectiveGoalText,
          effectiveContextText,
          effectiveAvoidText,
          opportunityScanError,
          setOpportunityScanError,
          aiActivity,
          aiScoresStale,
          rerankNow,
          opportunityScanLoading,
          loading,
          dataLength: data.length,
        })
      );
    }
    const AppWithAuth = authModule.createAppWithAuth
      ? authModule.createAppWithAuth({ App, h, useState, useEffect })
      : App;
    const root = createRoot(document.getElementById('root'));
    root.render(h(AppWithAuth));
})();
