const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadPostView() {
  const source = fs.readFileSync(path.join(process.cwd(), 'public/app-posts.js'), 'utf8');
  const context = {
    window: {},
    globalThis: {},
    console,
  };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return context.window.RDDPostView;
}

describe('app post helpers', () => {
  test('uses the raw AI score as the primary user-facing score', () => {
    const postView = loadPostView();
    const getAiItemForPost = jest.fn().mockReturnValue({
      score: 4,
      opportunity: {
        scores: {
          priority: 0.22,
        },
      },
    });
    const getOpportunityForPost = jest.fn().mockReturnValue({
      scores: {
        priority: 0.22,
      },
    });

    const score = postView.getAiScoreValue({
      postId: 'p1',
      getAiItemForPost,
      getOpportunityForPost,
    });
    const priority = postView.getOpportunityPriority({
      postId: 'p1',
      getOpportunityForPost,
    });

    expect(score).toBe(4);
    expect(priority).toBeCloseTo(0.22);
  });

  test('falls back to priority only when no raw AI score is available', () => {
    const postView = loadPostView();
    const getAiItemForPost = jest.fn().mockReturnValue(null);
    const getOpportunityForPost = jest.fn().mockReturnValue({
      scores: {
        priority: 0.78,
      },
    });

    const score = postView.getAiScoreValue({
      postId: 'p2',
      getAiItemForPost,
      getOpportunityForPost,
    });

    expect(score).toBe(4);
  });
});
