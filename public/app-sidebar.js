(function initDashboardSidebarView(globalScope) {

  function getSubDotColor(sub) {
    const colors = ['#F59E0B','#10B981','#60A5FA','#A78BFA','#F87171','#34D399','#C084FC'];
    let hash = 0;
    const s = String(sub || '');
    for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) & 0xFFFF;
    return colors[hash % colors.length];
  }

  function renderSidebar({
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
  }) {
    const isAllSelected = selectedSub === 'ALL';

    function renderSubList(compact) {
      if (subs.length === 0) {
        return h('div', { className: 'p-3' },
          h('p', { className: 'text-[11px] text-zinc-500 dark:text-zinc-600 mb-3' }, 'No subreddits yet'),
          h('div', { className: 'space-y-1' },
            STARTER_PACKS.map((pack) =>
              h('button', {
                key: pack.id,
                onClick: () => handleApplyStarterPack(pack),
                className: 'w-full px-2.5 py-2 rounded text-left hover:bg-white/[0.05] dark:hover:bg-white/[0.05] hover:bg-zinc-100 transition-colors',
              },
                h('div', { className: 'flex items-center gap-2' },
                  renderStarterPackIcon(pack.id),
                  h('div', null,
                    h('div', { className: 'text-[11px] font-medium text-zinc-400 dark:text-zinc-400' }, pack.label),
                    h('div', { className: 'text-[10px] text-zinc-500 dark:text-zinc-600' }, `${pack.subs.length} subs`)
                  )
                )
              )
            )
          )
        );
      }

      const allRow = h('button', {
        key: 'all',
        onClick: () => setSelectedSub('ALL'),
        className: `relative w-full flex items-center justify-between px-3 ${compact ? 'py-1.5' : 'py-2'} text-left transition-colors ${
          isAllSelected
            ? 'text-amber-400 dark:text-amber-400'
            : 'text-zinc-500 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100/60 dark:hover:bg-white/[0.03]'
        }`,
      },
        isAllSelected && h('div', { className: 'absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-full bg-amber-400' }),
        h('span', { className: 'text-[11px] font-medium pl-1' }, 'All subreddits'),
        h('span', { className: 'text-[10px] tabular-nums text-zinc-500 dark:text-zinc-600' }, allPosts.length)
      );

      const subRows = subs.map((sub) => {
        const isSelected = selectedSub.toLowerCase() === sub.toLowerCase();
        const postCount = allPosts.filter((p) => p.subreddit?.toLowerCase() === sub.toLowerCase()).length;
        const dotColor = getSubDotColor(sub);

        return h('div', {
          key: sub,
          className: 'group relative',
        },
          h('button', {
            onClick: () => setSelectedSub(sub),
            className: `relative w-full flex items-center gap-2 px-3 ${compact ? 'py-1.5' : 'py-2'} text-left transition-colors ${
              isSelected
                ? 'text-amber-400 dark:text-amber-400'
                : 'text-zinc-500 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100/60 dark:hover:bg-white/[0.03]'
            }`,
          },
            isSelected && h('div', { className: 'absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-full bg-amber-400' }),
            h('div', {
              className: 'w-1.5 h-1.5 rounded-full shrink-0 ml-1 transition-all',
              style: { backgroundColor: isSelected ? dotColor : 'currentColor', opacity: isSelected ? 1 : 0.3 },
            }),
            h('span', { className: 'flex-1 text-[11px] font-medium truncate' }, sub),
            h('span', { className: 'text-[10px] tabular-nums text-zinc-500 dark:text-zinc-600 group-hover:opacity-0 transition-opacity shrink-0' }, postCount),
            h('button', {
              onClick: (e) => { e.stopPropagation(); handleRemoveSub(sub); },
              className: 'absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-white/[0.1] text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-all',
              title: `Remove r/${sub}`,
            }, h('svg', { className: 'w-2.5 h-2.5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
              h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M6 18L18 6M6 6l12 12' })
            ))
          )
        );
      });

      return [allRow, ...subRows];
    }

    // ── Desktop: compact text list ──────────────────────────────────────
    const desktopSidebar = h('aside', {
      key: 'desktop-sidebar',
      className: 'hidden lg:flex w-44 shrink-0 flex-col bg-zinc-900 dark:bg-zinc-900 border-r border-zinc-700 dark:border-zinc-700',
      'aria-label': 'Subreddits',
    },
      h('div', { className: 'px-3 py-2 border-b border-zinc-700 flex items-center justify-between shrink-0' },
        h('span', { className: 'font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600' }, 'Subreddits'),
        h('button', {
          onClick: () => { setAddSubOpen(true); setTimeout(() => addSubInputRef.current?.focus(), 50); },
          'aria-label': 'Add subreddit',
          title: 'Add subreddit',
          className: 'p-1 rounded hover:bg-white/[0.08] text-zinc-600 hover:text-zinc-300 transition-colors',
        }, h('svg', { className: 'w-3.5 h-3.5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
          h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M12 4v16m8-8H4' })
        ))
      ),
      h('div', { className: 'flex-1 overflow-auto scrollbar-none py-1' },
        renderSubList(true)
      )
    );

    // ── Mobile: full list ──────────────────────────────────────────────
    const mobileList = h('aside', {
      key: 'mobile-list',
      className: `lg:hidden flex-col bg-zinc-900 border-r border-zinc-700 ${mobileView === 'subs' ? 'flex' : 'hidden'}`,
      style: { width: '100%' },
    },
      h('div', { className: 'px-3 py-2.5 border-b border-zinc-700 flex items-center justify-between shrink-0' },
        h('span', { className: 'font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600' }, 'Subreddits'),
        h('button', {
          onClick: () => { setAddSubOpen(true); setTimeout(() => addSubInputRef.current?.focus(), 50); },
          'aria-label': 'Add subreddit',
          className: 'p-1.5 rounded hover:bg-white/[0.06] text-zinc-500 hover:text-zinc-200 transition-colors',
          title: 'Add subreddit',
        }, h('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
          h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M12 4v16m8-8H4' })
        ))
      ),
      h('div', { className: 'flex-1 overflow-auto scrollbar-thin py-1' },
        renderSubList(false)
      )
    );

    return [desktopSidebar, mobileList];
  }

  globalScope.RDDSidebarView = { renderSidebar };
})(typeof window !== 'undefined' ? window : globalThis);
