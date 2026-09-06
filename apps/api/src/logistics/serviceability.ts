/** Pincode → city lookup for India demo + generic rules for other countries. */
export type ServiceabilityResult = {
  serviceable: boolean;
  city: string | null;
  region: string | null;
  country_code: string;
  postal_code: string;
  medicine_delivery: boolean;
  lab_home_collection: boolean;
  express_delivery: boolean;
  medicine_eta: 'same_day' | 'next_day' | '2_3_days' | 'unavailable';
  lab_eta: 'same_day' | 'next_day' | '2_3_days' | 'unavailable';
  message: string;
};

export const IN_PINCODES: Record<string, { city: string; region: string }> = {
  '110001': { city: 'New Delhi', region: 'Delhi' },
  '110020': { city: 'New Delhi', region: 'Delhi' },
  '122001': { city: 'Gurgaon', region: 'Haryana' },
  '122002': { city: 'Gurgaon', region: 'Haryana' },
  '400001': { city: 'Mumbai', region: 'Maharashtra' },
  '400051': { city: 'Mumbai', region: 'Maharashtra' },
  '560001': { city: 'Bangalore', region: 'Karnataka' },
  '560103': { city: 'Bangalore', region: 'Karnataka' },
  '500001': { city: 'Hyderabad', region: 'Telangana' },
  '600001': { city: 'Chennai', region: 'Tamil Nadu' },
  '700001': { city: 'Kolkata', region: 'West Bengal' },
  '411001': { city: 'Pune', region: 'Maharashtra' },
  '302001': { city: 'Jaipur', region: 'Rajasthan' },
  '201301': { city: 'Noida', region: 'Uttar Pradesh' },
  '201001': { city: 'Ghaziabad', region: 'Uttar Pradesh' },
  '121001': { city: 'Faridabad', region: 'Haryana' },
  '160001': { city: 'Chandigarh', region: 'Chandigarh' },
  '380001': { city: 'Ahmedabad', region: 'Gujarat' },
  '395001': { city: 'Surat', region: 'Gujarat' },
  '390001': { city: 'Vadodara', region: 'Gujarat' },
  '226001': { city: 'Lucknow', region: 'Uttar Pradesh' },
  '800001': { city: 'Patna', region: 'Bihar' },
  '751001': { city: 'Bhubaneswar', region: 'Odisha' },
  '781001': { city: 'Guwahati', region: 'Assam' },
  '452001': { city: 'Indore', region: 'Madhya Pradesh' },
  '462001': { city: 'Bhopal', region: 'Madhya Pradesh' },
  '440001': { city: 'Nagpur', region: 'Maharashtra' },
  '400601': { city: 'Thane', region: 'Maharashtra' },
  '411014': { city: 'Pune', region: 'Maharashtra' },
  '530001': { city: 'Visakhapatnam', region: 'Andhra Pradesh' },
  '682001': { city: 'Kochi', region: 'Kerala' },
  '641001': { city: 'Coimbatore', region: 'Tamil Nadu' },
};

function etaForMetro(serviceable: boolean): ServiceabilityResult['medicine_eta'] {
  if (!serviceable) return 'unavailable';
  return 'next_day';
}

export function resolveServiceability(countryCode: string, postalCode: string): ServiceabilityResult {
  const country = (countryCode || 'XX').trim().toUpperCase();
  const postal = (postalCode || '').trim();

  if (!postal) {
    return {
      serviceable: false,
      city: null,
      region: null,
      country_code: country,
      postal_code: postal,
      medicine_delivery: false,
      lab_home_collection: false,
      express_delivery: false,
      medicine_eta: 'unavailable',
      lab_eta: 'unavailable',
      message: 'Enter postal code to check delivery',
    };
  }

  if (country === 'IN') {
    const hit = IN_PINCODES[postal];
    if (hit) {
      return {
        serviceable: true,
        city: hit.city,
        region: hit.region,
        country_code: country,
        postal_code: postal,
        medicine_delivery: true,
        lab_home_collection: true,
        express_delivery: true,
        medicine_eta: 'same_day',
        lab_eta: 'next_day',
        message: `Delivering to ${hit.city}`,
      };
    }
    if (/^\d{6}$/.test(postal)) {
      return {
        serviceable: true,
        city: null,
        region: null,
        country_code: country,
        postal_code: postal,
        medicine_delivery: true,
        lab_home_collection: true,
        express_delivery: false,
        medicine_eta: 'next_day',
        lab_eta: '2_3_days',
        message: 'Delivery available in your area',
      };
    }
    return {
      serviceable: false,
      city: null,
      region: null,
      country_code: country,
      postal_code: postal,
      medicine_delivery: false,
      lab_home_collection: false,
      express_delivery: false,
      medicine_eta: 'unavailable',
      lab_eta: 'unavailable',
      message: 'Invalid pincode',
    };
  }

  // Sandbox / international: any 3+ char postal is serviceable
  const serviceable = postal.length >= 3;
  return {
    serviceable,
    city: country === 'XX' ? 'Sandbox City' : null,
    region: null,
    country_code: country,
    postal_code: postal,
    medicine_delivery: serviceable,
    lab_home_collection: serviceable,
    express_delivery: serviceable && postal.length >= 5,
    medicine_eta: etaForMetro(serviceable),
    lab_eta: serviceable ? 'next_day' : 'unavailable',
    message: serviceable
      ? country === 'XX'
        ? 'Delivering to Sandbox City'
        : 'Delivery available in your area'
      : 'Postal code too short',
  };
}

export function medicineEtaLabel(result: ServiceabilityResult | null, rxRequired?: boolean): string {
  if (rxRequired) return 'Prescription required';
  if (!result?.serviceable) return 'Add postal code for delivery ETA';
  switch (result.medicine_eta) {
    case 'same_day':
      return 'Get by today';
    case 'next_day':
      return 'Get by tomorrow';
    case '2_3_days':
      return 'Get in 2–3 days';
    default:
      return 'Not serviceable';
  }
}
