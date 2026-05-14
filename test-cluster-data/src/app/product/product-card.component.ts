
import { Component, Input } from '@angular/core';
import { Product } from './product.models';

@Component({
  selector: 'app-product-card',
  template: `
    <div class="product-card">
      <img [src]="product.images[0]" [alt]="product.name">
      <h3>{{product.name}}</h3>
      <p class="price">${{product.salePrice || product.price}}</p>
      <span *ngIf="product.salePrice" class="sale-badge">Sale</span>
    </div>
  `
})
export class ProductCardComponent {
  @Input() product!: Product;
}
