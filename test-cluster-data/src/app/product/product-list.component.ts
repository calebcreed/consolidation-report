
import { Component, OnInit } from '@angular/core';
import { ProductService } from './product.service';
import { Product, ProductFilter } from './product.models';
import { ProductState } from './product.state';

@Component({
  selector: 'app-product-list',
  template: `
    <div class="product-grid">
      <app-product-card *ngFor="let product of products" [product]="product"></app-product-card>
    </div>
  `
})
export class ProductListComponent implements OnInit {
  products: Product[] = [];

  constructor(private productService: ProductService, private state: ProductState) {}

  async ngOnInit() {
    this.products = await this.productService.loadProducts();
  }
}
