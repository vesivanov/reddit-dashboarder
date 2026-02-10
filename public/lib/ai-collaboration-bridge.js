// Human-AI Collaboration Bridge for Reddit Dashboarder
// This module provides seamless context sharing between human users and AI agents
//
// Usage in frontend:
//   const bridge = new AICollaborationBridge();
//   const shareToken = await bridge.shareWithAI({ intent: "Find me SEO leads" });
//   // Human copies token and sends to AI
//
// Usage for AI:
//   GET /api/context-bundle/{token}  - Retrieve human's context
//   PATCH /api/context-bundle/{token} - Suggest changes
//   POST /api/context-bundle/{token}/apply - Human approves (done via frontend)

class AICollaborationBridge {
  constructor(options = {}) {
    this.apiBase = options.apiBase || '';
    this.onContextUpdate = options.onContextUpdate || (() => {});
    this.currentToken = null;
    this.pollInterval = null;
  }

  /**
   * Human: Share current dashboard state with AI
   * Returns a share token that can be sent to AI agent
   */
  async shareWithAI(options = {}) {
    const bundle = this._collectContext(options);
    
    const response = await fetch(`${this.apiBase}/api/context-bundle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(bundle),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create context bundle');
    }
    
    const result = await response.json();
    this.currentToken = result.token;
    
    // Start polling for AI suggestions if requested
    if (options.autoSync) {
      this._startPolling();
    }
    
    return {
      token: result.token,
      shareUrl: result.shareUrl,
      expiresAt: result.expiresAt,
      // Human-friendly format for copying/pasting
      shareMessage: this._formatShareMessage(result, options.intent),
    };
  }

  /**
   * Human: Check for AI-suggested changes and apply them
   */
  async checkForSuggestions() {
    if (!this.currentToken) {
      throw new Error('No active context bundle. Call shareWithAI() first.');
    }
    
    const response = await fetch(`${this.apiBase}/api/context-bundle/${this.currentToken}`, {
      credentials: 'include',
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch context bundle');
    }
    
    const { bundle } = await response.json();
    const pending = bundle.collaboration?.pendingChanges;
    
    if (!pending) {
      return { hasSuggestions: false };
    }
    
    return {
      hasSuggestions: true,
      suggestions: pending.changes,
      reason: pending.reason,
      aiInterpretation: bundle.collaboration.aiInterpretation,
      aiPlan: bundle.collaboration.aiPlan,
      // Preview what will change
      preview: this._previewChanges(pending.changes),
    };
  }

  /**
   * Human: Approve or reject AI-suggested changes
   */
  async applySuggestions(approved, options = {}) {
    if (!this.currentToken) {
      throw new Error('No active context bundle');
    }
    
    const response = await fetch(`${this.apiBase}/api/context-bundle/${this.currentToken}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        approved,
        selectedChanges: options.selectedChanges, // Apply only specific changes
        reason: options.reason,
      }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to apply suggestions');
    }
    
    const result = await response.json();
    
    if (approved && result.bundle) {
      // Apply changes to local state
      this._applyToLocalState(result.bundle);
      this.onContextUpdate(result.bundle);
    }
    
