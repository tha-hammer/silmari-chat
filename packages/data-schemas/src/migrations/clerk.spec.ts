import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { MongoServerError } from 'mongodb';
import { MongoMemoryReplSet, MongoMemoryServer } from 'mongodb-memory-server';
import logger from '~/config/winston';
import { ensureClerkIndexes, ClerkIndexAssuranceError, CLERK_INDEX_SPECS } from './clerk';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

/**
 * Independently authored oracle — deliberately NOT imported from production `clerk.ts`.
 * Proves complete coverage of every required Fixed-Contract-5 field; a missing, misspelled,
 * or reassigned production row makes its own targeted case fail, so drift is observable.
 * Does not (and cannot) detect an extra row silently added to the private production table.
 */
const EXPECTED_NO_BLANK_CHECKS = [
  { collection: 'users', field: 'clerkId' },
  { collection: 'sessions', field: 'clerkTokenId' },
  { collection: 'sessions', field: 'clerkSessionId' },
  { collection: 'sessions', field: 'clerkUserId' },
  { collection: 'clerkauthclaims', field: 'tenantScope' },
  { collection: 'clerkauthclaims', field: 'clerkTokenId' },
  { collection: 'clerkauthclaims', field: 'sourceClerkSessionId' },
  { collection: 'clerkauthclaims', field: 'sourceClerkUserId' },
  { collection: 'clerkauthclaims', field: 'clerkSessionId' },
  { collection: 'clerkauthclaims', field: 'clerkUserId' },
] as const;

const BLANK_VALUES = [null, '', '   ', '\t\n'] as const;

const EXPECTED_BLANK_VALUE_COUNT = BLANK_VALUES.length;
const EXPECTED_BLANK_COUNT_COMMANDS = EXPECTED_NO_BLANK_CHECKS.length;
const MIXED_CASE_BLANK_COUNT = 2;
const FIXTURE_TTL_HORIZON_MS = 60 * 60 * 1000;
const INJECTED_READ_FAILURE_CODE = 9001;
const SUCCESS_LOG_MESSAGE =
  '[ensureClerkIndexes] All Clerk indexes assured; transactions supported.';

/** Schema-faithful success fixtures — realistic rows, distinct from the blank-matrix corruption rows below. */
function buildFixtures() {
  const future = new Date(Date.now() + FIXTURE_TTL_HORIZON_MS);
  const userId = new mongoose.Types.ObjectId();
  const clerkUserId = new mongoose.Types.ObjectId();

  return {
    legacyUser: {
      _id: userId,
      email: 'legacy@test.com',
      emailVerified: false,
      provider: 'local',
    },
    clerkUser: {
      _id: clerkUserId,
      email: 'clerk@test.com',
      emailVerified: true,
      provider: 'clerk',
      clerkId: 'user-clerk',
    },
    legacySession: {
      user: userId,
      refreshTokenHash: 'legacy-refresh-hash',
      expiration: future,
    },
    clerkSession: {
      user: clerkUserId,
      refreshTokenHash: 'clerk-refresh-hash',
      expiration: future,
      absoluteExpiresAt: future,
      authProvider: 'clerk',
      clerkTokenId: 'token-session',
      clerkSessionId: 'session-current',
      clerkUserId: 'user-clerk',
    },
    consumedToken: {
      kind: 'consumed_token',
      tenantScope: 'tenant-a',
      clerkTokenId: 'token-existing',
      sourceClerkSessionId: 'session-source',
      sourceClerkUserId: 'user-source',
      expiration: future,
    },
    sessionState: {
      kind: 'session_state',
      clerkSessionId: 'session-state',
      state: 'active',
      expiration: future,
    },
    userState: {
      kind: 'user_state',
      clerkUserId: 'user-state',
      state: 'active',
      expiration: future,
    },
  };
}

async function assertNoRequiredIndexExists(connection: mongoose.Connection): Promise<void> {
  for (const spec of CLERK_INDEX_SPECS) {
    const indexes = await connection
      .db!.collection(spec.collection)
      .indexes()
      .catch(() => []);
    expect(indexes.some((idx: { name?: string }) => idx.name === spec.options.name)).toBe(false);
  }
}

