/**
 * NgRx Metadata Extraction - handles N1-N5
 *
 * - Actions (N1)
 * - Reducers (N2)
 * - Effects (N3)
 * - Selectors (N4)
 * - Feature state registration (N5)
 */

import * as path from 'path';
import {
  SourceFile,
  Node,
  SyntaxKind,
} from 'ts-morph';

import {
  Dependency,
  NgRxMetadata,
  NgRxAction,
  NgRxReducer,
  NgRxEffect,
  NgRxSelector,
} from './types';

export class NgRxExtractor {
  /**
   * Extract NgRx metadata from source file
   */
  extract(
    sourceFile: SourceFile,
    filePath: string,
    deps: Dependency[]
  ): NgRxMetadata | undefined {
    const metadata: NgRxMetadata = {};
    const fileName = path.basename(filePath);

    // Detect file type by name convention
    const isActionFile = fileName.includes('.actions.');
    const isReducerFile = fileName.includes('.reducer.');
    const isEffectFile = fileName.includes('.effects.');
    const isSelectorFile = fileName.includes('.selectors.');

    if (isActionFile) {
      metadata.actions = this.extractActions(sourceFile);
    }

    if (isReducerFile) {
      metadata.reducers = this.extractReducers(sourceFile, filePath, deps);
    }

    if (isEffectFile) {
      metadata.effects = this.extractEffects(sourceFile, filePath, deps);
    }

    if (isSelectorFile) {
      metadata.selectors = this.extractSelectors(sourceFile, filePath, deps);
    }

    // Check for feature key
    const featureKey = this.extractFeatureKey(sourceFile);
    if (featureKey) {
      metadata.featureKey = featureKey;
    }

    // Return undefined if no NgRx metadata was found
    if (!metadata.actions?.length && !metadata.reducers?.length &&
        !metadata.effects?.length && !metadata.selectors?.length && !metadata.featureKey) {
      return undefined;
    }

    return metadata;
  }

  /**
   * Extract createAction calls and class-based actions (N1)
   */
  private extractActions(sourceFile: SourceFile): NgRxAction[] {
    const actions: NgRxAction[] = [];

    // New pattern: createAction
    sourceFile.forEachDescendant((node) => {
      if (Node.isCallExpression(node)) {
        const expr = node.getExpression();
        if (Node.isIdentifier(expr) && expr.getText() === 'createAction') {
          const args = node.getArguments();
          if (args.length > 0 && Node.isStringLiteral(args[0])) {
            const actionType = args[0].getLiteralValue();

            // Get the variable name
            const parent = node.getParent();
            let name = actionType;
            if (Node.isVariableDeclaration(parent)) {
              name = parent.getName();
            }

            actions.push({
              name,
              type: actionType,
              line: node.getStartLineNumber(),
            });
          }
        }
      }
    });

    // Old pattern: class extending Action
    for (const cls of sourceFile.getClasses()) {
      const heritage = cls.getHeritageClauses();
      for (const clause of heritage) {
        const text = clause.getText();
        if (text.includes('implements') && text.includes('Action')) {
          const typeProperty = cls.getProperty('type');
          if (typeProperty) {
            const initializer = typeProperty.getInitializer();
            if (initializer && Node.isStringLiteral(initializer)) {
              actions.push({
                name: cls.getName() || 'UnnamedAction',
                type: initializer.getLiteralValue(),
                line: cls.getStartLineNumber(),
              });
            }
          }
        }
      }
    }

    return actions;
  }

  /**
   * Extract reducer action references (N2)
   */
  private extractReducers(
    sourceFile: SourceFile,
    filePath: string,
    deps: Dependency[]
  ): NgRxReducer[] {
    const reducers: NgRxReducer[] = [];

    // New pattern: createReducer with on()
    sourceFile.forEachDescendant((node) => {
      if (Node.isCallExpression(node)) {
        const expr = node.getExpression();
        if (Node.isIdentifier(expr) && expr.getText() === 'createReducer') {
          const actions: string[] = [];

          // Find on() calls in the arguments
          for (const arg of node.getArguments()) {
            if (Node.isCallExpression(arg)) {
              const argExpr = arg.getExpression();
              if (Node.isIdentifier(argExpr) && argExpr.getText() === 'on') {
                const onArgs = arg.getArguments();
                // First arg(s) are action(s)
                for (const onArg of onArgs) {
                  if (Node.isIdentifier(onArg)) {
                    const actionName = onArg.getText();
                    actions.push(actionName);

                    deps.push({
                      type: 'ngrx-action',
                      source: filePath,
                      target: `ngrx-action:${actionName}`,
                      specifier: actionName,
                      line: onArg.getStartLineNumber(),
                      column: 0,
                      metadata: { context: 'reducer' },
                    });
                  }
                }
              }
            }
          }

          // Get reducer name
          const parent = node.getParent();
          let name = 'reducer';
          if (Node.isVariableDeclaration(parent)) {
            name = parent.getName();
          }

          reducers.push({
            name,
            actions,
            line: node.getStartLineNumber(),
          });
        }
      }
    });

    // Old pattern: switch on action.type
    for (const fn of sourceFile.getFunctions()) {
      const body = fn.getBody();
      if (!body) continue;

      const switchStatements = body.getDescendantsOfKind(SyntaxKind.SwitchStatement);
      for (const sw of switchStatements) {
        const expr = sw.getExpression();
        if (expr.getText().includes('.type')) {
          const actions: string[] = [];
          const clauses = sw.getClauses();

          for (const clause of clauses) {
            if (Node.isCaseClause(clause)) {
              const caseExpr = clause.getExpression();
              if (caseExpr) {
                const actionRef = caseExpr.getText();
                actions.push(actionRef);

                deps.push({
                  type: 'ngrx-action',
                  source: filePath,
                  target: `ngrx-action:${actionRef}`,
                  specifier: actionRef,
                  line: clause.getStartLineNumber(),
                  column: 0,
                  metadata: { context: 'reducer', pattern: 'switch' },
                });
              }
            }
          }

          reducers.push({
            name: fn.getName() || 'reducer',
            actions,
            line: fn.getStartLineNumber(),
          });
        }
      }
    }

    return reducers;
  }

