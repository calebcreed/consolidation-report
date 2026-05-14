
import { Component, Input, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-input',
  template: `
    <div class="input-wrapper">
      <label *ngIf="label">{{label}}</label>
      <input [type]="type" [placeholder]="placeholder" [(ngModel)]="value" (blur)="onBlur()">
      <span class="error" *ngIf="error">{{error}}</span>
    </div>
  `,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => InputComponent), multi: true }]
})
export class InputComponent implements ControlValueAccessor {
  @Input() type = 'text';
  @Input() label = '';
  @Input() placeholder = '';
  @Input() error = '';
  value = '';
  onChange = (v: string) => {};
  onTouched = () => {};
  writeValue(v: string) { this.value = v; }
  registerOnChange(fn: any) { this.onChange = fn; }
  registerOnTouched(fn: any) { this.onTouched = fn; }
  onBlur() { this.onTouched(); }
}
