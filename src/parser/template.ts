export interface TemplateRef {
  type: 'component' | 'directive' | 'pipe';
  name: string;
}

export function parseTemplate(templateContent: string): TemplateRef[] {
  const refs: TemplateRef[] = [];
  const seen = new Set<string>();

  // Match component selectors: <app-something> or <prefix-something>
  // Angular component selectors are typically kebab-case
  const componentRegex = /<([a-z][a-z0-9]*(?:-[a-z0-9]+)+)[\s>\/]/gi;
  let match;

  while ((match = componentRegex.exec(templateContent)) !== null) {
    const selector = match[1].toLowerCase();
    // Skip standard HTML elements
    if (!isStandardHtmlElement(selector) && !seen.has(`component:${selector}`)) {
      seen.add(`component:${selector}`);
      refs.push({ type: 'component', name: selector });
    }
  }

  // Match attribute directives: [appSomething] or [ngSomething]
  const attrDirectiveRegex = /\[([a-z][a-zA-Z0-9]*)\]/g;
  while ((match = attrDirectiveRegex.exec(templateContent)) !== null) {
    const directive = match[1];
    // Filter out standard Angular bindings and HTML attributes
    if (!isStandardBinding(directive) && !seen.has(`directive:${directive}`)) {
      seen.add(`directive:${directive}`);
      refs.push({ type: 'directive', name: directive });
    }
  }

  // Match structural directives: *ngIf, *ngFor, *appCustom
  const structuralRegex = /\*([a-z][a-zA-Z0-9]*)/g;
  while ((match = structuralRegex.exec(templateContent)) !== null) {
    const directive = match[1];
    if (!seen.has(`directive:${directive}`)) {
      seen.add(`directive:${directive}`);
      refs.push({ type: 'directive', name: directive });
    }
  }

  // Match pipes: {{ value | pipeName }} or {{ value | pipeName:arg }}
  const pipeRegex = /\|\s*([a-z][a-zA-Z0-9]*)/gi;
  while ((match = pipeRegex.exec(templateContent)) !== null) {
    const pipe = match[1];
    // Filter out standard Angular pipes
    if (!isStandardPipe(pipe) && !seen.has(`pipe:${pipe}`)) {
      seen.add(`pipe:${pipe}`);
      refs.push({ type: 'pipe', name: pipe });
    }
  }

  return refs;
}

function isStandardHtmlElement(tag: string): boolean {
  const htmlElements = new Set([
    'a', 'abbr', 'address', 'area', 'article', 'aside', 'audio',
    'b', 'base', 'bdi', 'bdo', 'blockquote', 'body', 'br', 'button',
    'canvas', 'caption', 'cite', 'code', 'col', 'colgroup',
    'data', 'datalist', 'dd', 'del', 'details', 'dfn', 'dialog', 'div', 'dl', 'dt',
    'em', 'embed',
    'fieldset', 'figcaption', 'figure', 'footer', 'form',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'hr', 'html',
    'i', 'iframe', 'img', 'input', 'ins',
    'kbd', 'keygen',
    'label', 'legend', 'li', 'link',
    'main', 'map', 'mark', 'menu', 'menuitem', 'meta', 'meter',
    'nav', 'noscript',
    'object', 'ol', 'optgroup', 'option', 'output',
    'p', 'param', 'picture', 'pre', 'progress',
    'q',
    'rp', 'rt', 'ruby',
    's', 'samp', 'script', 'section', 'select', 'small', 'source', 'span', 'strong', 'style', 'sub', 'summary', 'sup', 'svg',
    'table', 'tbody', 'td', 'template', 'textarea', 'tfoot', 'th', 'thead', 'time', 'title', 'tr', 'track',
    'u', 'ul',
    'var', 'video',
    'wbr',
    // SVG elements that might be hyphenated
    'font-face', 'missing-glyph',
    // ng-container and ng-template are Angular built-ins
    'ng-container', 'ng-template', 'ng-content',
  ]);

  return htmlElements.has(tag);
}

function isStandardBinding(attr: string): boolean {
  const standardBindings = new Set([
    // Angular core bindings
    'ngIf', 'ngFor', 'ngSwitch', 'ngSwitchCase', 'ngSwitchDefault',
    'ngClass', 'ngStyle', 'ngModel', 'ngModelOptions',
    'ngTemplateOutlet', 'ngTemplateOutletContext',
    'ngComponentOutlet',
    // Common HTML attribute bindings
    'class', 'style', 'id', 'name', 'value', 'type', 'src', 'href', 'alt', 'title',
    'disabled', 'readonly', 'checked', 'selected', 'hidden', 'required',
    'placeholder', 'min', 'max', 'step', 'pattern', 'maxlength', 'minlength',
    'rows', 'cols', 'size', 'width', 'height',
    'formControl', 'formControlName', 'formGroup', 'formGroupName', 'formArrayName',
    // Router
    'routerLink', 'routerLinkActive', 'routerLinkActiveOptions',
    'queryParams', 'fragment', 'preserveFragment', 'skipLocationChange', 'replaceUrl',
    // CDK
    'cdkScrollable', 'cdkDrag', 'cdkDrop', 'cdkDropList',
  ]);

  return standardBindings.has(attr);
}

function isStandardPipe(pipe: string): boolean {
  const standardPipes = new Set([
    // Angular common pipes
    'async', 'currency', 'date', 'decimal', 'i18nPlural', 'i18nSelect',
    'json', 'keyvalue', 'lowercase', 'number', 'percent', 'slice',
    'titlecase', 'uppercase',
  ]);

  return standardPipes.has(pipe);
}
