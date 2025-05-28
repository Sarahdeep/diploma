export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  // Add other roles if they exist in your backend models.py
}

export interface User {
  id: number;
  email: string;
  username: string;
  role: UserRole;
  avatar_url?: string | null;
  is_active: boolean;
  is_verified: boolean;
  created_at: string; // Represent datetime as string for simplicity, can be Date object
  last_login?: string | null; // Represent datetime as string
} 