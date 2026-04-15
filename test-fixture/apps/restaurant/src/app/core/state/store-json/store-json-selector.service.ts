import { Injectable } from '@angular/core';
import { Store, select } from '@ngrx/store';
import { Observable } from 'rxjs';
import * as fromSelectors from './store-json.selectors';
import { StoreJsonState } from './store-json.reducer';

/**
 * Selector Service - wraps raw selectors in an injectable service
 * This is the pattern used in POS codebase
 * Benefits: easier to mock in tests, cleaner component injection
 */
@Injectable({ providedIn: 'root' })
export class StoreJsonSelectorService {

  constructor(private store: Store<any>) {}

  // N3: Selector wrapped in service method returning Observable
  getLoaded$(): Observable<boolean> {
    return this.store.pipe(select(fromSelectors.selectLoaded));
  }

  getLoading$(): Observable<boolean> {
    return this.store.pipe(select(fromSelectors.selectLoading));
  }

  getStoreSettings$(): Observable<any> {
    return this.store.pipe(select(fromSelectors.selectStoreSettings));
  }

  getDealerImage$(): Observable<any> {
    return this.store.pipe(select(fromSelectors.selectDealerImage));
  }

  getError$(): Observable<string | null> {
    return this.store.pipe(select(fromSelectors.selectError));
  }

  // Composed selector via service
  getLoadStatus$(): Observable<{ loaded: boolean; loading: boolean; error: string | null; status: string }> {
    return this.store.pipe(select(fromSelectors.selectLoadStatus));
  }

  // Parameterized selector
  getSettingByKey$(key: string): Observable<any> {
    return this.store.pipe(select(fromSelectors.selectSettingByKey(key)));
  }
}
