const AUTH_OAUTH_USER_MESSAGE_KEY = "splove_auth_oauth_user_message";

/** Message utilisateur affiché sur /auth après échec OAuth Google (jamais le détail technique). */
export function stashAuthOAuthUserMessage(message: string): void {
  try {
    sessionStorage.setItem(AUTH_OAUTH_USER_MESSAGE_KEY, message);
  } catch {
    /* private mode */
  }
}

export function consumeAuthOAuthUserMessage(): string | null {
  try {
    const msg = sessionStorage.getItem(AUTH_OAUTH_USER_MESSAGE_KEY);
    if (msg) sessionStorage.removeItem(AUTH_OAUTH_USER_MESSAGE_KEY);
    return msg;
  } catch {
    return null;
  }
}
