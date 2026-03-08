(function initAppUtils(globalScope) {
  const h = React.createElement;
    function formatTimeUntil(timestamp) {
      if (!timestamp) return '';
      const diff = Math.max(0, Number(timestamp) - Date.now());
      if (diff < 60 * 1000) return 'in <1 min';
      const minutes = Math.round(diff / 60000);
      if (minutes < 60) return `in ${minutes}m`;
      const hours = Math.floor(minutes / 60);
      return `in ${hours}h ${minutes % 60}m`;
    }

    function normalizeSubredditName(value) {
      if (typeof value !== 'string') return '';
      return value.trim().replace(/^r\//i, '').trim();
    }

    function timeAgo(utcSeconds) {
      const now = Date.now() / 1000;
      const diff = Math.max(1, Math.floor(now - (utcSeconds || 0)));
      const units = [
        [31536000, 'y'], [2592000, 'mo'], [604800, 'w'],
        [86400, 'd'], [3600, 'h'], [60, 'm'], [1, 's'],
      ];
      for (const [seconds, name] of units) {
        if (diff >= seconds) return `${Math.floor(diff / seconds)}${name}`;
      }
      return 'now';
    }

    function formatSubs(value) {
      if (!value && value !== 0) return '';
      if (value < 1000) return String(value);
      const units = ['k', 'M', 'B'];
      let unitIndex = -1;
      let val = value;
      while (val >= 1000 && unitIndex < units.length - 1) {
        val /= 1000;
        unitIndex += 1;
      }
      return `${val.toFixed(val >= 10 ? 0 : 1)}${units[unitIndex]}`;
    }

    function formatNumber(value) {
      const num = Number(value);
      if (!Number.isFinite(num)) return '';
      return num.toLocaleString('en-US');
    }

    function truncateText(text, maxLen = 120) {
      const value = String(text || '').trim();
      if (!value) return '';
      if (value.length <= maxLen) return value;
      return `${value.slice(0, Math.max(0, maxLen - 1))}…`;
    }

    function formatModelDate(timestamp) {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      if (Number.isNaN(date.getTime())) return '';
      const now = new Date();
      const sameYear = date.getFullYear() === now.getFullYear();
      const options = sameYear
        ? { month: 'short', day: 'numeric' }
        : { month: 'short', day: 'numeric', year: 'numeric' };
      return date.toLocaleDateString('en-US', options);
    }

    function getModelTimestamp(model) {
      const raw = model?.updated || model?.updated_at || model?.updatedAt || model?.last_updated || model?.last_updated_at ||
        model?.created || model?.created_at || model?.createdAt;
      if (!raw) return 0;
      if (typeof raw === 'number') {
        return raw > 1e12 ? raw : raw * 1000;
      }
      const parsed = Date.parse(raw);
      return Number.isNaN(parsed) ? 0 : parsed;
    }

    function hashGoals(str) {
      let hash = 0;
      const input = String(str || '');
      for (let i = 0; i < input.length; i++) {
        hash = ((hash << 5) - hash) + input.charCodeAt(i);
        hash = hash & hash;
      }
      return hash.toString(36);
    }

    function getPostAgeHours(post, nowSeconds = Date.now() / 1000) {
      const createdUtc = Number(post?.created_utc);
      const base = Number.isFinite(createdUtc) ? createdUtc : nowSeconds;
      const ageSeconds = Math.max(60, nowSeconds - base);
      return Math.max(0.25, ageSeconds / 3600);
    }

    function buildRelevanceDebug({ postId, heuristicDetails, postMap, llmReason, llmConfidence, source }) {
      const post = postMap?.get(postId);
      const details = heuristicDetails || {};
      const matched = []
        .concat(details.matchedTitle || [])
        .concat(details.matchedSelftext || [])
        .concat(details.matchedSubreddit || []);
      const uniqueMatched = Array.from(new Set(matched)).slice(0, 12);
      const nowSeconds = Date.now() / 1000;
      const ageHours = post ? getPostAgeHours(post, nowSeconds) : null;
      const upvotesPerHour = post ? (Number(post.score) || 0) / (ageHours || 1) : null;
      const commentsPerHour = post ? (Number(post.num_comments) || 0) / (ageHours || 1) : null;
      const whyParts = [];
      if (llmReason) whyParts.push(llmReason);
      if (!llmReason && uniqueMatched.length > 0) whyParts.push(`Matched: ${uniqueMatched.slice(0, 5).join(', ')}`);
      if (Number.isFinite(upvotesPerHour) && upvotesPerHour > 2) whyParts.push(`Velocity: ${formatVelocity(upvotesPerHour)}/h`);
      if (Number.isFinite(commentsPerHour) && commentsPerHour > 0.5) whyParts.push(`Comments: ${formatVelocity(commentsPerHour)}/h`);
      const why = truncateText(whyParts.join(' • '), 140);

      return {
        source: source || 'unknown',
        why,
        llm: llmReason || null,
        llmConfidence: llmConfidence || null,
        matchedKeywords: uniqueMatched,
        matchedTitle: details.matchedTitle || [],
        matchedSelftext: details.matchedSelftext || [],
        matchedSubreddit: details.matchedSubreddit || [],
        keywordScore: details.keywordScore ?? null,
        engagementScore: details.engagementScore ?? null,
        domainBonus: details.domainBonus ?? null,
        ageHours,
        upvotesPerHour,
        commentsPerHour,
      };
    }

    function suggestPreset({ subs = [], posts = [], presets = [] }) {
      if (!Array.isArray(presets) || presets.length === 0) return null;
      const subsLower = (Array.isArray(subs) ? subs : []).map(s => String(s || '').toLowerCase());
      const topPosts = Array.isArray(posts) ? posts.slice(0, 200) : [];
      const postTexts = topPosts.map(p => `${p.title || ''} ${p.selftext || ''}`.toLowerCase());

      let best = null;
      let bestScore = 0;
      presets.forEach(preset => {
        let score = 0;
        const kw = Array.isArray(preset.keywords) ? preset.keywords : [];
        const sr = Array.isArray(preset.subreddits) ? preset.subreddits : [];
        kw.forEach(keyword => {
          const needle = String(keyword || '').toLowerCase();
          if (!needle) return;
          postTexts.forEach(text => {
            if (text.includes(needle)) score += 1;
          });
        });
        sr.forEach(sub => {
          const needle = String(sub || '').toLowerCase();
          if (!needle) return;
          if (subsLower.includes(needle)) score += 3;
        });
        if (!best || score > bestScore) {
          best = preset;
          bestScore = score;
        }
      });
      if (!best) return null;
      if (bestScore < 4) return null;
      return best;
    }
    // Calibration removed: show raw model scores for transparency.

    function percentileValue(sortedValues, percentile) {
      if (!Array.isArray(sortedValues) || sortedValues.length === 0) return 0;
      const clamped = Math.min(1, Math.max(0, percentile));
      const index = Math.floor((sortedValues.length - 1) * clamped);
      return sortedValues[Math.max(0, Math.min(sortedValues.length - 1, index))];
    }

    function formatVelocity(value) {
      const num = Number(value);
      if (!Number.isFinite(num) || num <= 0) return '0';
      if (num >= 100) return String(Math.round(num));
      if (num >= 10) return num.toFixed(1);
      return num.toFixed(2);
    }

    function buildScoringPromptPreview(config = {}) {
      const goals = config.goals || '';
      const context = config.context || '';
      const avoid = config.avoid || '';
      const examples = config.examples || {};
      const goalLine = (goals || '').trim() || '[Add your goals above]';
      const contextLine = (context || '').trim() || 'none provided';
      const avoidLine = (avoid || '').trim() || 'none provided';
      return [
        'You are a Reddit post evaluator. Follow the rubric strictly.',
        '',
        `USER GOAL: ${goalLine}`,
        `ADDITIONAL CONTEXT: ${contextLine}`,
        `AVOID: ${avoidLine}`,
        '',
        'Scoring rubric (0-5):',
        '5 = Perfect Match (high intent + actionable)',
        '4 = Strong Match',
        '3 = Maybe',
        '2 = Weak',
        '1 = Mostly irrelevant',
        '0 = Reject',
        '',
        examples.perfect ? `Example 5: ${examples.perfect}` : 'Example 5: [optional]',
        examples.strong ? `Example 4: ${examples.strong}` : 'Example 4: [optional]',
        examples.reject ? `Example 0-1: ${examples.reject}` : 'Example 0-1: [optional]',
        '',
        'Return only JSON: [{"postId":"...","score":4,"confidence":"high","reason":"..."}]',
      ].join('\n');
    }

    function aiScoreLabel(score) {
      const n = Number(score);
      if (!Number.isFinite(n)) return 'Unscored';
      if (n >= 5) return '🔥 Perfect Match';
      if (n >= 4) return '🎯 Strong Lead';
      if (n >= 3) return '⚡ Maybe';
      if (n >= 2) return '😐 Weak';
      if (n >= 1) return '❌ Noise';
      return '🚫 Reject';
    }

    function buildWhyLine({ post, relevanceMeta, upvotesPerHour, commentsPerHour }) {
      if (relevanceMeta && relevanceMeta.reason) {
        return `Why: ${relevanceMeta.reason}`;
      }
      const age = timeAgo(post.created_utc);
      const score = Number(post.score) || 0;
      const comments = Number(post.num_comments) || 0;
      const velocityBits = [];
      if (Number.isFinite(upvotesPerHour) && upvotesPerHour > 0) {
        velocityBits.push(`⚡ ${formatVelocity(upvotesPerHour)}/h`);
      }
      if (Number.isFinite(commentsPerHour) && commentsPerHour > 0) {
        velocityBits.push(`💬 ${formatVelocity(commentsPerHour)}/h`);
      }
      const base = `Fresh ${age} • ${score}▲ • ${comments}💬`;
      return velocityBits.length ? `${base} • ${velocityBits.join(' • ')}` : base;
    }

    function isFreePricing(pricing) {
      const prompt = Number(pricing?.prompt);
      const completion = Number(pricing?.completion);
      return Number.isFinite(prompt) && Number.isFinite(completion) && prompt === 0 && completion === 0;
    }

    function inferModelSpeed(modelId) {
      const id = String(modelId || '').toLowerCase();
      if (id.includes('flash') || id.includes('mini') || id.includes('lite') || id.includes('small')) return 'fast';
      if (id.includes('70b') || id.includes('72b') || id.includes('120b') || id.includes('405b') || id.includes('r1')) return 'slow';
      return 'balanced';
    }

    function formatCostHint(pricing) {
      if (!pricing) return 'pricing n/a';
      const prompt = Number(pricing.prompt);
      const completion = Number(pricing.completion);
      if (Number.isFinite(prompt) && Number.isFinite(completion) && prompt === 0 && completion === 0) return 'free';
      const parts = [];
      if (Number.isFinite(prompt)) parts.push(`$${(prompt * 1e6).toFixed(2)}/M in`);
      if (Number.isFinite(completion)) parts.push(`$${(completion * 1e6).toFixed(2)}/M out`);
      return parts.length ? parts.join(' • ') : 'pricing n/a';
    }

    function parseNumberFilter(value) {
      if (value === null || value === undefined || value === '') return null;
      const num = Number(value);
      return Number.isFinite(num) ? num : null;
    }

    function renderBody(post) {
      if (post.selftext_html) {
        const decoded = post.selftext_html
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
        const sanitized = DOMPurify.sanitize(decoded);
        return h('div', {
          className: 'post-body prose prose-sm prose-zinc dark:prose-invert max-w-none',
          dangerouslySetInnerHTML: { __html: sanitized },
        });
      }
      if (post.selftext) {
        return h('div', { className: 'post-body whitespace-pre-wrap text-zinc-700 dark:text-zinc-300 text-sm' }, post.selftext);
      }
      return h('div', { className: 'text-sm text-zinc-400 dark:text-zinc-500 italic' }, 'Link post — no text content');
    }
  globalScope.RDDAppUtils = {
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
  };
})(typeof window !== "undefined" ? window : globalThis);
