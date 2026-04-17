import { Action } from '@ngrx/store';
import { createAction, props } from '@ngrx/store';

// =============================================================
// OLD PATTERN: Class-based actions (pre-NgRx v8)
// =============================================================

// Action type constants
export const LOAD_STORE_JSON = '[StoreJson] Load Store Json';
export const LOAD_STORE_JSON_SUCCESS = '[StoreJson] Load Store Json Success';
export const LOAD_STORE_JSON_FAIL = '[StoreJson] Load Store Json Fail';
export const UPDATE_DEALER_IMAGE = '[StoreJson] Update Dealer Image';

// Class-based action with payload via constructor
export class LoadStoreJsonAction implements Action {
  readonly type = LOAD_STORE_JSON;
  constructor(
    public message?: any,
    public isNoSetupMenu?: boolean,
    public isCancelBtn?: boolean,
    public isFromSync?: boolean
  ) {}
}

export class LoadStoreJsonSuccessAction implements Action {
  readonly type = LOAD_STORE_JSON_SUCCESS;
  constructor(
    public responsePayload: any,
    public isRestrictToSyncImage?: boolean
  ) {}
}

export class LoadStoreJsonFailAction implements Action {
  readonly type = LOAD_STORE_JSON_FAIL;
  constructor(public error: any) {}
}

export class UpdateDealerImageAction implements Action {
  readonly type = UPDATE_DEALER_IMAGE;
  constructor(public imageData: any) {}
}

// Union type for reducer typing (old pattern)
export type Actions =
  | LoadStoreJsonAction
  | LoadStoreJsonSuccessAction
  | LoadStoreJsonFailAction
  | UpdateDealerImageAction;


// =============================================================
// NEW PATTERN: createAction() (NgRx v8+)
// =============================================================

// createAction with no payload
export const clearStoreJson = createAction(
  '[StoreJson] Clear Store Json'
);

// createAction with props payload
export const loadStoreJsonNew = createAction(
  '[StoreJson] Load Store Json New',
  props<{ message?: string; isFromSync?: boolean }>()
);

export const loadStoreJsonSuccessNew = createAction(
  '[StoreJson] Load Store Json Success New',
  props<{ payload: any; timestamp: number }>()
);

export const loadStoreJsonFailNew = createAction(
  '[StoreJson] Load Store Json Fail New',
  props<{ error: string }>()
);

// =============================================================
// RETAIL-ONLY: Extra action added in retail branch
// This creates a BOTTLENECK - this file is now dirty and blocks
// all other store-json files from being migrated
// =============================================================
export const refreshStoreJsonCache = createAction(
  '[StoreJson] Refresh Cache',
  props<{ forceRefresh: boolean }>()
);
