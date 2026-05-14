
import { Component, Output, EventEmitter } from '@angular/core';
import { ProductFilter, ProductCategory } from './product.models';
import { ProductService } from './product.service';

@Component({
  selector: 'app-product-filter',
  template: `
    <div class="filters">
      <select [(ngModel)]="filter.categoryId">
        <option *ngFor="let cat of categories" [value]="cat.id">{{cat.name}}</option>
      </select>
      <input type="number" [(ngModel)]="filter.minPrice" placeholder="Min price">
      <input type="number" [(ngModel)]="filter.maxPrice" placeholder="Max price">
      <button (click)="apply()">Apply</button>
    </div>
  `
})
export class ProductFilterComponent {
  filter: ProductFilter = {};
  categories: ProductCategory[] = [];
  @Output() filterChange = new EventEmitter<ProductFilter>();

  constructor(private productService: ProductService) {}

  async ngOnInit() {
    this.categories = await this.productService.getCategories();
  }

  apply() {
    this.filterChange.emit(this.filter);
  }
}
