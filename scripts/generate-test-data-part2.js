/**
 * Part 2: Product, Cart, Order clusters
 */
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '../test-cluster-data/src/app');

function write(filePath, content) {
  const dir = path.dirname(path.join(BASE, filePath));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(BASE, filePath), content);
  console.log(`Created: ${filePath}`);
}

// ============ CLUSTER 3: PRODUCT (10 files) ============

write('product/product.service.ts', `
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
`);

write('product/product.models.ts', `
export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  salePrice?: number;
  images: string[];
  categoryId: string;
  stock: number;
  sku: string;
}

export interface ProductFilter {
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  search?: string;
}

export interface ProductCategory {
  id: string;
  name: string;
  slug: string;
  parentId?: string;
}
`);

write('product/product.api.ts', `
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
    return this.http.get<Product>(\`\${this.baseUrl}/\${id}\`).toPromise();
  }

  getCategories(): Promise<ProductCategory[]> {
    return this.http.get<ProductCategory[]>('/api/categories').toPromise();
  }
}
`);

write('product/product.state.ts', `
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
`);

write('product/product-list.component.ts', `
import { Component, OnInit } from '@angular/core';
import { ProductService } from './product.service';
import { Product, ProductFilter } from './product.models';
import { ProductState } from './product.state';

@Component({
  selector: 'app-product-list',
  template: \`
    <div class="product-grid">
      <app-product-card *ngFor="let product of products" [product]="product"></app-product-card>
    </div>
  \`
})
export class ProductListComponent implements OnInit {
  products: Product[] = [];

  constructor(private productService: ProductService, private state: ProductState) {}

  async ngOnInit() {
    this.products = await this.productService.loadProducts();
  }
}
`);

write('product/product-detail.component.ts', `
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ProductService } from './product.service';
import { Product } from './product.models';

@Component({
  selector: 'app-product-detail',
  template: \`
    <div class="product-detail" *ngIf="product">
      <img [src]="product.images[0]" [alt]="product.name">
      <h1>{{product.name}}</h1>
      <p class="price">\${{product.price}}</p>
      <p>{{product.description}}</p>
      <button (click)="addToCart()">Add to Cart</button>
    </div>
  \`
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
`);

write('product/product-card.component.ts', `
import { Component, Input } from '@angular/core';
import { Product } from './product.models';

@Component({
  selector: 'app-product-card',
  template: \`
    <div class="product-card">
      <img [src]="product.images[0]" [alt]="product.name">
      <h3>{{product.name}}</h3>
      <p class="price">\${{product.salePrice || product.price}}</p>
      <span *ngIf="product.salePrice" class="sale-badge">Sale</span>
    </div>
  \`
})
export class ProductCardComponent {
  @Input() product!: Product;
}
`);

write('product/product-filter.component.ts', `
import { Component, Output, EventEmitter } from '@angular/core';
import { ProductFilter, ProductCategory } from './product.models';
import { ProductService } from './product.service';

@Component({
  selector: 'app-product-filter',
  template: \`
    <div class="filters">
      <select [(ngModel)]="filter.categoryId">
        <option *ngFor="let cat of categories" [value]="cat.id">{{cat.name}}</option>
      </select>
      <input type="number" [(ngModel)]="filter.minPrice" placeholder="Min price">
      <input type="number" [(ngModel)]="filter.maxPrice" placeholder="Max price">
      <button (click)="apply()">Apply</button>
    </div>
  \`
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
`);

write('product/product-search.component.ts', `
import { Component, Output, EventEmitter } from '@angular/core';
import { ProductApi } from './product.api';
import { Product } from './product.models';

@Component({
  selector: 'app-product-search',
  template: \`
    <input [(ngModel)]="query" (input)="search()" placeholder="Search products...">
    <div class="results" *ngIf="results.length">
      <app-product-card *ngFor="let p of results" [product]="p"></app-product-card>
    </div>
  \`
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
`);

