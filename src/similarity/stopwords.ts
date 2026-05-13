/**
 * Code Stopwords - Common terms to filter from TF-IDF analysis
 *
 * These terms appear frequently across all code files and don't
 * provide meaningful signal for similarity analysis.
 */

export const CODE_STOPWORDS = new Set([
  // TypeScript Keywords
  'import', 'export', 'from', 'const', 'let', 'var', 'function', 'class',
  'interface', 'type', 'enum', 'extends', 'implements', 'return', 'if',
  'else', 'for', 'while', 'switch', 'case', 'break', 'continue', 'try',
  'catch', 'throw', 'new', 'this', 'super', 'static', 'public', 'private',
  'protected', 'readonly', 'async', 'await', 'void', 'null', 'undefined',
  'true', 'false', 'string', 'number', 'boolean', 'any', 'unknown', 'never',
  'typeof', 'instanceof', 'delete', 'default', 'abstract', 'as', 'is',

  // Angular Ubiquitous
  'component', 'injectable', 'module', 'directive', 'pipe', 'input', 'output',
  'subscribe', 'observable', 'subject', 'behaviorsubject', 'oninit', 'ondestroy',
  'ngmodule', 'declarations', 'providers', 'imports', 'exports', 'selector',
  'template', 'styles', 'changedetection', 'viewchild', 'contentchild',
  'hostlistener', 'hostbinding', 'eventemitter', 'ngonchanges', 'afterviewinit',

  // RxJS Common
  'map', 'filter', 'tap', 'switchmap', 'mergemap', 'catcherror', 'of', 'from',
  'pipe', 'take', 'first', 'finalize', 'debounce', 'throttle', 'distinct',
  'share', 'replay', 'concat', 'merge', 'combine', 'zip', 'forkjoin',

  // Common Programming Terms
  'get', 'set', 'data', 'result', 'response', 'request', 'error', 'value',
  'item', 'items', 'list', 'array', 'object', 'index', 'length', 'key',
  'name', 'text', 'label', 'title', 'description', 'message', 'status',
  'type', 'state', 'props', 'params', 'args', 'options', 'config', 'settings',
  'handler', 'callback', 'promise', 'then', 'resolve', 'reject',

  // Single Letters and Short Terms
  'a', 'b', 'c', 'd', 'e', 'i', 'j', 'k', 'n', 'x', 'y', 'z',
  'id', 'el', 'fn', 'cb', 'ev', 'rx', 'ng', 'ts', 'js',

  // Common Method Names
  'init', 'load', 'save', 'update', 'delete', 'create', 'remove', 'add',
  'find', 'fetch', 'send', 'receive', 'handle', 'process', 'validate',
  'parse', 'format', 'convert', 'transform', 'build', 'render', 'display',

  // Testing Terms
  'test', 'spec', 'describe', 'it', 'expect', 'should', 'mock', 'spy',
  'beforeeach', 'aftereach', 'beforeall', 'afterall', 'fixture',
]);

/**
 * Check if a term is a stopword
 */
export function isStopword(term: string, additionalStopwords?: Set<string>): boolean {
  if (CODE_STOPWORDS.has(term)) return true;
  if (additionalStopwords && additionalStopwords.has(term)) return true;
  return false;
}
