
import { Component, Output, EventEmitter } from '@angular/core';
import { ProductApi } from './product.api';
import { Product } from './product.models';

@Component({
  selector: 'app-product-search',
  template: `
    <input [(ngModel)]="query" (input)="search()" placeholder="Search products...">
    <div class="results" *ngIf="results.length">
      <app-product-card *ngFor="let p of results" [product]="p"></app-product-card>
    </div>
  `
})
export class ProductSearchComponent {
  query = '';
  results: Product[] = [];
  @Output() productSelected = new EventEmitter<Product>();

  constructor(private api: ProductApi) {}

  async search() {
    if (this.query.length < 2) return;
    this.results = await this.api.getProducts({ search: this.query });
  }
}
