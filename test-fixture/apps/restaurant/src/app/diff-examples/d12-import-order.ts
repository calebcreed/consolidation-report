// D12: Only IMPORT ORDER differs (semantically equivalent)

import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class OrderService {
  getData(): Observable<any> {
    return new Observable();
  }
}
