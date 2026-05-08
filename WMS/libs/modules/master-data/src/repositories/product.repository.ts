import { BasePostgresRepository } from '@core/database';
import type { IDatabaseAdapter } from '@core/database';
import type { IProduct, CreateProductDTO, UpdateProductDTO } from '../master-data.model';

export class ProductRepository extends BasePostgresRepository {
    constructor({ db }: { db: IDatabaseAdapter }) {
        super(db, 'product');
    }

    async findByCode(code: string): Promise<IProduct | null> {
        const result = await this.findWhere({ code });
        return result[0] as unknown as IProduct ?? null;
    }

    async createProduct(data: CreateProductDTO): Promise<IProduct> {
        const result = await this.create(data as any);
        return result as unknown as IProduct;
    }

    async updateProduct(id: string, data: UpdateProductDTO): Promise<IProduct> {
        const result = await this.update(id, data as any);
        return result as unknown as IProduct;
    }

    async getAllProducts(): Promise<IProduct[]> {
        return this.findAll() as unknown as Promise<IProduct[]>;
    }
}