write('product/product.module.ts', `
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProductService } from './product.service';
import { ProductApi } from './product.api';
import { ProductState } from './product.state';
import { ProductListComponent } from './product-list.component';
import { ProductDetailComponent } from './product-detail.component';
import { ProductCardComponent } from './product-card.component';
import { ProductFilterComponent } from './product-filter.component';
import { ProductSearchComponent } from './product-search.component';

@NgModule({
  imports: [CommonModule],
  declarations: [ProductListComponent, ProductDetailComponent, ProductCardComponent, ProductFilterComponent, ProductSearchComponent],
  providers: [ProductService, ProductApi, ProductState],
  exports: [ProductListComponent, ProductDetailComponent, ProductCardComponent, ProductFilterComponent, ProductSearchComponent]
})
export class ProductModule {}
`);

// ============ CLUSTER 4: CART (10 files) ============

write('cart/cart.service.ts', `
import { Injectable } from '@angular/core';
import { CartItem, Cart, CartSummary } from './cart.models';
import { CartState } from './cart.state';
import { CartApi } from './cart.api';

@Injectable({ providedIn: 'root' })
export class CartService {
  constructor(private state: CartState, private api: CartApi) {}

  addItem(productId: string, quantity: number): void {
    this.state.addItem({ productId, quantity, price: 0 });
  }

  removeItem(productId: string): void {
    this.state.removeItem(productId);
  }

  updateQuantity(productId: string, quantity: number): void {
    this.state.updateQuantity(productId, quantity);
  }

  getCart(): Cart {
    return this.state.getCart();
  }

  getSummary(): CartSummary {
    return this.state.getSummary();
  }

  async checkout(): Promise<string> {
    const cart = this.getCart();
    const orderId = await this.api.checkout(cart);
    this.state.clearCart();
    return orderId;
  }
}
`);

write('cart/cart.models.ts', `
export interface CartItem {
  productId: string;
  productName?: string;
  quantity: number;
  price: number;
  image?: string;
}

export interface Cart {
  items: CartItem[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CartSummary {
  itemCount: number;
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
}

export interface CartPromo {
  code: string;
  discount: number;
  type: 'percent' | 'fixed';
}
`);

write('cart/cart.state.ts', `
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Cart, CartItem, CartSummary } from './cart.models';

@Injectable({ providedIn: 'root' })
export class CartState {
  private cart$ = new BehaviorSubject<Cart>({ items: [], createdAt: new Date(), updatedAt: new Date() });

  addItem(item: CartItem): void {
    const cart = this.cart$.value;
    const existing = cart.items.find(i => i.productId === item.productId);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      cart.items.push(item);
    }
    this.cart$.next({ ...cart, updatedAt: new Date() });
  }

  removeItem(productId: string): void {
    const cart = this.cart$.value;
    cart.items = cart.items.filter(i => i.productId !== productId);
    this.cart$.next({ ...cart, updatedAt: new Date() });
  }

  updateQuantity(productId: string, quantity: number): void {
    const cart = this.cart$.value;
    const item = cart.items.find(i => i.productId === productId);
    if (item) item.quantity = quantity;
    this.cart$.next({ ...cart, updatedAt: new Date() });
  }

  getCart(): Cart {
    return this.cart$.value;
  }

  getSummary(): CartSummary {
    const cart = this.cart$.value;
    const subtotal = cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    return { itemCount: cart.items.length, subtotal, tax: subtotal * 0.08, shipping: 5.99, total: subtotal * 1.08 + 5.99 };
  }

  clearCart(): void {
    this.cart$.next({ items: [], createdAt: new Date(), updatedAt: new Date() });
  }
}
`);

