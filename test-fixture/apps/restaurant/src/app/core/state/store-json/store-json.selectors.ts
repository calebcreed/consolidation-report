import { createSelector, createFeatureSelector } from '@ngrx/store';
import { StoreJsonState } from './store-json.reducer';

// =============================================================
// Feature selector - selects the feature state slice
// =============================================================

// N5: Feature state - this name must match StoreModule.forFeature('storeJson', ...)
export const selectStoreJsonState = createFeatureSelector<StoreJsonState>('storeJson');


// =============================================================
// OLD PATTERN: Plain functions as selectors
// =============================================================

export const getLoaded = (state: StoreJsonState) => state.loaded;
export const getLoading = (state: StoreJsonState) => state.loading;
export const getStoreSettings = (state: StoreJsonState) => state.storeSettings;


// =============================================================
// NEW PATTERN: createSelector() (memoized)
// =============================================================

// N3: Basic selectors - select single properties
export const selectLoaded = createSelector(
  selectStoreJsonState,
  (state: StoreJsonState) => state.loaded
);

export const selectLoading = createSelector(
  selectStoreJsonState,
  (state: StoreJsonState) => state.loading
);

export const selectStoreSettings = createSelector(
  selectStoreJsonState,
  (state: StoreJsonState) => state.storeSettings
);

export const selectDealerImage = createSelector(
  selectStoreJsonState,
  (state: StoreJsonState) => state.dealerImage
);

export const selectError = createSelector(
  selectStoreJsonState,
  (state: StoreJsonState) => state.error
);


// =============================================================
// N4: Composed selectors - selectors that use other selectors
// =============================================================

// Composed selector using multiple selectors
export const selectLoadStatus = createSelector(
  selectLoaded,
  selectLoading,
  selectError,
  (loaded, loading, error) => ({
    loaded,
    loading,
    error,
    status: loading ? 'loading' : loaded ? 'ready' : error ? 'error' : 'idle'
  })
);

// Derived data selector
export const selectHasStoreSettings = createSelector(
  selectStoreSettings,
  (settings) => settings !== null && settings !== undefined
);

// Selector with props (parameterized selector)
export const selectSettingByKey = (key: string) => createSelector(
  selectStoreSettings,
  (settings) => settings ? settings[key] : null
);

// Complex composed selector
export const selectStoreJsonSummary = createSelector(
  selectLoaded,
  selectStoreSettings,
  selectDealerImage,
  (loaded, settings, dealerImage) => {
    if (!loaded) return null;
    return {
      hasSettings: !!settings,
      hasDealerImage: !!dealerImage,
      settingsCount: settings ? Object.keys(settings).length : 0
    };
  }
);
