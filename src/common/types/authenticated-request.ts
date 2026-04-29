import { Request } from 'express';
import { User } from '../../database/schema';

export interface AuthenticatedRequest extends Request {
  user: User;
}
