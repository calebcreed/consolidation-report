
import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-modal',
  template: `
    <div class="modal-backdrop" *ngIf="isOpen" (click)="close()">
      <div class="modal-content" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h3>{{title}}</h3>
          <button class="close" (click)="close()">&times;</button>
        </div>
        <div class="modal-body"><ng-content></ng-content></div>
        <div class="modal-footer"><ng-content select="[footer]"></ng-content></div>
      </div>
    </div>
  `
})
export class ModalComponent {
  @Input() isOpen = false;
  @Input() title = '';
  @Output() closed = new EventEmitter<void>();
  close() { this.closed.emit(); }
}
