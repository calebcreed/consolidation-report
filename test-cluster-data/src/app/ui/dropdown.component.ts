
import { Component, Input, Output, EventEmitter } from '@angular/core';

export interface DropdownOption { value: string; label: string; }

@Component({
  selector: 'app-dropdown',
  template: `
    <div class="dropdown" [class.open]="isOpen">
      <button (click)="toggle()">{{selectedLabel || placeholder}}</button>
      <ul *ngIf="isOpen">
        <li *ngFor="let opt of options" (click)="select(opt)">{{opt.label}}</li>
      </ul>
    </div>
  `
})
export class DropdownComponent {
  @Input() options: DropdownOption[] = [];
  @Input() placeholder = 'Select...';
  @Input() value = '';
  @Output() valueChange = new EventEmitter<string>();
  isOpen = false;
  get selectedLabel() { return this.options.find(o => o.value === this.value)?.label; }
  toggle() { this.isOpen = !this.isOpen; }
  select(opt: DropdownOption) { this.value = opt.value; this.valueChange.emit(opt.value); this.isOpen = false; }
}
