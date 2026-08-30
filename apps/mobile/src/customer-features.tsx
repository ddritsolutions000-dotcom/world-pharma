import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import {
  NativeButton,
  NativeCard,
  NativeEmptyState,
  NativeInput,
  NativeLoadingState,
  NativeNetworkErrorState,
  NativePermissionDeniedState,
  NativeText,
} from '@world-pharma/ui-kit/native';
import { applyApiResult } from './api-result';
import {
  createAddress,
  createSupportTicket,
  deleteAddress,
  fetchAddresses,
  fetchNotificationPreferences,
  fetchProfile,
  fetchSupportTickets,
  logoutAllSessions,
  updateNotificationPreferences,
  updateProfile,
  type CustomerAddress,
  type CustomerProfile,
  type NotificationPreferences,
  type SupportTicket,
} from './account-api';
import {
  CONSENT_PURPOSES,
  CONSENT_SCOPES,
  fetchCareDoctorsForConsent,
  fetchConsentGrants,
  grantConsent,
  revokeConsent,
  type ConsentGrant,
  type CareDoctor,
} from './consent-api';
import {
  bookAppointment,
  cancelAppointment,
  fetchAppointment,
  fetchAppointments,
  fetchCareDoctors,
  fetchCommerceEligibility,
  fetchDoctorSlots,
  fetchPrescription,
  fetchPrescriptions,
  fetchRefillEligibility,
  fetchRefillRequests,
  cancelRefillRequest,
  refillEligibilityLabel,
  requestRefill,
  rescheduleAppointment,
  startRxHandoff,
  type AppointmentRow,
  type CareDoctor as DirectoryDoctor,
  type CommerceEligibility,
  type DoctorSlot,
  type Prescription,
  type RefillEligibility,
  type RefillRequest,
  type RxSubscriptionView,
} from './care-api';
import { newIdempotencyKey } from './commerce-api';
import { NativeConsultVideoPanel } from './consult-panel';
import {
  cancelLabBooking,
  createLabBooking,
  fetchLabBooking,
  fetchLabBookingCollection,
  fetchLabReport,
  fetchPhysicalReportEligibility,
  fetchPhysicalReportStatus,
  requestPhysicalReport,
  type PhysicalReportEligibility,
  type PhysicalReportStatus,
  type LabCustomerReport,
  fetchLabBookings,
  fetchLabCatalog,
  fetchLabCatalogItem,
  fetchLabSlots,
  payLabBooking,
  type LabBooking,
  type LabBookingCollection,
  type LabCatalogItem,
} from './lab-api';
import {
  cancelImagingBooking,
  checkImagingEligibility,
  createImagingBooking,
  fetchImagingBooking,
  fetchImagingBookings,
  fetchImagingCatalog,
  fetchImagingCatalogItem,
  fetchImagingLocations,
  fetchImagingPreparation,
  fetchImagingProgress,
  fetchImagingPhysicalReportEligibility,
  fetchImagingPhysicalReportStatus,
  fetchImagingReport,
  fetchImagingReportStatus,
  fetchImagingSlots,
  cancelImagingPhysicalReport,
  requestImagingPhysicalReport,
  imagingBookingDraftError,
  imagingPaymentRetryable,
  payImagingBooking,
  type ImagingBooking,
  type ImagingCatalogItem,
  type ImagingCustomerReport,
  type ImagingPhysicalReportEligibility,
  type ImagingPhysicalReportStatus,
  type ImagingPreparation,
  type ImagingReportStatus,
} from './imaging-api';
import type { ViewState } from './navigation';

const CARE_COUNTRY = 'DQ';
const LAB_COUNTRY = 'XX';
const IMAGING_COUNTRY = 'XX';

const CANCELLABLE_REFILL_STATUSES = new Set(['REQUESTED', 'PENDING_REAUTH']);

function subscriptionStatusLabel(subscription: RxSubscriptionView | null | undefined): string {
  if (!subscription?.available) {
    return 'UNAVAILABLE';
  }
  return subscription.status === 'DISABLED' || !subscription.auto_execute_enabled ? 'OFF' : subscription.status;
}

export type FeatureCtx = {
  token: string;
  onUnauthorized: () => void;
  viewState: ViewState;
  setViewState: (state: ViewState) => void;
  onBack: () => void;
  signOut: () => void;
};

function FeatureStates({ viewState, onRetry }: { viewState: ViewState; onRetry?: () => void }) {
  if (viewState === 'loading') {
    return <NativeLoadingState title="Loading" />;
  }
  if (viewState === 'network') {
    return <NativeNetworkErrorState onRetry={onRetry} />;
  }
  if (viewState === 'forbidden') {
    return <NativePermissionDeniedState />;
  }
  return null;
}

export function PrivacyScreen({ ctx }: { ctx: FeatureCtx }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <View style={{ gap: 12 }}>
      <NativeButton label="Back" variant="secondary" onPress={ctx.onBack} />
      <NativeText variant="h2">Privacy & security</NativeText>
      <NativeText variant="caption">
        [Policy placeholder] Country policy pack defines data use and consent. Not legal advice.
      </NativeText>
      <NativeCard>
        <NativeText>Sign out all sessions on every device.</NativeText>
        <NativeButton
          label={busy ? 'Signing out…' : 'Sign out all sessions'}
          variant="secondary"
          onPress={() => {
            setBusy(true);
            void logoutAllSessions({ token: ctx.token, onUnauthorized: ctx.onUnauthorized }).then((result) => {
              setBusy(false);
              if (result.ok) {
                ctx.signOut();
              } else if (result.kind !== 'unauthorized') {
                ctx.setViewState('network');
              }
            });
          }}
        />
        <NativeButton label="Sign out this device" variant="secondary" onPress={ctx.signOut} />
      </NativeCard>
      {message ? <NativeText>{message}</NativeText> : null}
    </View>
  );
}

export function ConsentScreen({ ctx }: { ctx: FeatureCtx }) {
  const [grants, setGrants] = useState<ConsentGrant[]>([]);
  const [doctors, setDoctors] = useState<CareDoctor[]>([]);
  const [countryCode, setCountryCode] = useState(CARE_COUNTRY);
  const [partnerId, setPartnerId] = useState('');
  const [purpose, setPurpose] = useState('consultation');
  const [consentScopes, setConsentScopes] = useState<string[]>(
    CONSENT_SCOPES.map((row) => row.value),
  );
  const [policyClosed, setPolicyClosed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    ctx.setViewState('loading');
    const [grantsResult, doctorsResult] = await Promise.all([
      fetchConsentGrants({ token: ctx.token, onUnauthorized: ctx.onUnauthorized }),
      fetchCareDoctorsForConsent({ token: ctx.token, onUnauthorized: ctx.onUnauthorized, countryCode }),
    ]);
    if (!grantsResult.ok) {
      if (grantsResult.kind === 'forbidden') {
        ctx.setViewState('forbidden');
      } else if (grantsResult.kind !== 'unauthorized') {
        ctx.setViewState('network');
      }
      return;
    }
    setGrants(grantsResult.data.consents ?? []);
    if (doctorsResult.ok) {
      setDoctors(doctorsResult.data.doctors ?? []);
      setPartnerId(partnerId || doctorsResult.data.doctors?.[0]?.partner_id || '');
      setPolicyClosed(false);
    } else {
      setDoctors([]);
      setPolicyClosed(true);
    }
    ctx.setViewState('idle');
  }, [countryCode, ctx]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={{ gap: 12 }}>
      <NativeButton label="Back" variant="secondary" onPress={ctx.onBack} />
      <NativeText variant="h2">Consent management</NativeText>
      <FeatureStates viewState={ctx.viewState} onRetry={() => void load()} />
      {ctx.viewState === 'idle' ? (
        <>
          {policyClosed ? (
            <NativeText variant="caption">Clinical services unavailable for this country. Consent cannot be granted.</NativeText>
          ) : null}
          <NativeInput label="Country code" value={countryCode} onChangeText={setCountryCode} />
          <NativeButton label="Reload doctors" variant="secondary" onPress={() => void load()} />
          {doctors.length ? (
            <NativeCard>
              <NativeText>Grant to doctor</NativeText>
              {doctors.map((doc) => (
                <View key={doc.partner_id}>
                  <NativeButton
                    label={`${doc.display_name}${partnerId === doc.partner_id ? ' ✓' : ''}`}
                    variant={partnerId === doc.partner_id ? 'primary' : 'secondary'}
                    onPress={() => setPartnerId(doc.partner_id)}
                  />
                </View>
              ))}
              {CONSENT_PURPOSES.map((row) => (
                <View key={row.value}>
                  <NativeButton
                    label={`Purpose: ${row.label}${purpose === row.value ? ' ✓' : ''}`}
                    variant={purpose === row.value ? 'primary' : 'secondary'}
                    onPress={() => setPurpose(row.value)}
                  />
                </View>
              ))}
              {CONSENT_SCOPES.map((row) => (
                <View key={row.value}>
                  <NativeButton
                    label={`${row.label}${consentScopes.includes(row.value) ? ' ✓' : ''}`}
                    variant={consentScopes.includes(row.value) ? 'primary' : 'secondary'}
                    onPress={() => {
                      const next = consentScopes.includes(row.value)
                        ? consentScopes.filter((value) => value !== row.value)
                        : [...consentScopes, row.value];
                      setConsentScopes(next);
                    }}
                  />
                </View>
              ))}
              <NativeButton
                label={busyId === 'grant' ? 'Granting…' : 'Grant consent'}
                disabled={!partnerId || policyClosed || !!busyId || consentScopes.length === 0}
                onPress={() => {
                  setBusyId('grant');
                  void grantConsent({
                    token: ctx.token,
                    onUnauthorized: ctx.onUnauthorized,
                    recipient_partner_id: partnerId,
                    purpose,
                    scope: consentScopes,
                  }).then((result) => {
                    setBusyId(null);
                    if (result.ok) {
                      setMessage('Consent granted.');
                      void load();
                    } else {
                      setMessage(result.error);
                    }
                  });
                }}
              />
            </NativeCard>
          ) : null}
          {grants.length === 0 ? (
            <NativeEmptyState title="No consent grants" description="Active grants appear here." />
          ) : (
            grants.map((row) => (
              <View key={row.id}>
                <NativeCard>
                  <NativeText>{row.recipient_display_name ?? row.recipient_partner_id.slice(0, 8)}</NativeText>
                  <NativeText variant="caption">{`Purpose: ${row.purpose} · ${row.status}`}</NativeText>
                  {row.status === 'ACTIVE' ? (
                    <NativeButton
                      label={busyId === row.id ? 'Revoking…' : 'Revoke'}
                      variant="secondary"
                      onPress={() => {
                        setBusyId(row.id);
                        void revokeConsent({
                          token: ctx.token,
                          onUnauthorized: ctx.onUnauthorized,
                          consentId: row.id,
                        }).then((result) => {
                          setBusyId(null);
                          if (result.ok) {
                            void load();
                          } else {
                            setMessage(result.error);
                          }
                        });
                      }}
                    />
                  ) : null}
                </NativeCard>
              </View>
            ))
          )}
          {message ? <NativeText>{message}</NativeText> : null}
        </>
      ) : null}
    </View>
  );
}