describe('ensureClerkIndexes — replica set (transactions supported)', () => {
  let mongoServer: MongoMemoryReplSet;
  let connection: mongoose.Connection;

  beforeAll(async () => {
    mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    connection = await mongoose.createConnection(mongoServer.getUri()).asPromise();
  });

  afterAll(async () => {
    await connection.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    /** Drop (not just deleteMany) so indexes from a prior test never leak into the next. */
    const collections = await connection.db!.listCollections().toArray();
    await Promise.all(
      collections.map((c) =>
        connection
          .db!.collection(c.name)
          .drop()
          .catch(() => undefined),
      ),
    );
  });

  test('creates every named index on a fresh database with the exact declared definition', async () => {
    await ensureClerkIndexes(connection);

    for (const spec of CLERK_INDEX_SPECS) {
      const indexes = await connection.db!.collection(spec.collection).indexes();
      const created = indexes.find((idx) => idx.name === spec.options.name);
      expect(created).toBeDefined();
      expect(created!.key).toEqual(spec.key);
      expect(Boolean(created!.unique)).toBe(Boolean(spec.options.unique));
      if (spec.options.partialFilterExpression) {
        expect(created!.partialFilterExpression).toEqual(spec.options.partialFilterExpression);
      }
      if (spec.options.expireAfterSeconds != null) {
        expect(created!.expireAfterSeconds).toBe(spec.options.expireAfterSeconds);
      }
    }
  });

  test('is idempotent on rerun — no duplicate or errored second pass', async () => {
    await ensureClerkIndexes(connection);
    await expect(ensureClerkIndexes(connection)).resolves.toBeUndefined();

    const indexes = await connection.db!.collection('users').indexes();
    expect(indexes.filter((idx) => idx.name === 'clerkId_1_tenantId_1')).toHaveLength(1);
  });

  test('fails preflight when an existing document has a blank clerkId', async () => {
    await connection.db!.collection('users').insertOne({ email: 'a@test.com', clerkId: '   ' });

    await expect(ensureClerkIndexes(connection)).rejects.toThrow(/null\/empty\/whitespace/);
  });

  test('fails preflight when existing documents have a duplicate clerkId within the same tenant scope', async () => {
    await connection.db!.collection('users').insertMany([
      { email: 'a@test.com', clerkId: 'dup', tenantId: 'tenant-a' },
      { email: 'b@test.com', clerkId: 'dup', tenantId: 'tenant-a' },
    ]);

    await expect(ensureClerkIndexes(connection)).rejects.toThrow(/duplicate values/);
  });

  test('does not fail preflight for the same clerkId across different tenant scopes', async () => {
    await connection.db!.collection('users').insertMany([
      { email: 'a@test.com', clerkId: 'dup', tenantId: 'tenant-a' },
      { email: 'b@test.com', clerkId: 'dup', tenantId: 'tenant-b' },
    ]);

    await expect(ensureClerkIndexes(connection)).resolves.toBeUndefined();
  });

  test('fails on an existing same-name index with an incompatible definition', async () => {
    await connection
      .db!.collection('users')
      .createIndex({ email: 1 }, { name: 'clerkId_1_tenantId_1' });

    await expect(ensureClerkIndexes(connection)).rejects.toThrow(/incompatible/);
  });

  test('rejects when the connection has no database handle', async () => {
    const bareConnection = { db: undefined } as unknown as mongoose.Connection;
    await expect(ensureClerkIndexes(bareConnection)).rejects.toBeInstanceOf(
      ClerkIndexAssuranceError,
    );
  });

  describe('variant-aware restart success (2026-08-14 production incident regression)', () => {
    test('resolves and creates all eight indexes for realistic pre-Clerk and Clerk User/Session rows plus valid claim variants', async () => {
      const fixtures = buildFixtures();

      await connection
        .db!.collection('users')
        .insertMany([fixtures.legacyUser, fixtures.clerkUser]);
      await connection
        .db!.collection('sessions')
        .insertMany([fixtures.legacySession, fixtures.clerkSession]);
      await connection
        .db!.collection('clerkauthclaims')
        .insertMany([fixtures.consumedToken, fixtures.sessionState, fixtures.userState]);

      await expect(ensureClerkIndexes(connection)).resolves.toBeUndefined();

      for (const spec of CLERK_INDEX_SPECS) {
        const indexes = await connection.db!.collection(spec.collection).indexes();
        expect(indexes.some((idx) => idx.name === spec.options.name)).toBe(true);
      }
    });

    test('pre-Clerk-only: resolves when the clerkauthclaims collection does not exist yet', async () => {
      const fixtures = buildFixtures();

      await connection.db!.collection('users').insertOne(fixtures.legacyUser);
      await connection.db!.collection('sessions').insertOne(fixtures.legacySession);

      const claimCollections = await connection
        .db!.listCollections({ name: 'clerkauthclaims' })
        .toArray();
      expect(claimCollections).toHaveLength(0);

      await expect(ensureClerkIndexes(connection)).resolves.toBeUndefined();

      for (const spec of CLERK_INDEX_SPECS) {
        const indexes = await connection.db!.collection(spec.collection).indexes();
        expect(indexes.some((idx) => idx.name === spec.options.name)).toBe(true);
      }
    });
  });

  describe('authoritative present-blank field (independent 10-row oracle)', () => {
    test.each(EXPECTED_NO_BLANK_CHECKS)(
      '$collection.$field: every blank value rejects with the exact count',
      async ({ collection, field }) => {
        await connection
          .db!.collection(collection)
          .insertMany(BLANK_VALUES.map((value) => ({ [field]: value })));

        const error = await ensureClerkIndexes(connection).catch((e) => e);

        expect(error).toBeInstanceOf(ClerkIndexAssuranceError);
        expect((error as Error).message).toBe(
          `[ensureClerkIndexes] Preflight failed: ${collection}.${field} has ${EXPECTED_BLANK_VALUE_COUNT} null/empty/whitespace value(s)`,
        );
      },
    );
  });

  describe('mixed absence, count, and precedence', () => {
    test('absent rows do not count; two present-blank rows report exact count; first failing field wins', async () => {
      await connection
        .db!.collection('sessions')
        .insertMany([
          { note: 'legacy session, no clerkTokenId at all' },
          { note: 'another legacy session, no clerkTokenId at all' },
          { note: 'a third legacy session, no clerkTokenId at all' },
          { clerkTokenId: '' },
          { clerkTokenId: '   ' },
        ]);
      // A later-ordered field in the 10-row contract is also blank — must not preempt
      // sessions.clerkTokenId's earlier, fail-fast position.
      await connection.db!.collection('clerkauthclaims').insertOne({ clerkUserId: null });

      const error = await ensureClerkIndexes(connection).catch((e) => e);

      expect(error).toBeInstanceOf(ClerkIndexAssuranceError);
      expect((error as Error).message).toBe(
        `[ensureClerkIndexes] Preflight failed: sessions.clerkTokenId has ${MIXED_CASE_BLANK_COUNT} null/empty/whitespace value(s)`,
      );
    });
  });
});