    return result;
  }

  /**
   * Human: Revoke a share token (stop sharing with AI)
   */
  async revokeSharing() {
    if (!this.currentToken) return;
    
    await fetch(`${this.apiBase}/api/context-bundle/${this.currentToken}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    
    this._stopPolling();
    this.currentToken = null;
  }

  /**
   * AI Agent: Retrieve context bundle by token
   * (Called by AI backend, not frontend)
   */
  static async retrieveContext(token, apiBase = '') {
    const response = await fetch(`${apiBase}/api/context-bundle/${token}`);
    if (!response.ok) {
      throw new Error(`Failed to retrieve context: ${response.status}`);
    }
    return response.json();
  }

  /**
   * AI Agent: Suggest changes to human's context
   * (Called by AI backend, not frontend)
   */
  static async suggestChanges(token, suggestions, apiBase = '') {
    const response = await fetch(`${apiBase}/api/context-bundle/${token}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(suggestions),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to suggest changes: ${response.status}`);
    }
    return response.json();
  }

  // Private methods

  _collectContext(options) {
    // This would integrate with your React state
    // For now, showing the structure expected
    return {
      intent: options.intent || '',
      ttlHours: options.ttlHours || 24,
      
      settings: options.settings || {
        subs: [],
        maxPages: 5,
        autoRefreshEnabled: false,
        autoRefreshInterval: 10,
        notificationsEnabled: false,
        upvoteThreshold: 100,
        alertKeywords: '',
        notifyHighRelevance: false,
        highRelevanceThreshold: 4,
        aiGoals: '',
        aiContext: '',
        aiEnabled: false,
        openRouterModel: 'google/gemini-2.0-flash-exp:free',
        aiLlmPostLimit: 60,
      },
      
      state: options.state || {
        filters: {
          selectedSub: 'ALL',
          keyword: '',
          minUpvotes: '',
          minComments: '',
          minAiRelevance: '',
          sortBy: 'date',
          sortOrder: 'desc',
        },
        selectedPostIds: [],
        hiddenPostIds: [],
        flaggedPostIds: [],
      },
      
      digest: options.digest || null,
      
      collaboration: {
        humanIntent: options.intent || '',
        aiInterpretation: '',
        aiPlan: '',
      },
      
      meta: {
        source: 'human-frontend',
        userAgent: navigator.userAgent,
        url: window.location.href,
      },
    };
  }

  _formatShareMessage(result, intent) {
    const lines = [
      '🤖 AI Collaboration Token',
      '',
      `Token: ${result.token}`,
      `Expires: ${new Date(result.expiresAt).toLocaleString()}`,
      '',
    ];
    
    if (intent) {
      lines.push(`Intent: "${intent}"`);
      lines.push('');
    }
    
    lines.push('AI can access this context at:');
    lines.push(result.shareUrl);
    lines.push('');
    lines.push('Or use the token with your AI agent.');
    
    return lines.join('\n');
  }

  _previewChanges(changes) {
    const preview = [];
    
    for (const [path, value] of Object.entries(changes)) {
      const parts = path.split('.');
      const category = parts[0];
      const field = parts[parts.length - 1];
      
      preview.push({
        path,
        category,
        field,
        newValue: value,
        description: this._describeChange(path, value),
      });
    }
    
    return preview;
  }

  _describeChange(path, value) {
    const descriptions = {
      'settings.subs': `Change subreddits to: ${Array.isArray(value) ? value.join(', ') : value}`,
      'settings.aiGoals': `Update AI goals to: "${value}"`,
      'settings.aiEnabled': value ? 'Enable AI ranking' : 'Disable AI ranking',
      'settings.openRouterModel': `Switch to model: ${value}`,
      'state.filters.sortBy': `Sort posts by: ${value}`,
      'state.filters.minAiRelevance': `Filter for AI relevance ≥ ${value}`,
    };
    
    return descriptions[path] || `Update ${path}`;
  }

  _applyToLocalState(bundle) {
    // This would update React state with new settings
    // Implementation depends on your state management
    console.log('Applying bundle to local state:', bundle);
  }

  _startPolling() {
    if (this.pollInterval) return;
    
    this.pollInterval = setInterval(async () => {
      try {
        const status = await this.checkForSuggestions();
        if (status.hasSuggestions) {
          this.onContextUpdate({ type: 'suggestions-available', status });
        }
      } catch (e) {
        console.warn('Polling error:', e);
      }
    }, 5000); // Poll every 5 seconds
  }

  _stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
}

// Export for use in browser
if (typeof window !== 'undefined') {
  window.AICollaborationBridge = AICollaborationBridge;
}

// Export for ES modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AICollaborationBridge;
}
