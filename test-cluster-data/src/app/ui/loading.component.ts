
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-loading',
  template: `
    <div class="loading" *ngIf="isLoading">
      <div class="spinner" [class]="size"></div>
      <span *ngIf="message">{{message}}</span>
    </div>
  `
})
export class LoadingComponent {
  @Input() isLoading = false;
  @Input() size: 'small' | 'medium' | 'large' = 'medium';
  @Input() message = '';
}
