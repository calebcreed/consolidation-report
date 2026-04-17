import { Injectable } from '@angular/core';

// S2: Relative import - parent directory
import { CommonService } from '../core/services/common.service';
import { User } from '../models/user';

// S1: Relative import - same directory (sibling)
import { NetworkDetectionService } from './network-detection.service';
import { SocketActionService } from './socket-action.service';
import { LoggerService } from './logger.service';

// S5: Path alias imports
import { environment } from '@env/environment';
import { APP_TYPES } from '@app/core/state/state.constants';
import { localStorageUtil } from '@app/utils/local-storage.utils';

@Injectable()
export class InterceptorProvider {
  private currentUser: User | null = null;

  constructor(
    private common: CommonService,
    private netWrkDetSvc: NetworkDetectionService,
    private socketActionsSvc: SocketActionService,
    private logger: LoggerService,
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
