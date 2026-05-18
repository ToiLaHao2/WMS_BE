import { Controller, Post, Get, Route, Tags, Body, Path } from '@tsoa/runtime';
import type { OutboundService } from './outbound.service';
import type { IOutboundOrder, CreateOutboundOrderDTO } from './outbound.model';

@Route('outbound')
@Tags('Outbound')
export class OutboundController extends Controller {
    private outboundService: OutboundService;

    constructor({ outboundService }: { outboundService: OutboundService }) {
        super();
        this.outboundService = outboundService;
    }

    /**
     * Tạo lệnh xuất hàng mới. Hệ thống sẽ tự động quét inventory để tìm vị trí lấy hàng.
     */
    @Post('')
    public async createOutboundOrder(@Body() body: CreateOutboundOrderDTO): Promise<IOutboundOrder> {
        this.setStatus(201);
        return this.outboundService.createOutboundOrder(body);
    }

    /**
     * Lấy danh sách tất cả các lệnh xuất hàng.
     */
    @Get('')
    public async getAllOutboundOrders(): Promise<IOutboundOrder[]> {
        return this.outboundService.getAllOrders();
    }

    /**
     * Lấy chi tiết lệnh xuất hàng theo ID (bao gồm cả danh sách vị trí phải đến lấy).
     */
    @Get('{id}')
    public async getOutboundOrderById(@Path() id: string): Promise<any> {
        return this.outboundService.getOrderById(id);
    }
}
