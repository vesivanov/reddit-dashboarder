(function initDashboardWorkspaceModule(globalScope) {
  function makeSyncToken() {
    try {
      return `sync_${crypto.randomUUID()}`;
    } catch {
      return `sync_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }
  }

  function getWorkspaceId({ snapshotInfo, syncToken }) {
    if (!snapshotInfo || snapshotInfo.syncToken !== syncToken) {
      return null;
    }
    return snapshotInfo.workspaceId || null;
  }

  function getConfigIdentity({ snapshotInfo, syncToken }) {
    return getWorkspaceId({ snapshotInfo, syncToken }) || syncToken;
  }

  function normalizeConfigPayload(payload) {
    if (payload?.data?.config) {
      return {
        ...payload,
        config: payload.data.config,
      };
    }
    return payload;
  }

  async function ensureWorkspace({ snapshotInfo, syncToken }) {
    const existingWorkspaceId = getWorkspaceId({ snapshotInfo, syncToken });
    if (existingWorkspaceId) {
      return {
        ok: true,
        status: 200,
        workspaceId: existingWorkspaceId,
        payload: { success: true, workspaceId: existingWorkspaceId, token: syncToken },
      };
    }

    const response = await fetch('/api/workspaces', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: syncToken }),
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {}

    return {
      ok: response.ok,
      status: response.status,
      workspaceId: payload?.workspaceId || null,
      payload,
    };
  }

  async function loadOpportunityConfig({ snapshotInfo, syncToken }) {
    const workspaceResult = await ensureWorkspace({ snapshotInfo, syncToken });
    if (!workspaceResult.ok || !workspaceResult.workspaceId) {
      return {
        ok: workspaceResult.ok,
        status: workspaceResult.status,
        workspaceId: workspaceResult.workspaceId || null,
        payload: workspaceResult.payload,
      };
    }

    const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceResult.workspaceId)}/config`, {
      credentials: 'include',
      cache: 'no-store',
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {}

    return {
      ok: response.ok,
      status: response.status,
      workspaceId: workspaceResult.workspaceId,
      payload: normalizeConfigPayload(payload),
    };
  }

  function getPayloadSizeBytes(payload) {
    return new TextEncoder().encode(JSON.stringify(payload)).length;
  }

  function normalizeEnum(value, allowed, fallback) {
    const normalized = String(value || '').trim().toLowerCase();
    return allowed.includes(normalized) ? normalized : fallback;
  }

  function sanitizeModelId(value) {
    const normalized = String(value || '').trim().slice(0, 100);
    return /^[a-zA-Z0-9_.:\-\/]+$/.test(normalized) ? normalized : '';
  }

  function buildSyncSettings({
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
  }) {
    return {
      subreddits: subs.map(normalizeSubredditName).filter(Boolean).slice(0, 50),
      opportunityBrief: opportunityBrief.trim().slice(0, 500),
      opportunityContext: opportunityContext.trim().slice(0, 600),
      aiAvoid: aiAvoid.trim().slice(0, 800),
      aiPrompt: opportunityBrief.trim().slice(0, 500),
      aiThreshold: Math.max(0, Math.min(5, Math.round(Number(priorityNotificationThreshold) || 4))),
      openRouterModel: sanitizeModelId(openRouterModel),
      scoringConfig: {
        lookingFor: (effectiveGoalText.trim() || opportunityBrief.trim()).slice(0, 1200),
        avoid: effectiveAvoidText.trim().slice(0, 800) || undefined,
        examples: {
          perfect: aiExamplePerfect.trim().slice(0, 1200) || undefined,
          strong: aiExampleStrong.trim().slice(0, 1200) || undefined,
          reject: aiExampleReject.trim().slice(0, 1200) || undefined,
        },
      },
      opportunityConfig: {
        businessOffering: businessOffering.trim().slice(0, 300),
        idealCustomer: idealCustomer.trim().slice(0, 300),
        problemsSolved: problemsSolved.trim().slice(0, 600),
        preferredEngagement: normalizeEnum(preferredEngagement, ['reply', 'dm', 'either', 'research'], 'reply'),
        strategyPreset: normalizeEnum(strategyPreset, ['balanced', 'sales', 'fast_wins', 'research'], 'balanced'),
        opportunityTypes: normalizedOpportunityFocus.slice(0, 8),
        strictness: normalizeEnum(opportunityStrictness, ['strict', 'balanced', 'broad'], 'balanced'),
      },
    };
  }

  function buildSyncFilters({
    parseNumberFilter,
    minUpvoteFilter,
    minCommentFilter,
    minPriorityFilter,
    keyword,
  }) {
    return {
      minScore: parseNumberFilter(minUpvoteFilter) ?? undefined,
      minComments: parseNumberFilter(minCommentFilter) ?? undefined,
      minPriority: parseNumberFilter(minPriorityFilter) ?? undefined,
      keyword: keyword.trim() || undefined,
    };
  }

  function buildSyncPosts({
    groups,
    postOpportunities,
    postScoreMetadata,
    postScoreProxies,
  }) {
    const MAX_SYNC_POSTS = 160;
    const MAX_SYNC_TEXT_LENGTH = 280;
    const allPosts = groups.flatMap(group => group.posts || []);
    const ranked = [...allPosts].sort((a, b) => {
      const aPriority = Number(postOpportunities.get(String(a.id))?.scores?.priority ?? a.aiPriority ?? -1);
      const bPriority = Number(postOpportunities.get(String(b.id))?.scores?.priority ?? b.aiPriority ?? -1);
      if (bPriority !== aPriority) return bPriority - aPriority;
      const aComments = Number(a.num_comments) || 0;
      const bComments = Number(b.num_comments) || 0;
      if (bComments !== aComments) return bComments - aComments;
      return (Number(b.score) || 0) - (Number(a.score) || 0);
    });

    return ranked.slice(0, MAX_SYNC_POSTS).map(post => {
      const postId = String(post.id);
      const opportunity = postOpportunities.get(postId) || null;
      const metadata = postScoreMetadata.get(postId) || post.aiMetadata || null;
      return {
        id: post.id,
        subreddit: String(post.subreddit || '').slice(0, 80),
        title: String(post.title || '').slice(0, 240),
        selftext: String(post.selftext || '').slice(0, MAX_SYNC_TEXT_LENGTH),
        author: String(post.author || '').slice(0, 80),
        reddit_url: post.reddit_url,
        external_url: post.external_url,
        domain: String(post.domain || '').slice(0, 120),
        score: Number(post.score) || 0,
        num_comments: Number(post.num_comments) || 0,
        created_utc: post.created_utc,
        link_flair_text: String(post.link_flair_text || '').slice(0, 80),
        aiRelevance: postScoreProxies.get(postId) ?? post.aiRelevance ?? null,
        aiMetadata: metadata ? {
          source: metadata.source || null,
          confidence: metadata.confidence || null,
          reason: String(metadata.reason || '').slice(0, 160) || null,
        } : null,
        aiOpportunity: opportunity ? {
          classification: opportunity.classification ? {
            type: opportunity.classification.type || null,
            label: opportunity.classification.label || null,
          } : null,
          scores: opportunity.scores ? {
            overall: opportunity.scores.overall ?? null,
            priority: opportunity.scores.priority ?? null,
          } : null,
          action: opportunity.action ? {
            recommended: opportunity.action.recommended || null,
            label: opportunity.action.label || null,
          } : null,
          explanation: opportunity.explanation ? {
            summary: String(opportunity.explanation.summary || '').slice(0, 180),
          } : null,
        } : null,
        aiPriority: opportunity?.scores?.priority ?? post.aiPriority ?? null,
      };
    });
  }

  async function syncDashboardSnapshot({ snapshotInfo, syncToken, posts, settings, filters, source = null }) {
    const workspaceResult = await ensureWorkspace({ snapshotInfo, syncToken });
    if (!workspaceResult.ok || !workspaceResult.workspaceId) {
      return {
        ok: workspaceResult.ok,
        status: workspaceResult.status,
        payload: null,
        body: workspaceResult.payload,
      };
    }

    const workspaceId = workspaceResult.workspaceId;
    const payload = {
      token: syncToken,
      settings,
      filters,
      timestamp: new Date().toISOString(),
      ...(Array.isArray(posts) ? { posts } : {}),
      ...(source ? { source } : {}),
    };

    const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/snapshot`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    let responseBody = null;
    try {
      responseBody = await response.json();
    } catch {}

    return {
      ok: response.ok,
      status: response.status,
      payload,
      body: responseBody,
    };
  }

  async function syncOpportunityConfig({
    snapshotInfo,
    syncToken,
    subreddits,
    goals,
    aiContext,
    aiPrompt,
    opportunityConfig,
    scoringConfig,
    threshold,
    model,
  }) {
    const workspaceResult = await ensureWorkspace({ snapshotInfo, syncToken });
    if (!workspaceResult.ok || !workspaceResult.workspaceId) {
      return {
        ok: workspaceResult.ok,
        status: workspaceResult.status,
        payload: workspaceResult.payload,
      };
    }

    const workspaceId = workspaceResult.workspaceId;
    const response = await fetch(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/config`,
      {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId,
        token: syncToken,
        subreddits,
        goals,
        aiContext,
        aiPrompt,
        opportunityConfig,
        scoringConfig,
        threshold,
        model,
      }),
      }
    );

    let payload = null;
    try {
      payload = await response.json();
    } catch {}

    return {
      ok: response.ok,
      status: response.status,
      payload: normalizeConfigPayload(payload),
    };
  }

  globalScope.RDDWorkspaceClient = {
    makeSyncToken,
    getWorkspaceId,
    getConfigIdentity,
    ensureWorkspace,
    loadOpportunityConfig,
    getPayloadSizeBytes,
    buildSyncSettings,
    buildSyncFilters,
    buildSyncPosts,
    syncDashboardSnapshot,
    syncOpportunityConfig,
  };
})(typeof window !== 'undefined' ? window : globalThis);
