import { Injectable } from '@nestjs/common';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { requireCountryCode } from '../catalog/catalog-country';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { workerTenantContext } from '../tenancy/build-tenant-context';

/**
 * Speciality care programs service - 1mg-style specialized healthcare programs
 * Provides cancer care, obesity management, vaccination, and chronic disease management
 */
@Injectable()
export class SpecialityCareService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get speciality care programs (1mg-style speciality programs)
   */
  async getSpecialityPrograms(
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
        const programs = this.getMockPrograms();
        return {
          programs,
          total_programs: programs.length,
          country_code: countryCode,
        };
      }
    );
  }

  /**
   * Get speciality program details (1mg-style program information)
   */
  async getProgramDetails(
    principal: Principal | null,
    programId: string,
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
        // Get program details based on programId
        const programDetails: any = {
          'cancer-care': {
            id: 'cancer-care',
            name: 'Cancer Care Program',
            description: 'Comprehensive cancer care support with specialized medicines and consultations',
            long_description: 'Our Cancer Care Program provides comprehensive support for cancer patients including specialized oncology consultations, chemotherapy support medicines, pain management solutions, and nutritional supplements. We coordinate with leading oncologists to ensure you receive the best possible care.',
            category: 'oncology',
            pricing: {
              consultation_fee: 1500,
              monthly_program_fee: 5000,
              includes_followups: true,
            },
            timeline: {
              initial_consultation: 'Week 1',
              treatment_planning: 'Week 2',
              ongoing_support: 'Ongoing',
            },
            specializations: ['Medical Oncology', 'Radiation Oncology', 'Surgical Oncology'],
            available_treatments: ['Chemotherapy', 'Immunotherapy', 'Targeted Therapy'],
          },
          'obesity-management': {
            id: 'obesity-management',
            name: 'Obesity Management Program',
            description: 'Structured weight management with medical supervision and lifestyle support',
            long_description: 'Our scientifically designed Obesity Management Program combines medical supervision with lifestyle modification to help you achieve sustainable weight loss. The program includes regular consultations with specialists, customized diet plans, exercise guidance, and prescription medications when appropriate.',
            category: 'wellness',
            pricing: {
              consultation_fee: 800,
              monthly_program_fee: 3000,
              includes_followups: true,
            },
            timeline: {
              initial_assessment: 'Week 1',
              plan_development: 'Week 2',
              active_phase: 'Weeks 3-12',
              maintenance: 'Ongoing',
            },
            specializations: ['Bariatric Medicine', 'Nutrition Science', 'Exercise Physiology'],
            available_treatments: ['Medical Weight Loss', 'Lifestyle Modification', 'Behavioral Therapy'],
          },
          'vaccination-program': {
            id: 'vaccination-program',
            name: 'Vaccination Program',
            description: 'Comprehensive vaccination services for all age groups',
            long_description: 'Our comprehensive Vaccination Program provides immunization services for children and adults. We offer home vaccination services, maintain vaccination records, and provide travel vaccinations. Our trained healthcare professionals ensure safe and effective vaccination administration.',
            category: 'preventive',
            pricing: {
              consultation_fee: 200,
              per_vaccination_fee: 500,
              home_service_fee: 300,
            },
            timeline: {
              booking: 'Same day',
              vaccination: 'As scheduled',
              followup: 'As needed',
            },
            specializations: ['Preventive Medicine', 'Pediatrics', 'Travel Medicine'],
            available_vaccinations: ['Flu', 'COVID-19', 'Hepatitis', 'Typhoid', 'MMR', 'DTP'],
          },
        };

        const listed = this.getMockPrograms().find((row) => row.id === programId);
        const extra = programDetails[programId];
        const program = extra
          ? { ...listed, ...extra, features: listed?.features ?? extra.features ?? [] }
          : listed
            ? {
                ...listed,
                long_description: listed.description,
                pricing: {
                  consultation_fee: 800,
                  monthly_program_fee: 2500,
                  includes_followups: true,
                },
                timeline: {
                  initial_consultation: 'Week 1',
                  care_plan: 'Week 2',
                  ongoing_support: 'Ongoing',
                },
                specializations: listed.features.slice(0, 3),
                available_treatments: listed.features,
              }
            : null;
        if (!program) {
          throw Errors.notFound('Speciality program not found');
        }

        return program;
      }
    );
  }

  /**
   * Enroll in speciality program (1mg-style program enrollment)
   */
  async enrollInProgram(
    principal: Principal,
    programId: string,
    enrollmentData: {
      country_code?: string;
      patient_details?: any;
      preferred_start_date?: string;
      notes?: string;
    }
  ) {
    const country = await this.prisma.country.findUnique({
      where: { isoAlpha2: requireCountryCode(enrollmentData.country_code) },
    });
    if (!country) {
      throw Errors.notFound('Country not available');
    }

    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal?.personId }),
      async () => {
        const program = this.getMockPrograms().find((row) => row.id === programId);
        if (!program) {
          throw Errors.notFound('Speciality program not found');
        }
        return {
          id: uuidv7(),
          status: 'REQUESTED',
          program_id: program.id,
          program_name: program.name,
          preferred_start_date: enrollmentData.preferred_start_date ?? null,
          message:
            'Sandbox enrolment recorded. A care coordinator will confirm the first consult. This is not a live clinic booking.',
        };
      }
    );
  }

  /**
   * Get vaccination services (1mg-style vaccination booking)
   */
  async getVaccinationServices(
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
        const vaccinations = [
          {
            id: 'flu-vaccine',
            name: 'Flu Vaccine',
            description: 'Annual influenza vaccination',
            age_groups: ['adult', 'senior'],
            price: 500,
            requires_prescription: false,
            available_for_home: true,
          },
          {
            id: 'covid-vaccine',
            name: 'COVID-19 Vaccine',
            description: 'COVID-19 vaccination and boosters',
            age_groups: ['adult', 'senior', 'pediatric'],
            price: 0,
            requires_prescription: false,
            available_for_home: true,
          },
          {
            id: 'hepatitis-b',
            name: 'Hepatitis B Vaccine',
            description: 'Hepatitis B vaccination series',
            age_groups: ['adult', 'pediatric'],
            price: 800,
            requires_prescription: false,
            available_for_home: true,
          },
          {
            id: 'typhoid-vaccine',
            name: 'Typhoid Vaccine',
            description: 'Typhoid fever vaccination',
            age_groups: ['adult', 'pediatric'],
            price: 600,
            requires_prescription: false,
            available_for_home: true,
          },
          {
            id: 'mmr-vaccine',
            name: 'MMR Vaccine',
            description: 'Measles, Mumps, Rubella vaccination',
            age_groups: ['pediatric'],
            price: 700,
            requires_prescription: false,
            available_for_home: true,
          },
          {
            id: 'pneumococcal',
            name: 'Pneumococcal Vaccine',
            description: 'Pneumonia prevention vaccine',
            age_groups: ['senior', 'adult'],
            price: 1200,
            requires_prescription: false,
            available_for_home: true,
          },
        ];

        return {
          vaccinations,
          total_vaccinations: vaccinations.length,
          home_service_available: true,
        };
      }
    );
  }

  /**
   * Book vaccination appointment (1mg-style vaccination booking)
   */
  async bookVaccination(
    principal: Principal,
    bookingData: {
      vaccination_id: string;
      country_code?: string;
      preferred_date?: string;
      home_service?: boolean;
      patient_details?: any;
    }
  ) {
    const country = await this.prisma.country.findUnique({
      where: { isoAlpha2: requireCountryCode(bookingData.country_code) },
    });
    if (!country) {
      throw Errors.notFound('Country not available');
    }

    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal?.personId }),
      async () => {
        const listed = [
          'flu-vaccine',
          'covid-vaccine',
          'hepatitis-b',
          'typhoid-vaccine',
          'mmr-vaccine',
          'pneumococcal',
        ];
        if (!listed.includes(bookingData.vaccination_id)) {
          throw Errors.notFound('Vaccination not found');
        }
        return {
          id: uuidv7(),
          status: 'REQUESTED',
          vaccination_id: bookingData.vaccination_id,
          home_service: bookingData.home_service !== false,
          preferred_date: bookingData.preferred_date ?? null,
          message:
            'Sandbox vaccination request recorded. A clinician will confirm a slot. This is not a live immunization booking.',
        };
      }
    );
  }

  private getMockPrograms() {
    return [
      {
        id: 'cancer-care',
        name: 'Cancer Care Program',
        description: 'Comprehensive cancer care support with specialized medicines and consultations',
        category: 'oncology',
        features: [
          'Specialized oncology consultations',
          'Chemotherapy support medicines',
          'Pain management solutions',
          'Nutritional supplements',
          'Home delivery of specialized medications',
        ],
        requires_prescription: true,
        available_doctors: 15,
        success_rate: 92,
      },
      {
        id: 'obesity-management',
        name: 'Obesity Management Program',
        description: 'Structured weight management with medical supervision and lifestyle support',
        category: 'wellness',
        features: [
          'Medical weight loss consultations',
          'Customized diet plans',
          'Exercise guidance',
          'Prescription weight management medications',
          'Regular progress monitoring',
        ],
        requires_prescription: true,
        available_doctors: 28,
        success_rate: 78,
      },
      {
        id: 'diabetes-care',
        name: 'Diabetes Care Program',
        description: 'Complete diabetes management with insulin delivery and monitoring',
        category: 'chronic-disease',
        features: [
          'Endocrinologist consultations',
          'Insulin and oral medications',
          'Blood sugar monitoring supplies',
          'Diet and lifestyle counseling',
          'Regular health checkups',
        ],
        requires_prescription: true,
        available_doctors: 42,
        success_rate: 85,
      },
      {
        id: 'cardiac-care',
        name: 'Cardiac Care Program',
        description: 'Heart health management with cardiologist support and medication delivery',
        category: 'cardiology',
        features: [
          'Cardiologist consultations',
          'Cardiac medications delivery',
          'Blood pressure monitoring',
          'Lifestyle modification guidance',
          'Rehabilitation support',
        ],
        requires_prescription: true,
        available_doctors: 35,
        success_rate: 88,
      },
      {
        id: 'vaccination-program',
        name: 'Vaccination Program',
        description: 'Comprehensive vaccination services for all age groups',
        category: 'preventive',
        features: [
          'Adult vaccination services',
          'Pediatric immunizations',
          'Travel vaccinations',
          'Home vaccination service',
          'Vaccination records management',
        ],
        requires_prescription: false,
        available_doctors: 50,
        success_rate: 95,
      },
      {
        id: 'respiratory-care',
        name: 'Respiratory Care Program',
        description: 'Asthma and COPD management with specialized respiratory support',
        category: 'pulmonology',
        features: [
          'Pulmonologist consultations',
          'Inhalers and respiratory medications',
          'Breathing exercises guidance',
          'Oxygen therapy support',
          'Emergency care planning',
        ],
        requires_prescription: true,
        available_doctors: 22,
        success_rate: 81,
      },
    ];
  }
}
