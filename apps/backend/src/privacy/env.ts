import dotenv from 'dotenv';
import { COOKIE_MAX_AGE } from '../consts';

dotenv.config();

export function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}`);
  }
  return value;
}

export function cookieFlags() {
  return {
    httpOnly: true as const,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    maxAge: COOKIE_MAX_AGE,
  };
}