describe('ensureClerkIndexes — standalone (no transaction support)', () => {
  let mongoServer: MongoMemoryServer;
  let connection: mongoose.Connection;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    connection = await mongoose.createConnection(mongoServer.getUri()).asPromise();
  });

  afterAll(async () => {
    await connection.close();
    await mongoServer.stop();
  });

  test('fails closed when multi-document transactions are unavailable', async () => {
    await expect(ensureClerkIndexes(connection)).rejects.toThrow(/transaction/);
  });
});

describe('preflight read failures fail closed (real Mongo failCommand)', () => {
  let mongoServer: MongoMemoryReplSet;
  let connection: mongoose.Connection;

  beforeAll(async () => {
    mongoServer = await MongoMemoryReplSet.create({
      replSet: { count: 1, args: ['--setParameter', 'enableTestCommands=1'] },
    });
    /** `retryReads: false` so the driver cannot mask the injected failure with a retry. */
    connection = await mongoose
      .createConnection(mongoServer.getUri(), { retryReads: false })
      .asPromise();
  });

  afterAll(async () => {
    await connection.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const collections = await connection.db!.listCollections().toArray();
    await Promise.all(
      collections.map((c) =>
        connection
          .db!.collection(c.name)
          .drop()
          .catch((error: unknown) => {
            /** "ns not found" (26) — the collection was already absent; anything else is a real failure. */
            if ((error as { code?: number }).code === 26) {
              return undefined;
            }
            throw error;
          }),
      ),
    );
  });

  async function enableAggregateFailure(
    mode: { times: number } | { skip: number; times: number },
  ): Promise<void> {
    await connection.db!.admin().command({
      configureFailPoint: 'failCommand',
      mode,
      data: { failCommands: ['aggregate'], errorCode: INJECTED_READ_FAILURE_CODE },
    });
  }

  async function disableFailpoint(): Promise<void> {
    await connection.db!.admin().command({ configureFailPoint: 'failCommand', mode: 'off' });
  }

  test('blank-count read failure: rejects with the native driver error before index creation', async () => {
    try {
      await enableAggregateFailure({ times: 1 });

      const error = await ensureClerkIndexes(connection).catch((e) => e);

      expect(error).toBeInstanceOf(MongoServerError);
      expect(error).not.toBeInstanceOf(ClerkIndexAssuranceError);
      expect((error as MongoServerError).code).toBe(INJECTED_READ_FAILURE_CODE);
      await assertNoRequiredIndexExists(connection);
      expect(logger.info).not.toHaveBeenCalledWith(SUCCESS_LOG_MESSAGE);
    } finally {
      await disableFailpoint();
    }
  });

  test('duplicate-scan read failure: rejects with the native driver error before index creation', async () => {
    try {
      await enableAggregateFailure({ skip: EXPECTED_BLANK_COUNT_COMMANDS, times: 1 });

      const error = await ensureClerkIndexes(connection).catch((e) => e);

      expect(error).toBeInstanceOf(MongoServerError);
      expect(error).not.toBeInstanceOf(ClerkIndexAssuranceError);
      expect((error as MongoServerError).code).toBe(INJECTED_READ_FAILURE_CODE);
      await assertNoRequiredIndexExists(connection);
      expect(logger.info).not.toHaveBeenCalledWith(SUCCESS_LOG_MESSAGE);
    } finally {
      await disableFailpoint();
    }
  });
});

describe('production code never calls syncIndexes()', () => {
  test('migrations/clerk.ts source has no syncIndexes call', () => {
    const source = fs.readFileSync(path.join(__dirname, 'clerk.ts'), 'utf8');
    expect(source).not.toMatch(/\.syncIndexes\(/);
  });
});
