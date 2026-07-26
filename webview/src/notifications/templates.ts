import { APP_NAME } from '@/config/app';
import { i18n } from '@/i18n';
import {
  NotificationKind,
  type NotificationContext,
  type NotificationTemplate,
} from './types';

export const NOTIFICATION_TEMPLATES: Record<NotificationKind, NotificationTemplate> = {
  [NotificationKind.SESSION_COMPLETE]: {
    title: (ctx: NotificationContext) => ctx.sessionTitle ?? APP_NAME,
    body: () => i18n.t('notifications:sessionComplete.body'),
    icon: '/favicon.svg',
  },
  [NotificationKind.STREAM_ERROR]: {
    title: (ctx: NotificationContext) => ctx.sessionTitle ?? APP_NAME,
    body: () => i18n.t('notifications:streamError.body'),
    icon: '/favicon.svg',
  },
  [NotificationKind.AWAITING_PERMISSION]: {
    title: (ctx: NotificationContext) => ctx.sessionTitle ?? APP_NAME,
    body: () => i18n.t('notifications:awaitingPermission.body'),
    icon: '/favicon.svg',
  },
  [NotificationKind.AWAITING_PLAN_APPROVAL]: {
    title: (ctx: NotificationContext) => ctx.sessionTitle ?? APP_NAME,
    body: () => i18n.t('notifications:awaitingPlanApproval.body'),
    icon: '/favicon.svg',
  },
  [NotificationKind.AWAITING_USER_INPUT]: {
    title: (ctx: NotificationContext) => ctx.sessionTitle ?? APP_NAME,
    body: () => i18n.t('notifications:awaitingUserInput.body'),
    icon: '/favicon.svg',
  },
  [NotificationKind.AUTO_RESUME_COUNTDOWN]: {
    title: (ctx: NotificationContext) => ctx.sessionTitle ?? APP_NAME,
    body: () => i18n.t('notifications:autoResumeCountdown.body'),
    icon: '/favicon.svg',
  },
};
