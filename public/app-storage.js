(function initDashboardStorageModule(globalScope) {
  const THEME_PREFERENCE_KEY = 'dashboard_theme_preference';

  function readString(key, fallback = '') {
    try {
      const value = localStorage.getItem(key);
      return value !== null ? value : fallback;
    } catch {
      return fallback;
    }
  }

  function readBooleanFlag(key, fallback = false) {
    try {
      const value = localStorage.getItem(key);
      if (value === null) return fallback;
      return value === '1';
    } catch {
      return fallback;
    }
  }

  function readNumber(key, fallback = 0) {
    try {
      const value = Number(localStorage.getItem(key));
      return Number.isFinite(value) ? value : fallback;
    } catch {
      return fallback;
    }
  }

  function readJSON(key, fallback = null, validate = null) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      if (typeof validate === 'function' && !validate(parsed)) {
        return fallback;
      }
      return parsed;
    } catch {
      return fallback;
    }
  }

  function writeString(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {}
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }

  function removeItem(key) {
    try {
      localStorage.removeItem(key);
    } catch {}
  }

  function loadSubs(defaultSubs = []) {
    const primary = readJSON('dashboard_subs', null, Array.isArray);
    if (primary) return primary;

    const backup = readJSON('dashboard_subs_backup', null, Array.isArray);
    if (backup) {
      writeJSON('dashboard_subs', backup);
      return backup;
    }

    return defaultSubs;
  }

  function persistSubs(subs) {
    writeJSON('dashboard_subs', subs);
    writeJSON('dashboard_subs_backup', subs);
  }

  function loadDashboardData() {
    return readJSON('dashboard_data', [], (parsed) =>
      Array.isArray(parsed) && parsed.every(item => item.subreddit && Array.isArray(item.posts))
    );
  }

  function loadHiddenPosts() {
    const parsed = readJSON('dashboard_hidden_posts', [], Array.isArray);
    return new Set(parsed);
  }

  function persistHiddenPosts(hiddenPosts, maxEntries = 1000) {
    const entries = Array.from(hiddenPosts).slice(-maxEntries);
    writeJSON('dashboard_hidden_posts', entries);
  }

  function loadThemePreference() {
    const savedPreference = readString(THEME_PREFERENCE_KEY, '');
    if (savedPreference === 'dark') return true;
    if (savedPreference === 'light') return false;
    return false;
  }

  function persistThemePreference(darkMode) {
    writeString(THEME_PREFERENCE_KEY, darkMode ? 'dark' : 'light');
    writeString('dashboard_dark_mode', darkMode ? '1' : '0');
    writeString('theme', darkMode ? 'dark' : 'light');
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  function loadSnapshotInfo() {
    return readJSON('dashboard_snapshot_info', null);
  }

  function persistSnapshotInfo(snapshotInfo) {
    if (snapshotInfo) {
      writeJSON('dashboard_snapshot_info', snapshotInfo);
      return;
    }
    removeItem('dashboard_snapshot_info');
  }

  function loadSyncToken(makeSyncToken) {
    return readString('dashboard_sync_token', '') || makeSyncToken();
  }

  globalScope.RDDAppStorage = {
    THEME_PREFERENCE_KEY,
    readString,
    readBooleanFlag,
    readNumber,
    readJSON,
    writeString,
    writeJSON,
    removeItem,
    loadSubs,
    persistSubs,
    loadDashboardData,
    loadHiddenPosts,
    persistHiddenPosts,
    loadThemePreference,
    persistThemePreference,
    loadSnapshotInfo,
    persistSnapshotInfo,
    loadSyncToken,
  };
})(typeof window !== 'undefined' ? window : globalThis);
