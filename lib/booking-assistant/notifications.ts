import {
  trackKlaviyoEvent,
  upsertKlaviyoProfile,
} from "@/lib/integrations/klaviyo";

export type BookingNotificationKind =
  | "resume_receipt"
  | "continue_later_reminder"
  | "ready_to_call_receipt"
  | "ready_to_call_reminder"
  | "callback_requested_receipt"
  | "no_agents_try_later_receipt"
  | "custom_operator_message";

export interface BookingNotification {
  kind: BookingNotificationKind;
  email: string;
  resumeUrl: string;
  dealLabel: string;
  nextTaskLabel?: string;
  fallbackCallKey?: string;
  agencyPhone?: string;
  callbackWindowLabel?: string;
  /** Operator-authored subject; only used by the custom_operator_message kind. */
  subject?: string;
  /** Operator-authored body; only used by the custom_operator_message kind. */
  body?: string;
  reminderControlsUrl: string;
  idempotencyKey: string;
}

export interface BookingNotificationTransport {
  send(notification: BookingNotification): Promise<{ accepted: boolean }>;
}

const EVENT_NAMES: Record<BookingNotificationKind, string> = {
  resume_receipt: "LLL Booking Assistant Progress Saved",
  continue_later_reminder: "LLL Booking Assistant Continue Later Reminder",
  ready_to_call_receipt: "LLL Booking Assistant Ready To Call",
  ready_to_call_reminder: "LLL Booking Assistant Call Reminder",
  callback_requested_receipt: "LLL Booking Assistant Callback Requested",
  no_agents_try_later_receipt: "LLL Booking Assistant No Agents Progress Saved",
  custom_operator_message: "LLL Booking Assistant Custom Operator Message",
};

export function createKlaviyoBookingNotificationTransport(): BookingNotificationTransport {
  return {
    async send(notification) {
      await upsertKlaviyoProfile({ email: notification.email });
      const result = await trackKlaviyoEvent({
        email: notification.email,
        eventName: EVENT_NAMES[notification.kind],
        properties: {
          resume_url: notification.resumeUrl,
          reminder_controls_url: notification.reminderControlsUrl,
          deal_label: notification.dealLabel,
          next_task_label: notification.nextTaskLabel,
          fallback_call_key: notification.fallbackCallKey,
          agency_phone: notification.agencyPhone,
          callback_window_label: notification.callbackWindowLabel,
          subject: notification.subject,
          body: notification.body,
          delivery_id: notification.idempotencyKey,
        },
      });
      return { accepted: result.accepted };
    },
  };
}

export function assertNotificationHasNoSensitiveSubjectData(notification: BookingNotification): void {
  if (notification.resumeUrl.includes(notification.email)) {
    throw new Error("Resume URL must not contain the guest email");
  }
  if (notification.fallbackCallKey && notification.resumeUrl.includes(notification.fallbackCallKey)) {
    throw new Error("Resume URL must not contain the fallback call key");
  }
}
