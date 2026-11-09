import { Prisma } from '@prisma/client';
import {
  FIELD_REGISTER,
  LEGITIMATE_INTEREST,
  POLICY_VERSION,
  PUBLIC_DATA_ASSET,
  PUBLIC_RECIPIENT,
  RECIPIENTS,
  RETENTION,
  TRANSFER,
  canPublishProfile,
  consentRecord,
  displayName,
  guestReadyForErasure,
  isOwnPly,
  latestConsent,
  notificationPatch,
  parseProfileEdit,
  portableExport,
  proofsExpired,
  resultForPlayer,
  subjectAccess,
  tombstonePatch,
  type SubjectSnapshot,
} from '@repo/db/gdpr';
import { db } from '../db';

export class PrivacyError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

const userSelect = {
  id: true,
  email: true,
  name: true,
  username: true,
  provider: true,
  rating: true,
  createdAt: true,
  lastLogin: true,
  publicProfile: true,
  processingRestricted: true,
  deletedAt: true,
  nameLocked: true,
} as const;

async function loadSnapshot(userId: string): Promise<SubjectSnapshot> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: userSelect,
  });
  if (!user || user.deletedAt) {
    throw new PrivacyError(401, 'Unauthorized');
  }

  const [consents, games, requests, disclosures] = await Promise.all([
    db.consent.findMany({
      where: { userId },
      orderBy: { capturedAt: 'desc' },
    }),
    db.game.findMany({
      where: {
        OR: [{ whitePlayerId: userId }, { blackPlayerId: userId }],
      },
      include: { moves: { orderBy: { moveNumber: 'asc' } } },
      orderBy: { startAt: 'desc' },
    }),
    db.privacyRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    }),
    db.recipientDisclosure.findMany({
      where: { userId },
      orderBy: { disclosedAt: 'desc' },
    }),
  ]);

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      username: user.username,
      provider: user.provider,
      rating: user.rating,
      createdAt: user.createdAt.toISOString(),
      lastLogin: user.lastLogin ? user.lastLogin.toISOString() : null,
      publicProfile: user.publicProfile,
      processingRestricted: user.processingRestricted,
      deletedAt: null,
    },
    consents: consents.map((row) => ({
      purpose: row.purpose,
      granted: row.granted,
      policyVersion: row.policyVersion,
      source: row.source,
      capturedAt: row.capturedAt.toISOString(),
      withdrawnAt: row.withdrawnAt ? row.withdrawnAt.toISOString() : null,
    })),
    games: games.map((game) => {
      const role = game.whitePlayerId === userId ? 'white' : 'black';
      return {
        id: game.id,
        role,
        result: resultForPlayer(role, game.result),
        startAt: game.startAt.toISOString(),
        moves: game.moves
          .filter((move) => isOwnPly(role, move.moveNumber))
          .map((move) => ({
            moveNumber: move.moveNumber,
            san: move.san,
            from: move.from,
            to: move.to,
            comments: move.comments,
            createdAt: move.createdAt.toISOString(),
          })),
      };
    }),
    requests: requests.map((row) => ({
      kind: row.kind,
      status: row.status,
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
    })),
    disclosures: disclosures.map((row) => ({
      recipient: row.recipient,
      dataAsset: row.dataAsset,
      disclosedAt: row.disclosedAt.toISOString(),
      notifiedOf: row.notifiedOf,
      notifiedAt: row.notifiedAt ? row.notifiedAt.toISOString() : null,
    })),
  };
}

async function logRequest(
  userId: string,
  kind: 'ACCESS' | 'EXPORT' | 'RECTIFY' | 'ERASE' | 'RESTRICT' | 'OBJECT',
  status: 'COMPLETED' | 'REJECTED',
  reason?: string
) {
  await db.privacyRequest.create({
    data: {
      userId,
      kind,
      status,
      reason,
      completedAt: new Date(),
    },
  });
}

export function notice() {
  return {
    version: POLICY_VERSION,
    controller: process.env.PRIVACY_CONTROLLER_NAME,
    contact: process.env.PRIVACY_CONTACT_EMAIL,
    automatedDecisionMaking: false,
    contractual: {
      oauth: 'Email and display name are required for a Google or GitHub account.',
      guest: 'A guest display name is optional. No email is stored.',
    },
    fields: FIELD_REGISTER,
    legitimateInterest: LEGITIMATE_INTEREST,
    recipients: RECIPIENTS,
    retention: RETENTION,
    transfer: TRANSFER,
    rights: ['access', 'rectify', 'erase', 'port', 'restrict', 'object', 'complain'],
    complaints: ['ICO under UK GDPR', "EU supervisory authority of the player's member state"],
    directMarketing: false,
  };
}

