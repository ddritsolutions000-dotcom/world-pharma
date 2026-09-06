import Link from 'next/link';
import { MgBtn, MgCard } from './ui/mg-ui';
import type { CatalogProduct } from './store-api';

const FAQS = [
  {
    q: 'Is this medicine genuine?',
    a: 'Yes. WorldPharma lists products only from licensed pharmacy partners. Packaging and batch details are handled at dispatch.',
  },
  {
    q: 'How fast is delivery?',
    a: 'Enter your pincode in the header for an ETA. Most OTC items in serviceable cities ship by the next day. Rx items wait for prescription verification.',
  },
  {
    q: 'Can I return this?',
    a: 'Damaged, wrong, or expired items can be returned under our return policy. Opened medicines may be restricted by regulation.',
  },
  {
    q: 'Do I need a prescription?',
    a: 'If the listing is marked Prescription required, upload a valid Rx before checkout. OTC items do not need a prescription.',
  },
];

export function ProductPdpPowerSections({ product }: { product: CatalogProduct }) {
  const attrs = product.attributes ?? {};
  return (
    <>
      <MgCard className="mg-pdp-care-card">
        <h2 className="mg-section-title">Need advice on this medicine?</h2>
        <p className="mg-text-muted">
          WorldPharma does not replace a clinician. Consult a verified doctor online, or book a related lab test if you
          need diagnostics.
        </p>
        <div className="mg-toolbar">
          <MgBtn href="/doctors" size="sm">
            Consult a doctor
          </MgBtn>
          <MgBtn href="/lab" variant="secondary" size="sm">
            Book a lab test
          </MgBtn>
          {attrs.composition ? (
            <MgBtn href="/pharmacist" variant="ghost" size="sm">
              Ask a pharmacist
            </MgBtn>
          ) : (
            <MgBtn href="/help" variant="ghost" size="sm">
              Help centre
            </MgBtn>
          )}
        </div>
      </MgCard>

      <MgCard>
        <h2 className="mg-section-title">Frequently asked</h2>
        <dl className="mg-pdp-faq">
          {FAQS.map((item) => (
            <div key={item.q}>
              <dt>{item.q}</dt>
              <dd>
                {item.q.includes('prescription') && product.rx_required
                  ? 'This listing requires a valid prescription. Upload your Rx from Upload Rx or at checkout.'
                  : item.a}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mg-text-muted">
          More help: <Link href="/legal/returns">Returns</Link> · <Link href="/help">Help centre</Link>
        </p>
      </MgCard>
    </>
  );
}
