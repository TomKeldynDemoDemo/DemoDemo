/**
 * Chess privacy rules, shaped by the use case's GDPR controls.
 *
 * GDPR4  — every collected field is non-special-category.
 * GDPR1/2 — each field has one purpose and one legal basis.
 * GDPR3  — lastLogin is the only legitimate interest, with the three tests below.
 * GDPR9  — password is not collected; public profile is off unless consent is granted.
 * GDPR10 — guests expire after 24h idle; proofs are kept 3 years after erasure.
 * GDPR20 — erasure overwrites identifiers and keeps the opponent's game row.
 * GDPR21 — portability is limited to data the player provided.
 * GDPR33 — a restricted player is stored, not played or published.
 * GDPR36 — consent rows are append-only.
 * GDPR39 — the public profile page is the only onward recipient.
 */

export const POLICY_VERSION = '2026-11-10';
export const TOMBSTONE_NAME = 'Deleted player';
export const GUEST_RETENTION_MS = 24 * 60 * 60 * 1000;
export const PROOF_RETENTION_MS = 3 * 365 * 24 * 60 * 60 * 1000;
export const PUBLIC_RECIPIENT = 'public-profile-page';
export const PUBLIC_DATA_ASSET = 'public-player-profile';

export type Sensitivity = 'non-special-category';
export type Basis = 'contract' | 'consent' | 'legitimate-interest';

export interface FieldRecord {
  field: string;
  purpose: string | null;
  basis: Basis | null;
  sensitivity: Sensitivity;
  collected: boolean;
  note: string;
}

export const FIELD_REGISTER: FieldRecord[] = [
  {
    field: 'email',
    purpose: 'account',
    basis: 'contract',
    sensitivity: 'non-special-category',
    collected: true,
    note: 'From Google or GitHub when the player chooses that sign-in. Guests have none.',
  },
  {
    field: 'name',
    purpose: 'account',
    basis: 'contract',
    sensitivity: 'non-special-category',
    collected: true,
    note: 'Display name. A player correction sets nameLocked so the next sign-in keeps it.',
  },
  {
    field: 'username',
    purpose: 'account',
    basis: 'contract',
    sensitivity: 'non-special-category',
    collected: true,
    note: 'Guest handle, or a name the player sets later.',
  },
  {
    field: 'provider',
    purpose: 'account',
    basis: 'contract',
    sensitivity: 'non-special-category',
    collected: true,
    note: 'Which sign-in created the account.',
  },
  {
    field: 'moves',
    purpose: 'gameplay',
    basis: 'contract',
    sensitivity: 'non-special-category',
    collected: true,
    note: 'Plies the player submitted. Comments are cleared on erasure.',
  },
  {
    field: 'rating',
    purpose: 'gameplay',
    basis: 'contract',
    sensitivity: 'non-special-category',
    collected: true,
    note: 'Stored default. Nothing updates it. Omitted from portability because the player did not provide it.',
  },
  {
    field: 'lastLogin',
    purpose: 'security',
    basis: 'legitimate-interest',
    sensitivity: 'non-special-category',
    collected: true,
    note: 'Used to expire idle guests. See LEGITIMATE_INTEREST.',
  },
  {
    field: 'password',
    purpose: null,
    basis: null,
    sensitivity: 'non-special-category',
    collected: false,
    note: 'Column remains. No code writes it.',
  },
];

export const LEGITIMATE_INTEREST = {
  purposeId: 'security',
  purposeTest:
    'Record the last time a player authenticated so idle guest accounts can be removed and a live session can be told from an abandoned one.',
  necessityTest: 'A single timestamp is enough. The field is not shown on the public profile.',
  balancingTest:
    'The impact is a timestamp on the player’s own account. It is deleted on erasure. An objection is recorded, and where the account still needs the timestamp for this purpose the player can erase the account instead. No counsel review is recorded yet.',
  counselReview: 'pending' as const,
};

