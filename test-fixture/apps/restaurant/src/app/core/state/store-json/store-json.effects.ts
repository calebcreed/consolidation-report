import { Injectable } from '@angular/core';
import { Actions, createEffect, ofType, Effect } from '@ngrx/effects';
import { of } from 'rxjs';
import { map, mergeMap, catchError, switchMap } from 'rxjs/operators';
import * as fromActions from './store-json.actions';

@Injectable()
export class StoreJsonEffects {

  constructor(
    private actions$: Actions,
    // private storeJsonService: StoreJsonService  // would inject service
  ) {}


  // =============================================================
  // OLD PATTERN: @Effect() decorator (deprecated but still works)
  // =============================================================

  // N2: Action referenced in effect via ofType with string constant
  @Effect()
  loadStoreJsonOld$ = this.actions$.pipe(
    ofType(fromActions.LOAD_STORE_JSON),
    mergeMap((action: fromActions.LoadStoreJsonAction) => {
      // Would call service here
      // return this.storeJsonService.load(action.message).pipe(...)
      return of({ data: 'mock response' }).pipe(
        map(response => new fromActions.LoadStoreJsonSuccessAction(response, false)),
        catchError(error => of(new fromActions.LoadStoreJsonFailAction(error)))
      );
    })
  );


  // =============================================================
  // NEW PATTERN: createEffect() (NgRx v8+)
  // =============================================================

  // N2: Action creator referenced in effect via ofType
  loadStoreJsonNew$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fromActions.loadStoreJsonNew),
      switchMap(({ message, isFromSync }) => {
        // Would call service here
        return of({ data: 'mock response' }).pipe(
          map(response => fromActions.loadStoreJsonSuccessNew({
            payload: response,
            timestamp: Date.now()
          })),
          catchError(error => of(fromActions.loadStoreJsonFailNew({
            error: error.message
          })))
        );
      })
    )
  );

  // Effect that dispatches multiple actions
  clearAndReload$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fromActions.clearStoreJson),
      map(() => fromActions.loadStoreJsonNew({ message: 'reload' }))
    )
  );

  // Non-dispatching effect (just for side effects like logging)
  logActions$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fromActions.loadStoreJsonSuccessNew),
      map(action => {
        console.log('Store JSON loaded:', action.payload);
      })
    ),
    { dispatch: false }
  );
}