write('cart/cart.api.ts', `
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Cart, CartPromo } from './cart.models';

@Injectable({ providedIn: 'root' })
export class CartApi {
  constructor(private http: HttpClient) {}

  async checkout(cart: Cart): Promise<string> {
    const res = await this.http.post<{ orderId: string }>('/api/checkout', cart).toPromise();
    return res.orderId;
  }

  async applyPromo(code: string): Promise<CartPromo> {
    return this.http.post<CartPromo>('/api/cart/promo', { code }).toPromise();
  }

  async saveCart(cart: Cart): Promise<void> {
    await this.http.post('/api/cart', cart).toPromise();
  }
}
`);

write('cart/cart.component.ts', `
import { Component, OnInit } from '@angular/core';
import { CartService } from './cart.service';
import { Cart, CartSummary } from './cart.models';
import { CartState } from './cart.state';

@Component({
  selector: 'app-cart',
  template: \`
    <div class="cart">
      <h2>Shopping Cart</h2>
      <app-cart-item *ngFor="let item of cart.items" [item]="item" (remove)="remove(item.productId)"></app-cart-item>
      <app-cart-summary [summary]="summary"></app-cart-summary>
      <button (click)="checkout()">Checkout</button>
    </div>
  \`
})
export class CartComponent implements OnInit {
  cart!: Cart;
  summary!: CartSummary;

  constructor(private cartService: CartService, private state: CartState) {}

  ngOnInit() {
    this.cart = this.cartService.getCart();
    this.summary = this.cartService.getSummary();
  }

  remove(productId: string) {
    this.cartService.removeItem(productId);
  }

  checkout() {
    this.cartService.checkout();
  }
}
`);

write('cart/cart-item.component.ts', `
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CartItem } from './cart.models';
import { CartService } from './cart.service';

@Component({
  selector: 'app-cart-item',
  template: \`
    <div class="cart-item">
      <img [src]="item.image" [alt]="item.productName">
      <span>{{item.productName}}</span>
      <input type="number" [value]="item.quantity" (change)="updateQty($event)">
      <span>\${{item.price * item.quantity}}</span>
      <button (click)="remove.emit()">Remove</button>
    </div>
  \`
})
export class CartItemComponent {
  @Input() item!: CartItem;
  @Output() remove = new EventEmitter<void>();

  constructor(private cartService: CartService) {}

  updateQty(event: Event) {
    const qty = +(event.target as HTMLInputElement).value;
    this.cartService.updateQuantity(this.item.productId, qty);
  }
}
`);

write('cart/cart-summary.component.ts', `
import { Component, Input } from '@angular/core';
import { CartSummary } from './cart.models';

@Component({
  selector: 'app-cart-summary',
  template: \`
    <div class="cart-summary">
      <div>Items: {{summary.itemCount}}</div>
      <div>Subtotal: \${{summary.subtotal.toFixed(2)}}</div>
      <div>Tax: \${{summary.tax.toFixed(2)}}</div>
      <div>Shipping: \${{summary.shipping.toFixed(2)}}</div>
      <div class="total">Total: \${{summary.total.toFixed(2)}}</div>
    </div>
  \`
})
export class CartSummaryComponent {
  @Input() summary!: CartSummary;
}
`);

write('cart/cart-icon.component.ts', `
import { Component } from '@angular/core';
import { CartState } from './cart.state';
import { CartSummary } from './cart.models';

@Component({
  selector: 'app-cart-icon',
  template: \`
    <div class="cart-icon" (click)="toggle()">
      <span class="icon">🛒</span>
      <span class="badge" *ngIf="itemCount > 0">{{itemCount}}</span>
    </div>
  \`
})
export class CartIconComponent {
  itemCount = 0;

  constructor(private state: CartState) {
    const summary = this.state.getSummary();
    this.itemCount = summary.itemCount;
  }

  toggle() {}
}
`);

write('cart/cart-promo.component.ts', `
import { Component } from '@angular/core';
import { CartApi } from './cart.api';
import { CartPromo } from './cart.models';

@Component({
  selector: 'app-cart-promo',
  template: \`
    <div class="promo">
      <input [(ngModel)]="code" placeholder="Promo code">
      <button (click)="apply()">Apply</button>
      <span *ngIf="promo">-{{promo.discount}}{{promo.type === 'percent' ? '%' : '$'}}</span>
    </div>
  \`
})
export class CartPromoComponent {
  code = '';
  promo: CartPromo | null = null;

  constructor(private api: CartApi) {}

  async apply() {
    this.promo = await this.api.applyPromo(this.code);
  }
}
`);

