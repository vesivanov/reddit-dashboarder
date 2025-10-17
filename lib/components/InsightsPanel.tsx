import React, { useMemo } from 'react';
import { InsightKey, useDashboardStore } from '../state/useDashboardStore';

const INSIGHT_LABELS: Record<InsightKey, string> = {
  topScoreDelta: 'Risers',
  subredditActivity: 'Active subreddits',
  keywordFrequency: 'Trending keywords',
};

interface InsightsPanelProps {
  className?: string;
}

function formatScoreDelta(delta: number): string {
  if (!Number.isFinite(delta)) return '0';
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

function formatTimeRange(start?: number, end?: number): string {
  if (!start && !end) return 'All time';
  const startDate = start ? new Date(start * 1000) : null;
  const endDate = end ? new Date(end * 1000) : new Date();
  if (!startDate) return `≤ ${endDate.toLocaleString()}`;
  return `${startDate.toLocaleString()} → ${endDate.toLocaleString()}`;
}

export function InsightsPanel({ className }: InsightsPanelProps): JSX.Element {
  const { state, toggleInsight } = useDashboardStore();
  const { insights, filters, activeInsights } = state;

  const timeframeLabel = useMemo(() => formatTimeRange(filters.timeframe?.start, filters.timeframe?.end), [filters.timeframe]);

  const visibleInsights = useMemo(() => {
    return (Object.keys(activeInsights) as InsightKey[]).filter(key => activeInsights[key]);
  }, [activeInsights]);

  return (
    <section className={`bg-white rounded-2xl shadow p-3 flex flex-col gap-3 ${className ?? ''}`}>
      <header className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Insights</h2>
          <p className="text-xs text-zinc-500">Filtered view • {timeframeLabel}</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {(Object.keys(activeInsights) as InsightKey[]).map(key => (
            <label key={key} className="flex items-center gap-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={activeInsights[key]}
                onChange={event => toggleInsight(key, event.target.checked)}
              />
              {INSIGHT_LABELS[key]}
            </label>
          ))}
        </div>
      </header>

      {visibleInsights.length === 0 ? (
        <p className="text-sm text-zinc-500">Enable an insight above to populate this panel.</p>
      ) : null}

      {visibleInsights.includes('topScoreDelta') && (
        <article className="border border-zinc-200 rounded-xl p-3">
          <h3 className="text-sm font-semibold mb-2">Top risers (score delta)</h3>
          {insights.topScoreDelta.length === 0 ? (
            <p className="text-xs text-zinc-500">No posts match the current filters.</p>
          ) : (
            <ol className="space-y-2 text-sm">
              {insights.topScoreDelta.map(post => (
                <li key={post.id} className="flex items-start gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-700 text-xs font-semibold whitespace-nowrap">
                    {formatScoreDelta(post.scoreDelta)}
                  </span>
                  <div className="flex-1">
                    <div className="font-semibold leading-snug">{post.title}</div>
                    <div className="text-[11px] text-zinc-500">r/{post.subreddit}</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </article>
      )}

      {visibleInsights.includes('subredditActivity') && (
        <article className="border border-zinc-200 rounded-xl p-3">
          <h3 className="text-sm font-semibold mb-2">Subreddits with most new posts</h3>
          {insights.subredditActivity.length === 0 ? (
            <p className="text-xs text-zinc-500">No posts match the current filters.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {insights.subredditActivity.map(entry => (
                <li key={entry.subreddit} className="flex items-center justify-between">
                  <span className="font-medium">r/{entry.subreddit}</span>
                  <span className="text-xs text-zinc-500">{entry.count} posts</span>
                </li>
              ))}
            </ul>
          )}
        </article>
      )}

      {visibleInsights.includes('keywordFrequency') && (
        <article className="border border-zinc-200 rounded-xl p-3">
          <h3 className="text-sm font-semibold mb-2">Keyword frequencies</h3>
          {insights.keywordFrequency.length === 0 ? (
            <p className="text-xs text-zinc-500">No keywords found for the current filters.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {insights.keywordFrequency.map(entry => (
                <li key={entry.keyword} className="flex items-center justify-between">
                  <span className="font-medium">{entry.keyword}</span>
                  <span className="text-xs text-zinc-500">{entry.count}</span>
                </li>
              ))}
            </ul>
          )}
        </article>
      )}

      <footer className="border-t border-dashed border-zinc-200 pt-2 mt-auto text-[11px] text-zinc-500">
        Showing {insights.filteredPosts} of {insights.totalPosts} posts.
      </footer>
    </section>
  );
}

export default InsightsPanel;
