const WARNING_CODE = 'DEP0169';
const BYPASS_ENV = 'ALLOW_LEGACY_URL_WARNING';

function shouldSuppress(warning, args) {
  if (!warning) return false;
  if (typeof warning === 'string') {
    if (warning.includes(WARNING_CODE)) return true;
    if (args && args.length) {
      const maybeCode = args[1] || args[0];
      if (typeof maybeCode === 'string' && maybeCode.includes(WARNING_CODE)) {
        return true;
      }
    }
    return false;
  }
  if (typeof warning.message === 'string' && warning.message.includes(WARNING_CODE)) {
    return true;
  }
  if (warning.code === WARNING_CODE) {
    return true;
  }
  return false;
}

(function patchWarnings() {
  if (process.__RDD_SUPPRESS_DEP0169 || process.env[BYPASS_ENV] === '1') {
    return;
  }
  const original = process.emitWarning;
  if (typeof original !== 'function') {
    return;
  }
  process.emitWarning = function patchedEmitWarning(warning, ...args) {
    if (shouldSuppress(warning, args)) {
      return;
    }
    return original.call(process, warning, ...args);
  };
  process.__RDD_SUPPRESS_DEP0169 = true;
})();

module.exports = {};
