
// Error code constants - no dependencies
export enum ErrorCode {
  UNKNOWN = 'E000',
  NETWORK_ERROR = 'E001',
  TIMEOUT = 'E002',
  UNAUTHORIZED = 'E401',
  FORBIDDEN = 'E403',
  NOT_FOUND = 'E404',
  VALIDATION_ERROR = 'E422',
  SERVER_ERROR = 'E500',
}

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.UNKNOWN]: 'An unknown error occurred',
  [ErrorCode.NETWORK_ERROR]: 'Network connection failed',
  [ErrorCode.TIMEOUT]: 'Request timed out',
  [ErrorCode.UNAUTHORIZED]: 'Authentication required',
  [ErrorCode.FORBIDDEN]: 'Access denied',
  [ErrorCode.NOT_FOUND]: 'Resource not found',
  [ErrorCode.VALIDATION_ERROR]: 'Validation failed',
  [ErrorCode.SERVER_ERROR]: 'Server error',
};
