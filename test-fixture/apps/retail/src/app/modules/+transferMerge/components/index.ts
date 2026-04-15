// S3/S7 Barrel file - Array collection pattern
// NOTE: imports use .component (no .ts extension) - TypeScript resolves to .component.ts

import { TabletTransferComponent } from './table-transfer/table-transfer.component';
import { MergeCheckComponent } from './merge-check/merge-check.component';
import { MergeCheckConfirmationComponent } from './merge-check/merge-check-confirmation/merge-check-confirmation.component';
import { TransferDetailContentComponent } from './transfer-detail-content/transfer-detail-content.component';

// Array collection export - common Angular pattern for NgModule declarations
export const components = [
  TabletTransferComponent,
  MergeCheckComponent,
  MergeCheckConfirmationComponent,
  TransferDetailContentComponent,
];

// Also re-export individually for direct imports
export { TabletTransferComponent };
export { MergeCheckComponent };
export { MergeCheckConfirmationComponent };
export { TransferDetailContentComponent };
