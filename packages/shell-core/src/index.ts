export {
  createSessionStore,
  snapshotContainsSecrets,
  type Audience,
  type SessionSecrets,
  type SessionSnapshot,
  type SessionStatus,
  type SessionStore,
} from './session';
export { apiBaseUrl, apiFetch, createCorrelationId } from './http';
export {
  requestOtp,
  loginWithPassword,
  verifyOtp,
  verifyMfaLogin,
  signInWithOtp,
  fetchCurrentUser,
  fetchBootstrap,
  hydrateSessionPermissions,
  type OtpVerifyResult,
  type CurrentUserResult,
  type BootstrapSnapshot,
} from './auth';
export {
  apiCall,
  refreshAccessToken,
  logoutSession,
  loadStoredSession,
  saveStoredSession,
  COOKIE_SESSION_TOKEN,
  type ApiCallResult,
  type StoredSession,
} from './api-call';
export { t, setLocale, getLocale, registerCatalog, type LocaleCode } from './i18n';
export { canAccessProtected, visibleNavItems, type ShellNavItem } from './nav';
export {
  ACTIVE_VIDEO_SESSION_STATUSES,
  isMockVideoToken,
  isMockVideoWsUrl,
  isOnlineAppointmentType,
  isVideoSessionEnded,
  mapVideoApiError,
  waitingRoomHeadline,
  type VideoEndResponse,
  type VideoJoinResponse,
  type VideoLeaveResponse,
  type VideoParticipantRole,
  type VideoSessionStatus,
  type VideoSessionView,
} from './video-session';
export {
  resolveNativeVideoMedia,
  type NativeVideoMediaCapability,
  type NativeVideoMediaSession,
} from './native-video-media';
export {
  clinicalReportNextAction,
  clinicalReportStatusLabel,
  type ClinicalReportNextAction,
} from './clinical-status-labels';
