import { Controller, Post, Get, Route, Tags, Body, Path } from '@tsoa/runtime';
import type { InboundService } from './inbound.service';
import type { IInboundOrder, CreateInboundOrderDTO } from './inbound.model';

@Route('inbound')
@Tags('Inbound')
export class InboundController extends Controller {
    private inboundService: InboundService;

    constructor({ inboundService }: { inboundService: InboundService }) {
        super();
        this.inboundService = inboundService;
    }

    /**
     * Tạo một lệnh nhập hàng mới. Hệ thống sẽ tự động gọi MES xin cấp slot.
     */
    @Post('')
    public async createInboundOrder(@Body() body: CreateInboundOrderDTO): Promise<any> {
        this.setStatus(201);
        return this.inboundService.createInboundOrder(body);
    }

    /**
     * Lấy danh sách tất cả các lệnh nhập hàng.
     */
    @Get('')
    public async getAllInboundOrders(): Promise<IInboundOrder[]> {
        return this.inboundService.getAllOrders();
    }

    /**
     * Lấy chi tiết lệnh nhập hàng theo ID (bao gồm cả danh sách items và slot_id).
     */
    @Get('{id}')
    public async getInboundOrderById(@Path() id: string): Promise<any> {
        return this.inboundService.getOrderById(id);
    }

}
