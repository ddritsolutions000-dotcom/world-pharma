import Link from 'next/link';
import { MgBtn } from './ui/mg-ui';

const WHY_US = [
  {
    title: 'Genuine medicines only',
    desc: 'Sourced from licensed pharmacies with proper cold-chain where required.',
    icon: '💊',
  },
  {
    title: 'Home delivery',
    desc: 'Delivery to your postal code. Free shipping on eligible orders.',
    icon: '🏠',
  },
  {
    title: 'Expert doctors',
    desc: 'Consult verified doctors online — get digital prescriptions when eligible.',
    icon: '👨‍⚕️',
  },
  {
    title: 'Lab at home',
    desc: 'Book tests with home sample collection from certified partner labs.',
    icon: '🧪',
  },
];

export function HomeExtraSections() {
  return (
    <>
      <section className="mg-why-section">
        <h2 className="mg-section-title mg-why-heading">Why choose WorldPharma?</h2>
        <ul className="mg-why-grid">
          {WHY_US.map((item) => (
            <li key={item.title} className="mg-why-card">
              <span className="mg-why-icon" aria-hidden>
                {item.icon}
              </span>
              <h3>{item.title}</h3>
              <p>{item.desc}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mg-app-promo">
        <div className="mg-app-promo-copy">
          <p className="mg-promo-kicker">Download our app</p>
          <h2 className="mg-app-promo-title">Healthcare in your pocket</h2>
          <p className="mg-app-promo-sub">
            Order medicines, book lab tests, consult doctors, and track deliveries — all in one app.
          </p>
          <div className="mg-app-promo-actions">
            <MgBtn href="/download">Download app</MgBtn>
            <MgBtn href="/help" variant="ghost">
              Need help?
            </MgBtn>
          </div>
        </div>
        <div className="mg-app-promo-visual" aria-hidden>
          <div className="mg-phone-mock">+</div>
        </div>
      </section>
    </>
  );
}
