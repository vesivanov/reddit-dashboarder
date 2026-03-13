(function initDashboardShellView(globalScope) {
  function renderMobileBottomNav({ h, mobileView, setMobileView }) {
    return h('nav', { className: 'lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-zinc-800 border-t border-zinc-200 dark:border-zinc-700 px-4 py-2 flex items-center justify-around z-40' },
      h('button', {
        onClick: () => setMobileView('subs'),
        className: `flex flex-col items-center gap-1 px-4 py-1 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900 ${mobileView === 'subs' ? 'text-[#0284C7] dark:text-sky-400' : 'text-zinc-500 dark:text-zinc-400'}`,
      },
        h('svg', { className: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
          h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' })
        ),
        h('span', { className: 'text-xs font-medium' }, 'Subreddits')
      ),
      h('button', {
        onClick: () => setMobileView('posts'),
        className: `flex flex-col items-center gap-1 px-4 py-1 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900 ${mobileView === 'posts' ? 'text-[#0284C7] dark:text-sky-400' : 'text-zinc-500 dark:text-zinc-400'}`,
      },
        h('svg', { className: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
          h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M4 6h16M4 10h16M4 14h16M4 18h16' })
        ),
        h('span', { className: 'text-xs font-medium' }, 'Posts')
      ),
      h('button', {
        onClick: () => setMobileView('detail'),
        className: `flex flex-col items-center gap-1 px-4 py-1 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900 ${mobileView === 'detail' ? 'text-[#0284C7] dark:text-sky-400' : 'text-zinc-500 dark:text-zinc-400'}`,
      },
        h('svg', { className: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
          h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' })
        ),
        h('span', { className: 'text-xs font-medium' }, 'Detail')
      )
    );
  }

  function renderAddSubredditModal({
    h,
    addSubOpen,
    setAddSubOpen,
    addSubInputRef,
    addSubInput,
    setAddSubInput,
    POPULAR_SUBREDDITS,
    subs,
    handleAddSub,
    handleAddSubSubmit,
  }) {
    if (!addSubOpen) return null;

    return h('div', { className: 'fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4', onClick: () => setAddSubOpen(false) },
      h('div', {
        className: 'w-full max-w-md bg-white dark:bg-zinc-800 rounded-xl shadow-xl',
        onClick: (event) => event.stopPropagation(),
      },
        h('div', { className: 'p-4 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between' },
          h('h3', { className: 'font-semibold text-zinc-900 dark:text-white' }, 'Add Subreddits'),
          h('button', {
            onClick: () => setAddSubOpen(false),
            className: 'p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 transition-colors',
          }, h('svg', { className: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
            h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M6 18L18 6M6 6l12 12' })
          ))
        ),
        h('div', { className: 'p-4 space-y-4' },
          h('div', null,
            h('label', { className: 'block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5' }, 'Subreddit names'),
            h('textarea', {
              ref: addSubInputRef,
              value: addSubInput,
              onChange: (event) => setAddSubInput(event.target.value),
              placeholder: 'programming, webdev, javascript...',
              className: 'w-full px-3 py-2 border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0284C7] focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-900 focus:border-transparent',
              rows: 3,
            }),
            h('p', { className: 'mt-1 text-xs text-zinc-500 dark:text-zinc-400' }, 'Separate with commas or new lines')
          ),
          h('div', null,
            h('p', { className: 'font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500 mb-2' }, 'Popular'),
            h('div', { className: 'flex flex-wrap gap-1.5' },
              POPULAR_SUBREDDITS.slice(0, 10).map((sub) =>
                h('button', {
                  key: sub,
                  onClick: () => { handleAddSub(sub); setAddSubOpen(false); },
                  disabled: subs.some((saved) => saved.toLowerCase() === sub.toLowerCase()),
                  className: 'px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors',
                }, sub)
              )
            )
          )
        ),
        h('div', { className: 'p-4 border-t border-zinc-200 dark:border-zinc-700 flex justify-end gap-2' },
          h('button', {
            onClick: () => setAddSubOpen(false),
            className: 'px-4 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors',
          }, 'Cancel'),
          h('button', {
            onClick: handleAddSubSubmit,
            disabled: !addSubInput.trim(),
            className: 'px-4 py-2 rounded-lg text-sm font-medium bg-zinc-900 dark:bg-[#0284C7] text-white hover:bg-zinc-800 dark:hover:bg-[#0369A1] disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900',
          }, 'Add')
        )
      )
    );
  }

  globalScope.RDDShellView = {
    renderMobileBottomNav,
    renderAddSubredditModal,
  };
})(typeof window !== 'undefined' ? window : globalThis);
