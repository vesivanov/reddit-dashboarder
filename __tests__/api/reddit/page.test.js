const nock = require('nock');

const pageHandler = require('../../../lib/api-handlers/reddit/page');
const { runHandler } = require('../../helpers/run-handler');

function buildPost(subreddit, id, createdUtc) {
  return {
    data: {
      id,
      subreddit,
      title: `${subreddit} ${id}`,
      selftext: `Body for ${id}`,
      score: 42,
      num_comments: 7,
      created_utc: createdUtc,
      permalink: `/r/${subreddit}/comments/${id}`,
      url: `https://example.com/${id}`,
      domain: 'example.com',
      author: 'tester',
      thumbnail: 'https://example.com/thumb.jpg',
      link_flair_text: 'Test',
    },
  };
}

describe('/api/reddit/page', () => {
  beforeAll(() => {
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  test('returns a single page with after token and done flag', async () => {
    const sub = 'programming';
    const now = Math.floor(Date.now() / 1000);
    nock('https://www.reddit.com')
      .get(`/r/${sub}/about.json`)
      .reply(200, { data: { subscribers: 100, active_user_count: 10, title: sub, icon_img: null, public_description: '' } })
      .get(new RegExp(`^/r/${sub}/new\\.json`))
      .query((query) => query.after === 't3_after1')
      .reply(200, {
        data: {
          children: [
            buildPost(sub, 'recent', now - 60),
            buildPost(sub, 'old', now - 9 * 86400),
          ],
          after: 't3_after2',
        },
      });

    const res = await runHandler(pageHandler, {
      method: 'GET',
      url: `/api/reddit/page?sub=${sub}&mode=new&days=7&limit=25&after=t3_after1&include_meta=1`,
      headers: { origin: 'http://localhost:3000' },
    });

    expect(res.status).toBe(200);
    expect(res.body.subreddit).toBe(sub);
    expect(res.body.meta).toMatchObject({ title: sub });
    expect(res.body.posts).toHaveLength(1);
    expect(res.body.posts[0].id).toBe('recent');
    expect(res.body.after).toBe('t3_after2');
    expect(res.body.done).toBe(true);
    expect(res.body.auth_mode).toBe('public');
  });
});
