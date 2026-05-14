
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UserService } from './user.service';
import { UserApi } from './user.api';
import { UserState } from './user.state';
import { UserProfileComponent } from './user-profile.component';
import { UserSettingsComponent } from './user-settings.component';
import { UserListComponent } from './user-list.component';
import { UserAvatarComponent } from './user-avatar.component';
import { UserSearchComponent } from './user-search.component';

@NgModule({
  imports: [CommonModule],
  declarations: [
    UserProfileComponent,
    UserSettingsComponent,
    UserListComponent,
    UserAvatarComponent,
    UserSearchComponent
  ],
  providers: [UserService, UserApi, UserState],
  exports: [
    UserProfileComponent,
    UserSettingsComponent,
    UserListComponent,
    UserAvatarComponent,
    UserSearchComponent
  ]
})
export class UserModule {}
