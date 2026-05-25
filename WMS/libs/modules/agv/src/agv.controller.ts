import { Controller, Get, Route, Tags, Path } from '@tsoa/runtime';
import { AgvDispatcherService } from './agv-dispatcher.service';
import { container } from '@core/container';

@Route('agv')
@Tags('AGV')
export class AgvController extends Controller {
    private agvDispatcherService: AgvDispatcherService;

    constructor() {
        super();
        this.agvDispatcherService = container.resolve<AgvDispatcherService>('agvDispatcherService');
    }

    @Get('warehouses/{warehouseId}/agvs')
    public async getAGVsByWarehouseId(@Path() warehouseId: string): Promise<any[]> {
        return this.agvDispatcherService.getAGVsByWarehouse(warehouseId);
    }
}
