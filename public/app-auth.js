(function initDashboardAuthModule() {
  const THEME_PREFERENCE_KEY = 'dashboard_theme_preference';
  window.RDDAppAuth = {
    createAppWithAuth({ App, h, useState, useEffect }) {
      function LoginPage({ showPreview = true }) {
        const [isDark, setIsDark] = useState(() => {
          if (typeof window !== 'undefined') {
            const savedPreference = localStorage.getItem(THEME_PREFERENCE_KEY);
            if (savedPreference === 'dark') return true;
            if (savedPreference === 'light') return false;
          }
          return false;
        });

        useEffect(() => {
          if (isDark) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
          localStorage.setItem(THEME_PREFERENCE_KEY, isDark ? 'dark' : 'light');
          localStorage.setItem('dashboard_dark_mode', isDark ? '1' : '0');
          localStorage.setItem('theme', isDark ? 'dark' : 'light');
        }, [isDark]);

        const handleLogin = () => {
          window.location.href = '/api/auth/start';
        };

        return h('div', { className: 'relative min-h-screen' },
          showPreview && h('div', { className: 'dashboard-preview' }, h(App)),
          h('div', { className: 'login-overlay flex items-center justify-center p-4' },
            h('div', { className: 'w-full max-w-md animate-fadeIn' },
              h('div', { className: 'glass rounded-xl p-8 text-center space-y-6' },
                h('div', { className: 'flex justify-center' },
                  h('div', { className: 'w-20 h-20 bg-gradient-to-br from-[#0284C7] to-[#075985] rounded-2xl flex items-center justify-center shadow-lg' },
                    h('svg', { className: 'w-10 h-10 text-white', fill: 'currentColor', viewBox: '0 0 24 24' },
                      h('path', { d: 'M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z' })
                    )
                  )
                ),
                h('div', null,
                  h('h1', { className: 'text-3xl font-bold text-zinc-900 dark:text-zinc-100' }, 'Reddit Dashboard'),
                  h('p', { className: 'mt-2 text-base text-zinc-600 dark:text-zinc-400' }, 'Browse your favorite subreddits with AI-powered insights')
                ),
                h('div', { className: 'space-y-2 text-left' },
                  h('div', { className: 'flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300' }, h('div', { className: 'w-1.5 h-1.5 rounded-full bg-[#0284C7]' }), h('span', null, 'AI-powered post ranking')),
                  h('div', { className: 'flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300' }, h('div', { className: 'w-1.5 h-1.5 rounded-full bg-[#0284C7]' }), h('span', null, 'Multi-subreddit browsing')),
                  h('div', { className: 'flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300' }, h('div', { className: 'w-1.5 h-1.5 rounded-full bg-[#0284C7]' }), h('span', null, 'Advanced filtering & sorting'))
                ),
                h('button', {
                  onClick: handleLogin,
                  className: 'w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold leading-5 transition-all duration-150 bg-[#0284C7] text-white hover:bg-[#0369A1] hover:shadow-lg active:bg-[#075985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900'
                },
                  h('svg', { className: 'w-5 h-5', fill: 'currentColor', viewBox: '0 0 24 24' },
                    h('path', { d: 'M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z' })
                  ),
                  'Sign in with Reddit'
                ),
                h('div', { className: 'flex items-center gap-3' },
                  h('div', { className: 'flex-1 border-t border-zinc-300 dark:border-zinc-600' }),
                  h('div', { className: 'flex-1 border-t border-zinc-300 dark:border-zinc-600' })
                ),
                h('button', {
                  onClick: () => setIsDark(!isDark),
                  className: 'text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors inline-flex items-center gap-2'
                },
                  h('span', null, isDark ? '☀️' : '🌙'),
                  h('span', null, isDark ? 'Light Mode' : 'Dark Mode')
                )
              )
            )
          )
        );
      }

      function AppWithAuth() {
        const [authState, setAuthState] = useState({ loading: true, authenticated: false });

        useEffect(() => {
          fetch('/api/auth/status')
            .then(res => res.json())
            .then(data => {
              setAuthState({ loading: false, authenticated: data.authenticated });
            })
            .catch(err => {
              console.error('Auth check failed:', err);
              setAuthState({ loading: false, authenticated: false });
            });
        }, []);

        if (authState.loading) {
          return h('div', { className: 'relative min-h-screen' },
            h('div', { className: 'dashboard-preview' }, h(App)),
            h('div', { className: 'login-overlay flex items-center justify-center' },
              h('div', { className: 'glass rounded-xl p-8' },
                h('div', { className: 'text-center' },
                  h('div', { className: 'w-16 h-16 bg-gradient-to-br from-[#0284C7] to-[#075985] rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse' },
                    h('svg', { className: 'w-8 h-8 text-white', fill: 'currentColor', viewBox: '0 0 24 24' },
                      h('path', { d: 'M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z' })
                    )
                  ),
                  h('p', { className: 'text-zinc-700 dark:text-zinc-300 font-medium' }, 'Loading...')
                )
              )
            )
          );
        }

        if (!authState.authenticated) {
          return h(LoginPage, { showPreview: true });
        }

        return h(App);
      }

      return AppWithAuth;
    },
  };
})();