export async function access(userId: string) {
  const snapshot = await loadSnapshot(userId);
  await logRequest(userId, 'ACCESS', 'COMPLETED');
  const fresh = await loadSnapshot(userId);
  return subjectAccess(fresh.requests.length ? fresh : snapshot);
}

export async function exportPortable(userId: string) {
  const snapshot = await loadSnapshot(userId);
  await logRequest(userId, 'EXPORT', 'COMPLETED');
  return portableExport(snapshot);
}

export async function rectify(userId: string, input: unknown) {
  const parsed = parseProfileEdit(input);
  if (!parsed.ok) throw new PrivacyError(400, parsed.error);

  const existing = await db.user.findUnique({ where: { id: userId } });
  if (!existing || existing.deletedAt) {
    throw new PrivacyError(401, 'Unauthorized');
  }

  try {
    await db.user.update({
      where: { id: userId },
      data: {
        ...(parsed.name ? { name: parsed.name, nameLocked: true } : {}),
        ...(parsed.username ? { username: parsed.username } : {}),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new PrivacyError(409, 'Username is taken');
    }
    throw error;
  }

  if (canPublishProfile(existing)) {
    await db.recipientDisclosure.updateMany({
      where: { userId },
      data: notificationPatch('rectification', new Date()),
    });
  }
  await logRequest(userId, 'RECTIFY', 'COMPLETED');
  return loadSnapshot(userId);
}

export async function setConsent(userId: string, granted: boolean, policyVersion: string) {
  if (policyVersion !== POLICY_VERSION) {
    throw new PrivacyError(400, 'Policy version is out of date');
  }
  const existing = await db.user.findUnique({ where: { id: userId } });
  if (!existing || existing.deletedAt) {
    throw new PrivacyError(401, 'Unauthorized');
  }

  const now = new Date();
  await db.consent.create({
    data: consentRecord({
      userId,
      granted,
      source: 'settings',
      now,
    }),
  });
  await db.user.update({
    where: { id: userId },
    data: { publicProfile: granted },
  });
  if (granted) {
    await db.recipientDisclosure.create({
      data: {
        userId,
        recipient: PUBLIC_RECIPIENT,
        dataAsset: PUBLIC_DATA_ASSET,
      },
    });
  } else {
    await db.recipientDisclosure.updateMany({
      where: { userId },
      data: notificationPatch('consent-withdrawn', now),
    });
  }
  return loadSnapshot(userId);
}

async function endLiveGames(tx: Prisma.TransactionClient, userId: string, now: Date) {
  const live = await tx.game.findMany({
    where: {
      status: 'IN_PROGRESS',
      OR: [{ whitePlayerId: userId }, { blackPlayerId: userId }],
    },
  });
  for (const game of live) {
    await tx.game.update({
      where: { id: game.id },
      data: {
        status: 'PLAYER_EXIT',
        result: game.whitePlayerId === userId ? 'BLACK_WINS' : 'WHITE_WINS',
        endAt: now,
      },
    });
  }
}

export async function restrict(userId: string, restricted: boolean) {
  const existing = await db.user.findUnique({ where: { id: userId } });
  if (!existing || existing.deletedAt) {
    throw new PrivacyError(401, 'Unauthorized');
  }
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { processingRestricted: restricted },
    });
    if (restricted) {
      await endLiveGames(tx, userId, now);
      await tx.recipientDisclosure.updateMany({
        where: { userId },
        data: notificationPatch('restriction', now),
      });
    }
  });
  await logRequest(userId, 'RESTRICT', 'COMPLETED');
  return loadSnapshot(userId);
}

export async function objectTo(
  userId: string,
  purpose: string
): Promise<{ status: 'COMPLETED' | 'REJECTED'; reason: string }> {
  const existing = await db.user.findUnique({ where: { id: userId } });
  if (!existing || existing.deletedAt) {
    throw new PrivacyError(401, 'Unauthorized');
  }

  if (purpose === 'PUBLIC_PROFILE') {
    await setConsent(userId, false, POLICY_VERSION);
    await logRequest(userId, 'OBJECT', 'COMPLETED', 'Public profile withdrawn');
    return {
      status: 'COMPLETED',
      reason: 'Public profile processing has stopped.',
    };
  }

  if (purpose === 'SECURITY_LOG') {
    const reason = LEGITIMATE_INTEREST.balancingTest;
    await logRequest(userId, 'OBJECT', 'REJECTED', reason);
    return { status: 'REJECTED', reason };
  }

  if (purpose === 'MARKETING') {
    const reason = 'No direct marketing is sent.';
    await logRequest(userId, 'OBJECT', 'COMPLETED', reason);
    return { status: 'COMPLETED', reason };
  }

  throw new PrivacyError(400, 'Unknown purpose');
}

