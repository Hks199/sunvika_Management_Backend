import type { Types } from 'mongoose';

export interface AuthenticatedUser {
  id: string;
}

export interface AuthContext {
  employeeId: Types.ObjectId;
  sessionId: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export {};
