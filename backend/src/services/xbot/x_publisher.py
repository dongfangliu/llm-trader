"""Twitter API v2 publisher using tweepy."""

import io
import time
from typing import Optional, Dict
from loguru import logger


class XPublisher:
    """Handles Twitter API media upload and tweet posting."""

    def __init__(self, api_key: str, api_secret: str, access_token: str, access_token_secret: str):
        self._api_key = api_key
        self._api_secret = api_secret
        self._access_token = access_token
        self._access_token_secret = access_token_secret
        self._v1_api = None
        self._v2_client = None

    def _get_v1_api(self):
        """Tweepy v1.1 API (needed for media upload)."""
        if self._v1_api is None:
            import tweepy
            auth = tweepy.OAuth1UserHandler(
                self._api_key, self._api_secret,
                self._access_token, self._access_token_secret,
            )
            self._v1_api = tweepy.API(auth)
        return self._v1_api

    def _get_v2_client(self):
        """Tweepy v2 Client (for posting tweets)."""
        if self._v2_client is None:
            import tweepy
            self._v2_client = tweepy.Client(
                consumer_key=self._api_key,
                consumer_secret=self._api_secret,
                access_token=self._access_token,
                access_token_secret=self._access_token_secret,
            )
        return self._v2_client

    def upload_media(self, png_bytes: bytes) -> Optional[str]:
        """Upload PNG image to Twitter, return media_id string."""
        try:
            api = self._get_v1_api()
            media = api.media_upload(
                filename="card.png",
                file=io.BytesIO(png_bytes),
            )
            return str(media.media_id)
        except Exception as e:
            logger.error(f"Media upload failed: {e}")
            return None

    def upload_media_batch(self, png_list: list) -> list:
        """Upload multiple PNGs sequentially, skip None/failures, return media_id list."""
        media_ids = []
        for png in png_list:
            if png:
                mid = self.upload_media(png)
                if mid:
                    media_ids.append(mid)
        return media_ids

    def post_tweet(self, text: str, media_ids=None, reply_to_tweet_id: Optional[str] = None) -> Optional[str]:
        """Post tweet with optional media (str or list) and optional thread reply."""
        try:
            client = self._get_v2_client()
            kwargs: dict = {"text": text}
            if isinstance(media_ids, str):
                ids = [media_ids] if media_ids else []
            else:
                ids = (media_ids or [])[:4]
            if ids:
                kwargs["media_ids"] = ids
            if reply_to_tweet_id:
                kwargs["reply_to_tweet_id"] = reply_to_tweet_id

            for attempt in range(3):
                try:
                    resp = client.create_tweet(**kwargs)
                    tweet_id = str(resp.data["id"])
                    logger.info(f"Tweet posted: {tweet_id}")
                    return tweet_id
                except Exception as e:
                    if "429" in str(e) or "rate limit" in str(e).lower():
                        wait = 60 * (attempt + 1)
                        logger.warning(f"Rate limited, waiting {wait}s (attempt {attempt+1}/3)")
                        time.sleep(wait)
                        continue
                    raise
        except Exception as e:
            logger.error(f"Tweet posting failed: {e}")
            return None

    def get_tweet_metrics(self, tweet_id: str) -> Dict:
        """Fetch engagement metrics for a tweet."""
        try:
            import tweepy
            client = self._get_v2_client()
            resp = client.get_tweet(tweet_id, tweet_fields=["public_metrics"])
            if resp.data and resp.data.public_metrics:
                m = resp.data.public_metrics
                return {
                    "likes": m.get("like_count", 0),
                    "retweets": m.get("retweet_count", 0),
                }
        except Exception as e:
            logger.warning(f"Failed to fetch tweet metrics for {tweet_id}: {e}")
        return {"likes": 0, "retweets": 0}

    def verify_credentials(self) -> Dict:
        """Test Twitter API connectivity. Returns account info or raises."""
        api = self._get_v1_api()
        me = api.verify_credentials()
        return {
            "id": str(me.id),
            "screen_name": me.screen_name,
            "name": me.name,
            "followers_count": me.followers_count,
        }


async def get_publisher_from_settings() -> Optional[XPublisher]:
    """Build XPublisher from SystemSetting values."""
    try:
        from src.database.new_db import async_session
        from sqlalchemy import select
        from src.models.settings import SystemSetting

        async with async_session() as db:
            keys = [
                "xbot_twitter_api_key",
                "xbot_twitter_api_secret",
                "xbot_twitter_access_token",
                "xbot_twitter_access_token_secret",
            ]
            result = await db.execute(
                select(SystemSetting).where(SystemSetting.key.in_(keys))
            )
            settings = {row.key: row.value for row in result.scalars().all()}

        api_key = settings.get("xbot_twitter_api_key", "")
        api_secret = settings.get("xbot_twitter_api_secret", "")
        access_token = settings.get("xbot_twitter_access_token", "")
        access_token_secret = settings.get("xbot_twitter_access_token_secret", "")

        if not all([api_key, api_secret, access_token, access_token_secret]):
            logger.warning("Twitter API credentials not fully configured")
            return None

        return XPublisher(api_key, api_secret, access_token, access_token_secret)
    except Exception as e:
        logger.error(f"Failed to load Twitter credentials: {e}")
        return None