write('cart/cart.module.ts', `
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
`);

// ============ CLUSTER 5: ORDER (10 files) ============

write('order/order.service.ts', `
import { Injectable } from '@angular/core';
import { Order, OrderStatus, OrderFilter } from './order.models';
import { OrderApi } from './order.api';
import { OrderState } from './order.state';

@Injectable({ providedIn: 'root' })
export class OrderService {
  constructor(private api: OrderApi, private state: OrderState) {}

  async getOrders(filter?: OrderFilter): Promise<Order[]> {
    const orders = await this.api.getOrders(filter);
    this.state.setOrders(orders);
    return orders;
  }

  async getOrder(id: string): Promise<Order> {
    return this.api.getOrder(id);
  }

  async updateStatus(id: string, status: OrderStatus): Promise<Order> {
    return this.api.updateStatus(id, status);
  }

  async cancelOrder(id: string): Promise<void> {
    await this.api.cancelOrder(id);
  }
}
`);

write('order/order.models.ts', `
export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
}

export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  status: OrderStatus;
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  shippingAddress: Address;
  createdAt: Date;
  updatedAt: Date;
}

export interface Address {
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export interface OrderFilter {
  status?: OrderStatus;
  startDate?: Date;
  endDate?: Date;
}
`);

write('order/order.api.ts', `
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Order, OrderStatus, OrderFilter } from './order.models';

@Injectable({ providedIn: 'root' })
export class OrderApi {
  private baseUrl = '/api/orders';

  constructor(private http: HttpClient) {}

  getOrders(filter?: OrderFilter): Promise<Order[]> {
    return this.http.get<Order[]>(this.baseUrl, { params: filter as any }).toPromise();
  }

  getOrder(id: string): Promise<Order> {
    return this.http.get<Order>(\`\${this.baseUrl}/\${id}\`).toPromise();
  }

  updateStatus(id: string, status: OrderStatus): Promise<Order> {
    return this.http.patch<Order>(\`\${this.baseUrl}/\${id}/status\`, { status }).toPromise();
  }

  cancelOrder(id: string): Promise<void> {
    return this.http.delete<void>(\`\${this.baseUrl}/\${id}\`).toPromise();
  }
}
`);

write('order/order.state.ts', `
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Order } from './order.models';

@Injectable({ providedIn: 'root' })
export class OrderState {
  private orders$ = new BehaviorSubject<Order[]>([]);
  private currentOrder$ = new BehaviorSubject<Order | null>(null);

  setOrders(orders: Order[]): void {
    this.orders$.next(orders);
  }

  getOrders(): Order[] {
    return this.orders$.value;
  }

  setCurrentOrder(order: Order): void {
    this.currentOrder$.next(order);
  }
}
`);

write('order/order-list.component.ts', `
import { Component, OnInit } from '@angular/core';
import { OrderService } from './order.service';
import { Order } from './order.models';

@Component({
  selector: 'app-order-list',
  template: \`
    <div class="orders">
      <h2>My Orders</h2>
      <div *ngFor="let order of orders" class="order-row" [routerLink]="['/orders', order.id]">
        <span>#{{order.id}}</span>
        <span>{{order.createdAt | date}}</span>
        <app-order-status [status]="order.status"></app-order-status>
        <span>\${{order.total}}</span>
      </div>
    </div>
  \`
})
export class OrderListComponent implements OnInit {
  orders: Order[] = [];

  constructor(private orderService: OrderService) {}

  async ngOnInit() {
    this.orders = await this.orderService.getOrders();
  }
}
`);