const PREF_KEYS: Array<{ key: keyof NotificationPreferences; label: string }> = [
  { key: 'email_enabled', label: 'Email notifications' },
  { key: 'push_enabled', label: 'Push notifications' },
  { key: 'sms_enabled', label: 'SMS notifications' },
  { key: 'order_updates', label: 'Order updates' },
  { key: 'appointment_updates', label: 'Appointment updates' },
  { key: 'delivery_updates', label: 'Delivery updates' },
  { key: 'marketing', label: 'Marketing' },
];

export function PreferencesScreen({ ctx }: { ctx: FeatureCtx }) {
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    ctx.setViewState('loading');
    const result = await fetchNotificationPreferences({ token: ctx.token, onUnauthorized: ctx.onUnauthorized });
    applyApiResult(result, {
      onOk: (data) => setPrefs(data),
      onUnauthorized: ctx.onUnauthorized,
      setViewState: ctx.setViewState,
    });
    if (result.ok) {
      ctx.setViewState('idle');
    }
  }, [ctx]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(key: keyof NotificationPreferences) {
    if (!prefs) {
      return;
    }
    setSaving(true);
    const next = { ...prefs, [key]: !prefs[key] };
    const result = await updateNotificationPreferences({
      token: ctx.token,
      onUnauthorized: ctx.onUnauthorized,
      ...next,
    });
    setSaving(false);
    if (result.ok) {
      setPrefs(result.data);
    } else if (result.kind !== 'unauthorized') {
      ctx.setViewState('network');
    }
  }

  return (
    <View style={{ gap: 12 }}>
      <NativeButton label="Back" variant="secondary" onPress={ctx.onBack} />
      <NativeText variant="h2">Notification preferences</NativeText>
      <NativeText variant="caption">
        Marketing is off by default. When enabled, you may receive reorder and refill reminders. Open prescriptions for
        refill requests.
      </NativeText>
      <FeatureStates viewState={ctx.viewState} onRetry={() => void load()} />
      {ctx.viewState === 'idle' && prefs
        ? PREF_KEYS.map(({ key, label }) => (
            <View key={key}>
              <NativeCard>
                <NativeText>{label}</NativeText>
                <NativeText variant="caption">{prefs[key] ? 'On' : 'Off'}</NativeText>
                <NativeButton label="Toggle" variant="secondary" disabled={saving} onPress={() => void toggle(key)} />
              </NativeCard>
            </View>
          ))
        : null}
    </View>
  );
}

export function SupportScreen({ ctx }: { ctx: FeatureCtx }) {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const load = useCallback(async () => {
    ctx.setViewState('loading');
    const result = await fetchSupportTickets({ token: ctx.token, onUnauthorized: ctx.onUnauthorized });
    applyApiResult(result, {
      onOk: (data) => setTickets(data.data ?? []),
      onUnauthorized: ctx.onUnauthorized,
      setViewState: ctx.setViewState,
    });
    if (result.ok) {
      ctx.setViewState('idle');
    }
  }, [ctx]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={{ gap: 12 }}>
      <NativeButton label="Back" variant="secondary" onPress={ctx.onBack} />
      <NativeText variant="h2">Support</NativeText>
      <FeatureStates viewState={ctx.viewState} onRetry={() => void load()} />
      {ctx.viewState === 'idle' ? (
        <>
          <NativeInput label="Subject" value={subject} onChangeText={setSubject} />
          <NativeInput label="Message" value={body} onChangeText={setBody} />
          <NativeButton
            label="Create ticket"
            onPress={() => {
              void createSupportTicket({ token: ctx.token, onUnauthorized: ctx.onUnauthorized, subject, body }).then(
                (result) => {
                  if (result.ok) {
                    setSubject('');
                    setBody('');
                    void load();
                  } else if (result.kind !== 'unauthorized') {
                    ctx.setViewState('network');
                  }
                },
              );
            }}
          />
          {tickets.length === 0 ? (
            <NativeEmptyState title="No tickets" description="Your support requests appear here." />
          ) : (
            tickets.map((row) => (
              <View key={row.id}>
                <NativeCard>
                  <NativeText>{row.subject}</NativeText>
                  <NativeText variant="caption">{`${row.status} · ${row.created_at}`}</NativeText>
                  <NativeText variant="caption">{row.body}</NativeText>
                </NativeCard>
              </View>
            ))
          )}
        </>
      ) : null}
    </View>
  );
}

