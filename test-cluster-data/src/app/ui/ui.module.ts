
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonComponent } from './button.component';
import { InputComponent } from './input.component';
import { ModalComponent } from './modal.component';
import { DropdownComponent } from './dropdown.component';
import { TableComponent } from './table.component';
import { PaginationComponent } from './pagination.component';
import { TooltipDirective } from './tooltip.directive';
import { LoadingComponent } from './loading.component';
import { AlertComponent } from './alert.component';

@NgModule({
  imports: [CommonModule, FormsModule],
  declarations: [ButtonComponent, InputComponent, ModalComponent, DropdownComponent, TableComponent, PaginationComponent, TooltipDirective, LoadingComponent, AlertComponent],
  exports: [ButtonComponent, InputComponent, ModalComponent, DropdownComponent, TableComponent, PaginationComponent, TooltipDirective, LoadingComponent, AlertComponent]
})
export class UiModule {}
