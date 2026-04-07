import { Project, SourceFile, SyntaxKind, Node } from 'ts-morph';
import * as fs from 'fs';

export interface NgRxPatterns {
  // Actions defined in this file
  actionNames: string[];           // e.g., '[Cart] Add Item', 'loadProducts'
  actionIdentifiers: string[];     // e.g., 'addItem', 'LoadProducts'

  // Actions referenced (in reducers, effects)
  referencedActions: string[];     // Action names or identifiers used

  // Selectors defined
  selectorNames: string[];

  // Selectors used
  referencedSelectors: string[];

  // Store feature name
  featureName?: string;
}

export function parseNgRxPatterns(filePath: string, content?: string): NgRxPatterns {
  const result: NgRxPatterns = {
    actionNames: [],
    actionIdentifiers: [],
    referencedActions: [],
    selectorNames: [],
    referencedSelectors: [],
  };

  if (!filePath.endsWith('.ts')) return result;

  const fileContent = content || (fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '');
  if (!fileContent) return result;

  // Detect action definitions: createAction('[Feature] Action Name', ...)
  const createActionRegex = /createAction\s*\(\s*['"`]([^'"`]+)['"`]/g;
  let match;
  while ((match = createActionRegex.exec(fileContent)) !== null) {
    result.actionNames.push(match[1]);
  }

  // Detect action class definitions: type = '[Feature] Action Name'
  const actionTypeRegex = /type\s*=\s*['"`](\[[^\]]+\][^'"`]*)['"`]/g;
  while ((match = actionTypeRegex.exec(fileContent)) !== null) {
    result.actionNames.push(match[1]);
  }

  // Detect exported action constants: export const loadItems = createAction(...)
  const actionConstRegex = /export\s+const\s+(\w+)\s*=\s*createAction/g;
  while ((match = actionConstRegex.exec(fileContent)) !== null) {
    result.actionIdentifiers.push(match[1]);
  }

  // Detect action class exports: export class LoadItems implements Action
  const actionClassRegex = /export\s+class\s+(\w+)\s+implements\s+Action/g;
  while ((match = actionClassRegex.exec(fileContent)) !== null) {
    result.actionIdentifiers.push(match[1]);
  }

  // Detect reducer action handling: on(ActionName, ...) or case ActionType:
  const onActionRegex = /on\s*\(\s*(\w+)/g;
  while ((match = onActionRegex.exec(fileContent)) !== null) {
    result.referencedActions.push(match[1]);
  }

  // Detect switch case action types: case '[Feature] Action':
  const caseActionRegex = /case\s+['"`](\[[^\]]+\][^'"`]*)['"`]/g;
  while ((match = caseActionRegex.exec(fileContent)) !== null) {
    result.referencedActions.push(match[1]);
  }

  // Detect case with action type reference: case ActionTypes.LoadItems:
  const caseEnumRegex = /case\s+\w+\.(\w+)\s*:/g;
  while ((match = caseEnumRegex.exec(fileContent)) !== null) {
    result.referencedActions.push(match[1]);
  }

  // Detect effect action handling: ofType(ActionName) or ofType('[Feature] Action')
  const ofTypeRegex = /ofType\s*\(\s*(\w+|['"`][^'"`]+['"`])/g;
  while ((match = ofTypeRegex.exec(fileContent)) !== null) {
    const actionRef = match[1].replace(/['"`]/g, '');
    result.referencedActions.push(actionRef);
  }

  // Detect ofType with multiple actions: ofType(Action1, Action2)
  const ofTypeMultiRegex = /ofType\s*\(([^)]+)\)/g;
  while ((match = ofTypeMultiRegex.exec(fileContent)) !== null) {
    const actions = match[1].split(',').map(a => a.trim().replace(/['"`]/g, ''));
    result.referencedActions.push(...actions);
  }

  // Detect selector definitions: export const selectItems = createSelector(...)
  const selectorRegex = /export\s+const\s+(select\w+|\w+Selector)\s*=/g;
  while ((match = selectorRegex.exec(fileContent)) !== null) {
    result.selectorNames.push(match[1]);
  }

  // Detect createFeatureSelector: createFeatureSelector<State>('featureName')
  const featureRegex = /createFeatureSelector\s*(?:<[^>]+>)?\s*\(\s*['"`](\w+)['"`]\)/;
  const featureMatch = featureRegex.exec(fileContent);
  if (featureMatch) {
    result.featureName = featureMatch[1];
  }

  // Detect selector usage: this.store.select(selectItems) or store.pipe(select(selectItems))
  const selectUsageRegex = /select\s*\(\s*(\w+)/g;
  while ((match = selectUsageRegex.exec(fileContent)) !== null) {
    if (match[1].startsWith('select') || match[1].endsWith('Selector')) {
      result.referencedSelectors.push(match[1]);
    }
  }

  // Detect dispatch: this.store.dispatch(new ActionName(...)) or dispatch(actionName(...))
  const dispatchRegex = /dispatch\s*\(\s*(?:new\s+)?(\w+)/g;
  while ((match = dispatchRegex.exec(fileContent)) !== null) {
    result.referencedActions.push(match[1]);
  }

  // Deduplicate
  result.actionNames = [...new Set(result.actionNames)];
  result.actionIdentifiers = [...new Set(result.actionIdentifiers)];
  result.referencedActions = [...new Set(result.referencedActions)];
  result.selectorNames = [...new Set(result.selectorNames)];
  result.referencedSelectors = [...new Set(result.referencedSelectors)];

  return result;
}

export function inferNgRxFileType(filePath: string): 'action' | 'reducer' | 'effect' | 'selector' | 'state' | null {
  const lower = filePath.toLowerCase();
  if (lower.includes('.actions.')) return 'action';
  if (lower.includes('.reducer.')) return 'reducer';
  if (lower.includes('.effects.')) return 'effect';
  if (lower.includes('.selectors.') || lower.includes('.selector.')) return 'selector';
  if (lower.includes('.state.')) return 'state';
  return null;
}
