import { redirect } from 'next/navigation';
import { VENDOR_JOIN_ROUTES } from '../../../src/vendor-join-routes';

export default function LegacyPartnersRedirect() {
  redirect(VENDOR_JOIN_ROUTES.hub);
}