write('order/order-detail.component.ts', `
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { OrderService } from './order.service';
import { Order } from './order.models';

@Component({
  selector: 'app-order-detail',
  template: \`
    <div class="order-detail" *ngIf="order">
      <h2>Order #{{order.id}}</h2>
      <app-order-status [status]="order.status"></app-order-status>
      <div *ngFor="let item of order.items">
        {{item.productName}} x{{item.quantity}} - \${{item.price}}
      </div>
      <div class="total">Total: \${{order.total}}</div>
      <button *ngIf="order.status === 'pending'" (click)="cancel()">Cancel Order</button>
    </div>
  \`
})
export class OrderDetailComponent implements OnInit {
  order: Order | null = null;

  constructor(private route: ActivatedRoute, private orderService: OrderService) {}

  async ngOnInit() {
    const id = this.route.snapshot.params['id'];
    this.order = await this.orderService.getOrder(id);
  }

  async cancel() {
    if (this.order) await this.orderService.cancelOrder(this.order.id);
  }
}
`);

write('order/order-status.component.ts', `
import { Component, Input } from '@angular/core';
import { OrderStatus } from './order.models';

@Component({
  selector: 'app-order-status',
  template: \`<span class="status" [class]="status">{{status | titlecase}}</span>\`
})
export class OrderStatusComponent {
  @Input() status!: OrderStatus;
}
`);

write('order/order-tracking.component.ts', `
import { Component, Input } from '@angular/core';
import { Order, OrderStatus } from './order.models';

@Component({
  selector: 'app-order-tracking',
  template: \`
    <div class="tracking">
      <div *ngFor="let step of steps" [class.active]="isActive(step)" [class.complete]="isComplete(step)">
        {{step | titlecase}}
      </div>
    </div>
  \`
})
export class OrderTrackingComponent {
  @Input() order!: Order;
  steps: OrderStatus[] = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];

  isActive(step: OrderStatus): boolean {
    return this.order?.status === step;
  }

  isComplete(step: OrderStatus): boolean {
    return this.steps.indexOf(step) < this.steps.indexOf(this.order?.status);
  }
}
`);

write('order/order-invoice.component.ts', `
import { Component, Input } from '@angular/core';
import { Order } from './order.models';

@Component({
  selector: 'app-order-invoice',
  template: \`
    <div class="invoice" *ngIf="order">
      <h3>Invoice #{{order.id}}</h3>
      <table>
        <tr *ngFor="let item of order.items">
          <td>{{item.productName}}</td>
          <td>{{item.quantity}}</td>
          <td>\${{item.price}}</td>
        </tr>
      </table>
      <div>Subtotal: \${{order.subtotal}}</div>
      <div>Tax: \${{order.tax}}</div>
      <div>Shipping: \${{order.shipping}}</div>
      <div class="total">Total: \${{order.total}}</div>
    </div>
  \`
})
export class OrderInvoiceComponent {
  @Input() order!: Order;
}
`);

write('order/order.module.ts', `
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OrderService } from './order.service';
import { OrderApi } from './order.api';
import { OrderState } from './order.state';
import { OrderListComponent } from './order-list.component';
import { OrderDetailComponent } from './order-detail.component';
import { OrderStatusComponent } from './order-status.component';
import { OrderTrackingComponent } from './order-tracking.component';
import { OrderInvoiceComponent } from './order-invoice.component';

@NgModule({
  imports: [CommonModule],
  declarations: [OrderListComponent, OrderDetailComponent, OrderStatusComponent, OrderTrackingComponent, OrderInvoiceComponent],
  providers: [OrderService, OrderApi, OrderState],
  exports: [OrderListComponent, OrderDetailComponent, OrderStatusComponent, OrderTrackingComponent, OrderInvoiceComponent]
})
export class OrderModule {}
`);

console.log('\n✓ Created Product cluster (10 files)');
console.log('✓ Created Cart cluster (10 files)');
console.log('✓ Created Order cluster (10 files)');
