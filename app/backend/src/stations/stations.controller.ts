import { Controller, Get, Query } from '@nestjs/common'
import { SearchStationsDto } from './dto/search-stations.dto'
import { StationsService } from './stations.service'

@Controller('stations')
export class StationsController {
  constructor(private readonly stationsService: StationsService) {}

  @Get()
  search(@Query() query: SearchStationsDto) {
    return this.stationsService.search(query)
  }

  @Get('search-locations')
  async searchLocations(@Query('query') query?: string) {
    const locations = await this.stationsService.searchLocations(query)
    return locations
  }

  @Get('resolve-location')
  async resolveLocation(
    @Query('query') query?: string,
    @Query('latitude') latitude?: string,
    @Query('longitude') longitude?: string,
  ) {
    const lat = latitude ? Number(latitude) : undefined
    const lng = longitude ? Number(longitude) : undefined
    const location = await this.stationsService.resolveLocation(query, lat, lng)
    return location
  }
}
