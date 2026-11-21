import "package:flutter/foundation.dart";

/// Independent reactive unread counters so Messages and Notifications never share or mix counts.
class AppStateBadges {
  static final ValueNotifier<int> unreadMessagesCount = ValueNotifier<int>(0);
  static final ValueNotifier<int> unreadNotificationsCount =
      ValueNotifier<int>(0);
}
