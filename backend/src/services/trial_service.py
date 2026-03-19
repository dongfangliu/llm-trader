"""Trial state management service."""
from enum import Enum
from typing import Union, TYPE_CHECKING

if TYPE_CHECKING:
    from src.models.user import User
    from src.models.device import Device


class TrialState(str, Enum):
    AVAILABLE = "available"      # Not yet used, can trigger trial
    ACTIVE = "active"            # Trial in progress (this request gets premium)
    EXPIRED = "expired"          # Trial used up
    NOT_ELIGIBLE = "not_eligible"  # Paid user, trial not applicable


def get_trial_state(entity) -> TrialState:
    """Get the current trial state for a user or device."""
    tier = getattr(entity, 'subscription_tier', 'free')
    has_had_trial = getattr(entity, 'has_had_pro_trial', False)

    if tier in ('basic', 'premium'):
        return TrialState.NOT_ELIGIBLE

    if has_had_trial:
        return TrialState.EXPIRED

    return TrialState.AVAILABLE


def can_use_trial(entity) -> bool:
    return get_trial_state(entity) == TrialState.AVAILABLE


def get_effective_tier(entity) -> str:
    """Get effective tier considering trial."""
    if can_use_trial(entity):
        return 'premium'
    tier = getattr(entity, 'subscription_tier', 'free')
    return tier


async def consume_trial(db, entity) -> None:
    """Mark trial as used."""
    from sqlalchemy import update
    from src.models.user import User
    from src.models.device import Device

    entity.has_had_pro_trial = True
    await db.commit()
