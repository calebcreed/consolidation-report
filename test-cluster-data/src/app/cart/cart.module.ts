
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CartService } from './cart.service';
import { CartState } from './cart.state';
import { CartApi } from './cart.api';
import { CartComponent } from './cart.component';
import { CartItemComponent } from './cart-item.component';
import { CartSummaryComponent } from './cart-summary.component';
import { CartIconComponent } from './cart-icon.component';
import { CartPromoComponent } from './cart-promo.component';

@NgModule({
  imports: [CommonModule],
  declarations: [CartComponent, CartItemComponent, CartSummaryComponent, CartIconComponent, CartPromoComponent],
  providers: [CartService, CartState, CartApi],
  exports: [CartComponent, CartItemComponent, CartSummaryComponent, CartIconComponent, CartPromoComponent]
})
export class CartModule {}
