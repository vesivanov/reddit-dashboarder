(function initDashboardPostModule(globalScope) {
  function formatOpportunityLabel(value) {
    if (!value) return null;
    return String(value).replace(/_/g, ' ');
  }

  function formatSignalLabel(key) {
    return String(key || '')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/_/g, ' ')
      .replace(/^./, (char) => char.toUpperCase());
  }

  function getPriorityScore({ postId, getOpportunityForPost, postScoreProxies }) {
    const opportunity = getOpportunityForPost(postId);
    if (opportunity?.scores?.priority !== undefined && opportunity?.scores?.priority !== null) {
      return Number(opportunity.scores.priority) || 0;
    }
    const relevance = postScoreProxies.get(String(postId));
    if (relevance !== undefined && relevance !== null) return (Number(relevance) || 0) / 5;
    return null;
  }

  function getOpportunitySignalSummary(opportunity) {
    const signalEntries = Object.entries(opportunity?.signals || {})
      .filter(([_, value]) => Number.isFinite(Number(value)))
      .sort((a, b) => Number(b[1]) - Number(a[1]));
    if (!signalEntries.length) return '';
    return signalEntries
      .slice(0, 4)
      .map(([key, value]) => `${formatSignalLabel(key)} ${Math.round(Number(value) * 100)}`)
      .join(' • ');
  }

  function buildSelectedPostWhyItems({
    selectedPost,
    meta,
    opportunity,
    velocity,
    formatVelocity,
    buildWhyLine,
  }) {
    if (!selectedPost) return [];
    const items = [];
    if (opportunity?.classification?.type) items.push({ label: 'Opportunity', value: formatOpportunityLabel(opportunity.classification.type) });
    if (opportunity?.action?.recommended) items.push({ label: 'Action', value: formatOpportunityLabel(opportunity.action.recommended) });
    if (opportunity?.explanation?.summary) items.push({ label: 'Summary', value: opportunity.explanation.summary });
    if (Array.isArray(opportunity?.explanation?.bullets) && opportunity.explanation.bullets.length > 0) {
      items.push({ label: 'Why now', value: opportunity.explanation.bullets.join(' • ') });
    }
    if (opportunity?.scores) {
      const scoreBits = [
        Number.isFinite(Number(opportunity.scores.priority)) ? `Priority ${Math.round(Number(opportunity.scores.priority) * 100)}` : null,
        Number.isFinite(Number(opportunity.scores.clientConversionLikelihood)) ? `Conversion ${Math.round(Number(opportunity.scores.clientConversionLikelihood) * 100)}` : null,
        Number.isFinite(Number(opportunity.scores.replyLikelihood)) ? `Reply ${Math.round(Number(opportunity.scores.replyLikelihood) * 100)}` : null,
      ].filter(Boolean);
      if (scoreBits.length) items.push({ label: 'Scores', value: scoreBits.join(' · ') });
    }
    const signalSummary = getOpportunitySignalSummary(opportunity);
    if (signalSummary) items.push({ label: 'Signals', value: signalSummary });
    if (meta?.reason) items.push({ label: 'AI note', value: meta.reason });
    if (velocity) {
      items.push({
        label: 'Momentum',
        value: `${formatVelocity(velocity.upvotesPerHour)}/h upvotes · ${formatVelocity(velocity.commentsPerHour)}/h comments`,
        upvotesPerHour: velocity.upvotesPerHour,
        commentsPerHour: velocity.commentsPerHour,
        upvotesLabel: `${formatVelocity(velocity.upvotesPerHour)}/h`,
        commentsLabel: `${formatVelocity(velocity.commentsPerHour)}/h`,
      });
    }
    if (!items.length) {
      items.push({
        label: 'Signal',
        value: buildWhyLine({ post: selectedPost, relevanceMeta: meta, upvotesPerHour: velocity?.upvotesPerHour, commentsPerHour: velocity?.commentsPerHour }),
      });
    }
    return items;
  }

  function buildSelectedPostNextAction({ selectedPost, opportunity, score }) {
    if (!selectedPost) return '';
    const recommended = opportunity?.action?.recommended || '';
    if (recommended === 'reply_now') return 'Reply now while the thread is still active.';
    if (recommended === 'dm_if_possible') return 'Consider direct outreach if the thread context allows it.';
    if (recommended === 'save_for_followup') return 'Save for follow-up — revisit when you can engage well.';
    if (recommended === 'research') return 'Use this as market research or messaging input.';
    if (recommended === 'ignore') return 'Ignore unless the thread evolves.';
    if (score >= 4) return 'High-priority thread. Open it now and decide whether to reply, DM, or save it.';
    if (score >= 3) return 'Worth a quick review. Check the thread for clear intent or follow-up context.';
    return 'Lower-confidence match. Keep in view only if the discussion fits your goals.';
  }

  function renderPostList({
    h,
    visiblePosts,
    postPageLimit,
    selectedPostId,
    postScoreProxies,
    postScoreMetadata,
    velocityMeta,
    getOpportunityForPost,
    getPriorityScore,
    getOpportunityTypeLabel,
    getRecommendedActionLabel,
    handlePostHoverStart,
    handlePostHoverEnd,
    onSelectPost,
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
    openedPostIds,
  }) {
    const hasAiData = postScoreProxies.size > 0;

    return h('ul', { role: 'list', className: 'list-none' },
      visiblePosts.slice(0, postPageLimit).map((post) => {
        const isSelected = selectedPostId === post.id;
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

        // ── Post age for temporal amber ────────────────────────────────
        const postAgeMinutes = (Date.now() / 1000 - post.created_utc) / 60;
        const isVeryRecent = postAgeMinutes < 15;
        const timeClass = isVeryRecent || isSpiking
          ? 'text-amber-500 dark:text-amber-400'
          : 'text-zinc-400 dark:text-zinc-600';

        // ── Tier ──────────────────────────────────────────────────────
        let cardTier = 'standard';
        if (hasAiData) {
          if (isVeryHighRelevant) cardTier = 'hero';
          else if (isHighlyRelevant) cardTier = 'feature';
          else if (hasPriority ? priorityScore >= 0.3 : (relevanceScore !== undefined && relevanceScore !== null && relevanceScore >= 3)) cardTier = 'standard';
          else cardTier = 'suppressed';
        }

        // Rationale: prefer AI summary, fall back to why-line
        const rationale = opportunity?.explanation?.summary
          || buildWhyLine({ post, relevanceMeta, upvotesPerHour, commentsPerHour });

        // ── Score badge ───────────────────────────────────────────────
        const scoreDisplay = priorityScore !== null
          ? `P${Math.round(priorityScore * 100)}`
          : (relevanceScore !== undefined && relevanceScore !== null
              ? `${aiScoresStale ? '~' : ''}${relevanceScore}/5`
              : null);

        const scoreColorClass = cardTier === 'hero'
          ? 'text-amber-400 dark:text-amber-400'
          : cardTier === 'feature'
            ? 'text-amber-500/80 dark:text-amber-400/70'
            : 'text-amber-500/55 dark:text-amber-400/45';

        // ── Tier ambient background ────────────────────────────────────
        const tierBg = cardTier === 'hero'
          ? 'dark:bg-amber-400/[0.04]'
          : cardTier === 'feature'
            ? 'dark:bg-white/[0.015]'
            : '';

        // ── Left border accent ─────────────────────────────────────────
        const borderAccent = cardTier === 'hero'
          ? 'border-l-2 border-amber-400/80'
          : cardTier === 'feature'
            ? 'border-l-2 border-amber-400/25'
            : 'border-l-2 border-transparent';

        // ── Selection / hover bg ───────────────────────────────────────
        const selectedBg = isSelected
          ? 'bg-zinc-100 dark:bg-white/[0.05]'
          : 'hover:bg-zinc-50 dark:hover:bg-white/[0.025]';

        // ── Read tracking: title class ─────────────────────────────────
        const isRead = openedPostIds && openedPostIds.has(post.id);
        const titleClass = isSelected
          ? 'text-[13px] leading-snug line-clamp-2 text-zinc-800 dark:text-zinc-200'
          : isRead
            ? 'text-[13px] leading-snug line-clamp-2 text-zinc-500 dark:text-zinc-500'
            : cardTier === 'suppressed'
              ? 'text-[13px] leading-snug line-clamp-2 text-zinc-500 dark:text-zinc-500'
              : 'text-[13px] leading-snug line-clamp-2 text-zinc-700 dark:text-zinc-300';

        return h('li', {
          key: post.id,
          className: `group relative border-b border-zinc-100 dark:border-white/[0.035] last:border-0 transition-colors ${borderAccent} ${selectedBg} ${tierBg}`,
          onMouseEnter: () => handlePostHoverStart(post),
          onMouseLeave: handlePostHoverEnd,
        },
          h('button', {
            onClick: () => onSelectPost(post),
            className: 'w-full text-left px-3 py-2 pr-8',
          },
            h('div', { className: 'flex gap-2 items-start' },

              // ── Left: score column ───────────────────────────────────
              scoreDisplay
                ? h('div', { className: 'shrink-0 flex flex-col items-center pt-0.5 w-8' },
                    h('span', { className: `font-mono text-[11px] font-bold leading-none ${scoreColorClass}` }, scoreDisplay),
                    cardTier === 'hero' && h('div', { className: 'w-3 h-px bg-amber-400/50 rounded-full mt-1.5' })
                  )
                : null,

              // ── Right: content ───────────────────────────────────────
              h('div', { className: 'flex-1 min-w-0' },

                // Row 1: meta
                h('div', { className: 'flex items-center gap-1 mb-1 min-w-0' },
                  h('div', { className: 'flex items-center gap-1 min-w-0 flex-1 overflow-hidden' },
                    h('span', { className: 'text-[10px] font-medium text-zinc-500 dark:text-zinc-500 shrink-0' }, `r/${post.subreddit}`),
                    opportunityType && h('span', { className: 'text-[10px] text-zinc-300 dark:text-zinc-700' }, '·'),
                    opportunityType && h('span', {
                      className: 'font-mono text-[9px] uppercase tracking-[0.1em] text-amber-500/80 dark:text-amber-500/70 shrink-0',
                    }, opportunityType.replace(/_/g, ' ')),
                    flair && h('span', {
                      className: 'px-1 rounded text-[9px] font-medium shrink-0',
                      style: { backgroundColor: flairBg, color: flairTextColor, opacity: 0.85 },
                    }, flair),
                    isSpiking && h('span', {
                      className: 'text-[9px] font-semibold text-rose-400 dark:text-rose-400/80 shrink-0',
                    }, '⚡spiking')
                  ),
                  // Right meta: time · upvotes · comments (score moved to left column)
                  h('div', { className: 'flex items-center gap-1.5 text-[10px] tabular-nums shrink-0 ml-2' },
                    h('span', { title: absoluteDate(post.created_utc), className: timeClass }, timeAgo(post.created_utc)),
                    h('span', { className: 'text-zinc-300 dark:text-zinc-700' }, '·'),
                    h('span', { className: 'inline-flex items-center gap-0.5 text-emerald-600/70 dark:text-emerald-500/60' },
                      renderGlyph('M7 14l5-5 5 5', 'w-2.5 h-2.5'), score),
                    h('span', { className: 'inline-flex items-center gap-0.5 text-zinc-400/70 dark:text-zinc-500/70' },
                      renderGlyph('M8 10h8M8 14h5m-9 7l2.5-2.5H19a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v11a2 2 0 002 2h1.5L4 21z', 'w-2.5 h-2.5'), comments)
                  )
                ),

                // Row 2: title
                h('p', { className: titleClass }, post.title),

                // Row 3: rationale + author
                h('div', { className: 'flex items-center gap-2 mt-0.5' },
                  rationale && showAiReasons && h('p', {
                    className: 'flex-1 text-[10px] text-zinc-400 dark:text-zinc-600 line-clamp-1 leading-relaxed',
                  }, rationale),
                  h('span', { className: 'text-[10px] text-zinc-400/60 dark:text-zinc-700 shrink-0 truncate max-w-[80px]' },
                    `u/${post.author}`)
                )
              )
            )
          ),

          // ── Context menu ──────────────────────────────────────────────
          h('div', { className: 'absolute top-2 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity' },
            h('button', {
              onClick: (e) => { e.stopPropagation(); setActivePostMenu(activePostMenu === post.id ? null : post.id); },
              className: 'p-0.5 rounded text-zinc-400/50 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors',
            },
              h('svg', { className: 'w-3 h-3', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z' })
              )
            ),
            activePostMenu === post.id && h('div', {
              className: 'absolute right-0 mt-1 w-36 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700 py-1 z-20 animate-fadeIn',
              onClick: (e) => e.stopPropagation(),
            },
              h('button', { onClick: () => { window.open(post.reddit_url || post.external_url, '_blank'); setActivePostMenu(null); }, className: 'w-full px-3 py-1.5 text-left text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 flex items-center gap-2' },
                renderGlyph('M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14', 'w-3.5 h-3.5'), 'Open in Reddit'),
              h('button', { onClick: () => handleCopyLink(post), className: 'w-full px-3 py-1.5 text-left text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 flex items-center gap-2' },
                renderGlyph('M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3', 'w-3.5 h-3.5'), 'Copy link'),
              h('button', { onClick: () => handleHidePost(post.id), className: 'w-full px-3 py-1.5 text-left text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 flex items-center gap-2' },
                renderGlyph('M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21', 'w-3.5 h-3.5'), 'Hide post')
            )
          )
        );
      }),
      visiblePosts.length > postPageLimit && h('li', { className: 'flex items-center justify-center py-4 border-t border-zinc-100 dark:border-white/[0.035]' },
        h('button', {
          onClick: () => setPostPageLimit((prev) => prev + 150),
          className: 'px-4 py-1.5 rounded text-[11px] text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors',
        }, `Load ${Math.min(150, visiblePosts.length - postPageLimit)} more  ·  showing ${postPageLimit} of ${visiblePosts.length}`)
      )
    );
  }

  function renderPostDetailPane({
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
  }) {
    if (detailCollapsed) return null;

    return h('aside', { className: `w-80 bg-white dark:bg-zinc-800 flex-col shrink-0 border-l border-zinc-100 dark:border-white/[0.05] ${mobileView === 'detail' ? 'flex' : 'hidden lg:flex'}` },

      // Header
      h('div', { className: 'px-4 py-2 border-b border-zinc-100 dark:border-white/[0.05] flex items-center justify-between shrink-0' },
        h('button', {
          onClick: () => setMobileView('posts'),
          'aria-label': 'Back to posts',
          className: 'lg:hidden p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-400 transition-colors',
        }, h('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
          h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M15 19l-7-7 7-7' })
        )),
        // Typography #6: BRIEF label → font-display
        h('span', { className: 'font-display text-[9px] uppercase tracking-[0.2em] text-zinc-300 dark:text-zinc-600 hidden lg:block' }, 'Brief'),
        h('button', {
          onClick: () => setDetailCollapsed(true),
          'aria-label': 'Collapse',
          className: 'hidden lg:block p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-300 dark:text-zinc-600 hover:text-zinc-500 dark:hover:text-zinc-400 transition-colors',
          title: 'Collapse detail pane',
        }, h('svg', { className: 'w-3.5 h-3.5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
          h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M13 5l7 7-7 7M5 5l7 7-7 7' })
        ))
      ),

      // Content
      h('div', { className: 'flex-1 overflow-auto scrollbar-thin' },
        !selectedPost
          ? h('div', { className: 'flex items-center justify-center h-full' },
              h('p', { className: 'text-[11px] text-zinc-300 dark:text-zinc-600' }, 'Select a post to read more')
            )
          : (() => {
              const detailOpportunity = getOpportunityForPost(selectedPost.id);
              const detailType = detailOpportunity?.classification?.type;
              const detailRelevanceScore = postScoreProxies.get(String(selectedPost.id));
              const detailPriority = getPriorityScore(selectedPost.id);
              const hasBrief = detailOpportunity || detailPriority !== null || (detailRelevanceScore !== undefined && detailRelevanceScore !== null);

              return h('div', null,

                // ── Post header ───────────────────────────────────────────
                h('div', { className: 'px-4 pt-4 pb-3 border-b border-zinc-100 dark:border-white/[0.05]' },
                  h('div', { className: 'flex items-center gap-1.5 flex-wrap mb-2' },
                    h('span', { className: 'text-[10px] text-zinc-400 dark:text-zinc-500' }, `r/${selectedPost.subreddit}`),
                    detailType && h('span', { className: 'font-mono text-[9px] uppercase tracking-[0.1em] text-amber-500/70 dark:text-amber-400/60' }, formatOpportunityLabel(detailType)),
                    selectedPost.link_flair_text && h('span', {
                      className: 'px-1 rounded text-[9px] font-medium opacity-75',
                      style: {
                        backgroundColor: selectedPost.link_flair_background_color || '#e4e4e7',
                        color: selectedPost.link_flair_text_color === 'light' ? '#fff' : '#18181b',
                      },
                    }, selectedPost.link_flair_text),
                    h('span', { className: 'text-[10px] text-zinc-300 dark:text-zinc-600 ml-auto', title: absoluteDate(selectedPost.created_utc) }, timeAgo(selectedPost.created_utc))
                  ),
                  // Typography #3: title → font-display, larger
                  h('h2', { className: 'font-display text-[15px] font-semibold text-zinc-800 dark:text-zinc-100 leading-snug mb-2.5' }, selectedPost.title),
                  h('div', { className: 'flex items-center gap-2.5 text-[10px] text-zinc-400 dark:text-zinc-600 tabular-nums' },
                    detailPriority !== null && h('span', { className: 'font-mono font-bold text-amber-500/90 dark:text-amber-400/80' }, `P${Math.round(detailPriority * 100)}`),
                    detailPriority === null && detailRelevanceScore !== undefined && detailRelevanceScore !== null && h('span', { className: 'font-mono font-bold text-amber-500/90 dark:text-amber-400/80' }, `${aiScoresStale ? '~' : ''}${detailRelevanceScore}/5`),
                    h('span', { className: 'inline-flex items-center gap-0.5 text-emerald-600/70 dark:text-emerald-500/60' },
                      renderGlyph('M7 14l5-5 5 5', 'w-2.5 h-2.5'), selectedPost.score),
                    h('span', { className: 'inline-flex items-center gap-0.5' },
                      renderGlyph('M8 10h8M8 14h5m-9 7l2.5-2.5H19a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v11a2 2 0 002 2h1.5L4 21z', 'w-2.5 h-2.5'), selectedPost.num_comments),
                    h('span', null, `u/${selectedPost.author}`)
                  )
                ),

                // ── Actions ───────────────────────────────────────────────
                h('div', { className: 'px-4 py-2.5 border-b border-zinc-100 dark:border-white/[0.05] flex items-center gap-2 flex-wrap' },
                  h('a', {
                    href: selectedPost.reddit_url || selectedPost.external_url,
                    target: '_blank',
                    rel: 'noreferrer',
                    className: 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber-500/90 text-white text-[11px] font-semibold hover:bg-amber-500 transition-colors',
                  },
                    'Open Reddit',
                    h('svg', { className: 'w-3 h-3', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                      h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14' })
                    )
                  ),
                  h('button', {
                    onClick: () => handleCopyLink(selectedPost),
                    className: 'inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-zinc-200 dark:border-zinc-600/50 text-[11px] text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/[0.04] transition-colors',
                  }, renderGlyph('M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3', 'w-3 h-3'), 'Copy'),
                  h('button', {
                    onClick: () => handleHidePost(selectedPost.id),
                    className: 'inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-zinc-200 dark:border-zinc-600/50 text-[11px] text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/[0.04] transition-colors',
                  }, renderGlyph('M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21', 'w-3 h-3'), 'Hide')
                ),

                // ── Intelligence brief (redesigned) ──────────────────────
                hasBrief && selectedPostWhyItems.length > 0 && h('div', { className: 'border-b border-zinc-100 dark:border-white/[0.05]' },

                  // Next action callout
                  selectedPostNextAction && h('div', {
                    className: 'mx-4 mt-3 border-l-2 border-amber-500 dark:border-amber-400 bg-amber-50/60 dark:bg-amber-500/[0.06] px-3 py-2.5 rounded-r-lg',
                  },
                    h('p', { className: 'font-display text-[9px] uppercase tracking-[0.14em] text-amber-600/60 dark:text-amber-400/50 mb-1' }, 'Next action'),
                    h('p', { className: 'text-[11px] font-medium text-zinc-700 dark:text-zinc-200 leading-relaxed' }, selectedPostNextAction)
                  ),

                  // Why items
                  h('div', { className: 'px-4 pt-3 pb-4 space-y-3' },
                    selectedPostWhyItems.slice(0, 6).map((item) =>
                      h('div', { key: item.label },
                        // Typography #6: section labels → font-display
                        h('p', { className: 'font-display text-[9px] uppercase tracking-[0.14em] text-zinc-400/60 dark:text-zinc-600 mb-1' }, item.label),

                        item.label === 'Why now'
                          // Bulleted list instead of dot-joined string
                          ? h('div', { className: 'space-y-1' },
                              item.value.split(' • ').filter(Boolean).map((bullet, i) =>
                                h('div', { key: i, className: 'flex items-baseline gap-1.5' },
                                  h('span', { className: 'text-amber-400/50 dark:text-amber-500/40 shrink-0 text-[10px]' }, '·'),
                                  h('span', { className: 'text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed' }, bullet)
                                )
                              )
                            )

                          : item.label === 'Scores'
                          // Score chips
                          ? h('div', { className: 'flex flex-wrap gap-1' },
                              item.value.split(' · ').filter(Boolean).map((s, i) =>
                                h('span', { key: i, className: 'font-mono text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-white/[0.05] text-zinc-600 dark:text-zinc-400' }, s)
                              )
                            )

                          : item.label === 'Momentum'
                          // Visual momentum bars
                          ? h('div', { className: 'space-y-2' },
                              h('div', { className: 'flex items-center gap-2' },
                                h('span', { className: 'font-mono text-[10px] text-zinc-500 dark:text-zinc-400 w-14 shrink-0' }, item.upvotesLabel || '—'),
                                h('span', { className: 'font-display text-[9px] text-zinc-400/60 dark:text-zinc-600 shrink-0' }, 'upvotes'),
                                h('div', { className: 'flex-1 h-1 rounded-full bg-zinc-100 dark:bg-white/[0.06] overflow-hidden' },
                                  h('div', {
                                    className: 'h-full rounded-full bg-emerald-400/60 dark:bg-emerald-500/40',
                                    style: { width: `${Math.min(100, ((item.upvotesPerHour || 0) / 20) * 100)}%` },
                                  })
                                )
                              ),
                              h('div', { className: 'flex items-center gap-2' },
                                h('span', { className: 'font-mono text-[10px] text-zinc-500 dark:text-zinc-400 w-14 shrink-0' }, item.commentsLabel || '—'),
                                h('span', { className: 'font-display text-[9px] text-zinc-400/60 dark:text-zinc-600 shrink-0' }, 'comments'),
                                h('div', { className: 'flex-1 h-1 rounded-full bg-zinc-100 dark:bg-white/[0.06] overflow-hidden' },
                                  h('div', {
                                    className: 'h-full rounded-full bg-zinc-400/40 dark:bg-zinc-500/30',
                                    style: { width: `${Math.min(100, ((item.commentsPerHour || 0) / 5) * 100)}%` },
                                  })
                                )
                              )
                            )

                          : h('p', { className: 'text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed' }, item.value)
                      )
                    )
                  )
                ),

                // ── Post body ─────────────────────────────────────────────
                h('div', { className: 'px-4 py-3' },
                  h('div', { className: 'post-body text-zinc-500 dark:text-zinc-500' },
                    renderBody(selectedPost)
                  )
                )
              );
            })()
      )
    );
  }

  globalScope.RDDPostView = {
    formatSignalLabel,
    formatOpportunityLabel,
    getPriorityScore,
    getOpportunitySignalSummary,
    buildSelectedPostWhyItems,
    buildSelectedPostNextAction,
    renderPostList,
    renderPostDetailPane,
  };
})(typeof window !== 'undefined' ? window : globalThis);
