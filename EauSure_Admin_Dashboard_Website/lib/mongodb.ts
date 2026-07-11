import { MongoClient } from 'mongodb';

const options = {};

type GlobalMongo = typeof globalThis & {
  _mongoClientPromise?: Promise<MongoClient>;
};

let mongoClientPromise: Promise<MongoClient> | undefined;

function getMongoUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('Invalid/Missing environment variable: "MONGODB_URI"');
  }
  return uri;
}

function createClientPromise(): Promise<MongoClient> {
  const client = new MongoClient(getMongoUri(), options);
  const promise = client.connect();

  promise.catch((error) => {
    if (process.env.NODE_ENV === 'development') {
      const globalWithMongo = global as GlobalMongo;
      if (globalWithMongo._mongoClientPromise === promise) {
        delete globalWithMongo._mongoClientPromise;
      }
    } else if (mongoClientPromise === promise) {
      mongoClientPromise = undefined;
    }

    console.error('MongoDB connection failed:', error);
  });

  return promise;
}

export function getClientPromise(): Promise<MongoClient> {
  if (process.env.NODE_ENV === 'development') {
    const globalWithMongo = global as GlobalMongo;
    if (!globalWithMongo._mongoClientPromise) {
      globalWithMongo._mongoClientPromise = createClientPromise();
    }
    return globalWithMongo._mongoClientPromise;
  }

  if (!mongoClientPromise) {
    mongoClientPromise = createClientPromise();
  }

  return mongoClientPromise;
}

const clientPromise = {
  then<TResult1 = MongoClient, TResult2 = never>(
    onfulfilled?:
      | ((value: MongoClient) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null
  ) {
    return getClientPromise().then(onfulfilled, onrejected);
  },
  catch<TResult = never>(
    onrejected?:
      | ((reason: unknown) => TResult | PromiseLike<TResult>)
      | null
  ) {
    return getClientPromise().catch(onrejected);
  },
  finally(onfinally?: (() => void) | null) {
    return getClientPromise().finally(onfinally);
  },
} as Promise<MongoClient>;

export default clientPromise;

export async function getClient(): Promise<MongoClient> {
  return await getClientPromise();
}

export async function dbConnect(): Promise<MongoClient> {
  return await getClientPromise();
}
