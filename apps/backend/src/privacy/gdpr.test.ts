import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FIELD_REGISTER,
  GUEST_RETENTION_MS,
  POLICY_VERSION,
  TOMBSTONE_NAME,
  canPublishProfile,
  consentRecord,
  displayName,
  guestReadyForErasure,
  latestConsent,
  parseProfileEdit,
  portableExport,
  proofsExpired,
  registerProblems,
  subjectAccess,
  tombstonePatch,
  type SubjectSnapshot,
} from '@repo/db/gdpr';

const now = new Date('2026-11-10T00:00:00.000Z');

function snapshot(): SubjectSnapshot {
  return {
    user: {
      id: 'user-1',
      email: 'ada@example.com',
      name: 'Ada',
      username: 'ada',
      provider: 'GOOGLE',
      rating: 1200,
      createdAt: now.toISOString(),
      lastLogin: now.toISOString(),
      publicProfile: false,
      processingRestricted: false,
      deletedAt: null,
    },
    consents: [],
    games: [
      {
        id: 'game-1',
        role: 'white',
        result: 'win',
        startAt: now.toISOString(),
        moves: [
          {
            moveNumber: 1,
            san: 'e4',
            from: 'e2',
            to: 'e4',
            comments: null,
            createdAt: now.toISOString(),
          },
        ],
      },
    ],
    requests: [],
    disclosures: [],
  };
}

describe('GDPR field register', () => {
  it('classifies every collected field and leaves password unwritten', () => {
    assert.deepEqual(registerProblems(), []);
    const password = FIELD_REGISTER.find((field) => field.field === 'password');
    assert.equal(password?.collected, false);
    assert.equal(
      FIELD_REGISTER.every((field) => field.sensitivity === 'non-special-category'),
      true
    );
  });
});

describe('GDPR21 portability', () => {
  it('keeps data the player provided and drops derived and security fields', () => {
    const exported = portableExport(snapshot());
    assert.deepEqual(Object.keys(exported).sort(), ['email', 'games', 'name', 'username']);
    assert.equal('rating' in exported, false);
    assert.equal('lastLogin' in exported, false);
    assert.equal(exported.games[0].moves[0].san, 'e4');
    assert.equal('result' in exported.games[0], false);
  });
});

describe('GDPR18 access', () => {
  it('confirms processing and includes the stored rating and last login', () => {
    const access = subjectAccess(snapshot());
    assert.equal(access.processing, true);
    assert.equal(access.automatedDecisionMaking, false);
    assert.equal(access.user.rating, 1200);
    assert.equal(access.user.lastLogin, now.toISOString());
    assert.equal('password' in access.user, false);
  });
});

describe('GDPR20 erasure', () => {
  it('overwrites identifiers and keeps a shared tombstone name', () => {
    assert.deepEqual(tombstonePatch(now), {
      email: null,
      username: null,
      name: TOMBSTONE_NAME,
      password: null,
      publicProfile: false,
      processingRestricted: true,
      nameLocked: true,
      deletedAt: now,
    });
  });
});

describe('GDPR10 retention', () => {
  it('expires an idle guest and keeps one who is still in a game', () => {
    const guest = {
      provider: 'GUEST',
      lastLogin: new Date(now.getTime() - GUEST_RETENTION_MS - 1),
      createdAt: now,
      deletedAt: null,
      now,
    };
    assert.equal(guestReadyForErasure({ ...guest, hasLiveGame: false }), true);
    assert.equal(guestReadyForErasure({ ...guest, hasLiveGame: true }), false);
    assert.equal(
      guestReadyForErasure({
        ...guest,
        provider: 'GOOGLE',
        hasLiveGame: false,
      }),
      false
    );
  });

  it('keeps proof rows until three years after erasure', () => {
    assert.equal(proofsExpired(now, now), false);
    const later = new Date('2030-11-10T00:00:00.000Z');
    assert.equal(proofsExpired(now, later), true);
  });
});

describe('GDPR36 consent', () => {
  it('appends a withdrawal instead of editing the grant', () => {
    const grant = consentRecord({
      userId: 'user-1',
      granted: true,
      source: 'settings',
      now,
    });
    const withdrawnAt = new Date(now.getTime() + 1000);
    const withdrawal = consentRecord({
      userId: 'user-1',
      granted: false,
      source: 'settings',
      now: withdrawnAt,
    });
    assert.equal(grant.granted, true);
    assert.equal(grant.policyVersion, POLICY_VERSION);
    assert.equal(withdrawal.granted, false);
    assert.notEqual(grant, withdrawal);
    const current = latestConsent(
      [
        { ...grant, capturedAt: grant.capturedAt },
        { ...withdrawal, capturedAt: withdrawal.capturedAt },
      ],
      'PUBLIC_PROFILE'
    );
    assert.equal(current?.granted, false);
  });
});

describe('GDPR9 public profile', () => {
  it('stays unpublished until consent, and hides a restricted or erased player', () => {
    const base = {
      id: 'user-1',
      name: 'Ada',
      publicProfile: false,
      processingRestricted: false,
      deletedAt: null,
    };
    assert.equal(canPublishProfile(base), false);
    assert.equal(
      displayName({
        player: base,
        viewerId: 'public',
        whiteId: 'white',
        blackId: 'black',
      }),
      'Player'
    );
    assert.equal(
      displayName({
        player: { ...base, publicProfile: true },
        viewerId: 'white',
        whiteId: 'white',
        blackId: 'black',
      }),
      'Ada'
    );
    assert.equal(canPublishProfile({ ...base, publicProfile: true, processingRestricted: true }), false);
  });
});

describe('GDPR35 corrections', () => {
  it('rejects a control character and accepts a trimmed name', () => {
    const bad = parseProfileEdit({ name: 'Ada\u0001' });
    assert.equal(bad.ok, false);
    const good = parseProfileEdit({ name: '  Ada  ' });
    assert.deepEqual(good, { ok: true, name: 'Ada' });
  });
});
