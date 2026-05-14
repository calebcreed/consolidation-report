
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Product, ProductCategory } from './product.models';

@Injectable({ providedIn: 'root' })
export class ProductState {
  private products$ = new BehaviorSubject<Product[]>([]);
  private categories$ = new BehaviorSubject<ProductCategory[]>([]);

  setProducts(products: Product[]): void {
    this.products$.next(products);
  }

  getProducts(): Product[] {
    return this.products$.value;
  }

  setCategories(categories: ProductCategory[]): void {
    this.categories$.next(categories);
  }
}
