(function initDashboardSettingsView(globalScope) {
  function renderSettingsModal({
    h,
    settingsOpen,
    setSettingsOpen,
    AUTO_REFRESH_OPTIONS,
    autoRefreshInterval,
    setAutoRefreshInterval,
    autoRefreshEnabled,
    setAutoRefreshEnabled,
    mode,
    setMode,
    time,
    setTime,
    days,
    setDays,
    maxPages,
    setMaxPages,
    requestNotificationPermission,
    notificationsEnabled,
    setNotificationsEnabled,
    upvoteThreshold,
    setUpvoteThreshold,
    alertKeywords,
    setAlertKeywords,
    notifyStrongOpportunities,
    setNotifyStrongOpportunities,
    opportunityEngineEnabled,
    setOpportunityEngineEnabled,
    hasOpportunityGoals,
    priorityNotificationThreshold,
    setPriorityNotificationThreshold,
    AI_PRESETS,
    applyPreset,
    aiPresetId,
    renderPresetIcon,
    businessOffering,
    setBusinessOffering,
    idealCustomer,
    setIdealCustomer,
    preferredEngagement,
    setPreferredEngagement,
    problemsSolved,
    setProblemsSolved,
    strategyPreset,
    setStrategyPreset,
    opportunityStrictness,
    setOpportunityStrictness,
    opportunityFocus,
    setOpportunityFocus,
    opportunityBrief,
    setOpportunityBrief,
    aiAdvancedOpen,
    setAiAdvancedOpen,
    aiAvoid,
    setAiAvoid,
    aiExamplePerfect,
    setAiExamplePerfect,
    aiExampleStrong,
    setAiExampleStrong,
    aiExampleReject,
    setAiExampleReject,
    aiShowModelKey,
    setAiShowModelKey,
    secureKeyStatus,
    deleteSecureApiKey,
    openRouterApiKey,
    setOpenRouterApiKey,
    saveSecureApiKey,
    savingSecureKey,
    modelGroups,
    openRouterModel,
    setOpenRouterModel,
    showAllModels,
    setShowAllModels,
    modelsLoading,
    modelsError,
    renderModelCard,
    aiShowPromptPreview,
    setAiShowPromptPreview,
    AI_PROMPT_VERSION,
    buildScoringPromptPreview,
    effectiveGoalText,
    effectiveContextText,
    effectiveAvoidText,
    opportunityScanError,
    setOpportunityScanError,
    aiActivity,
    aiScoresStale,
    rerankNow,
    opportunityScanLoading,
    loading,
    dataLength,
  }) {
    if (!settingsOpen) return null;

    const dayOptions = [
      { value: 1, label: '1 day', hint: 'Fastest check' },
      { value: 3, label: '3 days', hint: 'Balanced' },
      { value: 5, label: '5 days', hint: 'Deeper scan' },
    ];

    return h('div', { className: 'fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4', onClick: () => setSettingsOpen(false) },
      h('div', {
        className: 'w-full max-w-lg bg-white dark:bg-zinc-800 rounded-xl shadow-xl max-h-[90vh] overflow-auto',
        onClick: (event) => event.stopPropagation(),
      },
        h('div', { className: 'p-4 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between sticky top-0 bg-white dark:bg-zinc-800' },
          h('h3', { className: 'font-semibold text-zinc-900 dark:text-white' }, 'Settings'),
          h('button', {
            onClick: () => setSettingsOpen(false),
            className: 'p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 transition-colors',
          }, h('svg', { className: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
            h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M6 18L18 6M6 6l12 12' })
          ))
        ),
        h('div', { className: 'p-4 space-y-5' },
          h('div', { className: 'flex items-center justify-between' },
            h('div', null,
              h('p', { className: 'font-medium text-zinc-900 dark:text-white' }, 'Auto-refresh'),
              h('p', { className: 'text-sm text-zinc-500 dark:text-zinc-400' }, 'Automatically fetch new posts')
            ),
            h('div', { className: 'flex items-center gap-3' },
              h('select', {
                value: autoRefreshInterval,
                onChange: (event) => setAutoRefreshInterval(Number(event.target.value)),
                disabled: !autoRefreshEnabled,
                className: 'px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#D97706] focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-900 focus:border-transparent',
              },
                AUTO_REFRESH_OPTIONS.map((opt) => h('option', { key: opt, value: opt }, `${opt} min`))
              ),
              h('button', {
                onClick: () => setAutoRefreshEnabled(!autoRefreshEnabled),
                className: `relative w-11 h-6 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900 ${autoRefreshEnabled ? 'bg-[#D97706]' : 'bg-zinc-300 dark:bg-zinc-600'}`,
              },
                h('span', { className: `absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${autoRefreshEnabled ? 'translate-x-5' : ''}` })
              )
            )
          ),
          h('div', { className: 'grid grid-cols-2 gap-4' },
            h('label', { className: 'block' },
              h('span', { className: 'text-sm font-medium text-zinc-700 dark:text-zinc-300' }, 'Feed type'),
              h('select', {
                value: mode,
                onChange: (event) => setMode(event.target.value),
                className: 'mt-1 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#D97706] focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-900 focus:border-transparent',
              },
                h('option', { value: 'new' }, 'Latest posts'),
                h('option', { value: 'top' }, 'Top posts')
              )
            ),
            h('label', { className: 'block' },
              h('span', { className: 'text-sm font-medium text-zinc-700 dark:text-zinc-300' }, 'Top posts time range'),
              h('select', {
                value: time,
                onChange: (event) => setTime(event.target.value),
                disabled: mode !== 'top',
                className: 'mt-1 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#D97706] focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-900 focus:border-transparent',
              },
                h('option', { value: 'hour' }, 'Hour'),
                h('option', { value: 'day' }, 'Day'),
                h('option', { value: 'week' }, 'Week'),
                h('option', { value: 'month' }, 'Month')
              )
            ),
            h('label', { className: 'block' },
              h('span', { className: 'text-sm font-medium text-zinc-700 dark:text-zinc-300' }, 'Time window'),
              h('p', { className: 'mt-1 text-xs text-zinc-500 dark:text-zinc-400' }, 'Choose how far back each refresh should try to reach.'),
              h('div', { className: 'mt-2 grid grid-cols-3 gap-2' },
                dayOptions.map((option) =>
                  h('button', {
                    key: option.value,
                    type: 'button',
                    onClick: () => setDays(option.value),
                    className: `rounded-xl border px-3 py-3 text-left transition-colors ${days === option.value ? 'border-[#D97706] bg-amber-50 dark:border-[#D97706] dark:bg-[#D97706]/15' : 'border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-700/60'}`,
                  },
                    h('p', { className: 'text-sm font-semibold text-zinc-900 dark:text-white' }, option.label),
                    h('p', { className: 'mt-1 text-[11px] text-zinc-500 dark:text-zinc-400' }, option.hint)
                  )
                )
              )
            ),
            h('label', { className: 'block' },
              h('span', { className: 'text-sm font-medium text-zinc-700 dark:text-zinc-300' }, 'Fetch depth'),
              h('select', {
                value: maxPages,
                onChange: (event) => setMaxPages(Number(event.target.value)),
                className: 'mt-1 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#D97706] focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-900 focus:border-transparent',
              },
                [
                  h('option', { key: 'all', value: 0 }, 'All pages'),
                  ...[1, 2, 3, 5, 7, 10, 15, 20, 30].map((count) => h('option', { key: count, value: count }, count)),
                ]
              )
            )
          ),
          h('div', { className: 'pt-4 border-t border-zinc-200 dark:border-zinc-700' },
            h('p', { className: 'font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500 mb-3' }, 'Notifications'),
            h('div', { className: 'space-y-4' },
              h('div', { className: 'flex items-center justify-between' },
                h('div', null,
                  h('p', { className: 'font-medium text-zinc-900 dark:text-white' }, 'Enable alerts'),
                  h('p', { className: 'text-sm text-zinc-500 dark:text-zinc-400' }, 'Get notified on auto-refresh')
                ),
                h('div', { className: 'flex items-center gap-2' },
                  Notification.permission !== 'granted' && h('button', {
                    onClick: requestNotificationPermission,
                    className: 'px-2.5 py-1 text-xs font-medium rounded-full bg-amber-50 text-[#B45309] dark:bg-[#D97706]/15 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-[#D97706]/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900',
                  }, 'Allow notifications'),
                  h('button', {
                    onClick: () => setNotificationsEnabled(!notificationsEnabled),
                    disabled: Notification.permission !== 'granted',
                    className: `relative w-11 h-6 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900 ${notificationsEnabled ? 'bg-[#D97706]' : 'bg-zinc-300 dark:bg-zinc-600'}`,
                  },
                    h('span', { className: `absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${notificationsEnabled ? 'translate-x-5' : ''}` })
                  )
                )
              ),
              h('label', { className: 'block' },
                h('span', { className: 'text-sm font-medium text-zinc-700 dark:text-zinc-300' }, 'Upvote threshold'),
                h('p', { className: 'text-xs text-zinc-500 dark:text-zinc-400 mb-1' }, 'Alert when a post crosses this score'),
                h('input', {
                  type: 'number',
                  value: upvoteThreshold,
                  onChange: (event) => setUpvoteThreshold(Number(event.target.value) || 100),
                  disabled: !notificationsEnabled,
                  className: 'w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#D97706] focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-900 focus:border-transparent',
                })
              ),
              h('label', { className: 'block' },
                h('span', { className: 'text-sm font-medium text-zinc-700 dark:text-zinc-300' }, 'Alert keywords'),
                h('p', { className: 'text-xs text-zinc-500 dark:text-zinc-400 mb-1' }, 'Notify when new posts contain these (comma-separated). Works even if Enable alerts is off.'),
                h('input', {
                  type: 'text',
                  value: alertKeywords,
                  onChange: (event) => setAlertKeywords(event.target.value),
                  placeholder: 'breaking, launch, announcement...',
                  disabled: Notification.permission !== 'granted',
                  className: 'w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#D97706] focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-900 focus:border-transparent',
                })
              ),
              h('div', { className: 'flex items-center justify-between' },
                h('div', null,
                  h('p', { className: 'font-medium text-zinc-900 dark:text-white' }, 'Notify on strong opportunities'),
                  h('p', { className: 'text-sm text-zinc-500 dark:text-zinc-400' }, 'Get notified when a post reaches your threshold (opportunity engine must be enabled)')
                ),
                h('button', {
                  onClick: () => setNotifyStrongOpportunities(!notifyStrongOpportunities),
                  disabled: !opportunityEngineEnabled || !hasOpportunityGoals,
                  className: `relative w-11 h-6 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900 ${notifyStrongOpportunities ? 'bg-[#D97706]' : 'bg-zinc-300 dark:bg-zinc-600'}`,
                },
                  h('span', { className: `absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${notifyStrongOpportunities ? 'translate-x-5' : ''}` })
                )
              ),
              h('label', { className: 'block' },
                h('span', { className: 'text-sm font-medium text-zinc-700 dark:text-zinc-300' }, 'Strong-opportunity threshold'),
                h('p', { className: 'text-xs text-zinc-500 dark:text-zinc-400 mb-1' }, 'Minimum priority proxy (4 or 5) to trigger a notification'),
                h('select', {
                  value: priorityNotificationThreshold,
                  onChange: (event) => setPriorityNotificationThreshold(Number(event.target.value) || 4),
                  disabled: !notifyStrongOpportunities || !opportunityEngineEnabled,
                  className: 'w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#D97706] focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-900 focus:border-transparent',
                },
                  h('option', { value: 4 }, '4+'),
                  h('option', { value: 5 }, '5+')
                )
              )
            )
          ),
          h('div', { className: 'pt-4 border-t border-zinc-200 dark:border-zinc-700' },
            h('div', { className: 'flex items-center justify-between mb-4' },
              h('p', { className: 'font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500' }, 'Opportunity Engine'),
              h('button', {
                onClick: () => setOpportunityEngineEnabled(!opportunityEngineEnabled),
                title: opportunityEngineEnabled ? 'Disable opportunity engine' : 'Enable opportunity engine',
                className: `relative w-11 h-6 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900 ${opportunityEngineEnabled ? 'bg-[#D97706]' : 'bg-zinc-300 dark:bg-zinc-600'}`,
              },
                h('span', { className: `absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${opportunityEngineEnabled ? 'translate-x-5' : ''}` })
              )
            ),
            h('div', { className: 'space-y-4' },
              h('div', null,
                h('div', { className: 'flex flex-wrap gap-1.5 mb-2' },
                  AI_PRESETS.map((preset) => h('button', {
                    key: preset.id,
                    type: 'button',
                    onClick: () => applyPreset(preset),
                    disabled: !opportunityEngineEnabled,
                    className: `px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${aiPresetId === preset.id ? 'bg-[#D97706] text-white border-[#D97706]' : 'border-zinc-200 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'} ${!opportunityEngineEnabled ? 'opacity-50 cursor-not-allowed' : ''}`,
                  },
                    h('span', { className: 'inline-flex items-center gap-1.5' },
                      renderPresetIcon(preset.id, aiPresetId === preset.id),
                      h('span', null, preset.label)
                    )
                  ))
                ),
                h('div', { className: 'space-y-3 mb-3' },
                  h('label', { className: 'block' },
                    h('span', { className: 'text-sm font-medium text-zinc-700 dark:text-zinc-300' }, 'What do you sell?'),
                    h('input', {
                      type: 'text',
                      value: businessOffering,
                      onChange: (event) => setBusinessOffering(event.target.value),
                      placeholder: 'SEO consulting for B2B SaaS teams',
                      disabled: !opportunityEngineEnabled,
                      className: 'mt-1 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#D97706] focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-900 focus:border-transparent',
                    })
                  ),
                  h('label', { className: 'block' },
                    h('span', { className: 'text-sm font-medium text-zinc-700 dark:text-zinc-300' }, 'Ideal customer'),
                    h('input', {
                      type: 'text',
                      value: idealCustomer,
                      onChange: (event) => setIdealCustomer(event.target.value),
                      placeholder: 'Founders and marketing leads at SMBs',
                      disabled: !opportunityEngineEnabled,
                      className: 'mt-1 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#D97706] focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-900 focus:border-transparent',
                    })
                  ),
                  h('label', { className: 'block' },
                    h('span', { className: 'text-sm font-medium text-zinc-700 dark:text-zinc-300' }, 'Problems you solve'),
                    h('textarea', {
                      value: problemsSolved,
                      onChange: (event) => setProblemsSolved(event.target.value),
                      placeholder: 'Traffic drops, poor search visibility, weak conversion pages',
                      disabled: !opportunityEngineEnabled,
                      rows: 2,
                      className: 'mt-1 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed resize-none focus:outline-none focus:ring-2 focus:ring-[#D97706] focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-900 focus:border-transparent',
                    })
                  )
                )
              ),
              h('div', { className: 'rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden' },
                h('button', {
                  type: 'button',
                  onClick: () => setAiAdvancedOpen(!aiAdvancedOpen),
                  disabled: !opportunityEngineEnabled,
                  className: 'w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                },
                  h('span', null, 'Advanced'),
                  h('svg', { className: `w-4 h-4 text-zinc-400 transition-transform ${aiAdvancedOpen ? 'rotate-180' : ''}`, fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                    h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M19 9l-7 7-7-7' })
                  )
                ),
                aiAdvancedOpen && h('div', { className: 'px-3 pb-3 pt-3 space-y-3 border-t border-zinc-200 dark:border-zinc-700' },
                  h('div', { className: 'grid grid-cols-1 gap-3 sm:grid-cols-2 pb-3 border-b border-zinc-200 dark:border-zinc-700' },
                    h('label', { className: 'block' },
                      h('span', { className: 'text-xs font-medium text-zinc-700 dark:text-zinc-300' }, 'Preferred engagement'),
                      h('select', {
                        value: preferredEngagement,
                        onChange: (event) => setPreferredEngagement(event.target.value),
                        disabled: !opportunityEngineEnabled,
                        className: 'mt-1 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#D97706] focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-900 focus:border-transparent',
                      },
                        h('option', { value: 'reply' }, 'Public reply'),
                        h('option', { value: 'dm' }, 'DM / outreach'),
                        h('option', { value: 'either' }, 'Either'),
                        h('option', { value: 'research' }, 'Research only')
                      )
                    ),
                    h('label', { className: 'block' },
                      h('span', { className: 'text-xs font-medium text-zinc-700 dark:text-zinc-300' }, 'Strategy'),
                      h('select', {
                        value: strategyPreset,
                        onChange: (event) => setStrategyPreset(event.target.value),
                        disabled: !opportunityEngineEnabled,
                        className: 'mt-1 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#D97706] focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-900 focus:border-transparent',
                      },
                        h('option', { value: 'balanced' }, 'Balanced'),
                        h('option', { value: 'sales' }, 'Sales'),
                        h('option', { value: 'fast_wins' }, 'Fast wins'),
                        h('option', { value: 'research' }, 'Research')
                      )
                    ),
                    h('label', { className: 'block' },
                      h('span', { className: 'text-xs font-medium text-zinc-700 dark:text-zinc-300' }, 'Strictness'),
                      h('select', {
                        value: opportunityStrictness,
                        onChange: (event) => setOpportunityStrictness(event.target.value),
                        disabled: !opportunityEngineEnabled,
                        className: 'mt-1 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#D97706] focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-900 focus:border-transparent',
                      },
                        h('option', { value: 'strict' }, 'Strict'),
                        h('option', { value: 'balanced' }, 'Balanced'),
                        h('option', { value: 'broad' }, 'Broad recall')
                      )
                    ),
                    h('label', { className: 'block sm:col-span-2' },
                      h('span', { className: 'text-xs font-medium text-zinc-700 dark:text-zinc-300' }, 'Opportunity types'),
                      h('input', {
                        type: 'text',
                        value: opportunityFocus,
                        onChange: (event) => setOpportunityFocus(event.target.value),
                        placeholder: 'lead, pain_point, tool_search',
                        disabled: !opportunityEngineEnabled,
                        className: 'mt-1 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#D97706] focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-900 focus:border-transparent',
                      })
                    ),
                    h('label', { className: 'block sm:col-span-2' },
                      h('span', { className: 'text-xs font-medium text-zinc-700 dark:text-zinc-300' }, 'Extra instructions'),
                      h('textarea', {
                        value: opportunityBrief,
                        onChange: (event) => setOpportunityBrief(event.target.value),
                        placeholder: 'Optional: nuanced opportunities to prioritize',
                        disabled: !opportunityEngineEnabled,
                        rows: 2,
                        className: 'mt-1 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#D97706] focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-900 focus:border-transparent resize-none',
                      })
                    )
                  ),
                  h('label', { className: 'block' },
                    h('span', { className: 'text-xs font-medium text-zinc-700 dark:text-zinc-300' }, 'Avoid'),
                    h('p', { className: 'text-xs text-zinc-500 dark:text-zinc-400 mb-1' }, 'What should score low? e.g. job posts, memes, ads'),
                    h('input', {
                      type: 'text',
                      value: aiAvoid,
                      onChange: (event) => setAiAvoid(event.target.value),
                      placeholder: 'job postings, memes, generic questions without intent',
                      disabled: !opportunityEngineEnabled,
                      className: 'w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#D97706] focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-900 focus:border-transparent',
                    })
                  ),
                  h('div', null,
                    h('p', { className: 'font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500 mb-2' }, 'Few-shot examples'),
                    h('div', { className: 'space-y-2' },
                      h('label', { className: 'flex items-start gap-2' },
                        h('span', { className: 'w-14 shrink-0 text-[10px] font-mono font-medium text-emerald-600 dark:text-emerald-400 pt-2' }, 'PERFECT'),
                        h('textarea', {
                          value: aiExamplePerfect,
                          onChange: (event) => setAiExamplePerfect(event.target.value),
                          rows: 2,
                          disabled: !opportunityEngineEnabled,
                          placeholder: 'Traffic dropped 50%, need SEO help, budget ready',
                          className: 'flex-1 px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-xs disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#D97706] resize-none',
                        })
                      ),
                      h('label', { className: 'flex items-start gap-2' },
                        h('span', { className: 'w-14 shrink-0 text-[10px] font-mono font-medium text-amber-600 dark:text-amber-400 pt-2' }, 'STRONG'),
                        h('textarea', {
                          value: aiExampleStrong,
                          onChange: (event) => setAiExampleStrong(event.target.value),
                          rows: 2,
                          disabled: !opportunityEngineEnabled,
                          placeholder: 'How can we improve our local rankings?',
                          className: 'flex-1 px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-xs disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#D97706] resize-none',
                        })
                      ),
                      h('label', { className: 'flex items-start gap-2' },
                        h('span', { className: 'w-14 shrink-0 text-[10px] font-mono font-medium text-zinc-400 dark:text-zinc-500 pt-2' }, 'REJECT'),
                        h('textarea', {
                          value: aiExampleReject,
                          onChange: (event) => setAiExampleReject(event.target.value),
                          rows: 2,
                          disabled: !opportunityEngineEnabled,
                          placeholder: 'Hiring SEO specialist, $20/hr',
                          className: 'flex-1 px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-xs disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#D97706] resize-none',
                        })
                      )
                    )
                  )
                )
              ),
              h('div', { className: 'rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden' },
                h('button', {
                  type: 'button',
                  onClick: () => setAiShowModelKey(!aiShowModelKey),
                  disabled: !opportunityEngineEnabled,
                  className: 'w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                },
                  h('span', { className: 'flex items-center gap-2' },
                    'Model & Key',
                    secureKeyStatus.hasKey && h('span', { className: 'text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-medium' }, '✓ key saved')
                  ),
                  h('svg', { className: `w-4 h-4 text-zinc-400 transition-transform ${aiShowModelKey ? 'rotate-180' : ''}`, fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                    h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M19 9l-7 7-7-7' })
                  )
                ),
                aiShowModelKey && h('div', { className: 'px-3 pb-3 pt-3 space-y-4 border-t border-zinc-200 dark:border-zinc-700' },
                  h('div', null,
                    h('p', { className: 'text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1' }, 'OpenRouter API Key'),
                    h('p', { className: 'text-xs text-zinc-500 dark:text-zinc-400 mb-2' },
                      'Get a free key at ',
                      h('a', { href: 'https://openrouter.ai/keys', target: '_blank', rel: 'noopener noreferrer', className: 'text-[#D97706] dark:text-amber-400 hover:underline' }, 'openrouter.ai/keys')
                    ),
                    secureKeyStatus.hasKey
                      ? h('div', { className: 'flex items-center gap-2 p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800' },
                          h('svg', { className: 'w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                            h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' })
                          ),
                          h('div', { className: 'flex-1 min-w-0' },
                            h('p', { className: 'text-xs font-medium text-emerald-700 dark:text-emerald-300' }, 'Secure key stored'),
                            h('p', { className: 'text-xs text-emerald-600 dark:text-emerald-400 font-mono truncate' }, secureKeyStatus.keyPreview)
                          ),
                          h('button', {
                            onClick: deleteSecureApiKey,
                            className: 'p-1 text-emerald-600 dark:text-emerald-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors',
                            title: 'Remove key',
                          }, h('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                            h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' })
                          ))
                        )
                      : h('div', { className: 'flex gap-2' },
                          h('input', {
                            type: 'password',
                            value: openRouterApiKey,
                            onChange: (event) => setOpenRouterApiKey(event.target.value),
                            placeholder: 'sk-or-v1-...',
                            disabled: !opportunityEngineEnabled,
                            className: 'flex-1 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#D97706] focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-900 focus:border-transparent font-mono',
                          }),
                          openRouterApiKey.trim() && h('button', {
                            onClick: saveSecureApiKey,
                            disabled: savingSecureKey || !opportunityEngineEnabled,
                            className: 'px-3 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap',
                            title: 'Save key securely (HttpOnly cookie)',
                          }, savingSecureKey ? 'Saving...' : 'Save securely')
                        ),
                    !secureKeyStatus.hasKey && openRouterApiKey.trim() && h('p', { className: 'mt-1 text-xs text-amber-600 dark:text-amber-400' },
                      '⚠️ Click "Save securely" to protect your key from XSS attacks'
                    )
                  ),
                  h('div', null,
                    h('p', { className: 'text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-2' }, 'Model'),
                    modelGroups.recommended.length > 0 && h('div', { className: 'mb-3 p-2.5 rounded-lg border border-amber-200 dark:border-[#B45309]/55 bg-amber-50 dark:bg-[#D97706]/10' },
                      h('p', { className: 'text-[10px] font-semibold text-[#B45309] dark:text-amber-300 uppercase tracking-[0.12em] mb-1.5' }, 'Recommended'),
                      renderModelCard(modelGroups.recommended[0], { emphasize: true })
                    ),
                    h('div', { className: 'grid gap-2 sm:grid-cols-2' },
                      modelGroups.latestFree.length > 0
                        ? modelGroups.latestFree.map((model) => renderModelCard(model, { compact: true }))
                        : h('p', { className: 'text-xs text-zinc-500 dark:text-zinc-400' }, 'No free models found.')
                    ),
                    showAllModels && h('div', { className: 'mt-2' },
                      h('select', {
                        value: openRouterModel,
                        onChange: (event) => setOpenRouterModel(event.target.value),
                        disabled: !opportunityEngineEnabled,
                        className: 'w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#D97706] focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-900 focus:border-transparent',
                      },
                        modelGroups.all.map((model) =>
                          h('option', { key: `all-${model.id}`, value: model.id }, `${model.name} — ${model.hint}`)
                        )
                      )
                    ),
                    h('div', { className: 'mt-2 flex items-center justify-between gap-2' },
                      h('p', { className: 'text-xs text-zinc-500 dark:text-zinc-400 font-mono truncate' }, openRouterModel),
                      h('button', {
                        type: 'button',
                        onClick: () => setShowAllModels(!showAllModels),
                        disabled: !opportunityEngineEnabled,
                        className: 'text-xs text-[#D97706] dark:text-amber-400 hover:underline disabled:opacity-50 whitespace-nowrap shrink-0',
                      }, showAllModels ? 'Fewer' : 'All models')
                    ),
                    modelsLoading && h('p', { className: 'text-xs text-zinc-500 dark:text-zinc-400 mt-1' }, 'Loading models...'),
                    modelsError && h('p', { className: 'text-xs text-rose-600 dark:text-rose-400 mt-1' }, modelsError)
                  )
                )
              ),
              h('div', null,
                h('button', {
                  type: 'button',
                  onClick: () => setAiShowPromptPreview(!aiShowPromptPreview),
                  className: 'text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors flex items-center gap-1.5',
                },
                  h('svg', { className: `w-3 h-3 transition-transform ${aiShowPromptPreview ? 'rotate-90' : ''}`, fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                    h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M9 5l7 7-7 7' })
                  ),
                  'Preview engine prompt',
                  h('span', { className: 'px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-700 font-mono text-[10px]' }, AI_PROMPT_VERSION)
                ),
                aiShowPromptPreview && h('pre', { className: 'mt-2 max-h-44 overflow-auto whitespace-pre-wrap rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 p-2 text-[11px] text-zinc-700 dark:text-zinc-200' },
                  buildScoringPromptPreview({
                    goals: effectiveGoalText,
                    context: effectiveContextText,
                    avoid: effectiveAvoidText,
                    examples: {
                      perfect: aiExamplePerfect,
                      strong: aiExampleStrong,
                      reject: aiExampleReject,
                    },
                  })
                )
              ),
              opportunityScanError && h('div', { className: 'p-2 rounded-lg border border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-900/20 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between gap-2' },
                h('span', null, opportunityScanError),
                h('button', { onClick: () => setOpportunityScanError(null), className: 'text-rose-400 hover:text-rose-600 dark:hover:text-rose-200 shrink-0 font-medium' }, '×')
              ),
              aiActivity?.detail && !opportunityScanError && h('div', { className: 'p-2 rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50/70 dark:bg-amber-900/20 text-xs text-amber-800 dark:text-amber-200' },
                `${aiActivity.status}: ${aiActivity.detail}`
              ),
              aiScoresStale && !opportunityScanError && h('div', { className: 'p-2 rounded-lg border border-amber-200 dark:border-amber-700/60 bg-amber-50/60 dark:bg-amber-900/20 text-xs text-amber-700 dark:text-amber-300' },
                'Scores are cached — badges show ~ prefix. Re-run for fresh results.'
              ),
              h('div', { className: 'flex items-center gap-3' },
                h('button', {
                  type: 'button',
                  onClick: rerankNow,
                  disabled: !opportunityEngineEnabled || !hasOpportunityGoals || opportunityScanLoading || loading || dataLength === 0,
                  className: 'flex-1 px-3 py-2 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-[#D97706] dark:hover:bg-[#B45309] disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
                }, opportunityScanLoading ? 'Analyzing…' : 'Run opportunity scan'),
                opportunityScanLoading && h('div', { className: 'flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 shrink-0' },
                  h('div', { className: 'w-3 h-3 border-2 border-zinc-300 dark:border-zinc-600 border-t-zinc-600 dark:border-t-zinc-300 rounded-full animate-spin' })
                )
              )
            )
          )
        ),
        h('div', { className: 'p-4 border-t border-zinc-200 dark:border-zinc-700 flex justify-end sticky bottom-0 bg-white dark:bg-zinc-800' },
          h('button', {
            onClick: () => setSettingsOpen(false),
            className: 'px-4 py-2 rounded-lg text-sm font-medium bg-zinc-900 dark:bg-[#D97706] text-white hover:bg-zinc-800 dark:hover:bg-[#B45309] transition-colors',
          }, 'Done')
        )
      )
    );
  }

  globalScope.RDDSettingsView = {
    renderSettingsModal,
  };
})(typeof window !== 'undefined' ? window : globalThis);
