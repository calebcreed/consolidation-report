// S3: Barrel file for core module
export { CommonService } from './services/common.service';
export { TestService } from './test.service';
export * from './tokens';
export * from './state/state.constants';

// Connection 4: core/index.ts → store-json (re-export NgRx feature)
export * from './state/store-json';
