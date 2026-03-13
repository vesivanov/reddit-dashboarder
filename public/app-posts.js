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
    if (opportunity?.action?.recommended) items.push({ label: 'Recommended action', value: formatOpportunityLabel(opportunity.action.recommended) });
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
    if (meta?.reason) items.push({ label: 'AI summary', value: meta.reason });
    if (meta?.confidence || meta?.source) {
      items.push({
        label: 'Source',
        value: [
          meta.source === 'llm' ? 'LLM-ranked' : meta?.source === 'heuristic' ? 'Heuristic' : null,
          meta?.confidence ? `${meta.confidence} confidence` : null,
        ].filter(Boolean).join(' · '),
      });
    }
    if (meta?.debug?.matchedKeywords?.length) {
      items.push({ label: 'Matched signals', value: meta.debug.matchedKeywords.slice(0, 5).join(', ') });
    }
    if (velocity) {
      items.push({
        label: 'Momentum',
        value: `${formatVelocity(velocity.upvotesPerHour)}/h upvotes · ${formatVelocity(velocity.commentsPerHour)}/h comments`,
      });
    }
    if (selectedPost.link_flair_text) items.push({ label: 'Flair', value: selectedPost.link_flair_text });
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

    return h('ul', { role: 'list', className: 'list-none bg-zinc-50 dark:bg-zinc-900' },
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

        // Card tier determines visual weight
        let cardTier = 'standard';
        if (hasAiData) {
          if (isVeryHighRelevant) cardTier = 'hero';
          else if (isHighlyRelevant) cardTier = 'feature';
          else if (hasPriority ? priorityScore >= 0.3 : relevanceScore >= 3) cardTier = 'standard';
          else cardTier = 'suppressed';
        }

        // ── SUPPRESSED card (noise, very compact) ────────────────────────
        if (cardTier === 'suppressed' && !isSelected) {
          return h('li', {
            key: post.id,
            className: 'post-card-suppressed border-b border-zinc-100 dark:border-white/[0.04] last:border-0',
            onMouseEnter: () => handlePostHoverStart(post),
            onMouseLeave: handlePostHoverEnd,
          },
            h('button', {
              onClick: () => onSelectPost(post),
              className: 'w-full text-left px-4 py-2 flex items-center gap-3 hover:opacity-100 transition-opacity',
            },
              h('span', { className: 'flex-1 text-xs text-zinc-500 dark:text-zinc-600 line-clamp-1' }, post.title),
              h('span', { className: 'text-[10px] text-zinc-600 dark:text-zinc-700 shrink-0' }, timeAgo(post.created_utc))
            )
          );
        }

        // ── HERO card (very high relevance) ──────────────────────────────
        if (cardTier === 'hero') {
          const rationale = opportunity?.explanation?.summary || buildWhyLine({ post, relevanceMeta, upvotesPerHour, commentsPerHour });
          return h('li', {
            key: post.id,
            className: `group relative post-card-hero border-b border-zinc-100 dark:border-white/[0.04] last:border-0 ${isSelected ? 'border-l-[3px] border-amber-500' : 'border-l-[3px] border-amber-500/60'}`,
            onMouseEnter: () => handlePostHoverStart(post),
            onMouseLeave: handlePostHoverEnd,
          },
            h('button', {
              onClick: () => onSelectPost(post),
              className: `w-full text-left px-4 py-4 ${isSelected ? 'bg-amber-950/20 dark:bg-amber-950/25' : ''}`,
            },
              h('div', { className: 'flex gap-3' },
                post.thumbnail && post.thumbnail !== 'self' && post.thumbnail !== 'default' && post.thumbnail !== 'nsfw' &&
                  h('img', {
                    src: post.thumbnail, alt: '',
                    className: 'w-14 h-14 object-cover rounded-lg shrink-0 bg-zinc-200 dark:bg-zinc-700',
                  }),
                h('div', { className: 'flex-1 min-w-0' },
                  // Top: opportunity type + meta
                  h('div', { className: 'flex items-center gap-2 flex-wrap mb-1.5' },
                    opportunityType && h('span', {
                      className: 'font-mono text-[9px] uppercase tracking-[0.16em] font-semibold text-amber-500 dark:text-amber-400',
                    }, opportunityType.replace(/_/g, ' ')),
                    opportunityType && h('span', { className: 'text-zinc-300 dark:text-zinc-700 text-[10px]' }, '·'),
                    h('span', { className: 'text-[10px] text-zinc-500 dark:text-zinc-500' }, `r/${post.subreddit}`),
                    h('span', { className: 'text-[10px] text-zinc-500 dark:text-zinc-600' }, '·'),
                    h('span', { className: 'text-[10px] text-zinc-500 dark:text-zinc-500', title: absoluteDate(post.created_utc) }, timeAgo(post.created_utc)),
                    isSpiking && h('span', { className: 'px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300' }, 'Spiking'),
                    flair && h('span', {
                      className: 'px-1.5 py-0.5 rounded-full text-[9px] font-medium',
                      style: { backgroundColor: flairBg, color: flairTextColor },
                    }, flair)
                  ),
                  // Title — larger
                  h('h3', { className: 'text-base font-semibold text-zinc-900 dark:text-zinc-100 leading-snug line-clamp-2 mb-1.5' }, post.title),
                  // Inline rationale
                  rationale && h('p', { className: 'text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 mb-2.5' }, rationale),
                  // Stats row
                  h('div', { className: 'flex items-center gap-3 text-xs' },
                    h('span', { className: 'inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium tabular-nums' },
                      renderGlyph('M7 14l5-5 5 5', 'w-3 h-3'), score),
                    h('span', { className: 'inline-flex items-center gap-1 text-zinc-500 dark:text-zinc-400 tabular-nums' },
                      renderGlyph('M8 10h8M8 14h5m-9 7l2.5-2.5H19a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v11a2 2 0 002 2h1.5L4 21z', 'w-3 h-3'), comments),
                    priorityScore !== null
                      ? h('span', { className: 'ml-auto font-mono text-[10px] font-semibold text-amber-500 dark:text-amber-400 tabular-nums' },
                          `P${Math.round(priorityScore * 100)}`)
                      : relevanceScore !== undefined && relevanceScore !== null && h('span', {
                          className: `ml-auto font-mono text-[10px] font-bold tabular-nums ${
                            relevanceScore >= 5 ? 'text-emerald-600 dark:text-emerald-400' :
                            relevanceScore >= 4 ? 'text-emerald-600 dark:text-emerald-400' :
                            'text-zinc-500'
                          }`,
                        }, `${aiScoresStale ? '~' : ''}${relevanceScore}/5`)
                  )
                )
              )
            ),
            // Context menu trigger
            h('div', { className: 'absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity' },
              h('button', {
                onClick: (e) => { e.stopPropagation(); setActivePostMenu(activePostMenu === post.id ? null : post.id); },
                className: 'p-1.5 rounded-lg bg-white dark:bg-zinc-800 shadow-sm border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors',
              },
                h('svg', { className: 'w-3.5 h-3.5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                  h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z' })
                )
              ),
              activePostMenu === post.id && h('div', {
                className: 'absolute right-0 mt-1 w-40 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700 py-1 z-20 animate-fadeIn',
                onClick: (e) => e.stopPropagation(),
              },
                h('button', { onClick: () => { window.open(post.reddit_url || post.external_url, '_blank'); setActivePostMenu(null); }, className: 'w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2' },
                  renderGlyph('M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14', 'w-4 h-4'), 'Open in Reddit'),
                h('button', { onClick: () => handleCopyLink(post), className: 'w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2' },
                  renderGlyph('M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3', 'w-4 h-4'), 'Copy link'),
                h('button', { onClick: () => handleHidePost(post.id), className: 'w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2' },
                  renderGlyph('M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21', 'w-4 h-4'), 'Hide post')
              )
            )
          );
        }

        // ── FEATURE + STANDARD cards ──────────────────────────────────────
        const isFeature = cardTier === 'feature';
        const borderClass = isSelected
          ? 'border-l-[3px] border-amber-500'
          : isFeature
            ? 'border-l-[3px] border-amber-500/40'
            : '';
        const bgClass = isSelected
          ? 'bg-white dark:bg-zinc-800'
          : isFeature
            ? 'bg-zinc-50/80 dark:bg-white/[0.02]'
            : '';

        return h('li', {
          key: post.id,
          className: `group relative w-full border-b border-zinc-200 dark:border-white/[0.04] last:border-0 hover:bg-white dark:hover:bg-zinc-800 transition-colors ${bgClass} ${borderClass}`,
          onMouseEnter: () => handlePostHoverStart(post),
          onMouseLeave: handlePostHoverEnd,
        },
          h('button', {
            onClick: () => onSelectPost(post),
            className: 'w-full text-left px-4 py-3',
          },
            h('div', { className: 'flex gap-3' },
              post.thumbnail && post.thumbnail !== 'self' && post.thumbnail !== 'default' && post.thumbnail !== 'nsfw' &&
                h('img', {
                  src: post.thumbnail, alt: '',
                  className: 'w-12 h-12 object-cover rounded-lg shrink-0 bg-zinc-200 dark:bg-zinc-700 mt-0.5',
                }),
              h('div', { className: 'flex-1 min-w-0' },
                h('div', { className: 'flex items-center gap-1.5 text-[10px] text-zinc-500 dark:text-zinc-500 mb-1 flex-wrap' },
                  h('span', null, `r/${post.subreddit}`),
                  flair && h('span', {
                    className: 'px-1.5 py-0.5 rounded-full text-[9px] font-medium',
                    style: { backgroundColor: flairBg, color: flairTextColor },
                  }, flair),
                  h('span', null, '·'),
                  h('span', { title: absoluteDate(post.created_utc) }, timeAgo(post.created_utc)),
                  opportunityType && h('span', {
                    className: 'px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 capitalize',
                  }, opportunityType),
                  isSpiking && h('span', {
                    className: 'px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-200',
                  }, 'Spiking'),
                  h('span', { className: 'inline-flex items-center gap-0.5 text-[9px]' },
                    renderGlyph('M13 2L4 14h6l-1 8 9-12h-6l1-8z', 'w-2.5 h-2.5'),
                    `${formatVelocity(upvotesPerHour)}/h`
                  )
                ),
                h('h3', { className: `font-medium text-zinc-900 dark:text-zinc-100 leading-snug line-clamp-2 ${isFeature ? 'text-sm' : 'text-sm'}` }, post.title),
                showAiReasons && h('p', { className: 'text-xs text-zinc-500 dark:text-zinc-500 line-clamp-1 mt-0.5' },
                  opportunity?.explanation?.summary || buildWhyLine({ post, relevanceMeta, upvotesPerHour, commentsPerHour })
                ),
                h('div', { className: 'flex items-center gap-3 mt-2 text-xs' },
                  h('span', { className: 'inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium tabular-nums' },
                    renderGlyph('M7 14l5-5 5 5', 'w-3 h-3'), score),
                  h('span', { className: 'inline-flex items-center gap-1 text-zinc-500 dark:text-zinc-500 tabular-nums' },
                    renderGlyph('M8 10h8M8 14h5m-9 7l2.5-2.5H19a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v11a2 2 0 002 2h1.5L4 21z', 'w-3 h-3'), comments),
                  h('span', { className: 'text-zinc-400 dark:text-zinc-600 truncate' }, `u/${post.author}`),
                  priorityScore !== null
                    ? h('span', { className: 'ml-auto font-mono text-[10px] text-amber-500 dark:text-amber-400 tabular-nums' }, `P${Math.round(priorityScore * 100)}`)
                    : relevanceScore !== undefined && relevanceScore !== null && h('span', {
                        className: `ml-auto font-mono text-[10px] font-bold tabular-nums ${aiScoresStale ? 'opacity-50' : ''} ${
                          relevanceScore >= 5 ? 'text-emerald-600 dark:text-emerald-400' :
                          relevanceScore >= 4 ? 'text-emerald-600 dark:text-emerald-400' :
                          relevanceScore >= 3 ? 'text-amber-600 dark:text-amber-400' :
                          'text-zinc-500'
                        }`,
                      }, `${aiScoresStale ? '~' : ''}${aiScoreLabel(relevanceScore)} (${relevanceScore}/5)`)
                )
              )
            )
          ),
          h('div', { className: 'absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity' },
            h('button', {
              onClick: (e) => { e.stopPropagation(); setActivePostMenu(activePostMenu === post.id ? null : post.id); },
              className: 'p-1.5 rounded-lg bg-white dark:bg-zinc-800 shadow-sm border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors',
            },
              h('svg', { className: 'w-3.5 h-3.5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z' })
              )
            ),
            activePostMenu === post.id && h('div', {
              className: 'absolute right-0 mt-1 w-40 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700 py-1 z-20 animate-fadeIn',
              onClick: (e) => e.stopPropagation(),
            },
              h('button', { onClick: () => { window.open(post.reddit_url || post.external_url, '_blank'); setActivePostMenu(null); }, className: 'w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2' },
                renderGlyph('M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14', 'w-4 h-4'), 'Open in Reddit'),
              h('button', { onClick: () => handleCopyLink(post), className: 'w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2' },
                renderGlyph('M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3', 'w-4 h-4'), 'Copy link'),
              h('button', { onClick: () => handleHidePost(post.id), className: 'w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2' },
                renderGlyph('M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21', 'w-4 h-4'), 'Hide post')
            )
          )
        );
      }),
      visiblePosts.length > postPageLimit && h('li', { className: 'flex items-center justify-center py-6 border-t border-zinc-200 dark:border-white/[0.04] bg-zinc-50 dark:bg-zinc-900' },
        h('button', {
          onClick: () => setPostPageLimit((prev) => prev + 150),
          className: 'px-5 py-2 rounded-lg text-sm font-medium border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-white dark:hover:bg-zinc-800 transition-colors',
        }, `Load ${Math.min(150, visiblePosts.length - postPageLimit)} more  (${postPageLimit} of ${visiblePosts.length})`)
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

    return h('aside', { className: `w-96 bg-white dark:bg-zinc-800 flex-col shrink-0 border-l border-zinc-100 dark:border-white/[0.05] ${mobileView === 'detail' ? 'flex' : 'hidden lg:flex'}` },

      // Minimal header
      h('div', { className: 'px-4 py-2.5 border-b border-zinc-100 dark:border-white/[0.05] flex items-center justify-between shrink-0' },
        h('button', {
          onClick: () => setMobileView('posts'),
          'aria-label': 'Back to posts',
          className: 'lg:hidden p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 transition-colors',
        }, h('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
          h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M15 19l-7-7 7-7' })
        )),
        h('span', { className: 'font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-600 hidden lg:block' }, 'Brief'),
        h('button', {
          onClick: () => setDetailCollapsed(true),
          'aria-label': 'Collapse',
          className: 'hidden lg:block p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors',
          title: 'Collapse detail pane',
        }, h('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
          h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M13 5l7 7-7 7M5 5l7 7-7 7' })
        ))
      ),

      // Content
      h('div', { className: 'flex-1 overflow-auto scrollbar-thin' },
        !selectedPost
          ? h('div', { className: 'flex flex-col items-center justify-center h-full gap-3 text-center px-8' },
              h('div', { className: 'w-12 h-12 rounded-2xl bg-zinc-50 dark:bg-zinc-700/50 border border-zinc-200 dark:border-zinc-600 flex items-center justify-center' },
                h('svg', { className: 'w-5 h-5 text-zinc-400 dark:text-zinc-500', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                  h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 1.5, d: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' })
                )
              ),
              h('div', null,
                h('p', { className: 'text-sm font-medium text-zinc-500 dark:text-zinc-400' }, 'Select a post'),
                h('p', { className: 'text-xs text-zinc-400 dark:text-zinc-500 mt-0.5' }, 'Click any post to see the intelligence brief.')
              )
            )
          : (() => {
              const detailOpportunity = getOpportunityForPost(selectedPost.id);
              const detailType = detailOpportunity?.classification?.type;
              const detailAction = detailOpportunity?.action?.recommended;
              const detailRelevanceScore = postScoreProxies.get(String(selectedPost.id));
              const detailRelevanceMeta = postScoreMetadata.get(String(selectedPost.id));
              const detailPriority = getPriorityScore(selectedPost.id);
              const hasBrief = detailOpportunity || detailPriority !== null || (detailRelevanceScore !== undefined && detailRelevanceScore !== null);

              return h('div', null,

                // ── Article header ────────────────────────────────────────
                h('div', { className: 'px-5 pt-5 pb-4 border-b border-zinc-100 dark:border-white/[0.05]' },
                  // Meta row
                  h('div', { className: 'flex items-center gap-2 flex-wrap mb-3' },
                    h('span', { className: 'px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 font-medium text-xs' }, `r/${selectedPost.subreddit}`),
                    detailType && h('span', { className: 'font-mono text-[9px] uppercase tracking-[0.14em] font-semibold text-amber-600 dark:text-amber-400' }, formatOpportunityLabel(detailType)),
                    selectedPost.link_flair_text && h('span', {
                      className: 'px-1.5 py-0.5 rounded-full text-[9px] font-medium',
                      style: {
                        backgroundColor: selectedPost.link_flair_background_color || '#e4e4e7',
                        color: selectedPost.link_flair_text_color === 'light' ? '#fff' : '#18181b',
                      },
                    }, selectedPost.link_flair_text),
                    h('span', { className: 'text-xs text-zinc-400 dark:text-zinc-500 ml-auto', title: absoluteDate(selectedPost.created_utc) }, timeAgo(selectedPost.created_utc))
                  ),
                  // Title
                  h('h2', { className: 'text-xl font-semibold text-zinc-900 dark:text-zinc-100 leading-snug' }, selectedPost.title),
                  // Score
                  (detailPriority !== null || (detailRelevanceScore !== undefined && detailRelevanceScore !== null)) && h('div', { className: 'mt-3 flex items-center gap-2' },
                    detailPriority !== null && h('span', {
                      className: 'font-mono text-xs font-bold text-amber-600 dark:text-amber-400 tabular-nums',
                      title: detailOpportunity?.explanation?.summary || `Opportunity priority: ${Math.round(detailPriority * 100)}/100`,
                    }, `Priority ${Math.round(detailPriority * 100)}`),
                    detailPriority === null && h('span', {
                      className: `font-mono text-xs font-bold tabular-nums ${aiScoresStale ? 'opacity-50' : ''} ${
                        detailRelevanceScore >= 5 ? 'text-emerald-600 dark:text-emerald-400' :
                        detailRelevanceScore >= 4 ? 'text-emerald-600 dark:text-emerald-400' :
                        detailRelevanceScore >= 3 ? 'text-amber-600 dark:text-amber-400' :
                        'text-zinc-500'
                      }`,
                    }, `${aiScoresStale ? '~' : ''}${aiScoreLabel(detailRelevanceScore)} (${detailRelevanceScore}/5)`),
                    h('span', { className: 'inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400 font-medium tabular-nums' },
                      renderGlyph('M7 14l5-5 5 5', 'w-3 h-3'), selectedPost.score),
                    h('span', { className: 'inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 tabular-nums' },
                      renderGlyph('M8 10h8M8 14h5m-9 7l2.5-2.5H19a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v11a2 2 0 002 2h1.5L4 21z', 'w-3 h-3'), selectedPost.num_comments),
                    h('span', { className: 'text-xs text-zinc-400 dark:text-zinc-500' }, `u/${selectedPost.author}`)
                  )
                ),

                // ── Intelligence brief ────────────────────────────────────
                hasBrief && h('div', { className: 'px-5 py-4 border-b border-zinc-100 dark:border-white/[0.05]' },
                  h('p', { className: 'font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-600 mb-3' }, 'Intelligence'),

                  // Action statement (primary)
                  h('p', { className: 'text-sm font-medium text-zinc-800 dark:text-zinc-200 leading-relaxed mb-3' }, selectedPostNextAction),

                  // Why items
                  selectedPostWhyItems.length > 0 && h('div', { className: 'space-y-2 mb-3' },
                    selectedPostWhyItems.slice(0, 5).map((item) =>
                      h('div', { key: item.label, className: 'flex gap-2' },
                        h('span', { className: 'font-mono text-[9px] uppercase tracking-[0.1em] text-zinc-400 dark:text-zinc-600 pt-0.5 shrink-0 w-24' }, item.label),
                        h('span', { className: 'text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed' }, item.value)
                      )
                    )
                  ),

                  // Primary CTA
                  h('div', { className: 'flex items-center gap-2 mt-3 flex-wrap' },
                    h('a', {
                      href: selectedPost.reddit_url || selectedPost.external_url,
                      target: '_blank',
                      rel: 'noreferrer',
                      className: 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 active:bg-amber-800 transition-colors',
                    },
                      'Open on Reddit',
                      h('svg', { className: 'w-3.5 h-3.5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                        h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14' })
                      )
                    ),
                    h('button', {
                      onClick: () => handleCopyLink(selectedPost),
                      className: 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors',
                    }, renderGlyph('M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3', 'w-3.5 h-3.5'), 'Copy'),
                    h('button', {
                      onClick: () => handleHidePost(selectedPost.id),
                      className: 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-500 dark:text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors',
                    }, renderGlyph('M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21', 'w-3.5 h-3.5'), 'Hide')
                  )
                ),

                // ── No brief: just actions ────────────────────────────────
                !hasBrief && h('div', { className: 'px-5 py-4 border-b border-zinc-100 dark:border-white/[0.05] flex items-center gap-2 flex-wrap' },
                  h('a', {
                    href: selectedPost.reddit_url || selectedPost.external_url,
                    target: '_blank',
                    rel: 'noreferrer',
                    className: 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 transition-colors',
                  }, 'Open on Reddit',
                    h('svg', { className: 'w-3.5 h-3.5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                      h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14' })
                    )
                  ),
                  h('button', {
                    onClick: () => handleCopyLink(selectedPost),
                    className: 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors',
                  }, 'Copy link')
                ),

                // ── Post body (Lora serif reading mode) ──────────────────
                h('div', { className: 'px-5 py-5' },
                  h('p', { className: 'font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-600 mb-4' }, 'Post'),
                  h('div', { className: 'post-body text-zinc-700 dark:text-zinc-300' },
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