  /**
   * Extract effect action references (N3)
   */
  private extractEffects(
    sourceFile: SourceFile,
    filePath: string,
    deps: Dependency[]
  ): NgRxEffect[] {
    const effects: NgRxEffect[] = [];

    for (const cls of sourceFile.getClasses()) {
      for (const prop of cls.getProperties()) {
        const initializer = prop.getInitializer();
        if (!initializer) continue;

        // Look for createEffect or @Effect decorator
        const decorators = prop.getDecorators();
        const hasEffectDecorator = decorators.some(d => d.getName() === 'Effect');

        if (hasEffectDecorator || this.isCreateEffectCall(initializer)) {
          const actions: string[] = [];
          const dispatches: string[] = [];

          // Find ofType calls
          initializer.forEachDescendant((node) => {
            if (Node.isCallExpression(node)) {
              const expr = node.getExpression();
              if (Node.isIdentifier(expr) && expr.getText() === 'ofType') {
                for (const arg of node.getArguments()) {
                  const actionName = arg.getText();
                  actions.push(actionName);

                  deps.push({
                    type: 'ngrx-action',
                    source: filePath,
                    target: `ngrx-action:${actionName}`,
                    specifier: actionName,
                    line: arg.getStartLineNumber(),
                    column: 0,
                    metadata: { context: 'effect' },
                  });
                }
              }
            }
          });

          effects.push({
            name: prop.getName(),
            actions,
            dispatches,
            line: prop.getStartLineNumber(),
          });
        }
      }
    }

    return effects;
  }

  private isCreateEffectCall(node: Node): boolean {
    if (Node.isCallExpression(node)) {
      const expr = node.getExpression();
      if (Node.isIdentifier(expr) && expr.getText() === 'createEffect') {
        return true;
      }
    }
    return false;
  }

  /**
   * Extract selector definitions (N4)
   */
  private extractSelectors(
    sourceFile: SourceFile,
    filePath: string,
    deps: Dependency[]
  ): NgRxSelector[] {
    const selectors: NgRxSelector[] = [];

    sourceFile.forEachDescendant((node) => {
      if (Node.isCallExpression(node)) {
        const expr = node.getExpression();

        // createSelector
        if (Node.isIdentifier(expr) && expr.getText() === 'createSelector') {
          const args = node.getArguments();
          const composedFrom: string[] = [];

          // All args except the last are input selectors
          for (let i = 0; i < args.length - 1; i++) {
            const arg = args[i];
            if (Node.isIdentifier(arg)) {
              const selectorName = arg.getText();
              composedFrom.push(selectorName);

              deps.push({
                type: 'ngrx-selector',
                source: filePath,
                target: `ngrx-selector:${selectorName}`,
                specifier: selectorName,
                line: arg.getStartLineNumber(),
                column: 0,
                metadata: { context: 'composition' },
              });
            }
          }

          // Get selector name
          const parent = node.getParent();
          let name = 'selector';
          if (Node.isVariableDeclaration(parent)) {
            name = parent.getName();
          }

          selectors.push({
            name,
            composedFrom: composedFrom.length > 0 ? composedFrom : undefined,
            line: node.getStartLineNumber(),
          });
        }

        // createFeatureSelector
        if (Node.isIdentifier(expr) && expr.getText() === 'createFeatureSelector') {
          const parent = node.getParent();
          let name = 'featureSelector';
          let featureKey: string | undefined;

          if (Node.isVariableDeclaration(parent)) {
            name = parent.getName();
          }

          const args = node.getArguments();
          if (args.length > 0 && Node.isStringLiteral(args[0])) {
            featureKey = args[0].getLiteralValue();
          }

          selectors.push({
            name,
            featureKey,
            line: node.getStartLineNumber(),
          });
        }
      }
    });

    return selectors;
  }

  /**
   * Extract StoreModule.forFeature key (N5)
   */
  private extractFeatureKey(sourceFile: SourceFile): string | undefined {
    let featureKey: string | undefined;

    sourceFile.forEachDescendant((node) => {
      if (Node.isCallExpression(node)) {
        const expr = node.getExpression();
        if (Node.isPropertyAccessExpression(expr)) {
          const objName = expr.getExpression().getText();
          const methodName = expr.getName();

          if (objName === 'StoreModule' && methodName === 'forFeature') {
            const args = node.getArguments();
            if (args.length > 0 && Node.isStringLiteral(args[0])) {
              featureKey = args[0].getLiteralValue();
            }
          }
        }
      }
    });

    return featureKey;
  }
}
