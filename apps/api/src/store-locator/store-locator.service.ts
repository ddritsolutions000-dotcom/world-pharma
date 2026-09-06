import { Injectable } from '@nestjs/common';
import { LocationKind } from '@prisma/client';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { requireCountryCode } from '../catalog/catalog-country';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { workerTenantContext } from '../tenancy/build-tenant-context';

const STORE_KINDS: LocationKind[] = [
  LocationKind.STORE,
  LocationKind.WAREHOUSE,
  LocationKind.COLLECTION_POINT,
  LocationKind.VENDOR_WAREHOUSE,
];

/**
 * Store locator service - 1mg-style physical store network
 * Provides store location, directions, services, and inventory availability
 */
@Injectable()
export class StoreLocatorService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get nearby stores (1mg-style store locator)
   */
  async getNearbyStores(
    principal: Principal,
    query: {
      country_code?: string;
      latitude?: number;
      longitude?: number;
      radius?: number;
      store_type?: string;
      services?: string[];
      limit?: number;
    }
  ) {
    const country = await this.prisma.country.findUnique({
      where: { isoAlpha2: requireCountryCode(query.country_code) },
    });
    if (!country) {
      throw Errors.notFound('Country not available');
    }

    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const limit = Math.min(50, Math.max(1, query.limit || 20));
        const radius = query.radius || 10; // Default 10km radius
        const stores = await this.loadStores(country.id);
        
        // Filter by location if coordinates provided
        let filteredStores = stores;
        if (query.latitude && query.longitude) {
          filteredStores = stores.filter(store => {
            const distance = this.calculateDistance(
              query.latitude!,
              query.longitude!,
              store.latitude,
              store.longitude
            );
            return distance <= radius;
          }).map(store => ({
            ...store,
            distance: this.calculateDistance(
              query.latitude!,
              query.longitude!,
              store.latitude,
              store.longitude
            ),
          })).sort((a, b) => a.distance - b.distance);
        }

        // Filter by store type
        if (query.store_type) {
          filteredStores = filteredStores.filter(store => 
            store.store_type === query.store_type
          );
        }

        // Filter by services
        if (query.services && query.services.length > 0) {
          filteredStores = filteredStores.filter(store =>
            query.services!.some(service => store.services.includes(service))
          );
        }

        return {
          stores: filteredStores.slice(0, limit),
          total: filteredStores.length,
          search_center: query.latitude && query.longitude ? {
            latitude: query.latitude,
            longitude: query.longitude,
            radius: radius,
          } : null,
        };
      }
    );
  }

  /**
   * Get store details (1mg-style store information)
   */
  async getStoreDetails(
    principal: Principal,
    storeId: string,
    countryCode?: string
  ) {
    const country = await this.prisma.country.findUnique({
      where: { isoAlpha2: requireCountryCode(countryCode) },
    });
    if (!country) {
      throw Errors.notFound('Country not available');
    }

    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const stores = await this.loadStores(country.id);
        const store = stores.find(s => s.id === storeId);
        
        if (!store) {
          throw Errors.notFound('Store not found');
        }

        return {
          ...store,
          operating_hours: this.getStoreOperatingHours(storeId),
          contact_info: {
            phone: store.phone,
            email: store.email,
            address: store.address,
            directions: this.getDirections(storeId),
          },
          services_detail: this.getStoreServicesDetail(storeId),
          payment_methods: ['cash', 'card', 'upi', 'insurance'],
          amenities: this.getStoreAmenities(storeId),
          nearby_landmarks: this.getNearbyLandmarks(storeId),
        };
      }
    );
  }

  /**
   * Get store inventory (1mg-style store availability)
   */
  async getStoreInventory(
    principal: Principal,
    storeId: string,
    query: {
      country_code?: string;
      search?: string;
      category?: string;
      limit?: number;
    }
  ) {
    const country = await this.prisma.country.findUnique({
      where: { isoAlpha2: requireCountryCode(query.country_code) },
    });
    if (!country) {
      throw Errors.notFound('Country not available');
    }

    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const limit = Math.min(50, Math.max(1, query.limit || 20));
        
        // For now, return mock inventory data
        // In real implementation, would query actual inventory tables
        const inventory = this.getMockStoreInventory(storeId);
        
        let filteredInventory = inventory;
        
        if (query.search) {
          const searchLower = query.search.toLowerCase();
          filteredInventory = filteredInventory.filter(item =>
            item.name.toLowerCase().includes(searchLower) ||
            item.brand.toLowerCase().includes(searchLower)
          );
        }

        if (query.category) {
          filteredInventory = filteredInventory.filter(item =>
            item.category === query.category
          );
        }

        return {
          store_id: storeId,
          inventory: filteredInventory.slice(0, limit),
          total: filteredInventory.length,
          last_updated: new Date().toISOString(),
        };
      }
    );
  }

  /**
   * Get store services (1mg-style service availability)
   */
  async getStoreServices(
    principal: Principal,
    storeId: string,
    countryCode?: string
  ) {
    const country = await this.prisma.country.findUnique({
      where: { isoAlpha2: requireCountryCode(countryCode) },
    });
    if (!country) {
      throw Errors.notFound('Country not available');
    }

    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const services = this.getStoreServicesDetail(storeId);
        
        return {
          store_id: storeId,
          services,
        };
      }
    );
  }

  /**
   * Search stores by city/area (1mg-style location search)
   */
  async searchStoresByLocation(
    principal: Principal,
    query: {
      country_code?: string;
      city?: string;
      area?: string;
      pincode?: string;
      limit?: number;
    }
  ) {
    const country = await this.prisma.country.findUnique({
      where: { isoAlpha2: requireCountryCode(query.country_code) },
    });
    if (!country) {
      throw Errors.notFound('Country not available');
    }

    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const limit = Math.min(50, Math.max(1, query.limit || 20));
        const stores = await this.loadStores(country.id);
        
        let filteredStores = stores;
        
        if (query.city) {
          filteredStores = filteredStores.filter(store =>
            store.city.toLowerCase().includes(query.city!.toLowerCase())
          );
        }

        if (query.area) {
          filteredStores = filteredStores.filter(store =>
            store.area.toLowerCase().includes(query.area!.toLowerCase())
          );
        }

        if (query.pincode) {
          filteredStores = filteredStores.filter(store =>
            store.pincode === query.pincode
          );
        }

        return {
          stores: filteredStores.slice(0, limit),
          total: filteredStores.length,
          search_criteria: {
            city: query.city,
            area: query.area,
            pincode: query.pincode,
          },
        };
      }
    );
  }

  async listPublic(query: {
    country_code?: string;
    city?: string;
    pincode?: string;
    latitude?: number;
    longitude?: number;
    radius?: number;
    limit?: number;
  }) {
    const country = await this.prisma.country.findUnique({
      where: { isoAlpha2: requireCountryCode(query.country_code) },
    });
    if (!country) {
      throw Errors.notFound('Country not available');
    }
    return runWithTenant(workerTenantContext({ countryId: country.id }), async () => {
      const limit = Math.min(50, Math.max(1, query.limit || 20));
      let stores = await this.loadStores(country.id);
      if (query.city) {
        stores = stores.filter((store) => store.city.toLowerCase().includes(query.city!.toLowerCase()));
      }
      if (query.pincode) {
        stores = stores.filter((store) => store.pincode === query.pincode);
      }
      if (query.latitude && query.longitude) {
        const radius = query.radius || 25;
        stores = stores
          .map((store) => ({
            ...store,
            distance: this.calculateDistance(query.latitude!, query.longitude!, store.latitude, store.longitude),
          }))
          .filter((store) => store.distance <= radius)
          .sort((a, b) => a.distance - b.distance);
      }
      return {
        stores: stores.slice(0, limit),
        total: stores.length,
        country_code: country.isoAlpha2,
      };
    });
  }

  private async loadStores(countryId: string) {
    const rows = await this.prisma.location.findMany({
      where: {
        countryId,
        isActive: true,
        kind: { in: STORE_KINDS },
      },
      include: { organization: true },
      take: 50,
      orderBy: { name: 'asc' },
    });
    if (rows.length) {
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        store_type: row.kind === LocationKind.STORE ? 'pharmacy' : row.kind.toLowerCase(),
        address: row.addressLine ?? [row.city, row.region, row.postalCode].filter(Boolean).join(', '),
        city: row.city ?? '',
        area: row.region ?? '',
        pincode: row.postalCode ?? '',
        latitude: row.latitude ? Number(row.latitude) : 0,
        longitude: row.longitude ? Number(row.longitude) : 0,
        phone: null as string | null,
        email: null as string | null,
        rating: null as number | null,
        total_reviews: 0,
        is_24_7: false,
        services: ['pharmacy', 'prescription'],
        license_number: row.organization.legalName,
        organization_name: row.organization.displayName ?? row.organization.legalName,
      }));
    }
    return [];
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  private getStoreOperatingHours(storeId: string) {
    return {
      monday: { open: '09:00', close: '21:00', is_closed: false },
      tuesday: { open: '09:00', close: '21:00', is_closed: false },
      wednesday: { open: '09:00', close: '21:00', is_closed: false },
      thursday: { open: '09:00', close: '21:00', is_closed: false },
      friday: { open: '09:00', close: '21:00', is_closed: false },
      saturday: { open: '10:00', close: '20:00', is_closed: false },
      sunday: { open: '10:00', close: '18:00', is_closed: false },
    };
  }

  private getStoreServicesDetail(storeId: string) {
    return [
      {
        service_id: 'pharmacy',
        name: 'Pharmacy Services',
        description: 'Full range of prescription and OTC medicines',
        available: true,
      },
      {
        service_id: 'prescription',
        name: 'Prescription Services',
        description: 'Prescription processing and dispensing',
        available: true,
      },
      {
        service_id: 'health_checkup',
        name: 'Health Checkup',
        description: 'Basic health screening services',
        available: true,
      },
      {
        service_id: 'vaccination',
        name: 'Vaccination Services',
        description: 'Immunization and vaccination programs',
        available: true,
      },
      {
        service_id: 'lab_collection',
        name: 'Lab Sample Collection',
        description: 'Sample collection for partner labs',
        available: false,
      },
    ];
  }

  private getStoreAmenities(storeId: string) {
    return [
      'Parking Available',
      'Wheelchair Accessible',
      'Air Conditioned',
      'Waiting Area',
      'Payment Cards Accepted',
      'UPI Payments',
      'Home Delivery Available',
      'Prescription Refill Service',
    ];
  }

  private getNearbyLandmarks(storeId: string) {
    return [
      'City Hospital (0.5 km)',
      'Metro Station (1.2 km)',
      'Shopping Mall (0.8 km)',
      'Bus Stop (0.3 km)',
    ];
  }

  private getDirections(storeId: string) {
    return {
      main_landmark: 'Near City Hospital',
      public_transport: 'Metro Station - 1.2 km, Bus Stop - 0.3 km',
      parking: 'Free parking available',
      accessibility: 'Wheelchair accessible entrance',
    };
  }

  private getMockStoreInventory(storeId: string) {
    return [
      {
        item_id: 'item-001',
        name: 'Paracetamol 500mg',
        brand: 'Crocin',
        category: 'pain_relief',
        price: 25,
        stock: 150,
        requires_prescription: false,
      },
      {
        item_id: 'item-002',
        name: 'Omeprazole 20mg',
        brand: 'Omez',
        category: 'digestive',
        price: 89,
        stock: 75,
        requires_prescription: true,
      },
      {
        item_id: 'item-003',
        name: 'Metformin 500mg',
        brand: 'Glycomet',
        category: 'diabetes',
        price: 45,
        stock: 200,
        requires_prescription: true,
      },
      {
        item_id: 'item-004',
        name: 'Vitamin D3 60000 IU',
        brand: 'Calcirol',
        category: 'supplements',
        price: 65,
        stock: 120,
        requires_prescription: false,
      },
      {
        item_id: 'item-005',
        name: 'Cetirizine 10mg',
        brand: 'Cetcip',
        category: 'allergy',
        price: 35,
        stock: 180,
        requires_prescription: false,
      },
    ];
  }
}
