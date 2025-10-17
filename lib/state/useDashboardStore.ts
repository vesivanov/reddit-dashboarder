import React, { createContext, useCallback, useContext, useMemo, useReducer } from 'react';
import {
  DashboardFilters,
  DashboardInsights,
  NormalizedPost,
  RawRedditPost,
  TransformOptions,
  transformPosts,
} from '../data/transformPosts';

export type InsightKey = 'topScoreDelta' | 'subredditActivity' | 'keywordFrequency';

export interface DashboardState {
  posts: NormalizedPost[];
  filteredPosts: NormalizedPost[];
  insights: DashboardInsights;
  filters: DashboardFilters;
  lastUpdated: number | null;
  activeInsights: Record<InsightKey, boolean>;
}

export interface DashboardActions {
  setPosts: (posts: RawRedditPost[], options?: TransformOptions) => void;
  updateFilters: (filters: Partial<DashboardFilters>, options?: TransformOptions) => void;
  toggleInsight: (insight: InsightKey, enabled?: boolean) => void;
}

export interface DashboardStore extends DashboardActions {
  state: DashboardState;
}

interface SetPostsAction {
  type: 'SET_POSTS';
  posts: RawRedditPost[];
  options?: TransformOptions;
}

interface UpdateFiltersAction {
  type: 'UPDATE_FILTERS';
  filters: Partial<DashboardFilters>;
  options?: TransformOptions;
}

interface ToggleInsightAction {
  type: 'TOGGLE_INSIGHT';
  insight: InsightKey;
  enabled?: boolean;
}

type Action = SetPostsAction | UpdateFiltersAction | ToggleInsightAction;

const DEFAULT_INSIGHTS: DashboardInsights = {
  topScoreDelta: [],
  subredditActivity: [],
  keywordFrequency: [],
  totalPosts: 0,
  filteredPosts: 0,
};

const DEFAULT_STATE: DashboardState = {
  posts: [],
  filteredPosts: [],
  insights: DEFAULT_INSIGHTS,
  filters: {},
  lastUpdated: null,
  activeInsights: {
    topScoreDelta: true,
    subredditActivity: true,
    keywordFrequency: true,
  },
};

function reduceState(state: DashboardState, action: Action): DashboardState {
  switch (action.type) {
    case 'SET_POSTS': {
      const { posts, filteredPosts, insights } = transformPosts(action.posts, state.filters, action.options);
      return {
        ...state,
        posts,
        filteredPosts,
        insights,
        lastUpdated: Date.now(),
      };
    }
    case 'UPDATE_FILTERS': {
      const nextFilters = { ...state.filters, ...action.filters };
      const { posts, filteredPosts, insights } = transformPosts(state.posts, nextFilters, action.options);
      return {
        ...state,
        filters: nextFilters,
        filteredPosts,
        insights,
        lastUpdated: Date.now(),
      };
    }
    case 'TOGGLE_INSIGHT': {
      const { insight, enabled } = action;
      const nextValue = typeof enabled === 'boolean' ? enabled : !state.activeInsights[insight];
      return {
        ...state,
        activeInsights: {
          ...state.activeInsights,
          [insight]: nextValue,
        },
      };
    }
    default:
      return state;
  }
}

const DashboardStoreContext = createContext<DashboardStore | undefined>(undefined);

export interface DashboardProviderProps {
  children: React.ReactNode;
  initialFilters?: DashboardFilters;
}

export function DashboardProvider({ children, initialFilters }: DashboardProviderProps): JSX.Element {
  const [state, dispatch] = useReducer(reduceState, {
    ...DEFAULT_STATE,
    filters: initialFilters ?? {},
  });

  const setPosts = useCallback<DashboardActions['setPosts']>((posts, options) => {
    dispatch({ type: 'SET_POSTS', posts, options });
  }, []);

  const updateFilters = useCallback<DashboardActions['updateFilters']>((filters, options) => {
    dispatch({ type: 'UPDATE_FILTERS', filters, options });
  }, []);

  const toggleInsight = useCallback<DashboardActions['toggleInsight']>((insight, enabled) => {
    dispatch({ type: 'TOGGLE_INSIGHT', insight, enabled });
  }, []);

  const value = useMemo<DashboardStore>(() => ({
    state,
    setPosts,
    updateFilters,
    toggleInsight,
  }), [state, setPosts, updateFilters, toggleInsight]);

  return (
    <DashboardStoreContext.Provider value={value}>
      {children}
    </DashboardStoreContext.Provider>
  );
}

export function useDashboardStore(): DashboardStore {
  const ctx = useContext(DashboardStoreContext);
  if (!ctx) {
    throw new Error('useDashboardStore must be used within a DashboardProvider');
  }
  return ctx;
}

export function useDashboardState<T>(selector: (state: DashboardState) => T): T {
  const { state } = useDashboardStore();
  return selector(state);
}
