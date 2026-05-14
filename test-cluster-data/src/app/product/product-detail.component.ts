
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ProductService } from './product.service';
import { Product } from './product.models';

@Component({
  selector: 'app-product-detail',
  template: `
    <div class="product-detail" *ngIf="product">
      <img [src]="product.images[0]" [alt]="product.name">
      <h1>{{product.name}}</h1>
      <p class="price">${{product.price}}</p>
      <p>{{product.description}}</p>
      <button (click)="addToCart()">Add to Cart</button>
    </div>
  `
})
export class ProductDetailComponent implements OnInit {
  product: Product | null = null;

  constructor(private route: ActivatedRoute, private productService: ProductService) {}

  async ngOnInit() {
    const id = this.route.snapshot.params['id'];
    this.product = await this.productService.getProduct(id);
  }

  addToCart() {}
}
