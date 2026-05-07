import { BasePostgresRepository } from '@core/database';
import type { IDatabaseAdapter } from '@core/database';
import type { IProduct, CreateProductDTO, UpdateProductDTO } from '../master-data.model';

export class ProductRepository extends BasePostgresRepository {
    constructor({ db }: { db: IDatabaseAdapter }) {
        super(db, 'product');
    }

    async findByCode(code: string): Promise<IProduct | null> {
        const rows = await this.findWhere({ code });
        return (rows[0] as IProduct) ?? null;
    }

    async createProduct(data: CreateProductDTO): Promise<IProduct> {
        return this.create(data) as Promise<IProduct>;
    }

    async updateProduct(id: string, data: UpdateProductDTO): Promise<IProduct> {
        return this.update(id, data) as Promise<IProduct>;
    }

    async getAllProducts(): Promise<IProduct[]> {
        return this.findAll() as Promise<IProduct[]>;
    }
}
