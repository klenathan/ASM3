"""In-app notification bounded context."""

from .models.notification import Notification
from .services.notifications import NotificationService

__all__ = ["Notification", "NotificationService"]
