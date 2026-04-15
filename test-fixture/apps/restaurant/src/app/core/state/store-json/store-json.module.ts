import { NgModule } from '@angular/core';
import { StoreModule } from '@ngrx/store';
import { EffectsModule } from '@ngrx/effects';
import { reducer } from './store-json.reducer';
import { StoreJsonEffects } from './store-json.effects';

@NgModule({
  imports: [
    // N5: Feature state registration
    // 'storeJson' must match createFeatureSelector('storeJson') in selectors
    StoreModule.forFeature('storeJson', reducer),
    EffectsModule.forFeature([StoreJsonEffects])
  ]
})
export class StoreJsonStateModule {}
