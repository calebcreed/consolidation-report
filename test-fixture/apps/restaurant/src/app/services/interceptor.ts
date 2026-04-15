import { Injectable } from '@angular/core';

// S1: Relative import - parent directory
import { CommonService } from '../../../../merged/src/app/core/services/common.service';

// S1: Relative import - same directory (sibling)
import { NetworkDetectionService } from './network-detection.service';
import { SocketActionService } from './socket-action.service';

// S5: Path alias imports
import { environment } from '@env/environment';
import { APP_TYPES } from '@app/core/state/state.constants';
import { localStorageUtil } from '@app/utils/local-storage.utils';

@Injectable()
export class InterceptorProvider {
  constructor(
    private common: CommonService,
    private netWrkDetSvc: NetworkDetectionService,
    private socketActionsSvc: SocketActionService,
  ) {}

  getEnv() {
    return environment;
  }

  getAppType() {
    return APP_TYPES.RESTAURANT;
  }

  getStorage(key: string) {
    return localStorageUtil.get(key);
  }
}
