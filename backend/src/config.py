"""Application configuration — single source of truth for all settings."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings read from environment variables / .env file."""

    database_url: str = "sqlite+aiosqlite:///./data/trader.db"
    redis_url: str = "redis://localhost:6379"
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days

    # LLM configuration (set by operator, never exposed to frontend)
    llm_provider: str = "openai"
    llm_api_key: str = ""
    llm_base_url: str = "https://api.deepseek.com/v1"
    llm_model: str = "deepseek-chat"
    llm_max_tokens: int = 1500
    llm_temperature: float = 0.7

    # Security
    allowed_origins: str = "*"  # comma-separated list, e.g. "https://example.com,https://www.example.com"
    afdian_webhook_token: str = ""  # appended to webhook URL as ?token=xxx for verification
    admin_token: str = ""

    # 爱发电 plan IDs (from afdian.net dashboard) and subscription links
    afdian_basic_plan_id: str = ""
    afdian_premium_plan_id: str = ""
    afdian_basic_link: str = ""
    afdian_premium_link: str = ""

    # 爱发电 Open API credentials (for active order query, no webhook needed)
    afdian_user_id: str = ""    # your creator user_id from afdian.net/dashboard/dev
    afdian_api_token: str = ""  # API token from afdian.net/dashboard/dev

    # App branding (can be overridden via APP_NAME env var)
    app_name: str = "财财技术洞见"

    # Pricing display + daily limits (guests = unauthenticated, free = logged-in free tier)
    pricing_period: str = "月"
    pricing_guest_daily: int = 1    # 游客（未登录）每日分析次数
    pricing_free_daily: int = 3     # 免费版（已登录）每日分析次数
    pricing_basic_price: str = "19.9"
    pricing_basic_daily: int = 5
    pricing_premium_price: str = "49"
    pricing_premium_daily: int = 15

    # Email — Resend (https://resend.com)
    resend_api_key: str = ""        # RESEND_API_KEY env var
    email_from: str = ""            # e.g. "财财技术洞见 <noreply@yourdomain.com>"

    # Base URL of the frontend app (used to build verification links)
    app_base_url: str = "http://localhost:3000"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
