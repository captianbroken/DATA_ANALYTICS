type ErrorLike = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

type ErrorContext =
  | 'login'
  | 'load_users'
  | 'create_user'
  | 'update_user'
  | 'delete_user'
  | 'create_site'
  | 'generic';

const includesAny = (value: string, patterns: string[]) => {
  return patterns.some(pattern => value.includes(pattern));
};

const defaultMessages: Record<ErrorContext, string> = {
  login: 'Login failed. Check your email and password and try again.',
  load_users: 'Unable to load accounts right now. Please refresh and try again.',
  create_user: 'Unable to create the account right now. Please try again.',
  update_user: 'Unable to update the account right now. Please try again.',
  delete_user: 'Unable to remove the account right now. Please try again.',
  create_site: 'Unable to create the client/site right now. Please try again.',
  generic: 'Something went wrong. Please try again.',
};

export const toFriendlyErrorMessage = (err: ErrorLike | null | undefined, context: ErrorContext = 'generic') => {
  const message = (err?.message ?? '').toString();
  const lowerMessage = message.toLowerCase();
  const code = (err?.code ?? '').toString();
  const details = (err?.details ?? '').toString().toLowerCase();
  const hint = (err?.hint ?? '').toString().toLowerCase();
  const combined = `${lowerMessage} ${details} ${hint}`;

  if (code === 'PGRST200' || code === 'PGRST202' || includesAny(combined, ['schema cache', 'could not find the function'])) {
    if (context === 'create_user' || context === 'update_user' || context === 'delete_user' || context === 'load_users') {
      return 'Account management is unavailable because the database setup is incomplete. Apply the latest database migration and refresh the app.';
    }
    if (context === 'create_site') {
      return 'Client/site creation is unavailable because the database setup is incomplete. Apply the latest database migration and refresh the app.';
    }
    return 'The database setup is incomplete. Apply the latest migration and refresh the app.';
  }

  if (code === '42501' || includesAny(combined, ['permission denied', 'not allowed'])) {
    return 'You do not have permission to perform this action.';
  }

  if (code === '23505' || includesAny(combined, ['duplicate key', 'already exists', 'already registered'])) {
    if (includesAny(combined, ['email'])) {
      return 'An account with this email already exists.';
    }
    return 'This record already exists.';
  }

  if (includesAny(combined, ['invalid login credentials', 'invalid email or password', 'invalid password'])) {
    return 'Invalid email or password.';
  }

  if (includesAny(combined, ['name is required'])) {
    return 'Full name is required.';
  }

  if (includesAny(combined, ['email is required'])) {
    return 'Email is required.';
  }

  if (includesAny(combined, ['password is required'])) {
    return context === 'login' ? 'Password is required.' : 'Password is required to create the account.';
  }

  if (includesAny(combined, ['role "', 'role not found'])) {
    return 'The selected role is not available.';
  }

  if (includesAny(combined, ['access level "', 'access level not found'])) {
    return 'The selected access level is not available.';
  }

  if (includesAny(combined, ['site', 'client']) && includesAny(combined, ['not found'])) {
    return 'The selected client/site was not found. Please choose another one.';
  }

  if (includesAny(combined, ['user "', 'user not found'])) {
    return 'The selected account was not found or may have been removed already.';
  }

  if (includesAny(combined, ['email']) && includesAny(combined, ['invalid'])) {
    return 'Please enter a valid email address.';
  }

  return message || defaultMessages[context];
};
