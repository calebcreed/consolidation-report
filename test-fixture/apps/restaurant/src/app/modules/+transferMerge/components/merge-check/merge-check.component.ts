import { Component } from '@angular/core';

@Component({
  selector: 'app-merge-check',
  templateUrl: './merge-check.component.html'  // A7/A8: external template with dependencies
})
export class MergeCheckComponent {
  totalAmount = 99.99;
  confirmationData = {};

  onConfirm(event: any) {
    console.log('confirmed', event);
  }
}
