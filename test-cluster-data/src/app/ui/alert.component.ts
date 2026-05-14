
import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-alert',
  template: `
    <div class="alert" [class]="type" *ngIf="visible">
      <span>{{message}}</span>
      <button *ngIf="dismissible" (click)="dismiss()">&times;</button>
    </div>
  `
})
export class AlertComponent {
  @Input() type: 'success' | 'error' | 'warning' | 'info' = 'info';
  @Input() message = '';
  @Input() dismissible = true;
  @Output() dismissed = new EventEmitter<void>();
  visible = true;
  dismiss() { this.visible = false; this.dismissed.emit(); }
}
