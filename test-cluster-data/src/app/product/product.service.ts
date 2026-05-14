
import { Injectable } from '@angular/core';
import { Product, ProductFilter, ProductCategory } from './product.models';
import { ProductApi } from './product.api';
import { ProductState } from './product.state';

@Injectable({ providedIn: 'root' })
export class ProductService {
  constructor(private api: ProductApi, private state: ProductState) {}

  async loadProducts(filter?: ProductFilter): Promise<Product[]> {
    const products = await this.api.getProducts(filter);
    this.state.setProducts(products);
    return products;
  }

  async getProduct(id: string): Promise<Product> {
    return this.api.getProduct(id);
  }

  async getCategories(): Promise<ProductCategory[]> {
    return this.api.getCategories();
  }
}
