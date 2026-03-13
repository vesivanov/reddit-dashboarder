(function initDashboardSidebarView(globalScope) {

  function getSubColor(sub) {
    const palette = [
      { bg: 'rgba(120,53,15,0.85)',  text: '#FDE68A' },
      { bg: 'rgba(6,78,59,0.85)',    text: '#6EE7B7' },
      { bg: 'rgba(30,58,138,0.85)',  text: '#93C5FD' },
      { bg: 'rgba(76,29,149,0.85)', text: '#C4B5FD' },
      { bg: 'rgba(127,29,29,0.85)', text: '#FCA5A5' },
      { bg: 'rgba(19,78,74,0.85)',   text: '#5EEAD4' },
      { bg: 'rgba(88,28,135,0.85)', text: '#E9D5FF' },
    ];
    let hash = 0;
    const s = String(sub || '');
    for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) & 0xFFFF;
    return palette[hash % palette.length];
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

    // ── Desktop: icon rail (56px) ──────────────────────────────────────
    const desktopRail = h('aside', {
      key: 'desktop-rail',
      className: 'hidden lg:flex w-14 shrink-0 flex-col bg-zinc-900 border-r border-zinc-700',
      'aria-label': 'Subreddits',
    },
      h('div', { className: 'flex-1 overflow-auto scrollbar-none p-2 pt-3 flex flex-col items-center gap-1' },

        // ALL button
        h('button', {
          onClick: () => setSelectedSub('ALL'),
          title: `All subreddits (${allPosts.length})`,
          className: 'relative w-full flex justify-center items-center py-2 group',
        },
          isAllSelected && h('div', {
            className: 'absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-amber-400',
          }),
          h('div', {
            className: `w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
              isAllSelected
                ? 'bg-amber-500/20 ring-1 ring-amber-500/40'
                : 'bg-white/[0.06] group-hover:bg-white/[0.1]'
            }`,
          },
            h('svg', {
              className: `w-4 h-4 ${isAllSelected ? 'text-amber-400' : 'text-zinc-400 group-hover:text-zinc-200'}`,
              fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24',
            },
              h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M4 6h16M4 10h16M4 14h16M4 18h16' })
            )
          )
        ),

        // Divider
        subs.length > 0 && h('div', { className: 'w-6 h-px bg-white/[0.05] my-1 shrink-0' }),

        // Subreddit icons
        ...subs.map((sub) => {
          const isSelected = selectedSub.toLowerCase() === sub.toLowerCase();
          const postCount = allPosts.filter((p) => p.subreddit?.toLowerCase() === sub.toLowerCase()).length;
          const color = getSubColor(sub);
          const initial = (sub[0] || '?').toUpperCase();

          return h('button', {
            key: sub,
            onClick: () => setSelectedSub(sub),
            title: `r/${sub}  ·  ${postCount} posts`,
            className: 'relative w-full flex justify-center items-center py-1.5 group',
          },
            isSelected && h('div', {
              className: 'absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full bg-amber-400',
            }),
            h('div', {
              className: `w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold transition-all select-none ${
                isSelected ? 'ring-1 opacity-100' : 'opacity-50 group-hover:opacity-90'
              }`,
              style: {
                backgroundColor: color.bg,
                color: color.text,
                ...(isSelected ? { boxShadow: `0 0 0 1px ${color.text}40` } : {}),
              },
            }, initial)
          );
        })
      ),

      // Add button at bottom
      h('div', { className: 'p-2 pb-3 flex justify-center shrink-0' },
        h('button', {
          onClick: () => { setAddSubOpen(true); setTimeout(() => addSubInputRef.current?.focus(), 50); },
          'aria-label': 'Add subreddit',
          title: 'Add subreddit',
          className: 'w-9 h-9 rounded-xl flex items-center justify-center bg-white/[0.05] hover:bg-white/[0.10] text-zinc-500 hover:text-zinc-200 transition-all',
        },
          h('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
            h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M12 4v16m8-8H4' })
          )
        )
      )
    );

    // ── Mobile: full list ──────────────────────────────────────────────
    const mobileList = h('aside', {
      key: 'mobile-list',
      className: `lg:hidden flex-col bg-zinc-900 border-r border-zinc-700 ${mobileView === 'subs' ? 'flex' : 'hidden'}`,
      style: { width: '100%' },
    },
      h('div', { className: 'p-3 border-b border-zinc-700 flex items-center justify-between shrink-0' },
        h('span', { className: 'font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500' }, 'Subreddits'),
        h('button', {
          onClick: () => { setAddSubOpen(true); setTimeout(() => addSubInputRef.current?.focus(), 50); },
          'aria-label': 'Add subreddit',
          className: 'p-2 rounded-lg hover:bg-white/[0.06] text-zinc-500 hover:text-zinc-200 transition-colors',
          title: 'Add subreddit',
        }, h('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
          h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M12 4v16m8-8H4' })
        ))
      ),
      h('div', { className: 'flex-1 overflow-auto scrollbar-thin p-2 space-y-0.5' },
        subs.length === 0
          ? h('div', { className: 'p-4 text-center' },
              h('p', { className: 'text-sm text-zinc-500 mb-3' }, 'No subreddits yet'),
              h('div', { className: 'space-y-2' },
                STARTER_PACKS.map((pack) =>
                  h('button', {
                    key: pack.id,
                    onClick: () => handleApplyStarterPack(pack),
                    className: 'w-full px-3 py-2 rounded-lg border border-white/[0.07] hover:border-white/[0.12] hover:bg-white/[0.04] text-left text-sm transition-colors',
                  },
                    h('span', { className: 'flex items-center gap-2.5' },
                      renderStarterPackIcon(pack.id),
                      h('span', { className: 'min-w-0' },
                        h('span', { className: 'block font-medium text-zinc-300' }, pack.label),
                        h('span', { className: 'block text-xs text-zinc-500' }, `${pack.subs.length} subreddits`)
                      )
                    )
                  )
                )
              )
            )
          : [
              h('button', {
                key: 'all',
                onClick: () => setSelectedSub('ALL'),
                className: `w-full px-3 py-2 rounded-lg text-left text-sm font-medium transition-colors ${
                  isAllSelected
                    ? 'bg-amber-500/10 text-amber-300'
                    : 'text-zinc-400 hover:bg-white/[0.04]'
                }`,
              },
                h('div', { className: 'flex items-center justify-between' },
                  h('span', null, 'All subreddits'),
                  h('span', { className: 'text-xs text-zinc-600' }, allPosts.length)
                )
              ),
              ...subs.map((sub) => {
                const isSelected = selectedSub.toLowerCase() === sub.toLowerCase();
                const postCount = allPosts.filter((p) => p.subreddit?.toLowerCase() === sub.toLowerCase()).length;
                return h('div', {
                  key: sub,
                  className: `group rounded-lg transition-colors ${isSelected ? 'bg-amber-500/10' : 'hover:bg-white/[0.04]'}`,
                },
                  h('button', {
                    onClick: () => setSelectedSub(sub),
                    className: 'w-full px-3 py-2 text-left',
                  },
                    h('div', { className: 'flex items-center justify-between' },
                      h('span', { className: `text-sm font-medium ${isSelected ? 'text-amber-300' : 'text-zinc-400'}` }, `r/${sub}`),
                      h('div', { className: 'flex items-center gap-2' },
                        h('span', { className: 'text-xs text-zinc-600' }, postCount),
                        h('button', {
                          onClick: (e) => { e.stopPropagation(); handleRemoveSub(sub); },
                          className: 'opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/[0.1] text-zinc-500 hover:text-zinc-300 transition-all',
                          title: `Remove r/${sub}`,
                        }, h('svg', { className: 'w-3 h-3', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                          h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M6 18L18 6M6 6l12 12' })
                        ))
                      )
                    )
                  )
                );
              }),
            ]
      )
    );

    return [desktopRail, mobileList];
  }

  globalScope.RDDSidebarView = { renderSidebar };
})(typeof window !== 'undefined' ? window : globalThis);