export async function erase(userId: string) {
  const now = new Date();
  const erased = await db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) return false;

    const consents = await tx.consent.findMany({ where: { userId } });
    const current = latestConsent(consents, 'PUBLIC_PROFILE');
    if (current?.granted) {
      await tx.consent.create({
        data: consentRecord({
          userId,
          granted: false,
          source: 'erasure',
          now,
        }),
      });
    }

    await tx.user.update({
      where: { id: userId },
      data: tombstonePatch(now),
    });

    const games = await tx.game.findMany({
      where: {
        OR: [{ whitePlayerId: userId }, { blackPlayerId: userId }],
      },
      select: { id: true },
    });
    if (games.length) {
      await tx.move.updateMany({
        where: { gameId: { in: games.map((game) => game.id) } },
        data: { comments: null },
      });
    }
    await endLiveGames(tx, userId, now);
    await tx.recipientDisclosure.updateMany({
      where: { userId },
      data: notificationPatch('erasure', now),
    });
    await tx.privacyRequest.create({
      data: {
        userId,
        kind: 'ERASE',
        status: 'COMPLETED',
        completedAt: now,
      },
    });
    return true;
  });
  return { erased };
}

export async function runRetention(now = new Date()) {
  const guests = await db.user.findMany({
    where: { provider: 'GUEST', deletedAt: null },
    select: {
      id: true,
      provider: true,
      lastLogin: true,
      createdAt: true,
      deletedAt: true,
    },
  });

  let guestsExpired = 0;
  for (const guest of guests) {
    const live = await db.game.count({
      where: {
        status: 'IN_PROGRESS',
        OR: [{ whitePlayerId: guest.id }, { blackPlayerId: guest.id }],
      },
    });
    if (
      guestReadyForErasure({
        ...guest,
        hasLiveGame: live > 0,
        now,
      })
    ) {
      await erase(guest.id);
      guestsExpired += 1;
    }
  }

  const erased = await db.user.findMany({
    where: { deletedAt: { not: null } },
    select: { id: true, deletedAt: true },
  });
  const expiredIds = erased.filter((user) => proofsExpired(user.deletedAt, now)).map((user) => user.id);

  if (expiredIds.length) {
    await db.consent.deleteMany({ where: { userId: { in: expiredIds } } });
    await db.privacyRequest.deleteMany({
      where: { userId: { in: expiredIds } },
    });
    await db.recipientDisclosure.deleteMany({
      where: { userId: { in: expiredIds } },
    });
  }

  return { guestsExpired, proofsDeleted: expiredIds.length };
}

export async function publicProfile(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      rating: true,
      createdAt: true,
      publicProfile: true,
      processingRestricted: true,
      deletedAt: true,
    },
  });
  if (!user || !canPublishProfile(user)) return null;

  const games = await db.game.findMany({
    where: {
      status: { not: 'IN_PROGRESS' },
      OR: [{ whitePlayerId: userId }, { blackPlayerId: userId }],
    },
    orderBy: { startAt: 'desc' },
    take: 10,
    include: {
      whitePlayer: {
        select: {
          id: true,
          name: true,
          publicProfile: true,
          processingRestricted: true,
          deletedAt: true,
        },
      },
      blackPlayer: {
        select: {
          id: true,
          name: true,
          publicProfile: true,
          processingRestricted: true,
          deletedAt: true,
        },
      },
    },
  });

  return {
    id: user.id,
    name: user.name,
    rating: user.rating,
    memberSince: user.createdAt.toISOString(),
    games: games.map((game) => {
      const role = game.whitePlayerId === userId ? 'white' : 'black';
      const opponent = role === 'white' ? game.blackPlayer : game.whitePlayer;
      return {
        id: game.id,
        result: resultForPlayer(role, game.result),
        playedAt: game.startAt.toISOString(),
        opponent: {
          id: opponent.id,
          name: displayName({
            player: opponent,
            viewerId: 'public',
            whiteId: game.whitePlayerId,
            blackId: game.blackPlayerId,
          }),
        },
      };
    }),
  };
}
