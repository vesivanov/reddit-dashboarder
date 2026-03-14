(function initDashboardOnboardingView(globalScope) {
  function renderOnboardingModal({
    h,
    onboardingOpen,
    closeOnboarding,
    onboardingCurrentStep,
    renderGlyph,
    onboardingSteps,
    onboardingStep,
    setOnboardingStep,
    subs,
    handleRemoveSub,
    onboardingSubInput,
    setOnboardingSubInput,
    handleOnboardingAddSubs,
    STARTER_PACKS,
    handleApplyStarterPack,
    renderStarterPackIcon,
    POPULAR_SUBREDDITS,
    handleAddSub,
    AI_PRESETS,
    applyPreset,
    aiPresetId,
    renderPresetIcon,
    truncateText,
    opportunityEngineEnabled,
    setOpportunityEngineEnabled,
    aiPresetSuggestion,
    setOpportunityBrief,
    opportunityBrief,
    hasOpportunityGoals,
    secureKeyStatus,
    selectedModelInfo,
    days,
    setDays,
    maxPages,
    setMaxPages,
    mode,
    setMode,
    autoRefreshEnabled,
    autoRefreshInterval,
    setAutoRefreshEnabled,
    setAutoRefreshInterval,
    AUTO_REFRESH_OPTIONS,
    onboardingCanContinue,
    completeOnboarding,
    loading,
    onSkip,
  }) {
    if (!onboardingOpen) return null;

    const dayOptions = [
      { value: 1, label: '1 day', hint: 'Fastest startup' },
      { value: 3, label: '3 days', hint: 'Balanced coverage' },
      { value: 5, label: '5 days', hint: 'Deeper history' },
    ];

    return h('div', { className: 'fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4', onClick: closeOnboarding },
      h('div', {
        className: 'w-full max-w-3xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-800',
        onClick: (event) => event.stopPropagation(),
      },
        h('div', { className: 'border-b border-zinc-200 px-5 py-4 dark:border-zinc-700' },
          h('div', { className: 'flex items-start justify-between gap-4' },
            h('div', null,
              h('p', { className: 'text-[11px] font-mono font-medium uppercase tracking-[0.18em] text-[#D97706] dark:text-amber-300' }, 'Quick Setup'),
              h('h2', { className: 'mt-1 text-2xl font-bold tracking-tight text-zinc-900 dark:text-white' }, onboardingCurrentStep.title),
              h('p', { className: 'mt-1 text-sm text-zinc-500 dark:text-zinc-400' }, onboardingCurrentStep.description)
            ),
            h('button', {
              type: 'button',
              onClick: closeOnboarding,
              className: 'rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200',
            }, renderGlyph('M6 18L18 6M6 6l12 12', 'w-5 h-5'))
          ),
          h('div', { className: 'mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4' },
            onboardingSteps.map((step, index) =>
              h('button', {
                key: step.id,
                type: 'button',
                onClick: () => setOnboardingStep(index),
                className: `rounded-xl border px-3 py-2 text-left transition-colors ${index === onboardingStep ? 'border-[#D97706] bg-amber-50 dark:border-[#D97706] dark:bg-[#D97706]/15' : 'border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-700/60'}`,
              },
                h('p', { className: `text-[11px] font-mono uppercase tracking-wide ${index === onboardingStep ? 'text-[#D97706] dark:text-amber-300' : 'text-zinc-400 dark:text-zinc-500'}` }, `Step ${index + 1}`),
                h('p', { className: `mt-1 text-sm font-medium ${index === onboardingStep ? 'text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-300'}` }, step.title)
              )
            )
          )
        ),
        h('div', { className: 'p-5' },
          onboardingCurrentStep.id === 'subs' && h('div', { className: 'space-y-5' },
            h('div', null,
              h('p', { className: 'text-sm font-medium text-zinc-900 dark:text-white' }, 'Selected subreddits'),
              h('p', { className: 'mt-1 text-sm text-zinc-500 dark:text-zinc-400' }, 'Pick 3 to 5 to start. You can change them later.'),
              h('div', { className: 'mt-3 flex min-h-12 flex-wrap gap-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-3 dark:border-zinc-600 dark:bg-zinc-900/40' },
                subs.length
                  ? subs.map((sub) =>
                      h('button', {
                        key: sub,
                        type: 'button',
                        onClick: () => handleRemoveSub(sub),
                        className: 'inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-[#D97706]',
                      }, `r/${sub}`, renderGlyph('M6 18L18 6M6 6l12 12', 'w-3 h-3'))
                    )
                  : h('p', { className: 'text-sm text-zinc-400 dark:text-zinc-500' }, 'No subreddits selected yet.')
              )
            ),
            h('div', { className: 'grid gap-5 lg:grid-cols-[1.1fr_0.9fr]' },
              h('div', { className: 'rounded-xl border border-zinc-200 p-4 dark:border-zinc-700' },
                h('p', { className: 'text-sm font-medium text-zinc-900 dark:text-white' }, 'Add your own list'),
                h('textarea', {
                  value: onboardingSubInput,
                  onChange: (event) => setOnboardingSubInput(event.target.value),
                  placeholder: 'programming, webdev, javascript',
                  rows: 4,
                  className: 'mt-3 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#D97706] dark:border-zinc-600 dark:bg-zinc-700 dark:text-white',
                }),
                h('div', { className: 'mt-3 flex items-center justify-between gap-3' },
                  h('p', { className: 'text-xs text-zinc-500 dark:text-zinc-400' }, 'Separate names with commas or new lines.'),
                  h('button', {
                    type: 'button',
                    onClick: handleOnboardingAddSubs,
                    disabled: !onboardingSubInput.trim(),
                    className: 'rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#D97706] dark:hover:bg-[#B45309]',
                  }, 'Add list')
                )
              ),
              h('div', { className: 'rounded-xl border border-zinc-200 p-4 dark:border-zinc-700' },
                h('p', { className: 'text-sm font-medium text-zinc-900 dark:text-white' }, 'Starter packs'),
                h('div', { className: 'mt-3 space-y-2' },
                  STARTER_PACKS.map((pack) =>
                    h('button', {
                      key: pack.id,
                      type: 'button',
                      onClick: () => handleApplyStarterPack(pack),
                      className: 'flex w-full items-center gap-3 rounded-xl border border-zinc-200 px-3 py-3 text-left transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-700/60',
                    },
                      renderStarterPackIcon(pack.id),
                      h('div', { className: 'min-w-0' },
                        h('p', { className: 'text-sm font-medium text-zinc-900 dark:text-white' }, pack.label),
                        h('p', { className: 'text-xs text-zinc-500 dark:text-zinc-400' }, pack.subs.map((sub) => `r/${sub}`).join(', '))
                      )
                    )
                  )
                )
              )
            ),
            h('div', null,
              h('p', { className: 'font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500' }, 'Popular'),
              h('div', { className: 'mt-2 flex flex-wrap gap-2' },
                POPULAR_SUBREDDITS.slice(0, 12).map((sub) =>
                  h('button', {
                    key: sub,
                    type: 'button',
                    onClick: () => handleAddSub(sub),
                    disabled: subs.some((saved) => saved.toLowerCase() === sub.toLowerCase()),
                    className: 'rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600',
                  }, `r/${sub}`)
                )
              )
            )
          ),
          onboardingCurrentStep.id === 'goal' && h('div', { className: 'space-y-5' },
            h('div', null,
              h('p', { className: 'text-sm font-medium text-zinc-900 dark:text-white' }, 'Preset'),
              h('div', { className: 'mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3' },
                AI_PRESETS.map((preset) =>
                  h('button', {
                    key: preset.id,
                    type: 'button',
                    onClick: () => applyPreset(preset),
                    className: `rounded-xl border p-4 text-left transition-colors ${aiPresetId === preset.id ? 'border-[#D97706] bg-amber-50 dark:border-[#D97706] dark:bg-[#D97706]/15' : 'border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-700/60'}`,
                  },
                    h('div', { className: 'flex items-center gap-2' },
                      renderPresetIcon(preset.id, aiPresetId === preset.id),
                      h('p', { className: 'text-sm font-semibold text-zinc-900 dark:text-white' }, preset.label)
                    ),
                    h('p', { className: 'mt-2 text-sm text-zinc-500 dark:text-zinc-400' }, truncateText(preset.goals, 110))
                  )
                )
              )
            ),
            h('div', { className: 'rounded-xl border border-zinc-200 p-4 dark:border-zinc-700' },
              h('div', { className: 'flex items-center justify-between gap-3' },
                h('div', null,
                  h('p', { className: 'text-sm font-medium text-zinc-900 dark:text-white' }, 'Opportunity brief'),
                  h('p', { className: 'mt-1 text-sm text-zinc-500 dark:text-zinc-400' }, opportunityEngineEnabled ? 'Describe the conversations and opportunities you want surfaced first.' : 'Optional if you plan to keep the engine off.')
                ),
                aiPresetSuggestion && aiPresetSuggestion.id !== aiPresetId && h('button', {
                  type: 'button',
                  onClick: () => applyPreset(aiPresetSuggestion),
                  className: 'rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-[#B45309] transition-colors hover:bg-amber-100 dark:border-[#D97706]/30 dark:bg-[#D97706]/15 dark:text-amber-300',
                }, `Use suggested: ${aiPresetSuggestion.label}`)
              ),
              h('textarea', {
                value: opportunityBrief,
                onChange: (event) => setOpportunityBrief(event.target.value),
                rows: 4,
                placeholder: 'I want to find high-intent posts from people actively asking for help.',
                className: 'mt-3 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#D97706] dark:border-zinc-600 dark:bg-zinc-700 dark:text-white',
              })
            )
          ),
          onboardingCurrentStep.id === 'ai' && h('div', { className: 'grid gap-4 md:grid-cols-2' },
            h('button', {
              type: 'button',
              onClick: () => setOpportunityEngineEnabled(false),
              className: `rounded-xl border p-5 text-left transition-colors ${!opportunityEngineEnabled ? 'border-[#D97706] bg-amber-50 dark:border-[#D97706] dark:bg-[#D97706]/15' : 'border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-700/60'}`,
            },
              h('p', { className: 'text-sm font-semibold text-zinc-900 dark:text-white' }, 'Manual scan'),
              h('p', { className: 'mt-2 text-sm text-zinc-500 dark:text-zinc-400' }, 'Browse Reddit posts with filters only. Best if you want a lightweight setup first.')
            ),
            h('button', {
              type: 'button',
              onClick: () => setOpportunityEngineEnabled(true),
              className: `rounded-xl border p-5 text-left transition-colors ${opportunityEngineEnabled ? 'border-[#D97706] bg-amber-50 dark:border-[#D97706] dark:bg-[#D97706]/15' : 'border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-700/60'}`,
            },
              h('p', { className: 'text-sm font-semibold text-zinc-900 dark:text-white' }, 'Opportunity engine'),
              h('p', { className: 'mt-2 text-sm text-zinc-500 dark:text-zinc-400' }, 'Rank the feed against your business profile so the strongest opportunities rise to the top.')
            ),
            opportunityEngineEnabled && h('div', { className: 'md:col-span-2 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700' },
              h('div', { className: 'flex flex-wrap items-start justify-between gap-3' },
                h('div', null,
                  h('p', { className: 'text-sm font-medium text-zinc-900 dark:text-white' }, 'Finish setup in Settings'),
                  h('p', { className: 'mt-1 text-sm text-zinc-500 dark:text-zinc-400' }, 'Use onboarding to define what to look for. Model choice, secure key storage, and advanced review controls stay in Settings.')
                ),
                selectedModelInfo && h('span', { className: 'rounded-full bg-zinc-100 px-3 py-1 text-xs font-mono text-zinc-600 dark:bg-zinc-700 dark:text-zinc-200' }, selectedModelInfo.name)
              ),
              h('div', { className: 'mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400' },
                h('span', { className: 'rounded-full border border-zinc-200 px-2.5 py-1 dark:border-zinc-700' }, secureKeyStatus.hasKey ? 'Secure key saved' : 'Using default access'),
                h('span', { className: 'rounded-full border border-zinc-200 px-2.5 py-1 dark:border-zinc-700' }, 'Advanced controls in Settings')
              )
            )
          ),
          onboardingCurrentStep.id === 'depth' && h('div', { className: 'grid gap-5 lg:grid-cols-[1fr_0.9fr]' },
            h('div', { className: 'rounded-xl border border-zinc-200 p-4 dark:border-zinc-700' },
              h('p', { className: 'text-sm font-medium text-zinc-900 dark:text-white' }, 'Refresh target'),
              h('p', { className: 'mt-1 text-sm text-zinc-500 dark:text-zinc-400' }, 'Pick how far back each refresh should try to cover before you choose fetch depth.'),
              h('div', { className: 'mt-3 grid grid-cols-3 gap-3' },
                dayOptions.map((option) =>
                  h('button', {
                    key: option.value,
                    type: 'button',
                    onClick: () => setDays(option.value),
                    className: `rounded-xl border px-3 py-3 text-left transition-colors ${days === option.value ? 'border-[#D97706] bg-amber-50 dark:border-[#D97706] dark:bg-[#D97706]/15' : 'border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-700/60'}`,
                  },
                    h('p', { className: 'text-sm font-semibold text-zinc-900 dark:text-white' }, option.label),
                    h('p', { className: 'mt-1 text-xs text-zinc-500 dark:text-zinc-400' }, option.hint)
                  )
                )
              ),
              h('p', { className: 'mt-5 text-sm font-medium text-zinc-900 dark:text-white' }, 'Fetch depth'),
              h('div', { className: 'mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3' },
                [1, 3, 5, 10, 0].map((value) =>
                  h('button', {
                    key: String(value),
                    type: 'button',
                    onClick: () => setMaxPages(value),
                    className: `rounded-xl border px-3 py-3 text-left transition-colors ${maxPages === value ? 'border-[#D97706] bg-amber-50 dark:border-[#D97706] dark:bg-[#D97706]/15' : 'border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-700/60'}`,
                  },
                    h('p', { className: 'text-sm font-semibold text-zinc-900 dark:text-white' }, value === 0 ? 'All pages' : `${value} page${value === 1 ? '' : 's'}`),
                    h('p', { className: 'mt-1 text-xs text-zinc-500 dark:text-zinc-400' }, value <= 1 ? 'Fastest' : value === 0 ? 'Deepest scan' : 'Balanced coverage')
                  )
                )
              ),
              h('div', { className: 'mt-4 grid gap-4 sm:grid-cols-2' },
                h('label', { className: 'block' },
                  h('span', { className: 'text-sm font-medium text-zinc-700 dark:text-zinc-300' }, 'Feed'),
                  h('select', {
                    value: mode,
                    onChange: (event) => setMode(event.target.value),
                    className: 'mt-2 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D97706] focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-900 focus:border-transparent',
                  },
                    h('option', { value: 'new' }, 'Latest posts'),
                    h('option', { value: 'top' }, 'Top posts')
                  )
                ),
                h('label', { className: 'block' },
                  h('span', { className: 'text-sm font-medium text-zinc-700 dark:text-zinc-300' }, 'Auto-refresh'),
                  h('select', {
                    value: autoRefreshEnabled ? autoRefreshInterval : 0,
                    onChange: (event) => {
                      const nextValue = Number(event.target.value);
                      if (nextValue === 0) {
                        setAutoRefreshEnabled(false);
                      } else {
                        setAutoRefreshEnabled(true);
                        setAutoRefreshInterval(nextValue);
                      }
                    },
                    className: 'mt-2 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D97706] focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-900 focus:border-transparent',
                  },
                    h('option', { value: 0 }, 'Off'),
                    AUTO_REFRESH_OPTIONS.map((opt) => h('option', { key: opt, value: opt }, `Every ${opt} min`))
                  )
                )
              )
            ),
            h('div', { className: 'rounded-xl border border-zinc-200 p-4 dark:border-zinc-700' },
              h('p', { className: 'text-sm font-medium text-zinc-900 dark:text-white' }, 'What happens next'),
              h('ul', { className: 'mt-3 space-y-3 text-sm text-zinc-600 dark:text-zinc-300' },
                h('li', null, `Scan ${subs.length || 0} subreddit${subs.length === 1 ? '' : 's'}.`),
                h('li', null, opportunityEngineEnabled ? 'AI review will sort posts against your business profile.' : 'The feed will stay manual until you enable AI review.'),
                h('li', null, `Refreshes will aim for ${days} day${days === 1 ? '' : 's'} of subreddit coverage.`),
                h('li', null, `Fetch depth is set to ${maxPages === 0 ? 'all available pages' : `${maxPages} page${maxPages === 1 ? '' : 's'}`}.`)
              )
            )
          )
        ),
        h('div', { className: 'flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 px-5 py-4 dark:border-zinc-700' },
          h('div', { className: 'flex items-center gap-2' },
            h('button', {
              type: 'button',
              onClick: onSkip,
              className: 'text-sm text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200',
            }, 'Skip for now'),
            onboardingStep > 0 && h('button', {
              type: 'button',
              onClick: () => setOnboardingStep((step) => Math.max(0, step - 1)),
              className: 'rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-700',
            }, 'Back')
          ),
          h('div', { className: 'flex items-center gap-2' },
            onboardingStep < onboardingSteps.length - 1
              ? h('button', {
                  type: 'button',
                  onClick: () => setOnboardingStep((step) => Math.min(onboardingSteps.length - 1, step + 1)),
                  disabled: !onboardingCanContinue,
                  className: 'rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#D97706] dark:hover:bg-[#B45309]',
                }, 'Continue')
              : h('button', {
                  type: 'button',
                  onClick: completeOnboarding,
                  disabled: !onboardingCanContinue || subs.length === 0 || loading,
                  className: 'rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#D97706] dark:hover:bg-[#B45309]',
                }, loading ? 'Loading…' : 'Finish and fetch')
          )
        )
      )
    );
  }

  globalScope.RDDOnboardingView = {
    renderOnboardingModal,
  };
})(typeof window !== 'undefined' ? window : globalThis);
