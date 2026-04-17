// S2: Target for parent relative import test
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'guest';
}

export interface UserCredentials {
  email: string;
  password: string;
}

export type UserRole = User['role'];
