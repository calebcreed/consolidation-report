import { createReducer, on } from '@ngrx/store';
import * as fromActions from './store-json.actions';

// State interface
export interface StoreJsonState {
  loaded: boolean;
  loading: boolean;
  businessDate: string;
  storeSettings: any;
  images: any;
  dealerImage: any;
  error: string | null;
}

// Initial state
export const initialState: StoreJsonState = {
  loaded: false,
  loading: false,
  businessDate: '',
  storeSettings: null,
  images: null,
  dealerImage: null,
  error: null
};


// =============================================================
// OLD PATTERN: switch-based reducer function
// =============================================================

export function reducerOld(
  state = initialState,
  action: fromActions.Actions
): StoreJsonState {
  switch (action.type) {
    // N1: Action type constant referenced in reducer
    case fromActions.LOAD_STORE_JSON: {
      return {
        ...state,
        loading: true,
        error: null
      };
    }

    case fromActions.LOAD_STORE_JSON_SUCCESS: {
      // Action payload accessed via action property
      return {
        ...state,
        loaded: true,
        loading: false,
        storeSettings: action.responsePayload
      };
    }

    case fromActions.LOAD_STORE_JSON_FAIL: {
      return {
        ...state,
        loading: false,
        error: action.error
      };
    }

    case fromActions.UPDATE_DEALER_IMAGE: {
      return {
        ...state,
        dealerImage: action.imageData
      };
    }

    default:
      return state;
  }
}


// =============================================================
// NEW PATTERN: createReducer() with on()
// =============================================================

export const reducerNew = createReducer(
  initialState,

  // N1: Action creator referenced in on()
  on(fromActions.loadStoreJsonNew, (state, { message, isFromSync }) => ({
    ...state,
    loading: true,
    error: null
  })),

  on(fromActions.loadStoreJsonSuccessNew, (state, { payload, timestamp }) => ({
    ...state,
    loaded: true,
    loading: false,
    storeSettings: payload
  })),

  on(fromActions.loadStoreJsonFailNew, (state, { error }) => ({
    ...state,
    loading: false,
    error
  })),

  on(fromActions.clearStoreJson, (state) => ({
    ...initialState
  }))
);


// Export the reducer (use whichever pattern)
export function reducer(state: StoreJsonState | undefined, action: any): StoreJsonState {
  // Could delegate to either reducerOld or reducerNew
  return reducerNew(state, action);
}
