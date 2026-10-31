export class ApiError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export const E = {
  auth: (m = 'Log in to keep going.') => new ApiError('UNAUTHENTICATED', m),
  forbidden: (m = "Your account can't do that.") => new ApiError('FORBIDDEN', m),
  invalid: (m, details) => new ApiError('VALIDATION', m, details),
  notFound: (what = 'That') => new ApiError('NOT_FOUND', `${what} doesn't exist or was removed.`),
  state: (m) => new ApiError('STATE', m),
  conflict: (m, details) => new ApiError('CONFLICT', m, details),
  funds: (need) => new ApiError('INSUFFICIENT_FUNDS', 'Not enough in your stack for this entry.', { need }),
  blocked: (reasons) => new ApiError('COMPLIANCE_BLOCKED', reasons[0]?.message || 'Not available for your account.', { reasons }),
  rate: () => new ApiError('RATE_LIMITED', 'Too many requests. Wait a few seconds and try again.'),
};
