import { Injectable } from '@nestjs/common';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { requireCountryCode } from '../catalog/catalog-country';
import { Errors } from '../common/problem';
import { OutboxService } from '../events/outbox.service';
import type { Principal } from '../identity/current-principal';
import { workerTenantContext } from '../tenancy/build-tenant-context';

/**
 * Corporate wellness B2B service - 1mg-style corporate healthcare programs
 * Provides employee health benefits, wellness programs, and corporate partnerships
 */
@Injectable()
export class CorporateWellnessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * Get corporate wellness programs (1mg-style B2B offerings)
   */
  async getCorporatePrograms(
    principal: Principal | null,
    countryCode?: string
  ) {
    const code = requireCountryCode(countryCode);
    const country = await this.prisma.country.findUnique({
      where: { isoAlpha2: code },
    });
    if (!country) {
      throw Errors.notFound('Country not available');
    }

    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal?.personId }),
      async () => {
        const programs = [
          {
            id: 'employee-health-checkup',
            name: 'Employee Health Checkup Program',
            description: 'Comprehensive health screenings for employees',
            tier: 'basic',
            features: [
              'Annual health checkups',
              'Basic blood tests',
              'Vital signs assessment',
              'Health reports',
              'Digital health records',
            ],
            pricing: {
              per_employee: 1500,
              minimum_employees: 50,
              setup_fee: 5000,
            },
            includes_lab_tests: true,
            includes_consultations: false,
          },
          {
            id: 'corporate-wellness-comprehensive',
            name: 'Comprehensive Wellness Program',
            description: 'Complete wellness solution with health monitoring',
            tier: 'premium',
            features: [
              'Quarterly health checkups',
              'Advanced diagnostics',
              'Doctor consultations',
              'Mental health support',
              'Wellness workshops',
              'Health analytics dashboard',
            ],
            pricing: {
              per_employee: 3500,
              minimum_employees: 100,
              setup_fee: 15000,
            },
            includes_lab_tests: true,
            includes_consultations: true,
          },
          {
            id: 'pharmacy-benefit',
            name: 'Corporate Pharmacy Benefit',
            description: 'Discounted medicines and health products for employees',
            tier: 'basic',
            features: [
              '15% discount on medicines',
              'Free home delivery',
              'Priority support',
              'Family coverage option',
              'Easy reimbursement',
            ],
            pricing: {
              per_employee: 500,
              minimum_employees: 25,
              setup_fee: 2000,
            },
            includes_lab_tests: false,
            includes_consultations: false,
          },
          {
            id: 'telemedicine-employee',
            name: 'Employee Telemedicine Program',
            description: '24/7 doctor consultation access for employees',
            tier: 'premium',
            features: [
              'Unlimited doctor consultations',
              'Video and chat consultations',
              'Prescription services',
              'Follow-up care',
              'Specialist access',
              'Integration with corporate benefits',
            ],
            pricing: {
              per_employee: 1200,
              minimum_employees: 50,
              setup_fee: 8000,
            },
            includes_lab_tests: false,
            includes_consultations: true,
          },
          {
            id: 'mental-wellness',
            name: 'Corporate Mental Wellness Program',
            description: 'Mental health support and counseling for employees',
            tier: 'premium',
            features: [
              'Confidential counseling sessions',
              'Stress management workshops',
              'Mental health assessments',
              'Crisis support',
              'EAP integration',
              'Manager training',
            ],
            pricing: {
              per_employee: 800,
              minimum_employees: 50,
              setup_fee: 5000,
            },
            includes_lab_tests: false,
            includes_consultations: true,
          },
        ];

        return {
          programs,
          total_programs: programs.length,
          country_code: countryCode,
        };
      }
    );
  }

  /**
   * Register corporate partner (1mg-style B2B onboarding)
   */
  async registerCorporatePartner(
    principal: Principal,
    registrationData: {
      country_code?: string;
      company_name: string;
      company_type: string;
      industry: string;
      employee_count: number;
      contact_person: string;
      contact_email: string;
      contact_phone: string;
      address: any;
      interested_programs: string[];
      notes?: string;
    }
  ) {
    const country = await this.prisma.country.findUnique({
      where: { isoAlpha2: requireCountryCode(registrationData.country_code) },
    });
    if (!country) {
      throw Errors.notFound('Country not available');
    }

    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        // For now, return a placeholder response
        // In real implementation, would create partner application using existing partner tables
        const partnerId = uuidv7();
        
        await this.prisma.$transaction(async (tx) => {
          // Create organization with CORPORATE kind if not exists
          // Create partner application using existing tables
          // This would require schema updates to support corporate partners

          await this.outbox.enqueue(tx, {
            type: 'CORPORATE_PARTNER_REGISTERED',
            aggregateType: 'corporate_partner',
            aggregateId: partnerId,
            producer: 'corporate_wellness',
            countryId: country.id,
            actorId: principal.personId,
            payload: {
              partner_id: partnerId,
              company_name: registrationData.company_name,
              contact_email: registrationData.contact_email,
            },
            occurrenceKey: `CORPORATE_PARTNER_REGISTERED:${partnerId}`,
          });
        });

        return {
          partner_id: partnerId,
          company_name: registrationData.company_name,
          status: 'PENDING_APPROVAL',
          next_steps: [
            'Document verification',
            'KYC verification',
            'Program customization',
            'Contract finalization',
          ],
          note: 'Corporate partner registration requires schema updates for full implementation',
        };
      }
    );
  }

  /**
   * Get corporate dashboard (1mg-style B2B dashboard)
   */
  async getCorporateDashboard(
    principal: Principal,
    corporateId: string,
    countryCode?: string
  ) {
    const code = requireCountryCode(countryCode);
    const country = await this.prisma.country.findUnique({
      where: { isoAlpha2: code },
    });
    if (!country) {
      throw Errors.notFound('Country not available');
    }

    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        // Get corporate organization
        const corporate = await this.prisma.organization.findFirst({
          where: { id: corporateId },
        });

        if (!corporate) {
          throw Errors.notFound('Corporate organization not found');
        }

        // Mock dashboard data
        const dashboard = {
          company_name: corporate.displayName,
          employee_count: 100, // Would come from corporate profile attributes
          active_programs: ['employee-health-checkup', 'pharmacy-benefit'],
          utilization_metrics: {
            total_employees: 100,
            enrolled_employees: 75,
            health_checkups_completed: 60,
            consultations_used: 30,
            pharmacy_orders: 80,
          },
          health_insights: {
            overall_health_score: 78,
            common_health_concerns: ['Stress', 'Back Pain', 'Eye Strain'],
            wellness_program_participation: 65,
          },
          cost_savings: {
            total_savings: 250000,
            per_employee_savings: 1200,
            roi_percentage: 340,
          },
        };

        return dashboard;
      }
    );
  }

  /**
   * Create employee enrollment (1mg-style employee management)
   */
  async enrollEmployee(
    principal: Principal,
    corporateId: string,
    employeeData: {
      country_code?: string;
      employee_id: string;
      name: string;
      email: string;
      phone: string;
      department: string;
      date_of_birth: string;
      programs: string[];
    }
  ) {
    const country = await this.prisma.country.findUnique({
      where: { isoAlpha2: requireCountryCode(employeeData.country_code) },
    });
    if (!country) {
      throw Errors.notFound('Country not available');
    }

    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        // For now, return placeholder response
        // In real implementation, would create employee enrollment using new tables
        const enrollmentId = uuidv7();
        
        await this.prisma.$transaction(async (tx) => {
          await this.outbox.enqueue(tx, {
            type: 'EMPLOYEE_ENROLLED',
            aggregateType: 'corporate_employee',
            aggregateId: enrollmentId,
            producer: 'corporate_wellness',
            countryId: country.id,
            actorId: principal.personId,
            payload: {
              enrollment_id: enrollmentId,
              employee_id: employeeData.employee_id,
              programs: employeeData.programs,
            },
            occurrenceKey: `EMPLOYEE_ENROLLED:${enrollmentId}`,
          });
        });

        return {
          enrollment_id: enrollmentId,
          employee_id: employeeData.employee_id,
          status: 'ACTIVE',
          enrolled_programs: employeeData.programs,
          note: 'Employee enrollment requires schema updates for full implementation',
        };
      }
    );
  }

  /**
   * Get corporate analytics (1mg-style B2B analytics)
   */
  async getCorporateAnalytics(
    principal: Principal,
    corporateId: string,
    countryCode?: string
  ) {
    const code = requireCountryCode(countryCode);
    const country = await this.prisma.country.findUnique({
      where: { isoAlpha2: code },
    });
    if (!country) {
      throw Errors.notFound('Country not available');
    }

    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        // Mock analytics data
        const analytics = {
          program_utilization: {
            health_checkups: { enrolled: 150, completed: 120, utilization_rate: 80 },
            telemedicine: { enrolled: 200, used: 85, utilization_rate: 42.5 },
            pharmacy: { enrolled: 180, orders: 320, utilization_rate: 177 },
            mental_wellness: { enrolled: 100, sessions: 45, utilization_rate: 45 },
          },
          health_trends: {
            monthly_consultations: [12, 15, 18, 22, 25, 28, 30, 27, 24, 20, 18, 15],
            monthly_prescriptions: [45, 52, 48, 55, 60, 58, 62, 59, 54, 50, 47, 44],
            monthly_lab_tests: [30, 35, 40, 38, 42, 45, 48, 46, 43, 40, 37, 35],
          },
          cost_analysis: {
            total_healthcare_spend: 4500000,
            program_cost: 1200000,
            savings: 3300000,
            cost_per_employee: 4500,
            industry_average: 6500,
          },
          risk_assessment: {
            high_risk_employees: 12,
            moderate_risk_employees: 45,
            low_risk_employees: 143,
            total_employees: 200,
          },
        };

        return analytics;
      }
    );
  }
}
