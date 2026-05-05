import { NotFoundError } from '@core/exceptions';

/**
 * BaseFirebaseRepository — Generic CRUD cho Firestore.
 * Cac Module (Users, Courses) ke thua class nay.
 */
export class BaseFirebaseRepository {
    protected db: FirebaseFirestore.Firestore;
    protected collectionName: string;
    protected collection: FirebaseFirestore.CollectionReference;

    constructor(firestore: FirebaseFirestore.Firestore, collectionName: string) {
        if (!firestore) throw new Error('Firestore instance is required');
        this.db = firestore;
        this.collectionName = collectionName;
        this.collection = this.db.collection(collectionName);
    }

    async findById(id: string): Promise<Record<string, unknown> | null> {
        const doc = await this.collection.doc(id).get();
        if (!doc.exists) return null;
        return { id: doc.id, ...doc.data() };
    }

    async findByIdOrThrow(id: string): Promise<Record<string, unknown>> {
        const data = await this.findById(id);
        if (!data) {
            throw new NotFoundError(`Document with id '${id}' not found in ${this.collectionName}`);
        }
        return data;
    }

    async create(data: Record<string, unknown>, id: string | null = null): Promise<Record<string, unknown>> {
        const docRef = id ? this.collection.doc(id) : this.collection.doc();

        const timestamp = new Date();
        const payload = {
            ...data,
            createdAt: timestamp,
            updatedAt: timestamp
        };

        await docRef.set(payload);
        return { id: docRef.id, ...payload };
    }

    async update(id: string, partialData: Record<string, unknown>): Promise<Record<string, unknown>> {
        const docRef = this.collection.doc(id);
        await this.findByIdOrThrow(id);

        const payload = {
            ...partialData,
            updatedAt: new Date()
        };

        await docRef.set(payload, { merge: true });
        return { id, ...(await this.findById(id)) };
    }

    async delete(id: string): Promise<boolean> {
        await this.findByIdOrThrow(id);
        await this.collection.doc(id).delete();
        return true;
    }
}
