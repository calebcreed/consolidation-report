import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SocketActionService {
  emit(action: string): void {
    console.log('emit:', action);
  }
}
