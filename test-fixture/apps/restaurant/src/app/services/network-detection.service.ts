import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class NetworkDetectionService {
  isOnline(): boolean {
    return navigator.onLine;
  }
}
