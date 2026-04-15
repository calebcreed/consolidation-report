// D12: Only IMPORT ORDER differs (semantically equivalent)

import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { Injectable } from '@angular/core';

@Injectable()
export class OrderService {
  getData(): Observable<any> {
    return new Observable();
  }
}
