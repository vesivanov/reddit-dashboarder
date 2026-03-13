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

    if (opportunity?.classification?.type) {
      items.push({ label: 'Opportunity', value: formatOpportunityLabel(opportunity.classification.type) });
    }
    if (opportunity?.action?.recommended) {
      items.push({ label: 'Recommended action', value: formatOpportunityLabel(opportunity.action.recommended) });
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
          meta?.confidence ? `${meta.confidence} confidence` : null,
        ].filter(Boolean).join(' • '),
      });
    }
    if (meta?.debug?.matchedKeywords?.length) {
      items.push({ label: 'Matched signals', value: meta.debug.matchedKeywords.slice(0, 5).join(', ') });
    }
    if (velocity) {
      items.push({
        label: 'Momentum',
        value: `${formatVelocity(velocity.upvotesPerHour)}/h upvotes • ${formatVelocity(velocity.commentsPerHour)}/h comments`,
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
  }

  function buildSelectedPostNextAction({ selectedPost, opportunity, score }) {
    if (!selectedPost) return '';
    const recommended = opportunity?.action?.recommended || '';
    if (recommended === 'reply_now') return 'Recommended action: reply now while the thread is still active.';
    if (recommended === 'dm_if_possible') return 'Recommended action: consider direct outreach if the thread context allows it.';
    if (recommended === 'save_for_followup') return 'Recommended action: save for follow-up and revisit when you can engage well.';
    if (recommended === 'research') return 'Recommended action: use this as market research or messaging input.';
    if (recommended === 'ignore') return 'Recommended action: ignore unless the thread evolves.';
    if (score >= 4) return 'High-priority thread. Open it now and decide whether to reply, DM, or save it.';
    if (score >= 3) return 'Worth a quick review. Check the thread for clear intent or follow-up context.';
    return 'Lower-confidence match. Keep it in view only if the discussion fits your goals.';
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
    return h('ul', { role: 'list', className: 'list-none divide-y divide-zinc-200 dark:divide-zinc-700 bg-zinc-50 dark:bg-zinc-900' },
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
        const borderClass = isSelected
          ? 'border-l-4 border-[#0284C7]'
          : isHighlyRelevant
            ? 'border-l-4 border-emerald-500'
            : '';
        const bgClass = isSelected
          ? 'bg-white dark:bg-zinc-800'
          : isVeryHighRelevant
            ? 'bg-emerald-50/70 dark:bg-emerald-950/30'
            : 'bg-zinc-50 dark:bg-zinc-900';

        return h('li', {
          key: post.id,
          className: `group relative w-full text-left px-4 py-3.5 hover:bg-white dark:hover:bg-zinc-800 transition-colors ${bgClass} ${borderClass}`,
          onMouseEnter: () => handlePostHoverStart(post),
          onMouseLeave: handlePostHoverEnd,
        },
        h('button', {
          onClick: () => onSelectPost(post),
          className: 'w-full text-left',
        },
        h('div', { className: 'flex gap-3' },
          post.thumbnail && post.thumbnail !== 'self' && post.thumbnail !== 'default' && post.thumbnail !== 'nsfw' && h('img', {
            src: post.thumbnail,
            alt: '',
            className: 'w-16 h-16 object-cover rounded-lg shrink-0 bg-zinc-200 dark:bg-zinc-700',
          }),
          h('div', { className: 'flex-1 min-w-0' },
            h('div', { className: 'flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 mb-1.5 flex-wrap' },
              h('span', null, `r/${post.subreddit}`),
              flair && h('span', {
                className: 'px-1.5 py-0.5 rounded-full text-[10px] font-medium',
                style: { backgroundColor: flairBg, color: flairTextColor },
              }, flair),
              h('span', null, '•'),
              h('span', { title: absoluteDate(post.created_utc) }, timeAgo(post.created_utc)),
              opportunityType && h('span', {
                className: 'px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 capitalize',
              }, opportunityType),
              recommendedAction && h('span', {
                className: 'px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 capitalize',
              }, recommendedAction),
              isSpiking && h('span', {
                className: 'px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-200',
              }, 'Spiking'),
              h('span', { className: 'inline-flex items-center gap-1 text-[10px] text-zinc-500 dark:text-zinc-400' },
                renderGlyph('M13 2L4 14h6l-1 8 9-12h-6l1-8z', 'w-3 h-3'),
                `${formatVelocity(upvotesPerHour)}/h`
              ),
              priorityScore !== null && h('span', {
                className: 'px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-zinc-900 text-white dark:bg-sky-500 dark:text-zinc-950',
                title: opportunity?.explanation?.summary
                  ? `Priority ${Math.round(priorityScore * 100)}/100 — ${opportunity.explanation.summary}`
                  : `Opportunity priority: ${Math.round(priorityScore * 100)}/100 (higher = better match for your goals)`,
              }, `P${Math.round(priorityScore * 100)}`),
              !hasPriority && relevanceScore !== undefined && relevanceScore !== null && h('span', {
                className: `px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${aiScoresStale ? 'opacity-50' : ''} ${
                  relevanceScore >= 5 ? 'bg-emerald-600 text-white' :
                  relevanceScore >= 4 ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-200' :
                  relevanceScore >= 3 ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-200' :
                  'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400'
                }`,
                title: aiScoresStale
                  ? `AI score ${relevanceScore}/5 (cached, may be stale — re-run ranking for fresh scores). ${relevanceMeta?.reason || ''}`
                  : relevanceMeta
                    ? `AI relevance: ${relevanceScore}/5 (0=reject, 5=perfect match) • ${relevanceMeta.confidence} confidence • ${relevanceMeta.reason}`
                    : `AI relevance: ${relevanceScore}/5 (0=reject, 5=perfect match)`,
              }, `${aiScoresStale ? '~' : ''}${aiScoreLabel(relevanceScore)} (${relevanceScore}/5)`)
            ),
            h('h3', { className: 'text-sm font-semibold text-zinc-900 dark:text-white leading-snug line-clamp-2' }, post.title),
            showAiReasons && h('p', { className: 'text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1 mt-0.5' },
              opportunity?.explanation?.summary || buildWhyLine({
                post,
                relevanceMeta,
                upvotesPerHour,
                commentsPerHour,
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
            onClick: (event) => { event.stopPropagation(); setActivePostMenu(activePostMenu === post.id ? null : post.id); },
            className: 'p-2 rounded-lg bg-white dark:bg-zinc-700 shadow-sm border border-zinc-200 dark:border-zinc-600 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-600 transition-colors',
          },
          h('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
            h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z' })
          )),
          activePostMenu === post.id && h('div', {
            className: 'absolute right-0 mt-1 w-40 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700 py-1 z-20 animate-fadeIn',
            onClick: (event) => event.stopPropagation(),
          },
          h('button', {
            onClick: () => { window.open(post.reddit_url || post.external_url, '_blank'); setActivePostMenu(null); },
            className: 'w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2',
          },
          h('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
            h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14' })
          ),
          'Open in Reddit'),
          h('button', {
            onClick: () => handleCopyLink(post),
            className: 'w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2',
          },
          h('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
            h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3' })
          ),
          'Copy link'),
          h('button', {
            onClick: () => handleHidePost(post.id),
            className: 'w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2',
          },
          h('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
            h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21' })
          ),
          'Hide post'))
        ));
      }),
      visiblePosts.length > postPageLimit && h('li', { className: 'flex items-center justify-center py-6 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900' },
        h('button', {
          onClick: () => setPostPageLimit((prev) => prev + 150),
          className: 'px-5 py-2 rounded-lg text-sm font-medium border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900',
        }, `Load ${Math.min(150, visiblePosts.length - postPageLimit)} more posts  (${postPageLimit} of ${visiblePosts.length} shown)`)
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

    return h('aside', { className: `w-96 bg-white dark:bg-zinc-800 flex-col shrink-0 ${mobileView === 'detail' ? 'flex' : 'hidden lg:flex'}` },
      h('div', { className: 'p-3 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between' },
        h('div', { className: 'flex items-center gap-2' },
          h('button', {
            onClick: () => setMobileView('posts'),
            'aria-label': 'Back to posts',
            className: 'lg:hidden p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 transition-colors',
            title: 'Back to posts',
          }, h('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', 'aria-hidden': 'true' },
            h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M15 19l-7-7 7-7' })
          )),
          h('span', { className: 'text-[11px] font-mono font-medium uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400' }, 'Post Detail')
        ),
        h('button', {
          onClick: () => setDetailCollapsed(true),
          'aria-label': 'Collapse detail pane',
          className: 'hidden lg:block p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 transition-colors',
          title: 'Collapse detail pane',
        }, h('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', 'aria-hidden': 'true' },
          h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M13 5l7 7-7 7M5 5l7 7-7 7' })
        ))
      ),
      h('div', { className: 'flex-1 overflow-auto scrollbar-thin p-4' },
        !selectedPost
          ? h('div', { className: 'flex flex-col items-center justify-center h-full gap-3 text-center px-6' },
              h('div', { className: 'w-14 h-14 rounded-2xl bg-zinc-50 dark:bg-zinc-700/50 border border-zinc-200 dark:border-zinc-600 flex items-center justify-center' },
                h('svg', { className: 'w-6 h-6 text-zinc-400 dark:text-zinc-500', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                  h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 1.5, d: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' })
                )
              ),
              h('div', null,
                h('p', { className: 'text-sm font-medium text-zinc-600 dark:text-zinc-300' }, 'No post selected'),
                h('p', { className: 'text-xs text-zinc-400 dark:text-zinc-500 mt-1' }, 'Click any post from the list to see details here.')
              )
            )
          : (() => {
              const detailOpportunity = getOpportunityForPost(selectedPost.id);
              const detailType = detailOpportunity?.classification?.type;
              const detailAction = detailOpportunity?.action?.recommended;
              const detailRelevanceScore = postScoreProxies.get(String(selectedPost.id));
              const detailRelevanceMeta = postScoreMetadata.get(String(selectedPost.id));
              const detailPriority = getPriorityScore(selectedPost.id);

              return h('article', { className: 'space-y-4' },
                h('div', { className: 'flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 flex-wrap' },
                  h('span', { className: 'px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-medium text-xs' }, `r/${selectedPost.subreddit}`),
                  detailType && h('span', { className: 'px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 font-medium text-[11px] capitalize' }, formatOpportunityLabel(detailType)),
                  detailAction && h('span', { className: 'px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 font-medium text-[11px] capitalize' }, formatOpportunityLabel(detailAction)),
                  selectedPost.link_flair_text && h('span', {
                    className: 'px-1.5 py-0.5 rounded-full text-[10px] font-medium',
                    style: {
                      backgroundColor: selectedPost.link_flair_background_color || '#e4e4e7',
                      color: selectedPost.link_flair_text_color === 'light' ? '#fff' : '#18181b',
                    },
                  }, selectedPost.link_flair_text),
                  h('span', { title: absoluteDate(selectedPost.created_utc) }, timeAgo(selectedPost.created_utc))
                ),
                h('h2', { className: 'text-lg font-bold text-zinc-900 dark:text-white leading-snug' }, selectedPost.title),
                (detailPriority !== null || (detailRelevanceScore !== undefined && detailRelevanceScore !== null)) && h('div', {
                  className: 'flex items-center gap-2 py-1 flex-wrap',
                  title: detailOpportunity?.explanation?.summary || (detailRelevanceMeta ? `${detailRelevanceMeta.confidence} confidence • ${detailRelevanceMeta.reason}` : (detailPriority !== null ? `Opportunity priority ${Math.round(detailPriority * 100)}/100` : `Opportunity score: ${detailRelevanceScore}/5`)),
                },
                  detailPriority !== null && h('span', {
                    className: 'px-2 py-0.5 rounded text-xs font-bold font-mono bg-zinc-900 text-white dark:bg-sky-500 dark:text-zinc-950',
                    title: detailOpportunity?.explanation?.summary
                      ? `Priority ${Math.round(detailPriority * 100)}/100 — ${detailOpportunity.explanation.summary}`
                      : `Opportunity priority: ${Math.round(detailPriority * 100)}/100 — how well this post matches your goals (0=no match, 100=perfect)`,
                  }, `Priority ${Math.round(detailPriority * 100)}/100`),
                  detailPriority === null && h('span', {
                    className: `px-2 py-0.5 rounded text-xs font-bold font-mono shadow-sm ${aiScoresStale ? 'opacity-50' : ''} ${
                      detailRelevanceScore >= 5 ? 'bg-emerald-600 text-white ring-2 ring-emerald-300 dark:ring-emerald-400/30' :
                      detailRelevanceScore >= 4 ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-200' :
                      detailRelevanceScore >= 3 ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-200' :
                      'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400'
                    }`,
                    title: aiScoresStale
                      ? `AI relevance ${detailRelevanceScore}/5 — cached scores (may be outdated). Re-run ranking for fresh results.`
                      : `AI relevance: ${detailRelevanceScore}/5 (0=reject, 5=perfect match for your goals)`,
                  }, `${aiScoresStale ? '~' : ''}${aiScoreLabel(detailRelevanceScore)} (${detailRelevanceScore}/5)`),
                  detailPriority === null && h('div', { className: 'w-16 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden' },
                    h('div', {
                      className: `h-full rounded-full transition-all ${
                        detailRelevanceScore >= 5 ? 'bg-emerald-600' :
                        detailRelevanceScore >= 4 ? 'bg-emerald-500 dark:bg-emerald-400' :
                        detailRelevanceScore >= 3 ? 'bg-amber-500 dark:bg-amber-400' :
                        'bg-zinc-400 dark:bg-zinc-500'
                      }`,
                      style: { width: `${Math.min(100, Math.max(0, (detailRelevanceScore / 5) * 100))}%` },
                    })
                  ),
                  showAiReasons && (detailOpportunity?.explanation?.summary || detailRelevanceMeta?.reason) && h('span', {
                    className: 'text-xs text-zinc-600 dark:text-zinc-400 line-clamp-1',
                  }, detailOpportunity?.explanation?.summary || detailRelevanceMeta.reason)
                ),
                h('section', { className: 'sticky top-4 z-10 rounded-xl border border-sky-200/80 bg-sky-50/90 p-3 backdrop-blur dark:border-[#0284C7]/25 dark:bg-[#0284C7]/10' },
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
                      className: 'shrink-0 rounded-lg border border-sky-200 px-2.5 py-1 text-xs font-medium text-[#0369A1] hover:bg-sky-100 dark:border-[#0284C7]/30 dark:text-sky-300 dark:hover:bg-[#0284C7]/20 transition-colors',
                    }, 'Keep visible')
                  ),
                  h('div', { className: 'mt-3 space-y-2' },
                    selectedPostWhyItems.map((item) =>
                      h('div', { key: item.label, className: 'rounded-lg bg-white/80 px-3 py-2 dark:bg-zinc-900/40' },
                        h('p', { className: 'text-[11px] font-mono uppercase tracking-wide text-zinc-500 dark:text-zinc-400' }, item.label),
                        h('p', { className: 'mt-1 text-sm text-zinc-700 dark:text-zinc-200' }, item.value)
                      )
                    )
                  ),
                  h('div', { className: 'mt-3 flex flex-wrap items-center gap-2' },
                    h('button', {
                      type: 'button',
                      onClick: () => handleCopyLink(selectedPost),
                      className: 'inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-700/50 dark:text-zinc-200 dark:hover:bg-zinc-700/70 transition-colors',
                    },
                      renderGlyph('M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3', 'w-3.5 h-3.5'),
                      'Copy link'
                    ),
                    h('button', {
                      type: 'button',
                      onClick: () => handleHidePost(selectedPost.id),
                      className: 'inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-700/50 dark:text-zinc-200 dark:hover:bg-zinc-700/70 transition-colors',
                    },
                      renderGlyph('M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21', 'w-3.5 h-3.5'),
                      'Hide post'
                    )
                  )
                ),
                h('div', { className: 'flex items-center gap-3 text-sm' },
                  h('span', { className: 'inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium' },
                    renderGlyph('M7 14l5-5 5 5', 'w-3.5 h-3.5'), selectedPost.score),
                  h('span', { className: 'inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-medium' },
                    renderGlyph('M8 10h8M8 14h5m-9 7l2.5-2.5H19a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v11a2 2 0 002 2h1.5L4 21z', 'w-3.5 h-3.5'), selectedPost.num_comments),
                  h('span', { className: 'text-zinc-500 dark:text-zinc-400' }, `u/${selectedPost.author}`)
                ),
                h('a', {
                  href: selectedPost.reddit_url || selectedPost.external_url,
                  target: '_blank',
                  rel: 'noreferrer',
                  className: 'inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 dark:bg-[#0284C7] text-white text-sm font-medium hover:bg-zinc-800 dark:hover:bg-[#0369A1] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900',
                },
                  'Open on Reddit',
                  h('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                    h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14' })
                  )
                ),
                h('div', { className: 'border-t border-zinc-200 dark:border-zinc-700 pt-4' },
                  renderBody(selectedPost)
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
