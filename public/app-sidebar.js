(function initDashboardSidebarView(globalScope) {
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
    return h('aside', { className: `w-52 bg-zinc-50 dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-700 flex-col shrink-0 ${mobileView === 'subs' ? 'flex' : 'hidden lg:flex'}` },
      h('div', { className: 'p-3 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between' },
        h('span', { className: 'font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500' }, 'Subreddits'),
        h('button', {
          onClick: () => { setAddSubOpen(true); setTimeout(() => addSubInputRef.current?.focus(), 50); },
          'aria-label': 'Add subreddit',
          className: 'p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900',
          title: 'Add subreddit',
        }, h('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', 'aria-hidden': 'true' },
          h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M12 4v16m8-8H4' })
        ))
      ),
      h('div', { className: 'flex-1 overflow-auto scrollbar-thin p-2 space-y-1' },
        subs.length === 0
          ? h('div', { className: 'p-3 text-center' },
              h('div', { className: 'w-10 h-10 mx-auto mb-3 rounded-xl bg-[#D97706]/8 dark:bg-[#D97706]/12 border border-[#D97706]/20 dark:border-[#D97706]/25 flex items-center justify-center' },
                h('svg', { className: 'w-5 h-5 text-[#D97706] dark:text-amber-400', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                  h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 1.5, d: 'M12 4v16m8-8H4' })
                )
              ),
              h('p', { className: 'text-sm font-semibold text-zinc-900 dark:text-white mb-1' }, 'Add subreddits'),
              h('p', { className: 'text-xs text-zinc-500 dark:text-zinc-400 mb-3' }, 'Pick a starter pack or add custom subs.'),
              h('div', { className: 'space-y-2' },
                STARTER_PACKS.map((pack) =>
                  h('button', {
                    key: pack.id,
                    onClick: () => handleApplyStarterPack(pack),
                    className: 'w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-white dark:hover:bg-zinc-800 text-left text-sm transition-colors',
                  },
                    h('span', { className: 'flex items-center gap-2.5' },
                      renderStarterPackIcon(pack.id),
                      h('span', { className: 'min-w-0' },
                        h('span', { className: 'block font-medium text-zinc-700 dark:text-zinc-300' }, pack.label),
                        h('span', { className: 'block text-xs text-zinc-500 dark:text-zinc-400' }, `${pack.subs.length} starter subreddits`)
                      )
                    )
                  )
                )
              ),
              h('button', {
                onClick: () => { setAddSubOpen(true); setTimeout(() => addSubInputRef.current?.focus(), 50); },
                className: 'mt-3 text-xs text-[#D97706] dark:text-amber-400 hover:text-[#B45309] dark:hover:text-amber-300 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900',
              }, 'Add custom subreddits')
            )
          : [
              h('button', {
                key: 'all',
                onClick: () => setSelectedSub('ALL'),
                className: `w-full px-3 py-2 rounded-lg text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900 ${selectedSub === 'ALL' ? 'bg-white text-zinc-900 ring-1 ring-zinc-200 shadow-sm dark:bg-zinc-800 dark:text-amber-200 dark:ring-zinc-700' : 'hover:bg-white dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'}`,
              },
                h('div', { className: 'flex items-center justify-between' },
                  h('span', null, 'All'),
                  h('span', { className: 'text-xs text-zinc-400 dark:text-zinc-500' }, allPosts.length)
                )
              ),
              ...subs.map((sub) => {
                const postCount = allPosts.filter((post) => post.subreddit?.toLowerCase() === sub.toLowerCase()).length;
                const isSelected = selectedSub.toLowerCase() === sub.toLowerCase();
                const meta = subMetaMap.get(sub) || {};
                const coverageState = coverageStateBySub.get(String(sub || '').toLowerCase()) || null;

                return h('div', {
                  key: sub,
                  className: `group rounded-lg transition-colors ${isSelected ? 'bg-white ring-1 ring-zinc-200 shadow-sm dark:bg-zinc-800 dark:ring-zinc-700' : 'hover:bg-white dark:hover:bg-zinc-800'}`,
                },
                  h('button', {
                    onClick: () => setSelectedSub(sub),
                    className: 'w-full px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900',
                  },
                    h('div', { className: 'flex items-center justify-between' },
                      h('span', { className: `text-sm font-medium ${isSelected ? 'text-zinc-950 dark:text-amber-200' : 'text-zinc-700 dark:text-zinc-300'}` }, `r/${sub}`),
                      h('div', { className: 'flex items-center gap-2' },
                        h('span', { className: 'text-xs text-zinc-400 dark:text-zinc-500' }, postCount),
                        h('button', {
                          onClick: (event) => { event.stopPropagation(); handleRemoveSub(sub); },
                          'aria-label': `Remove r/${sub}`,
                          className: 'opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-600 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900',
                          title: `Remove r/${sub}`,
                        }, h('svg', { className: 'w-3 h-3', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', 'aria-hidden': 'true' },
                          h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M6 18L18 6M6 6l12 12' })
                        ))
                      )
                    ),
                    h('div', { className: 'mt-1 flex items-center gap-1.5 flex-wrap' },
                      meta.subscribers && h('div', { className: 'text-[11px] text-zinc-400 dark:text-zinc-500' }, `${formatSubs(meta.subscribers)} members`),
                      coverageState && renderCoveragePill('1d', Boolean(coverageState.complete_1d)),
                      coverageState && renderCoveragePill('3d', Boolean(coverageState.complete_3d)),
                      coverageState && renderCoveragePill('5d', Boolean(coverageState.complete_5d)),
                      coverageState?.status === 'cooldown' && h('span', { className: 'text-[10px] text-amber-600 dark:text-amber-400 font-medium' }, 'cooldown'),
                      coverageState?.status === 'capped' && h('span', { className: 'text-[10px] text-amber-600 dark:text-amber-400 font-medium' }, 'capped')
                    )
                  )
                );
              }),
            ]
      )
    );
  }

  globalScope.RDDSidebarView = {
    renderSidebar,
  };
})(typeof window !== 'undefined' ? window : globalThis);
