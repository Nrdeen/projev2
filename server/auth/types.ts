import type { SessionRecord } from './sessions';

export interface Credential {
  userId: string;
  /** Argon2id PHC string. Never serialised to clients. */
  passwordHash: string;
  updatedAt: string;
}

/** The slice of the JSON store the auth layer needs. */
export interface AuthStore {
  users: any[];
  sellers: any[];
  credentials: Credential[];
  sessions: SessionRecord[];
}

export interface AuthContext {
  user: any;
  session: SessionRecord;
  csrfToken: string;
}