export function AddressesScreen({ ctx, country }: { ctx: FeatureCtx; country: string }) {
  const [rows, setRows] = useState<CustomerAddress[]>([]);
  const [recipientName, setRecipientName] = useState('');
  const [city, setCity] = useState('');
  const [line1, setLine1] = useState('');

  const load = useCallback(async () => {
    ctx.setViewState('loading');
    const result = await fetchAddresses({ token: ctx.token, onUnauthorized: ctx.onUnauthorized });
    applyApiResult(result, {
      onOk: (data) => setRows(Array.isArray(data) ? data : []),
      onUnauthorized: ctx.onUnauthorized,
      setViewState: ctx.setViewState,
    });
    if (result.ok) {
      ctx.setViewState('idle');
    }
  }, [ctx]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={{ gap: 12 }}>
      <NativeButton label="Back" variant="secondary" onPress={ctx.onBack} />
      <NativeText variant="h2">Addresses</NativeText>
      <FeatureStates viewState={ctx.viewState} onRetry={() => void load()} />
      {ctx.viewState === 'idle' ? (
        <>
          <NativeInput label="Recipient name" value={recipientName} onChangeText={setRecipientName} />
          <NativeInput label="Line 1" value={line1} onChangeText={setLine1} />
          <NativeInput label="City" value={city} onChangeText={setCity} />
          <NativeButton
            label="Add address"
            onPress={() => {
              void createAddress({
                token: ctx.token,
                onUnauthorized: ctx.onUnauthorized,
                country_code: country,
                recipient_name: recipientName,
                city,
                line1,
              }).then((result) => {
                if (result.ok) {
                  setRecipientName('');
                  setCity('');
                  setLine1('');
                  void load();
                } else if (result.kind !== 'unauthorized') {
                  ctx.setViewState('network');
                }
              });
            }}
          />
          {rows.map((row) => (
            <View key={row.id}>
              <NativeCard>
                <NativeText>{`${row.recipient_name ?? row.recipientName ?? 'Recipient'} — ${row.line1}, ${row.city}`}</NativeText>
                <NativeButton
                  label="Delete"
                  variant="secondary"
                  onPress={() => {
                    void deleteAddress({ token: ctx.token, onUnauthorized: ctx.onUnauthorized, id: row.id }).then(
                      (result) => {
                        if (result.ok) {
                          void load();
                        } else if (result.kind !== 'unauthorized') {
                          ctx.setViewState('network');
                        }
                      },
                    );
                  }}
                />
              </NativeCard>
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}

export function ProfileEditScreen({ ctx }: { ctx: FeatureCtx }) {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [locale, setLocale] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    ctx.setViewState('loading');
    const result = await fetchProfile({ token: ctx.token, onUnauthorized: ctx.onUnauthorized });
    applyApiResult(result, {
      onOk: (data) => {
        setProfile(data);
        setLocale(data.preferred_locale ?? '');
      },
      onUnauthorized: ctx.onUnauthorized,
      setViewState: ctx.setViewState,
    });
    if (result.ok) {
      ctx.setViewState('idle');
    }
  }, [ctx]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={{ gap: 12 }}>
      <NativeButton label="Back" variant="secondary" onPress={ctx.onBack} />
      <NativeText variant="h2">Edit profile</NativeText>
      <FeatureStates viewState={ctx.viewState} onRetry={() => void load()} />
      {ctx.viewState === 'idle' && profile ? (
        <>
          <NativeText>{`Person ref ${profile.person_id.slice(0, 8)}…`}</NativeText>
          <NativeInput label="Preferred locale" value={locale} onChangeText={setLocale} />
          <NativeButton
            label="Save"
            onPress={() => {
              void updateProfile({
                token: ctx.token,
                onUnauthorized: ctx.onUnauthorized,
                preferred_locale: locale.trim() || undefined,
              }).then((result) => {
                if (result.ok) {
                  setProfile(result.data);
                  setMessage('Profile updated.');
                } else if (result.kind !== 'unauthorized') {
                  ctx.setViewState('network');
                }
              });
            }}
          />
          {message ? <NativeText>{message}</NativeText> : null}
        </>
      ) : null}
    </View>
  );
}

export function DoctorsScreen({
  ctx,
  country,
  onBooked,
}: {
  ctx: FeatureCtx;
  country: string;
  onBooked: () => void;
}) {
  const [doctors, setDoctors] = useState<DirectoryDoctor[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [slots, setSlots] = useState<DoctorSlot[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    ctx.setViewState('loading');
    const result = await fetchCareDoctors({ token: ctx.token, onUnauthorized: ctx.onUnauthorized, country });
    if (!applyApiResult(result, {
      onOk: (data) => setDoctors(data.doctors ?? []),
      onUnauthorized: ctx.onUnauthorized,
      setViewState: ctx.setViewState,
    })) {
      return;
    }
    ctx.setViewState('idle');
  }, [country, ctx]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadSlots(profileId: string) {
    ctx.setViewState('loading');
    const from = new Date().toISOString();
    const to = new Date(Date.now() + 7 * 86400_000).toISOString();
    const result = await fetchDoctorSlots({
      token: ctx.token,
      onUnauthorized: ctx.onUnauthorized,
      profileId,
      country,
      from,
      to,
    });
    if (!applyApiResult(result, {
      onOk: (data) => {
        setSelectedId(profileId);
        setSlots(data.slots ?? []);
      },
      onUnauthorized: ctx.onUnauthorized,
      setViewState: ctx.setViewState,
    })) {
      return;
    }
    ctx.setViewState('idle');
  }

  return (
    <View style={{ gap: 12 }}>
      <NativeText variant="h2">Doctors</NativeText>
      <FeatureStates viewState={ctx.viewState} onRetry={() => void load()} />
      {error ? <NativeText>{error}</NativeText> : null}
      {ctx.viewState === 'idle' && doctors.length === 0 ? (
        <NativeEmptyState title="No doctors listed" description="Country policy may keep discovery closed." />
      ) : null}
      {ctx.viewState === 'idle'
        ? doctors.map((doc) => (
            <View key={doc.profile_id}>
              <NativeCard>
                <NativeText>{doc.display_name}</NativeText>
                <NativeButton label="View slots" variant="secondary" onPress={() => void loadSlots(doc.profile_id)} />
              </NativeCard>
            </View>
          ))
        : null}
      {ctx.viewState === 'idle' && selectedId
        ? slots.map((slot) => (
            <View key={slot.starts_at}>
              <NativeButton
                label={`Book ${slot.starts_at}`}
                variant="secondary"
                onPress={() => {
                  void bookAppointment({
                    token: ctx.token,
                    onUnauthorized: ctx.onUnauthorized,
                    doctor_profile_id: selectedId,
                    country_code: country,
                    starts_at: slot.starts_at,
                    type: 'IN_PERSON',
                  }).then((result) => {
                    if (result.ok) {
                      onBooked();
                    } else if (result.kind === 'forbidden') {
                      ctx.setViewState('forbidden');
                    } else if (result.kind !== 'unauthorized') {
                      setError(result.error);
                      ctx.setViewState('network');
                    }
                  });
                }}
              />
            </View>
          ))
        : null}
    </View>
  );
}

export function AppointmentsListScreen({
  ctx,
  onOpen,
}: {
  ctx: FeatureCtx;
  onOpen: (id: string) => void;
}) {
  const [rows, setRows] = useState<AppointmentRow[]>([]);

  const load = useCallback(async () => {
    ctx.setViewState('loading');
    const result = await fetchAppointments({ token: ctx.token, onUnauthorized: ctx.onUnauthorized });
    applyApiResult(result, {
      onOk: (data) => setRows(data.appointments ?? []),
      onUnauthorized: ctx.onUnauthorized,
      setViewState: ctx.setViewState,
    });
    if (result.ok) {
      ctx.setViewState('idle');
    }
  }, [ctx]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={{ gap: 12 }}>
      <NativeText variant="h2">Appointments</NativeText>
      <FeatureStates viewState={ctx.viewState} onRetry={() => void load()} />
      {ctx.viewState === 'idle' && rows.length === 0 ? (
        <NativeEmptyState title="No appointments" description="Book a doctor to see upcoming visits." />
      ) : null}
      {ctx.viewState === 'idle'
        ? rows.map((row) => (
            <View key={row.id}>
              <NativeCard>
                <NativeText>{row.doctor_display_name ?? 'Doctor'}</NativeText>
                <NativeText variant="caption">{`${row.starts_at ?? '—'} · ${row.status}`}</NativeText>
                <NativeButton label="Details" variant="secondary" onPress={() => onOpen(row.id)} />
                <NativeButton
                  label="Cancel"
                  variant="secondary"
                  onPress={() => {
                    void cancelAppointment({ token: ctx.token, onUnauthorized: ctx.onUnauthorized, id: row.id }).then(
                      () => void load(),
                    );
                  }}
                />
              </NativeCard>
            </View>
          ))
        : null}
    </View>
  );
}

export function AppointmentDetailScreen({
  ctx,
  appointmentId,
  onBack,
}: {
  ctx: FeatureCtx;
  appointmentId: string;
  onBack: () => void;
}) {
  const [row, setRow] = useState<AppointmentRow | null>(null);
  const [rescheduleAt, setRescheduleAt] = useState('');

  const load = useCallback(async () => {
    ctx.setViewState('loading');
    const result = await fetchAppointment({ token: ctx.token, onUnauthorized: ctx.onUnauthorized, id: appointmentId });
    applyApiResult(result, {
      onOk: setRow,
      onUnauthorized: ctx.onUnauthorized,
      setViewState: ctx.setViewState,
    });
    if (result.ok) {
      ctx.setViewState('idle');
    }
  }, [appointmentId, ctx]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={{ gap: 12 }}>
      <NativeButton label="Back" variant="secondary" onPress={onBack} />
      <NativeText variant="h2">Appointment</NativeText>
      <FeatureStates viewState={ctx.viewState} onRetry={() => void load()} />
      {ctx.viewState === 'idle' && row ? (
        <NativeCard>
          <NativeText>{row.status}</NativeText>
          <NativeText variant="caption">{`${row.starts_at ?? '—'} – ${row.ends_at ?? '—'}`}</NativeText>
          <NativeText variant="caption">{`Encounter: ${row.encounter?.status ?? 'none'}`}</NativeText>
          <NativeButton
            label="Cancel"
            variant="secondary"
            onPress={() => {
              void cancelAppointment({ token: ctx.token, onUnauthorized: ctx.onUnauthorized, id: appointmentId }).then(
                () => void load(),
              );
            }}
          />
          <NativeInput label="Reschedule (ISO datetime)" value={rescheduleAt} onChangeText={setRescheduleAt} />
          <NativeButton
            label="Reschedule"
            variant="secondary"
            onPress={() => {
              if (!rescheduleAt.trim()) {
                return;
              }
              void rescheduleAppointment({
                token: ctx.token,
                onUnauthorized: ctx.onUnauthorized,
                id: appointmentId,
                starts_at: rescheduleAt.trim(),
              }).then(() => void load());
            }}
          />
        </NativeCard>
      ) : null}
      {ctx.viewState === 'idle' && row ? (
        <NativeConsultVideoPanel
          role="customer"
          token={ctx.token}
          appointmentId={appointmentId}
          appointmentType={row.type}
          onUnauthorized={ctx.onUnauthorized}
        />
      ) : null}
    </View>
  );
}

export function PrescriptionsListScreen({
  ctx,
  onOpen,
}: {
  ctx: FeatureCtx;
  onOpen: (id: string) => void;
}) {
  const [rows, setRows] = useState<Prescription[]>([]);

  const load = useCallback(async () => {
    ctx.setViewState('loading');
    const result = await fetchPrescriptions({ token: ctx.token, onUnauthorized: ctx.onUnauthorized });
    applyApiResult(result, {
      onOk: (data) => setRows(data.prescriptions ?? []),
      onUnauthorized: ctx.onUnauthorized,
      setViewState: ctx.setViewState,
    });
    if (result.ok) {
      ctx.setViewState('idle');
    }
  }, [ctx]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={{ gap: 12 }}>
      <NativeText variant="h2">Prescriptions</NativeText>
      <NativeText variant="caption">
        Read-only. Drafts are not shown. You cannot edit clinical instructions.
      </NativeText>
      <FeatureStates viewState={ctx.viewState} onRetry={() => void load()} />
      {ctx.viewState === 'idle' && rows.length === 0 ? (
        <NativeEmptyState title="No prescriptions" description="Issued prescriptions from care visits appear here." />
      ) : null}
      {ctx.viewState === 'idle'
        ? rows.map((row) => (
            <View key={row.id}>
              <NativeCard>
                <NativeText>{`${row.status} · v${row.current_version_number ?? '—'}`}</NativeText>
                <NativeText variant="caption">{row.id.slice(0, 8)}</NativeText>
                <NativeButton label="Details" variant="secondary" onPress={() => onOpen(row.id)} />
              </NativeCard>
            </View>
          ))
        : null}
    </View>
  );
}

export function PrescriptionDetailScreen({
  ctx,
  prescriptionId,
  onBack,
  onContinueCheckout,
  onViewOrders,
}: {
  ctx: FeatureCtx;
  prescriptionId: string;
  onBack: () => void;
  onContinueCheckout: () => void;
  onViewOrders?: () => void;
}) {
  const [row, setRow] = useState<Prescription | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [orderBusy, setOrderBusy] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [eligibility, setEligibility] = useState<CommerceEligibility | null>(null);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);
  const [refillEligibility, setRefillEligibility] = useState<RefillEligibility | null>(null);
  const [refillLoading, setRefillLoading] = useState(false);
  const [refillHistory, setRefillHistory] = useState<RefillRequest[]>([]);
  const [refillBusy, setRefillBusy] = useState(false);
  const [refillError, setRefillError] = useState<string | null>(null);

  const loadEligibility = useCallback(async () => {
    setEligibilityLoading(true);
    const result = await fetchCommerceEligibility({
      token: ctx.token,
      onUnauthorized: ctx.onUnauthorized,
      id: prescriptionId,
    });
    setEligibilityLoading(false);
    if (result.ok) {
      setEligibility(result.data);
    } else {
      setEligibility(null);
    }
  }, [ctx, prescriptionId]);

  const load = useCallback(async () => {
    ctx.setViewState('loading');
    setShowHistory(false);
    setOrderError(null);
    setRefillEligibility(null);
    setRefillHistory([]);
    setRefillError(null);
    const result = await fetchPrescription({
      token: ctx.token,
      onUnauthorized: ctx.onUnauthorized,
      id: prescriptionId,
    });
    applyApiResult(result, {
      onOk: async (loaded) => {
        setRow(loaded);
        if (loaded.status !== 'DRAFT' && loaded.status !== 'CANCELLED') {
          setRefillLoading(true);
          const [refillResult, requestsResult] = await Promise.all([
            fetchRefillEligibility({
              token: ctx.token,
              onUnauthorized: ctx.onUnauthorized,
              id: prescriptionId,
            }),
            fetchRefillRequests({ token: ctx.token, onUnauthorized: ctx.onUnauthorized }),
          ]);
          setRefillLoading(false);
          if (refillResult.ok) {
            setRefillEligibility(refillResult.data);
          } else {
            setRefillEligibility(null);
          }
          if (requestsResult.ok) {
            setRefillHistory(
              (requestsResult.data.requests ?? []).filter((entry) => entry.prescription_id === prescriptionId),
            );
          } else {
            setRefillHistory([]);
          }
        }
        if (loaded.dispensing_status === 'DISPENSED') {
          void loadEligibility();
        } else {
          setEligibility(null);
        }
      },
      onUnauthorized: ctx.onUnauthorized,
      setViewState: ctx.setViewState,
    });
    if (result.ok) {
      ctx.setViewState('idle');
    }
  }, [prescriptionId, ctx, loadEligibility]);

  useEffect(() => {
    void load();
  }, [load]);

  const orderMedicines = useCallback(async () => {
    setOrderBusy(true);
    setOrderError(null);
    let eligibilityResult = eligibility;
    if (!eligibilityResult) {
      const fetched = await fetchCommerceEligibility({
        token: ctx.token,
        onUnauthorized: ctx.onUnauthorized,
        id: prescriptionId,
      });
      if (!fetched.ok) {
        if (fetched.kind === 'unauthorized') {
          ctx.onUnauthorized();
        } else {
          setOrderError(fetched.error || 'Could not prepare medicines for order.');
        }
        setOrderBusy(false);
        return;
      }
      eligibilityResult = fetched.data;
    }
    if (!eligibilityResult.eligible || !eligibilityResult.dispensing_case_id) {
      if (eligibilityResult.reason === 'order_already_exists' && eligibilityResult.order_id) {
        setOrderError(`These medicines already have an order (${eligibilityResult.order_id.slice(0, 8)}).`);
      } else {
        setOrderError('These medicines are not ready to order yet.');
      }
      setOrderBusy(false);
      return;
    }
    const handoff = await startRxHandoff({
      token: ctx.token,
      onUnauthorized: ctx.onUnauthorized,
      dispensingCaseId: eligibilityResult.dispensing_case_id,
      idempotencyKey: newIdempotencyKey('rx-handoff'),
    });
    setOrderBusy(false);
    if (!handoff.ok) {
      if (handoff.kind === 'unauthorized') {
        ctx.onUnauthorized();
      } else {
        setOrderError(handoff.error || 'Could not prepare medicines for order.');
      }
      return;
    }
    onContinueCheckout();
  }, [ctx, eligibility, onContinueCheckout, prescriptionId]);

  const submitRefillRequest = useCallback(async () => {
    if (!refillEligibility?.eligible) {
      return;
    }
    setRefillBusy(true);
    setRefillError(null);
    const created = await requestRefill({
      token: ctx.token,
      onUnauthorized: ctx.onUnauthorized,
      prescriptionId,
      idempotencyKey: newIdempotencyKey('refill'),
    });
    setRefillBusy(false);
    if (!created.ok) {
      if (created.kind === 'unauthorized') {
        ctx.onUnauthorized();
      } else {
        setRefillError(created.error || 'Could not submit refill request.');
      }
      return;
    }
    setRefillHistory([created.data, ...refillHistory.filter((entry) => entry.id !== created.data.id)]);
    if (refillEligibility) {
      setRefillEligibility({
        ...refillEligibility,
        open_request_id: created.data.id,
        open_request_status: created.data.status,
      });
    }
  }, [ctx, prescriptionId, refillEligibility, refillHistory]);

  const cancelOpenRefill = useCallback(async () => {
    const openId = refillEligibility?.open_request_id;
    if (!openId) {
      return;
    }
    setRefillBusy(true);
    setRefillError(null);
    const cancelled = await cancelRefillRequest({
      token: ctx.token,
      onUnauthorized: ctx.onUnauthorized,
      requestId: openId,
      idempotencyKey: newIdempotencyKey('refill-cancel'),
    });
    if (!cancelled.ok) {
      setRefillBusy(false);
      if (cancelled.kind === 'unauthorized') {
        ctx.onUnauthorized();
      } else {
        setRefillError(cancelled.error || 'Could not cancel refill request.');
      }
      return;
    }
    const refreshed = await fetchRefillEligibility({
      token: ctx.token,
      onUnauthorized: ctx.onUnauthorized,
      id: prescriptionId,
    });
    setRefillBusy(false);
    setRefillHistory([cancelled.data, ...refillHistory.filter((entry) => entry.id !== cancelled.data.id)]);
    if (refreshed.ok) {
      setRefillEligibility(refreshed.data);
    }
  }, [ctx, prescriptionId, refillEligibility?.open_request_id, refillHistory]);

  const currentLines =
    row?.versions?.find((v) => v.id === row.current_version_id)?.lines ??
    row?.versions?.[row.versions.length - 1]?.lines ??
    [];

  return (
    <View style={{ gap: 12 }}>
      <NativeButton label="Back" variant="secondary" onPress={onBack} />
      <NativeText variant="h2">Prescription</NativeText>
      <FeatureStates viewState={ctx.viewState} onRetry={() => void load()} />
      {ctx.viewState === 'idle' && row ? (
        <>
          <NativeCard>
            <NativeText variant="h2">Clinical record</NativeText>
            <NativeText>{row.status}</NativeText>
            {row.dispensing_status ? (
              <NativeText variant="caption">{`Dispensing: ${row.dispensing_status}`}</NativeText>
            ) : null}
            <NativeText variant="caption">
              {`Current version ${row.current_version_number ?? '—'} of ${row.versions?.length ?? 1}`}
            </NativeText>
            <NativeText variant="caption">{`Created ${row.created_at ?? '—'}`}</NativeText>
            {currentLines.length === 0 ? (
              <NativeText variant="caption">No medication lines on current version.</NativeText>
            ) : (
              currentLines.map((line, index) => (
                <View key={`${line.clinical_concept_code}-${index}`}>
                  <NativeText variant="caption">
                    {`${line.line_number ?? index + 1}. ${line.clinical_concept_label} · ${line.dosage_instructions} · qty ${line.quantity_authorized}`}
                  </NativeText>
                </View>
              ))
            )}
            {(row.versions?.length ?? 0) > 1 ? (
              <>
                <NativeButton
                  label={showHistory ? 'Hide prior versions' : 'Show prior versions'}
                  variant="secondary"
                  onPress={() => setShowHistory(!showHistory)}
                />
                {showHistory
                  ? row.versions?.map((v) => (
                      <View key={v.id}>
                        <NativeText variant="caption">
                          {`Version ${v.version_number}${v.id === row.current_version_id ? ' (current)' : ''}`}
                        </NativeText>
                      </View>
                    ))
                  : null}
              </>
            ) : null}
          </NativeCard>

          {row.status !== 'DRAFT' && row.status !== 'CANCELLED' ? (
            <NativeCard>
              <NativeText variant="h2">Refill request</NativeText>
              <NativeText variant="caption">
                Fail-closed refill with doctor re-authorization. Automatic subscription refill stays off.
              </NativeText>
              {refillLoading ? <NativeLoadingState title="Checking refill eligibility" /> : null}
              {!refillLoading && refillEligibility ? (
                <>
                  <NativeText variant="caption">{refillEligibilityLabel(refillEligibility.reason)}</NativeText>
                  {refillEligibility.open_request_id ? (
                    <NativeText variant="caption">
                      {`Open request: ${refillEligibility.open_request_status ?? '—'} (${refillEligibility.open_request_id.slice(0, 8)})`}
                    </NativeText>
                  ) : null}
                  <NativeText variant="caption">{`Automatic refill: OFF`}</NativeText>
                  <NativeText variant="caption">
                    {`Subscription: ${subscriptionStatusLabel(refillEligibility.subscription)} · auto-execute: OFF`}
                  </NativeText>
                  {refillEligibility.subscription?.note ? (
                    <NativeText variant="caption">{refillEligibility.subscription.note}</NativeText>
                  ) : (
                    <NativeText variant="caption">
                      Automatic refill / subscription is unavailable unless explicitly configured.
                    </NativeText>
                  )}
                  {refillBusy ? <NativeLoadingState title="Updating refill request" /> : null}
                  {refillError ? <NativeText variant="caption">{refillError}</NativeText> : null}
                  {!refillBusy && refillEligibility.eligible && !refillEligibility.open_request_id ? (
                    <NativeButton label="Request refill" onPress={() => void submitRefillRequest()} />
                  ) : null}
                  {!refillBusy &&
                  refillEligibility.open_request_id &&
                  refillEligibility.open_request_status &&
                  CANCELLABLE_REFILL_STATUSES.has(refillEligibility.open_request_status) ? (
                    <NativeButton
                      label="Cancel refill request"
                      variant="secondary"
                      onPress={() => void cancelOpenRefill()}
                    />
                  ) : null}
                  {refillHistory.length ? (
                    <>
                      <NativeText variant="caption">Refill history</NativeText>
                      {refillHistory.map((entry) => (
                        <View key={entry.id}>
                          <NativeText variant="caption">
                            {`${entry.status} · ${entry.id.slice(0, 8)} · ${entry.created_at}`}
                          </NativeText>
                        </View>
                      ))}
                    </>
                  ) : null}
                </>
              ) : null}
              {!refillLoading && !refillEligibility ? (
                <NativeText variant="caption">Refill eligibility could not be loaded.</NativeText>
              ) : null}
            </NativeCard>
          ) : null}

          {row.dispensing_status === 'DISPENSED' ? (
            <NativeCard>
              <NativeText variant="h2">Commercial order</NativeText>
              <NativeText variant="caption">
                Pharmacy has dispensed this prescription. Review mapped SKUs, then start checkout.
              </NativeText>
              {eligibilityLoading ? <NativeLoadingState title="Checking order eligibility" /> : null}
              {!eligibilityLoading && eligibility?.commerce_items?.length ? (
                <>
                  <NativeText variant="caption">Mapped medicines (commercial SKUs)</NativeText>
                  {eligibility.commerce_items.map((item) => (
                    <View key={`${item.prescription_line_id}-${item.catalog_variant_id}`}>
                      <NativeText variant="caption">
                        {`Variant ${item.catalog_variant_id.slice(0, 8)} · qty ${item.quantity_dispensed}`}
                      </NativeText>
                    </View>
                  ))}
                </>
              ) : null}
              {orderBusy ? <NativeLoadingState title="Preparing your medicines for order" /> : null}
              {orderError ? <NativeText variant="caption">{orderError}</NativeText> : null}
              {!eligibilityLoading &&
              eligibility?.reason === 'order_already_exists' &&
              eligibility.order_id &&
              onViewOrders ? (
                <NativeButton label="View orders" variant="secondary" onPress={onViewOrders} />
              ) : null}
              {!orderBusy && !eligibilityLoading && eligibility?.eligible && eligibility.dispensing_case_id ? (
                <NativeButton label="Order medicines" onPress={() => void orderMedicines()} />
              ) : null}
            </NativeCard>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

export function AccountHubScreen({
  ctx,
  country,
  onNavigate,
}: {
  ctx: FeatureCtx;
  country: string;
  onNavigate: (
    screen:
      | 'privacy'
      | 'consent'
      | 'preferences'
      | 'support'
      | 'addresses'
      | 'profile-edit'
      | 'wishlist'
      | 'lab'
      | 'lab-bookings'
      | 'imaging'
      | 'imaging-bookings'
      | 'health-home',
  ) => void;
}) {
  const [summary, setSummary] = useState<string | null>(null);

  const load = useCallback(async () => {
    ctx.setViewState('loading');
    const profile = await fetchProfile({ token: ctx.token, onUnauthorized: ctx.onUnauthorized });
    if (!profile.ok) {
      if (profile.kind === 'forbidden') {
        ctx.setViewState('forbidden');
      } else if (profile.kind !== 'unauthorized') {
        ctx.setViewState('network');
      }
      return;
    }
    const email = profile.data.identifiers.find((row) => row.type === 'EMAIL')?.value ?? '—';
    setSummary(`Signed in as ${email}`);
    ctx.setViewState('idle');
  }, [ctx]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={{ gap: 12 }}>
      <NativeText variant="h2">Account</NativeText>
      <FeatureStates viewState={ctx.viewState} onRetry={() => void load()} />
      {ctx.viewState === 'idle' && summary ? <NativeText>{summary}</NativeText> : null}
      {ctx.viewState === 'idle' ? (
        <>
          {(['privacy', 'consent', 'preferences', 'wishlist', 'support', 'addresses', 'profile-edit', 'lab', 'lab-bookings', 'imaging', 'imaging-bookings', 'health-home'] as const).map(
            (item) => (
            <View key={item}>
              <NativeButton label={item.replace('-', ' ')} variant="secondary" onPress={() => onNavigate(item)} />
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}

export function LabBrowseScreen({
  ctx,
  onOpenBookings,
}: {
  ctx: FeatureCtx;
  onOpenBookings: () => void;
}) {
  const [rows, setRows] = useState<LabCatalogItem[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [selected, setSelected] = useState<LabCatalogItem | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [slot, setSlot] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    ctx.setViewState('loading');
    const result = await fetchLabCatalog({
      token: ctx.token,
      onUnauthorized: ctx.onUnauthorized,
      country: LAB_COUNTRY,
    });
    applyApiResult(result, {
      onOk: (data) => {
        setEnabled(data.country_enabled);
        setRows(data.data);
        setMessage(data.note ?? null);
      },
      onUnauthorized: ctx.onUnauthorized,
      setViewState: ctx.setViewState,
    });
    if (result.ok) {
      ctx.setViewState('idle');
    }
  }, [ctx]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDetail(slug: string) {
    ctx.setViewState('loading');
    const [detail, addr, slots] = await Promise.all([
      fetchLabCatalogItem({ token: ctx.token, onUnauthorized: ctx.onUnauthorized, slug, country: LAB_COUNTRY }),
      fetchAddresses({ token: ctx.token, onUnauthorized: ctx.onUnauthorized }),
      fetchLabSlots({
        token: ctx.token,
        onUnauthorized: ctx.onUnauthorized,
        labOrgId: '',
        collectionMode: 'HOME',
        country: LAB_COUNTRY,
      }).catch(() => null),
    ]);
    void slots;
    if (!detail.ok) {
      applyApiResult(detail, {
        onOk: () => undefined,
        onUnauthorized: ctx.onUnauthorized,
        setViewState: ctx.setViewState,
      });
      return;
    }
    const offer = detail.data.offers[0];
    if (offer) {
      const slotRes = await fetchLabSlots({
        token: ctx.token,
        onUnauthorized: ctx.onUnauthorized,
        labOrgId: offer.seller_org_id,
        collectionMode: 'HOME',
        country: LAB_COUNTRY,
      });
      if (slotRes.ok) {
        setSlot(slotRes.data.data[0]?.starts_at ?? '');
      }
    }
    if (addr.ok) {
      setAddresses(Array.isArray(addr.data) ? addr.data : []);
    }
    setSelected(detail.data);
    ctx.setViewState('idle');
  }

  async function bookPay() {
    if (!selected?.offers[0] || !addresses[0] || !slot) {
      setMessage('Address and slot are required for home collection.');
      return;
    }
    setBusy(true);
    setMessage(null);
    const offer = selected.offers[0];
    const booking = await createLabBooking({
      token: ctx.token,
      onUnauthorized: ctx.onUnauthorized,
      idempotencyKey: newIdempotencyKey('m-lab-book'),
      payload: {
        offer_id: offer.id,
        collection_mode: 'HOME',
        lab_org_id: offer.seller_org_id,
        customer_address_id: addresses[0].id,
        slot_starts_at: slot,
        country: LAB_COUNTRY,
      },
    });
    if (!booking.ok) {
      setBusy(false);
      applyApiResult(booking, {
        onOk: () => undefined,
        onUnauthorized: ctx.onUnauthorized,
        setViewState: ctx.setViewState,
      });
      if (!booking.ok && booking.kind !== 'unauthorized') {
        setMessage(booking.error);
      }
      return;
    }
    const paid = await payLabBooking({
      token: ctx.token,
      onUnauthorized: ctx.onUnauthorized,
      bookingId: booking.data.id,
      idempotencyKey: newIdempotencyKey('m-lab-pay'),
      scenario: 'success',
    });
    setBusy(false);
    if (paid.ok && paid.data.status === 'CAPTURED') {
      setMessage('Sandbox payment captured. Booking confirmed.');
      onOpenBookings();
      return;
    }
    setMessage(paid.ok ? `Payment status ${paid.data.status}` : paid.error);
  }

  return (
    <View style={{ gap: 12 }}>
      <NativeText variant="h2">Lab tests</NativeText>
      <NativeText variant="caption">Commercial catalog only — not medical advice. Sandbox pay only.</NativeText>
      <NativeButton label="My lab bookings" variant="secondary" onPress={onOpenBookings} />
      <FeatureStates viewState={ctx.viewState} onRetry={() => void load()} />
      {ctx.viewState === 'idle' && !enabled ? (
        <NativeEmptyState title="Lab unavailable" description={message ?? 'Country pack disables lab services.'} />
      ) : null}
      {ctx.viewState === 'idle' && enabled && !selected && rows.length === 0 ? (
        <NativeEmptyState title="No lab tests" description="No published LAB_TEST offers yet." />
      ) : null}
      {ctx.viewState === 'idle' && !selected
        ? rows.map((row) => (
            <View key={row.id}>
              <NativeCard>
                <NativeText>{row.title}</NativeText>
                <NativeText variant="caption">
                  {`${row.offers[0]?.seller_display_name ?? 'Lab'} · ${
                    row.offers[0]?.price
                      ? `${row.offers[0].currency} ${row.offers[0].price.sell_minor}`
                      : 'Price n/a'
                  }`}
                </NativeText>
                <NativeButton label="Book" variant="secondary" onPress={() => void openDetail(row.slug)} />
              </NativeCard>
            </View>
          ))
        : null}
      {ctx.viewState === 'idle' && selected ? (
        <NativeCard>
          <NativeText variant="h2">{selected.title}</NativeText>
          <NativeText variant="caption">{selected.description || 'Commercial listing.'}</NativeText>
          <NativeText variant="caption">
            {`Address: ${addresses[0] ? `${addresses[0].line1}, ${addresses[0].city}` : 'Add an address in Account first'}`}
          </NativeText>
          <NativeText variant="caption">{`Slot: ${slot || 'Unavailable'}`}</NativeText>
          {busy ? <NativeLoadingState title="Confirming sandbox lab booking…" /> : null}
          {message ? <NativeText>{message}</NativeText> : null}
          <NativeButton label="Book & pay (sandbox)" onPress={() => void bookPay()} />
          <NativeButton label="Back to list" variant="secondary" onPress={() => setSelected(null)} />
        </NativeCard>
      ) : null}
    </View>
  );
}

export function LabBookingsScreen({
  ctx,
  onOpen,
}: {
  ctx: FeatureCtx;
  onOpen: (id: string) => void;
}) {
  const [rows, setRows] = useState<LabBooking[]>([]);

  const load = useCallback(async () => {
    ctx.setViewState('loading');
    const result = await fetchLabBookings({ token: ctx.token, onUnauthorized: ctx.onUnauthorized });
    applyApiResult(result, {
      onOk: (data) => setRows(data.data),
      onUnauthorized: ctx.onUnauthorized,
      setViewState: ctx.setViewState,
    });
    if (result.ok) {
      ctx.setViewState('idle');
    }
  }, [ctx]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={{ gap: 12 }}>
      <NativeText variant="h2">Lab bookings</NativeText>
      <FeatureStates viewState={ctx.viewState} onRetry={() => void load()} />
      {ctx.viewState === 'idle' && rows.length === 0 ? (
        <NativeEmptyState title="No lab bookings" description="Book a lab test to see status here." />
      ) : null}
      {ctx.viewState === 'idle'
        ? rows.map((row) => (
            <View key={row.id}>
              <NativeCard>
                <NativeText>{row.lines[0]?.title ?? 'Lab booking'}</NativeText>
                <NativeText variant="caption">{`${row.status} · ${row.collection_mode} · ${row.currency} ${row.total_minor}`}</NativeText>
                <NativeButton label="Details" variant="secondary" onPress={() => onOpen(row.id)} />
                {row.status === 'BOOKED' || row.status === 'PAYMENT_FAILED' ? (
                  <NativeButton
                    label="Cancel"
                    variant="secondary"
                    onPress={() => {
                      void cancelLabBooking({
                        token: ctx.token,
                        onUnauthorized: ctx.onUnauthorized,
                        id: row.id,
                      }).then(() => void load());
                    }}
                  />
                ) : null}
              </NativeCard>
            </View>
          ))
        : null}
    </View>
  );
}

export function LabBookingDetailScreen({
  ctx,
  bookingId,
  onBack,
}: {
  ctx: FeatureCtx;
  bookingId: string;
  onBack: () => void;
}) {
  const [row, setRow] = useState<LabBooking | null>(null);
  const [collection, setCollection] = useState<LabBookingCollection | null>(null);
  const [report, setReport] = useState<LabCustomerReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<'network' | 'forbidden' | 'unavailable' | 'generic' | null>(null);
  const [physicalEligibility, setPhysicalEligibility] = useState<PhysicalReportEligibility | null>(null);
  const [physicalStatus, setPhysicalStatus] = useState<PhysicalReportStatus | null>(null);

  const loadReport = useCallback(() => {
    setReportLoading(true);
    setReportError(null);
    setReport(null);
    void fetchLabReport({
      token: ctx.token,
      onUnauthorized: ctx.onUnauthorized,
      id: bookingId,
    }).then((result) => {
      if (result.ok) {
        setReport(result.data);
        return;
      }
      if (result.kind === 'unauthorized') {
        ctx.onUnauthorized();
        return;
      }
      if (result.kind === 'forbidden' || result.status === 403) {
        setReportError('forbidden');
        return;
      }
      if (result.status === 404) {
        setReportError('unavailable');
        return;
      }
      if (result.kind === 'network' || result.status === 0) {
        setReportError('network');
        return;
      }
      setReportError('generic');
    }).finally(() => setReportLoading(false));
  }, [bookingId, ctx]);

  const load = useCallback(async () => {
    ctx.setViewState('loading');
    const [bookingResult, collectionResult] = await Promise.all([
      fetchLabBooking({
        token: ctx.token,
        onUnauthorized: ctx.onUnauthorized,
        id: bookingId,
      }),
      fetchLabBookingCollection({
        token: ctx.token,
        onUnauthorized: ctx.onUnauthorized,
        id: bookingId,
      }),
    ]);
    applyApiResult(bookingResult, {
      onOk: (data) => setRow(data),
      onUnauthorized: ctx.onUnauthorized,
      setViewState: ctx.setViewState,
    });
    if (collectionResult.ok) {
      setCollection(collectionResult.data);
    }
    if (bookingResult.ok) {
      ctx.setViewState('idle');
    }
  }, [bookingId, ctx]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={{ gap: 12 }}>
      <NativeButton label="Back" variant="secondary" onPress={onBack} />
      <NativeText variant="h2">Lab booking</NativeText>
      <FeatureStates viewState={ctx.viewState} onRetry={() => void load()} />
      {ctx.viewState === 'idle' && row ? (
        <NativeCard>
          <NativeText>{row.lines[0]?.title ?? 'Booking'}</NativeText>
          <NativeText variant="caption">{`${row.status} · ${row.lab_display_name ?? ''}`}</NativeText>
          <NativeText variant="caption">{`${row.currency} ${row.total_minor} · sandbox`}</NativeText>
          {collection ? (
            <>
              <NativeText variant="h2">Collection</NativeText>
              {collection.collection_started ? (
                <>
                  <NativeText variant="caption">{`Status: ${collection.status}`}</NativeText>
                  {collection.transport_in_progress ? (
                    <NativeText variant="caption">In transit to lab</NativeText>
                  ) : null}
                  {collection.lab_received ? <NativeText variant="caption">Received at lab</NativeText> : null}
                  {collection.accession_number ? (
                    <NativeText variant="caption">{`Accession: ${collection.accession_number}`}</NativeText>
                  ) : null}
                  {collection.processing_status ? (
                    <NativeText variant="caption">{`Processing: ${collection.processing_status}`}</NativeText>
                  ) : null}
                  {collection.report_status ? (
                    <NativeText variant="caption">{`Report: ${collection.report_status}`}</NativeText>
                  ) : null}
                  {collection.boundary?.results_available ? (
                    <NativeButton
                      label={reportLoading ? 'Loading report…' : report ? 'Report loaded' : 'View final report'}
                      variant="secondary"
                      disabled={reportLoading}
                      onPress={loadReport}
                    />
                  ) : (
                    <NativeText variant="caption">Final report not available yet.</NativeText>
                  )}
                  {reportError === 'forbidden' ? <NativePermissionDeniedState /> : null}
                  {reportError === 'unavailable' ? (
                    <NativeEmptyState
                      title="Report not available"
                      description="The final diagnostic report is not published yet or is no longer available."
                    />
                  ) : null}
                  {reportError === 'network' ? (
                    <NativeNetworkErrorState onRetry={loadReport} />
                  ) : null}
                  {reportError === 'generic' ? (
                    <NativeEmptyState
                      title="Could not load report"
                      description="An unexpected error occurred."
                    />
                  ) : null}
                  {collection.custody_timeline.map((event, index) => (
                    <NativeText variant="caption">{`${event.to_status} · ${event.action_code}`}</NativeText>
                  ))}
                </>
              ) : (
                <NativeText variant="caption">{collection.note ?? 'Collection not started.'}</NativeText>
              )}
              {report ? (
                <NativeCard>
                  <NativeText variant="h2">Diagnostic report</NativeText>
                  <NativeText variant="caption">{`Accession ${report.accession_number}`}</NativeText>
                  {report.results.map((line) => (
                    <NativeText variant="caption">{`${line.analyte_name}: ${line.value}`}</NativeText>
                  ))}
                </NativeCard>
              ) : null}
              {collection.boundary?.results_available ? (
                <NativeCard>
                  <NativeText variant="h2">Physical report</NativeText>
                  <NativeButton
                    label="Check physical delivery"
                    variant="secondary"
                    onPress={() =>
                      void fetchPhysicalReportEligibility({
                        token: ctx.token,
                        onUnauthorized: ctx.onUnauthorized,
                        id: bookingId,
                      }).then((result) => {
                        if (result.ok) {
                          setPhysicalEligibility(result.data);
                          if (result.data.existing_request_id) {
                            void fetchPhysicalReportStatus({
                              token: ctx.token,
                              onUnauthorized: ctx.onUnauthorized,
                              id: bookingId,
                            }).then((status) => {
                              if (status.ok) {
                                setPhysicalStatus(status.data);
                              }
                            });
                          }
                        }
                      })
                    }
                  />
                  {physicalEligibility && !physicalEligibility.eligible ? (
                    <NativeText variant="caption">{physicalEligibility.reason ?? 'Unavailable'}</NativeText>
                  ) : null}
                  {physicalEligibility?.eligible && !physicalStatus ? (
                    <NativeButton
                      label="Request hard copy"
                      onPress={() =>
                        void requestPhysicalReport({
                          token: ctx.token,
                          onUnauthorized: ctx.onUnauthorized,
                          id: bookingId,
                          idempotencyKey: `phys-${bookingId}`,
                        }).then((result) => {
                          if (result.ok) {
                            setPhysicalStatus(result.data);
                          }
                        })
                      }
                    />
                  ) : null}
                  {physicalStatus ? (
                    <>
                      <NativeText variant="caption">{`Status: ${physicalStatus.status}`}</NativeText>
                      {physicalStatus.logistics_job_status ? (
                        <NativeText variant="caption">{`Delivery: ${physicalStatus.logistics_job_status}`}</NativeText>
                      ) : null}
                      {physicalStatus.failure_reason ? (
                        <NativeText variant="caption">{`Issue: ${physicalStatus.failure_reason}`}</NativeText>
                      ) : null}
                    </>
                  ) : null}
                </NativeCard>
              ) : null}
            </>
          ) : null}
        </NativeCard>
      ) : null}
    </View>
  );
}

const PREP_INSTRUCTIONS = [
  'Arrive 15 minutes before your scheduled slot with your booking reference.',
  'Wear comfortable clothing without metal where possible.',
  'Follow any fasting or contrast instructions provided by the imaging center separately.',
];

export function ImagingBrowseScreen({
  ctx,
  onOpenBookings,
}: {
  ctx: FeatureCtx;
  onOpenBookings: () => void;
}) {
  const [rows, setRows] = useState<ImagingCatalogItem[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [selected, setSelected] = useState<ImagingCatalogItem | null>(null);
  const [locations, setLocations] = useState<Array<{ id: string; name: string; city?: string | null }>>([]);
  const [slots, setSlots] = useState<Array<{ starts_at: string; ends_at: string }>>([]);
  const [locationId, setLocationId] = useState('');
  const [slot, setSlot] = useState('');
  const [slotEnd, setSlotEnd] = useState('');
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [locationsError, setLocationsError] = useState<'network' | 'forbidden' | 'generic' | null>(null);
  const [slotsError, setSlotsError] = useState<'network' | 'forbidden' | 'generic' | null>(null);
  const [prepAck, setPrepAck] = useState(false);
  const [referralRef, setReferralRef] = useState('');
  const [referralRequired, setReferralRequired] = useState(false);
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    ctx.setViewState('loading');
    const result = await fetchImagingCatalog({
      token: ctx.token,
      onUnauthorized: ctx.onUnauthorized,
      country: IMAGING_COUNTRY,
    });
    applyApiResult(result, {
      onOk: (data) => {
        setEnabled(data.country_enabled);
        setRows(data.data);
        setMessage(data.note ?? null);
      },
      onUnauthorized: ctx.onUnauthorized,
      setViewState: ctx.setViewState,
    });
    if (result.ok) {
      ctx.setViewState('idle');
    }
  }, [ctx]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetBookingDraft() {
    setLocationId('');
    setSlot('');
    setSlotEnd('');
    setPrepAck(false);
    setReferralRef('');
    setLocations([]);
    setSlots([]);
    setLocationsError(null);
    setSlotsError(null);
    setEligible(null);
    setReferralRequired(false);
    setMessage(null);
  }

  async function openDetail(slug: string) {
    resetBookingDraft();
    ctx.setViewState('loading');
    const detail = await fetchImagingCatalogItem({
      token: ctx.token,
      onUnauthorized: ctx.onUnauthorized,
      slug,
      country: IMAGING_COUNTRY,
    });
    if (!detail.ok) {
      applyApiResult(detail, {
        onOk: () => undefined,
        onUnauthorized: ctx.onUnauthorized,
        setViewState: ctx.setViewState,
      });
      return;
    }
    const offer = detail.data.offers[0];
    setSelected(detail.data);
    ctx.setViewState('idle');
    if (!offer) {
      return;
    }
    setLocationsLoading(true);
    setSlotsLoading(true);
    const [locs, slotRes, elig] = await Promise.all([
      fetchImagingLocations({
        token: ctx.token,
        onUnauthorized: ctx.onUnauthorized,
        imagingOrgId: offer.seller_org_id,
        country: IMAGING_COUNTRY,
      }),
      fetchImagingSlots({
        token: ctx.token,
        onUnauthorized: ctx.onUnauthorized,
        imagingOrgId: offer.seller_org_id,
        country: IMAGING_COUNTRY,
      }),
      checkImagingEligibility({
        token: ctx.token,
        onUnauthorized: ctx.onUnauthorized,
        imagingOrgId: offer.seller_org_id,
        offerId: offer.id,
        country: IMAGING_COUNTRY,
      }),
    ]);
    setLocationsLoading(false);
    setSlotsLoading(false);
    if (locs.ok) {
      setLocations(locs.data.data);
      if (!locs.data.data.length) {
        setLocationsError('generic');
      }
    } else if (locs.kind === 'forbidden') {
      setLocationsError('forbidden');
    } else if (locs.kind === 'network' || locs.status === 0) {
      setLocationsError('network');
    } else {
      setLocationsError('generic');
    }
    if (slotRes.ok) {
      setSlots(slotRes.data.data);
      if (!slotRes.data.data.length) {
        setSlotsError('generic');
      }
    } else if (slotRes.kind === 'forbidden') {
      setSlotsError('forbidden');
    } else if (slotRes.kind === 'network' || slotRes.status === 0) {
      setSlotsError('network');
    } else {
      setSlotsError('generic');
    }
    if (elig.ok) {
      setEligible(elig.data.eligible);
      setReferralRequired(elig.data.referral_required);
      if (!elig.data.eligible) {
        setMessage(elig.data.blocked_reason);
      }
    }
  }

  async function reloadLocationsAndSlots() {
    const offer = selected?.offers[0];
    if (!offer) {
      return;
    }
    setLocationsLoading(true);
    setSlotsLoading(true);
    setLocationsError(null);
    setSlotsError(null);
    const [locs, slotRes] = await Promise.all([
      fetchImagingLocations({
        token: ctx.token,
        onUnauthorized: ctx.onUnauthorized,
        imagingOrgId: offer.seller_org_id,
        country: IMAGING_COUNTRY,
      }),
      fetchImagingSlots({
        token: ctx.token,
        onUnauthorized: ctx.onUnauthorized,
        imagingOrgId: offer.seller_org_id,
        country: IMAGING_COUNTRY,
      }),
    ]);
    setLocationsLoading(false);
    setSlotsLoading(false);
    if (locs.ok) {
      setLocations(locs.data.data);
    } else if (locs.kind === 'forbidden') {
      setLocationsError('forbidden');
    } else if (locs.kind === 'network' || locs.status === 0) {
      setLocationsError('network');
    } else {
      setLocationsError('generic');
    }
    if (slotRes.ok) {
      setSlots(slotRes.data.data);
    } else if (slotRes.kind === 'forbidden') {
      setSlotsError('forbidden');
    } else if (slotRes.kind === 'network' || slotRes.status === 0) {
      setSlotsError('network');
    } else {
      setSlotsError('generic');
    }
  }

  function selectSlot(startsAt: string) {
    const pick = slots.find((s) => s.starts_at === startsAt);
    setSlot(startsAt);
    setSlotEnd(pick?.ends_at ?? '');
  }

  async function bookPay(scenario: 'success' | 'failed') {
    const draftError = imagingBookingDraftError({
      eligible,
      locationId,
      slotStartsAt: slot,
      prepAcknowledged: prepAck,
      referralRequired,
      referralReference: referralRef,
    });
    if (draftError) {
      setMessage(draftError);
      return;
    }
    if (!selected?.offers[0]) {
      return;
    }
    setBusy(true);
    setMessage(null);
    const offer = selected.offers[0];
    const booking = await createImagingBooking({
      token: ctx.token,
      onUnauthorized: ctx.onUnauthorized,
      idempotencyKey: newIdempotencyKey('m-img-book'),
      payload: {
        offer_id: offer.id,
        imaging_org_id: offer.seller_org_id,
        imaging_location_id: locationId,
        slot_starts_at: slot,
        slot_ends_at: slotEnd || undefined,
        country: IMAGING_COUNTRY,
        prep_acknowledged: true,
        referral_reference: referralRef.trim() || undefined,
      },
    });
    if (!booking.ok) {
      setBusy(false);
      applyApiResult(booking, {
        onOk: () => undefined,
        onUnauthorized: ctx.onUnauthorized,
        setViewState: ctx.setViewState,
      });
      if (!booking.ok && booking.kind !== 'unauthorized') {
        setMessage(booking.error);
      }
      return;
    }
    const paid = await payImagingBooking({
      token: ctx.token,
      onUnauthorized: ctx.onUnauthorized,
      bookingId: booking.data.id,
      idempotencyKey: newIdempotencyKey('m-img-pay'),
      scenario,
    });
    setBusy(false);
    if (paid.ok && paid.data.status === 'CAPTURED') {
      setMessage('Sandbox payment captured. Booking confirmed.');
      onOpenBookings();
      return;
    }
    setMessage(paid.ok ? `Payment status ${paid.data.status}` : paid.error);
  }

  const selectedLocation = locations.find((l) => l.id === locationId);

  return (
    <View style={{ gap: 12 }}>
      <NativeText variant="h2">Radiology studies</NativeText>
      <NativeText variant="caption">Commercial catalog only — not medical advice. Sandbox pay only.</NativeText>
      <NativeButton label="My imaging bookings" variant="secondary" onPress={onOpenBookings} />
      <FeatureStates viewState={ctx.viewState} onRetry={() => void load()} />
      {ctx.viewState === 'idle' && !enabled ? (
        <NativeEmptyState title="Imaging unavailable" description={message ?? 'Country pack disables imaging services.'} />
      ) : null}
      {ctx.viewState === 'idle' && enabled && !selected && rows.length === 0 ? (
        <NativeEmptyState title="No imaging studies" description="No published IMAGING_STUDY offers yet." />
      ) : null}
      {ctx.viewState === 'idle' && !selected
        ? rows.map((row) => (
            <View key={row.id}>
              <NativeCard>
                <NativeText>{row.title}</NativeText>
                <NativeText variant="caption">
                  {`${row.offers[0]?.seller_display_name ?? 'Imaging center'} · ${
                    row.offers[0]?.price
                      ? `${row.offers[0].currency} ${row.offers[0].price.sell_minor}`
                      : 'Price n/a'
                  }`}
                </NativeText>
                <NativeButton label="Book" variant="secondary" onPress={() => void openDetail(row.slug)} />
              </NativeCard>
            </View>
          ))
        : null}
      {ctx.viewState === 'idle' && selected ? (
        <NativeCard>
          <NativeText variant="h2">{selected.title}</NativeText>
          <NativeText variant="caption">{selected.description || 'Commercial listing.'}</NativeText>
          <NativeText variant="h2">Preparation</NativeText>
          {PREP_INSTRUCTIONS.map((line) => (
            <View key={line}>
              <NativeText variant="caption">{line}</NativeText>
            </View>
          ))}
          {eligible === false ? (
            <NativeEmptyState title="Not eligible" description={message ?? 'Cannot book this center.'} />
          ) : null}
          {referralRequired ? (
            <NativeInput label="Referral reference" value={referralRef} onChangeText={setReferralRef} />
          ) : null}
          <NativeText variant="h2">Imaging center location</NativeText>
          {locationsLoading ? <NativeLoadingState title="Loading locations…" /> : null}
          {locationsError === 'forbidden' ? <NativePermissionDeniedState /> : null}
          {locationsError === 'network' ? (
            <NativeNetworkErrorState onRetry={() => void reloadLocationsAndSlots()} />
          ) : null}
          {locationsError === 'generic' && !locationsLoading ? (
            <NativeEmptyState title="No locations" description="No active IMAGING locations for this center." />
          ) : null}
          {!locationsLoading && !locationsError && locations.length > 0
            ? locations.map((loc) => (
                <View key={loc.id}>
                  <NativeButton
                    label={`${locationId === loc.id ? '✓ ' : ''}${loc.name}${loc.city ? ` · ${loc.city}` : ''}`}
                    variant={locationId === loc.id ? 'primary' : 'secondary'}
                    onPress={() => setLocationId(loc.id)}
                  />
                </View>
              ))
            : null}
          {selectedLocation ? (
            <NativeText variant="caption">{`Selected: ${selectedLocation.name}`}</NativeText>
          ) : (
            <NativeText variant="caption">Select an imaging center location to continue.</NativeText>
          )}
          <NativeText variant="h2">Appointment slot</NativeText>
          {slotsLoading ? <NativeLoadingState title="Loading slots…" /> : null}
          {slotsError === 'forbidden' ? <NativePermissionDeniedState /> : null}
          {slotsError === 'network' ? (
            <NativeNetworkErrorState onRetry={() => void reloadLocationsAndSlots()} />
          ) : null}
          {slotsError === 'generic' && !slotsLoading ? (
            <NativeEmptyState title="No slots" description="No appointment slots are available right now." />
          ) : null}
          {!slotsLoading && !slotsError && slots.length > 0
            ? slots.map((s) => (
                <View key={s.starts_at}>
                  <NativeButton
                    label={`${slot === s.starts_at ? '✓ ' : ''}${new Date(s.starts_at).toLocaleString()}`}
                    variant={slot === s.starts_at ? 'primary' : 'secondary'}
                    onPress={() => selectSlot(s.starts_at)}
                  />
                </View>
              ))
            : null}
          {slot ? (
            <NativeText variant="caption">{`Selected slot: ${new Date(slot).toLocaleString()}`}</NativeText>
          ) : (
            <NativeText variant="caption">Select an appointment slot to continue.</NativeText>
          )}
          <NativeButton
            label={prepAck ? 'Preparation acknowledged ✓' : 'Acknowledge preparation'}
            variant={prepAck ? 'primary' : 'secondary'}
            onPress={() => setPrepAck(true)}
          />
          {busy ? <NativeLoadingState title="Confirming sandbox imaging booking…" /> : null}
          {message ? <NativeText>{message}</NativeText> : null}
          <NativeButton label="Book & pay (sandbox success)" onPress={() => void bookPay('success')} />
          <NativeButton label="Simulate payment failure" variant="secondary" onPress={() => void bookPay('failed')} />
          <NativeButton
            label="Back to list"
            variant="secondary"
            onPress={() => {
              setSelected(null);
              resetBookingDraft();
            }}
          />
        </NativeCard>
      ) : null}
    </View>
  );
}

export function ImagingBookingsScreen({
  ctx,
  onOpen,
}: {
  ctx: FeatureCtx;
  onOpen: (id: string) => void;
}) {
  const [rows, setRows] = useState<ImagingBooking[]>([]);
  const [payBusyId, setPayBusyId] = useState<string | null>(null);
  const [payMessage, setPayMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    ctx.setViewState('loading');
    const result = await fetchImagingBookings({ token: ctx.token, onUnauthorized: ctx.onUnauthorized });
    applyApiResult(result, {
      onOk: (data) => setRows(data.data),
      onUnauthorized: ctx.onUnauthorized,
      setViewState: ctx.setViewState,
    });
    if (result.ok) {
      ctx.setViewState('idle');
    }
  }, [ctx]);

  useEffect(() => {
    void load();
  }, [load]);

  async function retryPay(bookingId: string, scenario: 'success' | 'failed') {
    setPayBusyId(bookingId);
    setPayMessage(null);
    const paid = await payImagingBooking({
      token: ctx.token,
      onUnauthorized: ctx.onUnauthorized,
      bookingId,
      idempotencyKey: newIdempotencyKey('m-img-repay'),
      scenario,
    });
    setPayBusyId(null);
    if (!paid.ok) {
      if (paid.kind === 'forbidden') {
        ctx.setViewState('forbidden');
        return;
      }
      if (paid.kind === 'unauthorized') {
        return;
      }
      setPayMessage(paid.error);
      await load();
      return;
    }
    if (paid.data.status === 'CAPTURED') {
      setPayMessage('Sandbox payment captured. Booking confirmed.');
      await load();
      return;
    }
    setPayMessage(`Sandbox payment ended as ${paid.data.status}.`);
    await load();
  }

  return (
    <View style={{ gap: 12 }}>
      <NativeText variant="h2">Imaging bookings</NativeText>
      <FeatureStates viewState={ctx.viewState} onRetry={() => void load()} />
      {payMessage ? <NativeText>{payMessage}</NativeText> : null}
      {ctx.viewState === 'idle' && rows.length === 0 ? (
        <NativeEmptyState title="No imaging bookings" description="Book an imaging study to see status here." />
      ) : null}
      {ctx.viewState === 'idle'
        ? rows.map((row) => (
            <View key={row.id}>
              <NativeCard>
                <NativeText>{row.lines[0]?.title ?? 'Imaging booking'}</NativeText>
                <NativeText variant="caption">{`${row.status} · ${row.currency} ${row.total_minor}`}</NativeText>
                {row.status === 'PAYMENT_FAILED' ? (
                  <NativeText variant="caption">Payment failed — retry sandbox pay below.</NativeText>
                ) : null}
                <NativeButton label="Details" variant="secondary" onPress={() => onOpen(row.id)} />
                {imagingPaymentRetryable(row.status) ? (
                  <>
                    {payBusyId === row.id ? <NativeLoadingState title="Processing sandbox payment…" /> : null}
                    <NativeButton
                      label="Pay (sandbox success)"
                      disabled={payBusyId === row.id}
                      onPress={() => void retryPay(row.id, 'success')}
                    />
                    <NativeButton
                      label="Simulate payment failure"
                      variant="secondary"
                      disabled={payBusyId === row.id}
                      onPress={() => void retryPay(row.id, 'failed')}
                    />
                    <NativeButton
                      label="Cancel"
                      variant="secondary"
                      disabled={payBusyId === row.id}
                      onPress={() => {
                        void cancelImagingBooking({
                          token: ctx.token,
                          onUnauthorized: ctx.onUnauthorized,
                          id: row.id,
                        }).then(() => void load());
                      }}
                    />
                  </>
                ) : null}
              </NativeCard>
            </View>
          ))
        : null}
    </View>
  );
}

export function ImagingBookingDetailScreen({
  ctx,
  bookingId,
  onBack,
}: {
  ctx: FeatureCtx;
  bookingId: string;
  onBack: () => void;
}) {
  const [row, setRow] = useState<ImagingBooking | null>(null);
  const [progress, setProgress] = useState<{
    progress: string;
    note: string;
    accession_number?: string | null;
    study_status?: string | null;
  } | null>(null);
  const [prep, setPrep] = useState<ImagingPreparation | null>(null);
  const [reportStatus, setReportStatus] = useState<ImagingReportStatus | null>(null);
  const [report, setReport] = useState<ImagingCustomerReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<'network' | 'forbidden' | 'unavailable' | 'generic' | null>(null);
  const [physicalEligibility, setPhysicalEligibility] = useState<ImagingPhysicalReportEligibility | null>(null);
  const [physicalStatus, setPhysicalStatus] = useState<ImagingPhysicalReportStatus | null>(null);
  const [physicalLoading, setPhysicalLoading] = useState(false);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [prepLoading, setPrepLoading] = useState(false);
  const [prepError, setPrepError] = useState<'network' | 'forbidden' | 'unavailable' | 'generic' | null>(null);
  const [payBusy, setPayBusy] = useState(false);
  const [payMessage, setPayMessage] = useState<string | null>(null);

  const loadPrep = useCallback(() => {
    setPrepLoading(true);
    setPrepError(null);
    setPrep(null);
    void fetchImagingPreparation({
      token: ctx.token,
      onUnauthorized: ctx.onUnauthorized,
      id: bookingId,
    }).then((result) => {
      if (result.ok) {
        setPrep(result.data);
        return;
      }
      if (result.kind === 'unauthorized') {
        return;
      }
      if (result.kind === 'forbidden' || result.status === 403) {
        setPrepError('forbidden');
        return;
      }
      if (result.status === 404) {
        setPrepError('unavailable');
        return;
      }
      if (result.kind === 'network' || result.status === 0) {
        setPrepError('network');
        return;
      }
      setPrepError('generic');
    }).finally(() => setPrepLoading(false));
  }, [bookingId, ctx]);

  const load = useCallback(async () => {
    ctx.setViewState('loading');
    const [bookingResult, progressResult, statusResult] = await Promise.all([
      fetchImagingBooking({ token: ctx.token, onUnauthorized: ctx.onUnauthorized, id: bookingId }),
      fetchImagingProgress({ token: ctx.token, onUnauthorized: ctx.onUnauthorized, id: bookingId }),
      fetchImagingReportStatus({ token: ctx.token, onUnauthorized: ctx.onUnauthorized, id: bookingId }),
    ]);
    applyApiResult(bookingResult, {
      onOk: (data) => setRow(data),
      onUnauthorized: ctx.onUnauthorized,
      setViewState: ctx.setViewState,
    });
    if (progressResult.ok) {
      setProgress(progressResult.data);
    }
    if (statusResult.ok) {
      setReportStatus(statusResult.data);
      setReportError(null);
    } else if (statusResult.kind === 'forbidden' || statusResult.status === 403) {
      setReportError('forbidden');
    }
    const addrResult = await fetchAddresses({ token: ctx.token, onUnauthorized: ctx.onUnauthorized });
    if (addrResult.ok) {
      setAddresses(addrResult.data);
      if (addrResult.data.length === 1) {
        setSelectedAddressId(addrResult.data[0]!.id);
      }
    }
    setReport(null);
    if (bookingResult.ok) {
      ctx.setViewState('idle');
      loadPrep();
    }
  }, [bookingId, ctx, loadPrep]);

  const loadReport = useCallback(() => {
    setReportLoading(true);
    setReportError(null);
    setReport(null);
    void fetchImagingReport({
      token: ctx.token,
      onUnauthorized: ctx.onUnauthorized,
      id: bookingId,
    }).then((result) => {
      if (result.ok) {
        setReport(result.data);
        return;
      }
      if (result.kind === 'unauthorized') {
        return;
      }
      if (result.kind === 'forbidden' || result.status === 403) {
        setReportError('forbidden');
        return;
      }
      if (result.status === 404) {
        setReportError('unavailable');
        return;
      }
      if (result.kind === 'network' || result.status === 0) {
        setReportError('network');
        return;
      }
      setReportError('generic');
    }).finally(() => setReportLoading(false));
  }, [bookingId, ctx]);

  useEffect(() => {
    void load();
  }, [load]);

  async function retryPay(scenario: 'success' | 'failed') {
    if (!row) {
      return;
    }
    setPayBusy(true);
    setPayMessage(null);
    const paid = await payImagingBooking({
      token: ctx.token,
      onUnauthorized: ctx.onUnauthorized,
      bookingId: row.id,
      idempotencyKey: newIdempotencyKey('m-img-repay'),
      scenario,
    });
    setPayBusy(false);
    if (!paid.ok) {
      if (paid.kind === 'forbidden') {
        ctx.setViewState('forbidden');
        return;
      }
      if (paid.kind !== 'unauthorized') {
        setPayMessage(paid.error);
      }
      await load();
      return;
    }
    if (paid.data.status === 'CAPTURED') {
      setPayMessage('Sandbox payment captured. Booking confirmed.');
      await load();
      return;
    }
    setPayMessage(`Sandbox payment ended as ${paid.data.status}.`);
    await load();
  }

  return (
    <View style={{ gap: 12 }}>
      <NativeButton label="Back" variant="secondary" onPress={onBack} />
      <NativeText variant="h2">Imaging booking</NativeText>
      <FeatureStates viewState={ctx.viewState} onRetry={() => void load()} />
      {ctx.viewState === 'idle' && row ? (
        <NativeCard>
          <NativeText>{row.lines[0]?.title ?? 'Booking'}</NativeText>
          <NativeText variant="caption">{`${row.status} · ${row.imaging_display_name ?? ''}`}</NativeText>
          {row.status === 'PAYMENT_FAILED' ? (
            <NativeText variant="caption">Payment failed — retry sandbox pay below.</NativeText>
          ) : null}
          <NativeText variant="caption">{`${row.currency} ${row.total_minor} · sandbox`}</NativeText>
          {row.slot_starts_at ? (
            <NativeText variant="caption">{`Slot: ${new Date(row.slot_starts_at).toLocaleString()}`}</NativeText>
          ) : null}
          {row.imaging_location ? (
            <NativeText variant="caption">{`Center: ${row.imaging_location.name}`}</NativeText>
          ) : null}
          {progress ? (
            <>
              <NativeText variant="caption">{`Progress: ${progress.progress}`}</NativeText>
              {progress.accession_number ? (
                <NativeText variant="caption">{`Accession: ${progress.accession_number}`}</NativeText>
              ) : null}
              <NativeText variant="caption">{progress.note}</NativeText>
            </>
          ) : null}
          <NativeText variant="h2">Preparation</NativeText>
          {prepLoading ? <NativeLoadingState title="Loading preparation…" /> : null}
          {prepError === 'forbidden' ? <NativePermissionDeniedState /> : null}
          {prepError === 'unavailable' ? (
            <NativeEmptyState title="Preparation unavailable" description="Preparation information is not available for this booking." />
          ) : null}
          {prepError === 'network' ? <NativeNetworkErrorState onRetry={loadPrep} /> : null}
          {prepError === 'generic' ? (
            <NativeEmptyState title="Could not load preparation" description="An unexpected error occurred." />
          ) : null}
          {prep ? (
            <>
              <NativeText variant="caption">{prep.study_title}</NativeText>
              {prep.instructions.map((line) => (
                <View key={line}>
                  <NativeText variant="caption">{line}</NativeText>
                </View>
              ))}
              {prep.note ? <NativeText variant="caption">{prep.note}</NativeText> : null}
            </>
          ) : null}
          <NativeText variant="h2">Imaging report</NativeText>
          {reportStatus ? (
            <>
              <NativeText variant="caption">{reportStatus.note ?? ''}</NativeText>
              {reportStatus.report_available ? (
                <>
                  <NativeText variant="caption">{`Version ${reportStatus.version_number ?? ''}`}</NativeText>
                  <NativeButton
                    label={reportLoading ? 'Loading report…' : 'View final report'}
                    variant="secondary"
                    disabled={reportLoading}
                    onPress={loadReport}
                  />
                </>
              ) : (
                <NativeText variant="caption">Final report not available yet.</NativeText>
              )}
            </>
          ) : null}
          {reportError === 'forbidden' ? <NativePermissionDeniedState /> : null}
          {reportError === 'unavailable' ? (
            <NativeEmptyState
              title="Report not available"
              description="The final imaging report is not published yet or is no longer available."
            />
          ) : null}
          {reportError === 'network' ? <NativeNetworkErrorState onRetry={loadReport} /> : null}
          {reportError === 'generic' ? (
            <NativeEmptyState title="Could not load report" description="An unexpected error occurred." />
          ) : null}
          {report ? (
            <>
              {report.summary ? <NativeText>{report.summary}</NativeText> : null}
              {report.amendment_reason ? (
                <NativeText variant="caption">{`Amendment: ${report.amendment_reason}`}</NativeText>
              ) : null}
              {report.findings.map((line) => (
                <View key={`${line.finding_code}-${line.finding_text}`}>
                  <NativeText variant="caption">{`${line.finding_code}: ${line.finding_text}`}</NativeText>
                </View>
              ))}
              {report.note ? <NativeText variant="caption">{report.note}</NativeText> : null}
            </>
          ) : null}
          {reportStatus?.report_available ? (
            <>
              <NativeText variant="h2">Physical report delivery</NativeText>
              <NativeButton
                label={physicalLoading ? 'Loading…' : 'Check physical delivery'}
                variant="secondary"
                disabled={physicalLoading}
                onPress={() => {
                  setPhysicalLoading(true);
                  void fetchImagingPhysicalReportEligibility({
                    token: ctx.token,
                    onUnauthorized: ctx.onUnauthorized,
                    id: bookingId,
                  }).then(async (result) => {
                    if (!result.ok) {
                      return;
                    }
                    setPhysicalEligibility(result.data);
                    if (result.data.existing_request_id) {
                      const status = await fetchImagingPhysicalReportStatus({
                        token: ctx.token,
                        onUnauthorized: ctx.onUnauthorized,
                        id: bookingId,
                      });
                      if (status.ok) {
                        setPhysicalStatus(status.data);
                      }
                    }
                  }).finally(() => setPhysicalLoading(false));
                }}
              />
              {physicalEligibility && !physicalEligibility.eligible ? (
                <NativeText variant="caption">{physicalEligibility.reason ?? 'Unavailable'}</NativeText>
              ) : null}
              {physicalEligibility?.eligible && !physicalStatus ? (
                <>
                  {addresses.map((addr) => (
                    <View key={addr.id}>
                      <NativeButton
                        label={`${selectedAddressId === addr.id ? '✓ ' : ''}${addr.recipient_name} · ${addr.city}`}
                        variant={selectedAddressId === addr.id ? 'primary' : 'secondary'}
                        onPress={() => setSelectedAddressId(addr.id)}
                      />
                    </View>
                  ))}
                  <NativeButton
                    label="Request physical report"
                    disabled={physicalLoading || !selectedAddressId}
                    onPress={() => {
                      if (!selectedAddressId) {
                        return;
                      }
                      setPhysicalLoading(true);
                      void requestImagingPhysicalReport({
                        token: ctx.token,
                        onUnauthorized: ctx.onUnauthorized,
                        id: bookingId,
                        idempotencyKey: newIdempotencyKey('m-img-phys'),
                        customerAddressId: selectedAddressId,
                      }).then((result) => {
                        if (result.ok) {
                          setPhysicalStatus(result.data);
                        }
                      }).finally(() => setPhysicalLoading(false));
                    }}
                  />
                </>
              ) : null}
              {physicalStatus ? (
                <>
                  <NativeText variant="caption">{`Status: ${physicalStatus.status}`}</NativeText>
                  {physicalStatus.logistics_job_status ? (
                    <NativeText variant="caption">{`Delivery: ${physicalStatus.logistics_job_status}`}</NativeText>
                  ) : null}
                  {physicalStatus.failure_reason ? (
                    <NativeText variant="caption">{`Issue: ${physicalStatus.failure_reason}`}</NativeText>
                  ) : null}
                  {['REQUESTED', 'ACCEPTED', 'PREPARING', 'PACKED'].includes(physicalStatus.status) ? (
                    <NativeButton
                      label="Cancel request"
                      variant="secondary"
                      onPress={() => {
                        void cancelImagingPhysicalReport({
                          token: ctx.token,
                          onUnauthorized: ctx.onUnauthorized,
                          id: bookingId,
                        }).then((result) => {
                          if (result.ok) {
                            setPhysicalStatus(result.data);
                          }
                        });
                      }}
                    />
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}
          {payMessage ? <NativeText>{payMessage}</NativeText> : null}
          {payBusy ? <NativeLoadingState title="Processing sandbox payment…" /> : null}
          {imagingPaymentRetryable(row.status) ? (
            <>
              <NativeButton label="Pay (sandbox success)" disabled={payBusy} onPress={() => void retryPay('success')} />
              <NativeButton
                label="Simulate payment failure"
                variant="secondary"
                disabled={payBusy}
                onPress={() => void retryPay('failed')}
              />
              <NativeButton
                label="Cancel booking"
                variant="secondary"
                disabled={payBusy}
                onPress={() => {
                  void cancelImagingBooking({
                    token: ctx.token,
                    onUnauthorized: ctx.onUnauthorized,
                    id: row.id,
                  }).then(() => void load());
                }}
              />
            </>
          ) : null}
        </NativeCard>
      ) : null}
    </View>
  );
}
