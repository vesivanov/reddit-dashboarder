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

        // Score badge
        const scoreDisplay = priorityScore !== null
          ? `P${Math.round(priorityScore * 100)}`
          : (relevanceScore !== undefined && relevanceScore !== null
              ? `${aiScoresStale ? '~' : ''}${relevanceScore}/5`
              : null);

        // Tier: expressed only via left border
        const borderAccent = cardTier === 'hero'
          ? 'border-l-2 border-amber-400/80'
          : cardTier === 'feature'
            ? 'border-l-2 border-amber-400/30'
            : 'border-l-2 border-transparent';

        const suppressedClass = cardTier === 'suppressed' && !isSelected ? 'opacity-40 hover:opacity-70' : '';
        const selectedBg = isSelected
          ? 'bg-zinc-100 dark:bg-white/[0.04]'
          : 'hover:bg-zinc-50 dark:hover:bg-white/[0.02]';

        return h('li', {
          key: post.id,
          className: `group relative border-b border-zinc-100 dark:border-white/[0.035] last:border-0 transition-colors ${borderAccent} ${selectedBg} ${suppressedClass}`,
          onMouseEnter: () => handlePostHoverStart(post),
          onMouseLeave: handlePostHoverEnd,
        },
          h('button', {
            onClick: () => onSelectPost(post),
            className: 'w-full text-left px-3.5 py-2 pr-8',
          },
            // ── Row 1: meta ─────────────────────────────────────────────
            h('div', { className: 'flex items-center gap-1 mb-1 min-w-0' },
              // Left meta: sub · type · flair · spiking
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
              // Right meta: time · score · comments · velocity · AI score
              h('div', { className: 'flex items-center gap-1.5 text-[10px] text-zinc-400 dark:text-zinc-600 tabular-nums shrink-0 ml-2' },
                h('span', { title: absoluteDate(post.created_utc), className: 'text-zinc-400 dark:text-zinc-600' }, timeAgo(post.created_utc)),
                h('span', { className: 'text-zinc-300 dark:text-zinc-700' }, '·'),
                h('span', { className: 'inline-flex items-center gap-0.5 text-emerald-600/70 dark:text-emerald-500/60' },
                  renderGlyph('M7 14l5-5 5 5', 'w-2.5 h-2.5'), score),
                h('span', { className: 'inline-flex items-center gap-0.5 text-zinc-400/70 dark:text-zinc-500/70' },
                  renderGlyph('M8 10h8M8 14h5m-9 7l2.5-2.5H19a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v11a2 2 0 002 2h1.5L4 21z', 'w-2.5 h-2.5'), comments),
                upvotesPerHour > 0 && h('span', { className: 'text-zinc-400/60 dark:text-zinc-600/60' },
                  `${formatVelocity(upvotesPerHour)}/h`),
                scoreDisplay && h('span', { className: 'font-mono font-semibold text-amber-500/80 dark:text-amber-400/70' }, scoreDisplay)
              )
            ),
            // ── Row 2: title ─────────────────────────────────────────────
            h('p', {
              className: 'text-[13px] leading-snug line-clamp-2 text-zinc-700 dark:text-zinc-300',
            }, post.title),
            // ── Row 3: rationale + author ─────────────────────────────────
            h('div', { className: 'flex items-center gap-2 mt-0.5' },
              rationale && h('p', {
                className: 'flex-1 text-[10px] text-zinc-400 dark:text-zinc-600 line-clamp-1 leading-relaxed',
              }, rationale),
              h('span', { className: 'text-[10px] text-zinc-400/60 dark:text-zinc-700 shrink-0 truncate max-w-[80px]' },
                `u/${post.author}`)
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
        h('span', { className: 'font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-300 dark:text-zinc-600 hidden lg:block' }, 'Brief'),
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
                h('div', { className: 'px-4 pt-3 pb-3 border-b border-zinc-100 dark:border-white/[0.05]' },
                  h('div', { className: 'flex items-center gap-1.5 flex-wrap mb-1.5' },
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
                  h('h2', { className: 'text-sm font-medium text-zinc-700 dark:text-zinc-300 leading-snug mb-2' }, selectedPost.title),
                  h('div', { className: 'flex items-center gap-2.5 text-[10px] text-zinc-400 dark:text-zinc-600 tabular-nums' },
                    detailPriority !== null && h('span', { className: 'font-mono font-semibold text-amber-500/80 dark:text-amber-400/70' }, `P${Math.round(detailPriority * 100)}`),
                    detailPriority === null && detailRelevanceScore !== undefined && detailRelevanceScore !== null && h('span', { className: 'font-mono font-semibold text-amber-500/80 dark:text-amber-400/70' }, `${aiScoresStale ? '~' : ''}${detailRelevanceScore}/5`),
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

                // ── Intelligence brief ────────────────────────────────────
                hasBrief && selectedPostWhyItems.length > 0 && h('div', { className: 'px-4 py-3 border-b border-zinc-100 dark:border-white/[0.05]' },
                  selectedPostNextAction && h('p', { className: 'text-[11px] text-zinc-500 dark:text-zinc-500 leading-relaxed mb-2.5' }, selectedPostNextAction),
                  h('div', { className: 'space-y-1.5' },
                    selectedPostWhyItems.slice(0, 5).map((item) =>
                      h('div', { key: item.label, className: 'flex gap-2' },
                        h('span', { className: 'font-mono text-[8px] uppercase tracking-[0.08em] text-zinc-300 dark:text-zinc-600 pt-0.5 shrink-0 w-16' }, item.label),
                        h('span', { className: 'text-[10px] text-zinc-500 dark:text-zinc-500 leading-relaxed' }, item.value)
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
