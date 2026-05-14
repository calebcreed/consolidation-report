
import { Component, OnInit } from '@angular/core';
import { UserService } from './user.service';
import { UserPreferences } from './user.models';
import { UserState } from './user.state';

@Component({
  selector: 'app-user-settings',
  template: `
    <div class="settings">
      <h2>User Settings</h2>
      <label>Theme: <select [(ngModel)]="prefs.theme"></select></label>
      <label>Language: <select [(ngModel)]="prefs.language"></select></label>
      <button (click)="save()">Save Settings</button>
    </div>
  `
})
export class UserSettingsComponent implements OnInit {
  prefs: UserPreferences = { theme: 'light', language: 'en', notifications: true, newsletter: false };

  constructor(
    private userService: UserService,
    private userState: UserState
  ) {}

  ngOnInit() {}

  async save() {
    await this.userService.updatePreferences(this.prefs);
  }
}
