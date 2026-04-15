import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class CommonService {
  getData(): string {
    return 'common data';
  }
}
