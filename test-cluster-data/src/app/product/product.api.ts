
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Product, ProductFilter, ProductCategory } from './product.models';

@Injectable({ providedIn: 'root' })
export class ProductApi {
  private baseUrl = '/api/products';

  constructor(private http: HttpClient) {}

  getProducts(filter?: ProductFilter): Promise<Product[]> {
    return this.http.get<Product[]>(this.baseUrl, { params: filter as any }).toPromise();
  }

  getProduct(id: string): Promise<Product> {
    return this.http.get<Product>(`${this.baseUrl}/${id}`).toPromise();
  }

  getCategories(): Promise<ProductCategory[]> {
    return this.http.get<ProductCategory[]>('/api/categories').toPromise();
  }
}
