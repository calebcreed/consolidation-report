
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
