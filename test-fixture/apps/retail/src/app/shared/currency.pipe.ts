import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'appCurrency' })
export class CurrencyPipe implements PipeTransform {
  transform(value: number): string {
    return '$' + value.toFixed(2);
  }
}
