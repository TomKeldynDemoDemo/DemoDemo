const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GithubStrategy = require('passport-github2').Strategy;
import passport from 'passport';
import dotenv from 'dotenv';
import { db } from './db';

interface GithubEmailRes {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: 'private' | 'public';
}

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}`);
  }
  return value;
}

async function upsertOAuthUser(email: string, displayName: string | undefined, provider: 'GOOGLE' | 'GITHUB') {
  const existing = await db.user.findUnique({ where: { email } });
  if (existing?.deletedAt) {
    throw new Error('Account was erased');
  }
  if (!existing) {
    return db.user.create({
      data: {
        email,
        name: displayName,
        provider,
        lastLogin: new Date(),
      },
    });
  }
  return db.user.update({
    where: { id: existing.id },
    data: {
      lastLogin: new Date(),
      ...(existing.nameLocked ? {} : { name: displayName }),
    },
  });
}

export function initPassport() {
  const GOOGLE_CLIENT_ID = required('GOOGLE_CLIENT_ID');
  const GOOGLE_CLIENT_SECRET = required('GOOGLE_CLIENT_SECRET');
  const GITHUB_CLIENT_ID = required('GITHUB_CLIENT_ID');
  const GITHUB_CLIENT_SECRET = required('GITHUB_CLIENT_SECRET');

  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: '/auth/google/callback',
      },
      async function (accessToken: string, refreshToken: string, profile: any, done: (error: any, user?: any) => void) {
        try {
          const email = profile.emails?.[0]?.value as string | undefined;
          if (!email) {
            done(new Error('Google account has no email'));
            return;
          }
          const user = await upsertOAuthUser(email, profile.displayName, 'GOOGLE');
          done(null, user);
        } catch (error) {
          done(error);
        }
      }
    )
  );

  passport.use(
    new GithubStrategy(
      {
        clientID: GITHUB_CLIENT_ID,
        clientSecret: GITHUB_CLIENT_SECRET,
        callbackURL: '/auth/github/callback',
      },
      async function (accessToken: string, refreshToken: string, profile: any, done: (error: any, user?: any) => void) {
        try {
          const res = await fetch('https://api.github.com/user/emails', {
            headers: {
              Authorization: `token ${accessToken}`,
            },
          });
          const data: GithubEmailRes[] = await res.json();
          const primaryEmail = data.find((item) => item.primary === true);
          if (!primaryEmail?.email) {
            done(new Error('GitHub account has no primary email'));
            return;
          }
          const user = await upsertOAuthUser(primaryEmail.email, profile.displayName, 'GITHUB');
          done(null, user);
        } catch (error) {
          done(error);
        }
      }
    )
  );

  passport.serializeUser(function (user: any, cb) {
    process.nextTick(function () {
      return cb(null, {
        id: user.id,
        username: user.username,
        picture: user.picture,
      });
    });
  });

  passport.deserializeUser(function (user: any, cb) {
    process.nextTick(function () {
      return cb(null, user);
    });
  });
}
