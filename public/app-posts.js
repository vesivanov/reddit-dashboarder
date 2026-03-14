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

  function getPriorityScore({ postId, getAiItemForPost, getOpportunityForPost }) {
    const opportunity = getOpportunityForPost(postId);
    if (opportunity?.scores?.priority !== undefined && opportunity?.scores?.priority !== null) {
      return Number(opportunity.scores.priority) || 0;
    }
    const relevance = getAiItemForPost(postId)?.score;
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
    if (meta?.reason) items.push({ label: 'Review note', value: meta.reason });
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
    velocityMeta,
    getAiItemForPost,
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
    const hasAiData = visiblePosts.some((post) => Boolean(getAiItemForPost(post.id)));

    return h('ul', { role: 'list', className: 'list-none' },
      visiblePosts.slice(0, postPageLimit).map((post) => {
        const isSelected = selectedPostId === post.id;
        const score = Number(post.score) || 0;
        const comments = Number(post.num_comments) || 0;
        const flair = post.link_flair_text;
        const flairBg = post.link_flair_background_color || '#e4e4e7';
        const flairTextColor = post.link_flair_text_color === 'light' ? '#fff' : '#18181b';
        const aiItem = getAiItemForPost(post.id);
        const relevanceScore = aiItem?.score;
        const relevanceMeta = aiItem?.metadata || null;
        const opportunity = aiItem?.opportunity || null;
        const priorityScore = getPriorityScore(post.id);
        const opportunityType = getOpportunityTypeLabel(post.id);
        const reviewStatus = aiItem?.review?.status || '';
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

        // ── Tier ──────────────────────────────────────────────────────
        let cardTier = 'standard';
        if (hasAiData) {
          if (isVeryHighRelevant) cardTier = 'hero';
          else if (isHighlyRelevant) cardTier = 'feature';
          else if (hasPriority ? priorityScore >= 0.3 : (relevanceScore !== undefined && relevanceScore !== null && relevanceScore >= 3)) cardTier = 'standard';
          else cardTier = 'suppressed';
        }

        // ── Temporal amber on timestamp ────────────────────────────────
        const postAgeMinutes = (Date.now() / 1000 - post.created_utc) / 60;
        const isVeryRecent = postAgeMinutes < 15;
        const timeClass = isVeryRecent || isSpiking
          ? 'text-amber-500 dark:text-amber-400 font-medium'
          : 'text-zinc-400 dark:text-zinc-500';

        // ── Rationale ─────────────────────────────────────────────────
        // Only show AI-generated text; skip the buildWhyLine stats fallback
        // since score/comments/velocity are already shown in the metadata row
        const rationale = opportunity?.explanation?.summary
          || (relevanceMeta?.reason ? `Why: ${relevanceMeta.reason}` : null);

        // ── Post type + domain ─────────────────────────────────────────
        const domain = !post.is_self && post.domain ? post.domain : null;
        const isTextPost = Boolean(post.is_self);

        // ── Upvote ratio ───────────────────────────────────────────────
        const upvoteRatio = post.upvote_ratio != null ? Math.round(post.upvote_ratio * 100) : null;
        const isControversial = upvoteRatio !== null && upvoteRatio < 70;

        // ── Recommended action badge ───────────────────────────────────
        const recommendedAction = opportunity?.action?.recommended;
        const actionInfo = recommendedAction === 'reply_now'
          ? { label: 'Reply now', cls: 'bg-amber-500 text-white' }
          : recommendedAction === 'dm_if_possible'
            ? { label: 'DM', cls: 'border border-amber-400/60 text-amber-600 dark:text-amber-400' }
            : recommendedAction === 'save_for_followup'
              ? { label: 'Save', cls: 'border border-zinc-300 dark:border-zinc-600 text-zinc-400 dark:text-zinc-500' }
              : null;
        const typeInfo = opportunityType
          ? { label: opportunityType, cls: 'border border-zinc-300 dark:border-zinc-600 text-zinc-500 dark:text-zinc-400' }
          : null;
        const reviewInfo = reviewStatus === 'heuristic_only'
          ? { label: 'Light review', cls: 'border border-zinc-300 dark:border-zinc-600 text-zinc-400 dark:text-zinc-500' }
          : reviewStatus === 'failed'
            ? { label: 'Fallback', cls: 'border border-rose-300 dark:border-rose-700 text-rose-600 dark:text-rose-400' }
            : null;

        // ── Score badge ───────────────────────────────────────────────
        const scoreDisplay = priorityScore !== null
          ? `${Math.round(priorityScore * 100)}%`
          : (relevanceScore !== undefined && relevanceScore !== null
              ? `${aiScoresStale ? '~' : ''}${relevanceScore}/5`
              : null);

        // Score badge visual — solid colored pill
        const scoreBadgeClass = scoreDisplay
          ? cardTier === 'hero'
            ? 'bg-amber-500 text-white font-mono text-[11px] font-bold px-1.5 py-0.5 rounded'
            : cardTier === 'feature'
              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 font-mono text-[11px] font-semibold px-1.5 py-0.5 rounded'
              : 'bg-zinc-100 text-zinc-500 dark:bg-white/[0.06] dark:text-zinc-400 font-mono text-[11px] px-1.5 py-0.5 rounded'
          : '';

        // ── Card background & border ───────────────────────────────────
        // Hero: visible warm tint + strong amber left border
        // Feature: amber left border at 50%
        // Standard: no border treatment
        // Suppressed: whole card at reduced opacity
        const cardBorderClass = cardTier === 'hero'
          ? 'border-l-[3px] border-amber-500'
          : cardTier === 'feature'
            ? 'border-l-[3px] border-amber-400/50'
            : 'border-l-[3px] border-transparent';

        const cardBgClass = isSelected
          ? 'bg-zinc-100 dark:bg-white/[0.06]'
          : cardTier === 'hero'
            ? 'bg-amber-50/40 dark:bg-amber-500/[0.11] hover:bg-amber-50/70 dark:hover:bg-amber-500/[0.15]'
            : 'hover:bg-zinc-50 dark:hover:bg-white/[0.03]';

        const cardOpacity = '';

        // ── Read tracking: subtle left indicator dot (not title dimming) ──
        const isRead = openedPostIds && openedPostIds.has(post.id) && !isSelected;

        return h('li', {
          key: post.id,
          className: `group relative border-b border-zinc-100 dark:border-white/[0.04] last:border-0 transition-all duration-100 ${cardBorderClass} ${cardBgClass} ${cardOpacity}`,
          onMouseEnter: () => handlePostHoverStart(post),
          onMouseLeave: handlePostHoverEnd,
        },
          h('button', {
            onClick: () => onSelectPost(post),
            className: 'w-full text-left px-3 py-2 pr-16',
          },

            // ── Row 1: title + badges ─────────────────────────────────
            h('div', { className: 'flex items-start gap-2 mb-1' },
              h('p', {
                className: `flex-1 text-[13px] font-semibold leading-snug line-clamp-2 ${
                  isSelected
                    ? 'text-zinc-900 dark:text-white'
                    : isRead
                      ? 'text-zinc-500 dark:text-zinc-400'
                      : cardTier === 'hero'
                        ? 'text-zinc-900 dark:text-white'
                        : 'text-zinc-800 dark:text-zinc-100'
                }`,
              }, post.title),
              actionInfo && h('span', { className: `font-mono text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${actionInfo.cls}` }, actionInfo.label),
              typeInfo && h('span', { className: `font-mono text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${typeInfo.cls}` }, typeInfo.label),
              scoreDisplay && h('span', { className: scoreBadgeClass }, scoreDisplay)
            ),

            // ── Row 2: sub  flair  type/domain  time  upvotes  comments  ratio  author ──
            h('div', { className: 'flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-zinc-500 tabular-nums flex-wrap' },
              h('span', { className: 'font-medium text-zinc-500 dark:text-zinc-400 shrink-0' }, `r/${post.subreddit}`),
              flair && h('span', {
                className: 'px-1 py-px rounded text-[10px] font-medium shrink-0',
                style: { backgroundColor: flairBg, color: flairTextColor },
              }, flair),
              domain
                ? h('span', { className: 'shrink-0 text-zinc-400 dark:text-zinc-500 font-mono text-[10px]' }, domain)
                : isTextPost && h('span', { className: 'shrink-0 text-zinc-400 dark:text-zinc-500' }, 'text'),
              h('span', { className: 'shrink-0 text-zinc-300 dark:text-zinc-600' }, '·'),
              isSpiking
                ? h('span', { className: 'inline-flex items-center gap-0.5 text-rose-500 shrink-0 font-medium' },
                    '⚡', upvotesPerHour > 0 && `${formatVelocity(upvotesPerHour)}/h`)
                : null,
              h('span', { title: absoluteDate(post.created_utc), className: `${timeClass} shrink-0` }, timeAgo(post.created_utc)),
              h('span', { className: 'inline-flex items-center gap-0.5 text-zinc-500 dark:text-zinc-400 shrink-0' },
                renderGlyph('M7 14l5-5 5 5', 'w-2.5 h-2.5'),
                score,
                !isSpiking && upvotesPerHour > 2 && h('span', { className: 'text-amber-500 dark:text-amber-400 font-medium' }, `+${formatVelocity(upvotesPerHour)}/h`)
              ),
              h('span', { className: 'inline-flex items-center gap-0.5 shrink-0' },
                renderGlyph('M8 10h8M8 14h5m-9 7l2.5-2.5H19a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v11a2 2 0 002 2h1.5L4 21z', 'w-2.5 h-2.5'), comments),
              isControversial && h('span', { className: 'shrink-0 text-rose-500 dark:text-rose-400 font-medium', title: `${upvoteRatio}% upvoted` }, `${upvoteRatio}%↑`),
              post.author && h('span', { className: 'shrink-0 text-zinc-400 dark:text-zinc-500' }, `u/${post.author}`)
            ),

            // ── Row 3: rationale ──────────────────────────────────────
            rationale && cardTier !== 'suppressed' && h('p', {
              className: 'mt-1 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400 line-clamp-2',
            }, rationale)
          ),

          // ── Context menu ──────────────────────────────────────────────
          h('div', { className: 'absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity' },
            h('a', {
              href: post.reddit_url || post.external_url,
              target: '_blank',
              rel: 'noreferrer',
              onClick: (e) => e.stopPropagation(),
              title: 'Open in Reddit',
              className: 'p-1 rounded text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.08] transition-colors',
            },
              renderGlyph('M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14', 'w-3.5 h-3.5')
            ),
            h('button', {
              onClick: (e) => { e.stopPropagation(); setActivePostMenu(activePostMenu === post.id ? null : post.id); },
              className: 'p-1 rounded text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.08] transition-colors',
            },
              h('svg', { className: 'w-3.5 h-3.5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z' })
              )
            ),
            activePostMenu === post.id && h('div', {
              className: 'absolute right-0 top-7 w-36 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700 py-1 z-20 animate-fadeIn',
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
      visiblePosts.length > postPageLimit && h('li', { className: 'flex items-center justify-center py-4 border-t border-zinc-100 dark:border-white/[0.04]' },
        h('button', {
          onClick: () => setPostPageLimit((prev) => prev + 150),
          className: 'px-4 py-1.5 rounded-lg text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.05] transition-colors',
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
    getAiItemForPost,
    getOpportunityForPost,
    getPriorityScore,
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

    // Hoist score/tier for header
    const detailAiItem = selectedPost ? getAiItemForPost(selectedPost.id) : null;
    const detailOpportunity = detailAiItem?.opportunity || (selectedPost ? getOpportunityForPost(selectedPost.id) : null);
    const detailReview = detailAiItem?.review || null;
    const detailPriority = selectedPost ? getPriorityScore(selectedPost.id) : null;
    const detailRelevanceScore = detailAiItem?.score;
    const detailScoreDisplay = detailPriority !== null && detailPriority !== undefined
      ? `P${Math.round(detailPriority * 100)}`
      : (detailRelevanceScore !== undefined && detailRelevanceScore !== null
          ? `${aiScoresStale ? '~' : ''}${detailRelevanceScore}/5`
          : null);
    const detailIsHero = detailPriority !== null && detailPriority !== undefined
      ? detailPriority >= 0.85
      : detailRelevanceScore >= 5;

    return h('aside', { className: `w-80 bg-white dark:bg-zinc-800 flex-col shrink-0 border-l border-zinc-100 dark:border-white/[0.05] ${mobileView === 'detail' ? 'flex' : 'hidden lg:flex'}` },

      // Header
      h('div', { className: 'px-4 py-2.5 border-b border-zinc-100 dark:border-white/[0.05] flex items-center justify-between shrink-0' },
        h('button', {
          onClick: () => setMobileView('posts'),
          'aria-label': 'Back to posts',
          className: 'lg:hidden p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-400 transition-colors',
        }, h('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
          h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M15 19l-7-7 7-7' })
        )),
        h('div', { className: 'hidden lg:flex items-center gap-2' },
          h('span', { className: 'font-display text-[9px] uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500' }, 'Brief'),
          detailScoreDisplay && h('span', {
            className: `font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${detailIsHero ? 'bg-amber-500 text-white' : 'bg-zinc-100 dark:bg-white/[0.08] text-zinc-500 dark:text-zinc-400'}`,
          }, detailScoreDisplay)
        ),
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
              h('p', { className: 'text-xs text-zinc-400 dark:text-zinc-500' }, 'Select a post to read more')
            )
          : (() => {
              const detailType = detailOpportunity?.classification?.type;
              const hasBrief = detailOpportunity || detailPriority !== null || (detailRelevanceScore !== undefined && detailRelevanceScore !== null);

              return h('div', null,

                // ── Post header ───────────────────────────────────────────
                h('div', { className: 'px-4 pt-4 pb-3 border-b border-zinc-100 dark:border-white/[0.05]' },
                  h('div', { className: 'flex items-center gap-1.5 flex-wrap mb-2' },
                    h('span', { className: 'text-xs font-semibold text-amber-600 dark:text-amber-400' }, `r/${selectedPost.subreddit}`),
                    detailType && h('span', { className: 'font-mono text-[10px] uppercase tracking-[0.08em] text-amber-500 dark:text-amber-400' }, formatOpportunityLabel(detailType)),
                    detailReview?.status === 'heuristic_only' && h('span', { className: 'font-mono text-[10px] uppercase tracking-[0.08em] text-zinc-400 dark:text-zinc-500' }, 'light review'),
                    detailReview?.status === 'failed' && h('span', { className: 'font-mono text-[10px] uppercase tracking-[0.08em] text-rose-500 dark:text-rose-400' }, 'fallback'),
                    selectedPost.link_flair_text && h('span', {
                      className: 'px-1.5 py-px rounded text-[10px] font-medium',
                      style: {
                        backgroundColor: selectedPost.link_flair_background_color || '#e4e4e7',
                        color: selectedPost.link_flair_text_color === 'light' ? '#fff' : '#18181b',
                      },
                    }, selectedPost.link_flair_text),
                    h('span', { className: 'text-xs text-zinc-400 dark:text-zinc-500 ml-auto', title: absoluteDate(selectedPost.created_utc) }, timeAgo(selectedPost.created_utc))
                  ),
                  h('h2', { className: 'font-display text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 leading-snug mb-3' }, selectedPost.title),
                  h('div', { className: 'flex items-center gap-3 text-xs text-zinc-400 dark:text-zinc-500 tabular-nums' },
                    detailPriority !== null && h('span', { className: 'bg-amber-500 text-white font-mono text-[11px] font-bold px-1.5 py-0.5 rounded' }, `P${Math.round(detailPriority * 100)}`),
                    detailPriority === null && detailRelevanceScore !== undefined && detailRelevanceScore !== null && h('span', { className: 'bg-amber-500 text-white font-mono text-[11px] font-bold px-1.5 py-0.5 rounded' }, `${aiScoresStale ? '~' : ''}${detailRelevanceScore}/5`),
                    h('span', { className: 'inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-500' },
                      renderGlyph('M7 14l5-5 5 5', 'w-3 h-3'), selectedPost.score),
                    h('span', { className: 'inline-flex items-center gap-0.5' },
                      renderGlyph('M8 10h8M8 14h5m-9 7l2.5-2.5H19a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v11a2 2 0 002 2h1.5L4 21z', 'w-3 h-3'), selectedPost.num_comments),
                    h('span', null, `u/${selectedPost.author}`)
                  )
                ),

                // ── Actions ───────────────────────────────────────────────
                h('div', { className: 'px-4 py-3 border-b border-zinc-100 dark:border-white/[0.05] flex items-center gap-2' },
                  h('a', {
                    href: selectedPost.reddit_url || selectedPost.external_url,
                    target: '_blank',
                    rel: 'noreferrer',
                    className: 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 transition-colors',
                  },
                    'Open Reddit',
                    h('svg', { className: 'w-3 h-3', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                      h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14' })
                    )
                  ),
                  h('button', {
                    onClick: () => handleCopyLink(selectedPost),
                    className: 'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-600/60 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/[0.05] transition-colors',
                  }, renderGlyph('M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3', 'w-3.5 h-3.5'), 'Copy'),
                  h('button', {
                    onClick: () => handleHidePost(selectedPost.id),
                    className: 'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-600/60 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/[0.05] transition-colors',
                  }, renderGlyph('M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21', 'w-3.5 h-3.5'), 'Hide')
                ),

                // ── Intelligence brief ────────────────────────────────────
                hasBrief && selectedPostWhyItems.length > 0 && h('div', { className: 'border-b border-zinc-100 dark:border-white/[0.05]' },

                  // Next action callout
                  selectedPostNextAction && h('div', {
                    className: 'mx-4 mt-3 border-l-2 border-amber-500 dark:border-amber-400 bg-amber-50/60 dark:bg-amber-500/[0.07] px-3 py-2.5 rounded-r-lg',
                  },
                    h('p', { className: 'font-display text-[9px] uppercase tracking-[0.14em] text-amber-600 dark:text-amber-400 mb-1' }, 'Next action'),
                    h('p', { className: 'text-xs font-medium text-zinc-700 dark:text-zinc-200 leading-relaxed' }, selectedPostNextAction)
                  ),

                  h('div', { className: 'px-4 pt-3 pb-4 space-y-3' },
                    selectedPostWhyItems.slice(0, 6).map((item) =>
                      h('div', { key: item.label },
                        h('p', { className: 'font-display text-[9px] uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500 mb-1' }, item.label),

                        item.label === 'Why now'
                          ? h('div', { className: 'space-y-1' },
                              item.value.split(' • ').filter(Boolean).map((bullet, i) =>
                                h('div', { key: i, className: 'flex items-baseline gap-1.5' },
                                  h('span', { className: 'text-amber-400 dark:text-amber-500 shrink-0 text-[10px]' }, '·'),
                                  h('span', { className: 'text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed' }, bullet)
                                )
                              )
                            )

                          : item.label === 'Scores'
                          ? h('div', { className: 'flex flex-wrap gap-1' },
                              item.value.split(' · ').filter(Boolean).map((s, i) =>
                                h('span', { key: i, className: 'font-mono text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-400' }, s)
                              )
                            )

                          : item.label === 'Momentum'
                          ? h('div', { className: 'space-y-2' },
                              h('div', { className: 'flex items-center gap-2' },
                                h('span', { className: 'font-mono text-[10px] text-zinc-500 dark:text-zinc-400 w-14 shrink-0' }, item.upvotesLabel || '—'),
                                h('span', { className: 'font-display text-[9px] text-zinc-400 dark:text-zinc-500 w-12 shrink-0' }, 'upvotes'),
                                h('div', { className: 'flex-1 h-1 rounded-full bg-zinc-100 dark:bg-white/[0.06] overflow-hidden' },
                                  h('div', { className: 'h-full rounded-full bg-emerald-400/70 dark:bg-emerald-500/50', style: { width: `${Math.min(100, ((item.upvotesPerHour || 0) / 20) * 100)}%` } })
                                )
                              ),
                              h('div', { className: 'flex items-center gap-2' },
                                h('span', { className: 'font-mono text-[10px] text-zinc-500 dark:text-zinc-400 w-14 shrink-0' }, item.commentsLabel || '—'),
                                h('span', { className: 'font-display text-[9px] text-zinc-400 dark:text-zinc-500 w-12 shrink-0' }, 'comments'),
                                h('div', { className: 'flex-1 h-1 rounded-full bg-zinc-100 dark:bg-white/[0.06] overflow-hidden' },
                                  h('div', { className: 'h-full rounded-full bg-zinc-400/50 dark:bg-zinc-500/40', style: { width: `${Math.min(100, ((item.commentsPerHour || 0) / 5) * 100)}%` } })
                                )
                              )
                            )

                          : h('p', { className: 'text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed' }, item.value)
                      )
                    )
                  )
                ),

                // ── Post body ─────────────────────────────────────────────
                h('div', { className: 'px-4 py-3' },
                  h('div', { className: 'post-body text-zinc-600 dark:text-zinc-400' },
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