export const RETENTION = {
  guest: '24 hours after lastLogin, or createdAt when lastLogin is empty.',
  account: 'Until the player erases it.',
  games: 'The game row stays so the opponent keeps the match. The erased player’s name becomes a shared tombstone.',
  proofs: 'Consent, request, and disclosure rows are deleted 3 years after erasure.',
  exception: 'A guest with a game still IN_PROGRESS is kept until that game ends.',
  backups:
    'This service has no backup client and no field-level encryption key. Identifiers are overwritten in PostgreSQL. A database backup taken earlier can still hold them until that backup expires.',
};

export const RECIPIENTS = [
  {
    name: 'Amazon Web Services',
    role: 'processor',
    region: 'eu-west-2',
    when: 'Hosts the application and PostgreSQL.',
  },
  {
    name: 'Google',
    role: 'independent-controller',
    region: 'chosen by Google',
    when: 'Only when the player chooses Google sign-in.',
  },
  {
    name: 'GitHub',
    role: 'independent-controller',
    region: 'chosen by GitHub',
    when: 'Only when the player chooses GitHub sign-in.',
  },
] as const;

export const TRANSFER = {
  accountStore: 'eu-west-2',
  note: 'The account row stays in AWS London. Google and GitHub are contacted only for a sign-in the player starts. Their notices cover that step. No other international transfer is made.',
};

export function registerProblems(): string[] {
  const problems: string[] = [];
  for (const field of FIELD_REGISTER) {
    if (field.sensitivity !== 'non-special-category') {
      problems.push(`${field.field} is not classified`);
    }
    if (field.collected && (!field.purpose || !field.basis)) {
      problems.push(`${field.field} is collected without a purpose and basis`);
    }
    if (!field.collected && field.field !== 'password') {
      problems.push(`${field.field} is an unexpected uncollected field`);
    }
  }
  return problems;
}

export interface ProfileFlags {
  deletedAt: Date | null;
  publicProfile: boolean;
  processingRestricted: boolean;
}

export function canPublishProfile(user: ProfileFlags): boolean {
  return Boolean(user.publicProfile && !user.processingRestricted && !user.deletedAt);
}

export function displayName(input: {
  player: ProfileFlags & { id: string; name: string | null };
  viewerId: string;
  whiteId: string;
  blackId: string;
}): string {
  if (input.player.deletedAt) return TOMBSTONE_NAME;
  const inGame = input.viewerId === input.whiteId || input.viewerId === input.blackId;
  if (inGame || canPublishProfile(input.player)) {
    return input.player.name ?? 'Player';
  }
  return 'Player';
}

export function guestReadyForErasure(input: {
  provider: string;
  lastLogin: Date | null;
  createdAt: Date;
  deletedAt: Date | null;
  hasLiveGame: boolean;
  now: Date;
}): boolean {
  if (input.provider !== 'GUEST' || input.deletedAt || input.hasLiveGame) {
    return false;
  }
  const activity = input.lastLogin ?? input.createdAt;
  return input.now.getTime() - activity.getTime() >= GUEST_RETENTION_MS;
}

export function proofsExpired(deletedAt: Date | null, now: Date): boolean {
  if (!deletedAt) return false;
  return now.getTime() - deletedAt.getTime() >= PROOF_RETENTION_MS;
}

export function tombstonePatch(now: Date) {
  return {
    email: null,
    username: null,
    name: TOMBSTONE_NAME,
    password: null,
    publicProfile: false,
    processingRestricted: true,
    nameLocked: true,
    deletedAt: now,
  };
}

export interface ConsentInput {
  userId: string;
  granted: boolean;
  source: string;
  now: Date;
}

export function consentRecord(input: ConsentInput) {
  return {
    userId: input.userId,
    purpose: 'PUBLIC_PROFILE' as const,
    granted: input.granted,
    policyVersion: POLICY_VERSION,
    source: input.source,
    capturedAt: input.now,
    withdrawnAt: input.granted ? null : input.now,
  };
}

export function latestConsent<T extends { purpose: string; capturedAt: Date }>(rows: T[], purpose: string): T | null {
  const matches = rows
    .filter((row) => row.purpose === purpose)
    .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime());
  return matches[0] ?? null;
}

export function notificationPatch(kind: 'rectification' | 'erasure' | 'restriction' | 'consent-withdrawn', now: Date) {
  return { notifiedOf: kind, notifiedAt: now };
}

