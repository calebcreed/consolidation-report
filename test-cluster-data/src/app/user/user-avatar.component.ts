
import { Component, Input } from '@angular/core';
import { User } from './user.models';

@Component({
  selector: 'app-user-avatar',
  template: `
    <div class="avatar" [class.large]="size === 'large'">
      <img *ngIf="user?.avatar" [src]="user.avatar" [alt]="user.firstName">
      <span *ngIf="!user?.avatar">{{initials}}</span>
    </div>
  `
})
export class UserAvatarComponent {
  @Input() user: User | null = null;
  @Input() size: 'small' | 'medium' | 'large' = 'medium';

  get initials(): string {
    if (!this.user) return '?';
    return this.user.firstName[0] + this.user.lastName[0];
  }
}
