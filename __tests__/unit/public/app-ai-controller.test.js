const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadAiController() {
  const source = fs.readFileSync(path.join(process.cwd(), 'public/app-ai-controller.js'), 'utf8');
  const context = {
    window: {
      RDDAiClient: {},
      RDDFetchClient: {},
    },
    globalThis: {},
    console,
    Map,
    Set,
    Date,
    Math,
  };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return context.window.RDDAiController;
}

describe('app AI controller', () => {
  test('splits large AI ranking requests to stay within the backend post limit', () => {
    const controller = loadAiController();
    const posts = Array.from({ length: 696 }, (_, index) => ({ id: `p${index + 1}` }));

    const chunks = controller.buildAiRequestChunks(posts, 40);

    expect(chunks).toHaveLength(3);
    expect(chunks.map((chunk) => chunk.posts.length)).toEqual([250, 250, 196]);
    expect(chunks.every((chunk) => chunk.posts.length <= 250)).toBe(true);
    expect(chunks.reduce((sum, chunk) => sum + chunk.llmPostLimit, 0)).toBe(40);
    expect(chunks.map((chunk) => chunk.llmPostLimit)).toEqual([15, 14, 11]);
  });
});