export type ProfileEdit = { ok: true; name?: string; username?: string } | { ok: false; error: string };

export function parseProfileEdit(input: unknown): ProfileEdit {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Expected an object' };
  }
  const body = input as { name?: unknown; username?: unknown };
  const next: { name?: string; username?: string } = {};
  if (body.name !== undefined) {
    if (typeof body.name !== 'string') {
      return { ok: false, error: 'Name must be a string' };
    }
    const name = body.name.trim();
    const hasControl = Array.from(name).some((char) => char.charCodeAt(0) < 32);
    if (name.length < 1 || name.length > 80 || hasControl) {
      return { ok: false, error: 'Name must be 1 to 80 visible characters' };
    }
    next.name = name;
  }
  if (body.username !== undefined) {
    if (typeof body.username !== 'string') {
      return { ok: false, error: 'Username must be a string' };
    }
    const username = body.username.trim();
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(username)) {
      return {
        ok: false,
        error: 'Username must be 1 to 32 letters, numbers, _ or -',
      };
    }
    next.username = username;
  }
  if (!next.name && !next.username) {
    return { ok: false, error: 'Provide a name or a username' };
  }
  return { ok: true, ...next };
}

export function isOwnPly(role: 'white' | 'black', moveNumber: number): boolean {
  const whitePly = moveNumber % 2 === 1;
  return role === 'white' ? whitePly : !whitePly;
}

export function resultForPlayer(role: 'white' | 'black', result: string | null): 'win' | 'loss' | 'draw' | null {
  if (!result) return null;
  if (result === 'DRAW') return 'draw';
  const whiteWon = result === 'WHITE_WINS';
  return (role === 'white') === whiteWon ? 'win' : 'loss';
}

export interface SubjectMove {
  moveNumber: number;
  san: string | null;
  from: string;
  to: string;
  comments: string | null;
  createdAt: string;
}

export interface SubjectGame {
  id: string;
  role: 'white' | 'black';
  result: 'win' | 'loss' | 'draw' | null;
  startAt: string;
  moves: SubjectMove[];
}

export interface SubjectSnapshot {
  user: {
    id: string;
    email: string | null;
    name: string | null;
    username: string | null;
    provider: string;
    rating: number;
    createdAt: string;
    lastLogin: string | null;
    publicProfile: boolean;
    processingRestricted: boolean;
    deletedAt: string | null;
  };
  consents: Array<{
    purpose: string;
    granted: boolean;
    policyVersion: string;
    source: string;
    capturedAt: string;
    withdrawnAt: string | null;
  }>;
  games: SubjectGame[];
  requests: Array<{
    kind: string;
    status: string;
    reason: string | null;
    createdAt: string;
  }>;
  disclosures: Array<{
    recipient: string;
    dataAsset: string;
    disclosedAt: string;
    notifiedOf: string | null;
    notifiedAt: string | null;
  }>;
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export function subjectAccess(snapshot: SubjectSnapshot) {
  return {
    processing: true,
    automatedDecisionMaking: false,
    classification: 'non-special-category' as const,
    purposes: FIELD_REGISTER.filter((field) => field.collected).map((field) => ({
      field: field.field,
      purpose: field.purpose,
      basis: field.basis,
    })),
    legitimateInterest: LEGITIMATE_INTEREST,
    recipients: RECIPIENTS,
    onwardDisclosures: snapshot.disclosures,
    retention: RETENTION,
    transfer: TRANSFER,
    rights: ['access', 'rectify', 'erase', 'port', 'restrict', 'object', 'complain'],
    user: snapshot.user,
    consents: snapshot.consents,
    games: snapshot.games,
    requests: snapshot.requests,
  };
}

/** GDPR21: data the player provided. Excludes rating, lastLogin, and other people. */
export function portableExport(snapshot: SubjectSnapshot) {
  return {
    name: snapshot.user.name,
    username: snapshot.user.username,
    email: snapshot.user.email,
    games: snapshot.games.map((game) => ({
      id: game.id,
      role: game.role,
      moves: game.moves,
    })),
  };
}
