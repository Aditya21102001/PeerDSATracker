from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Shared secret with the Spring Boot backend. This service is never exposed
    # publicly; Spring is the only caller.
    internal_token: str = "dev-internal-token"

    # LeetCode's GraphQL endpoint is unofficial and Cloudflare-fronted; it 403s
    # without browser-like headers. See clients/leetcode.py.
    leetcode_graphql_url: str = "https://leetcode.com/graphql/"
    codeforces_api_url: str = "https://codeforces.com/api"

    # Piston runs untrusted user code in its own sandbox. The public emkc.org instance became
    # whitelist-only on 2026-02-15, so the default targets a self-hosted Piston (its standard
    # Docker port). Note the base differs by host: self-hosted ends in /api/v2, the public
    # instance in /api/v2/piston. See clients/piston.py and docs/05-analytics.md.
    piston_url: str = "http://localhost:2000/api/v2"

    http_timeout_seconds: float = 15.0
    # Longer: a run covers Piston compiling and executing the program, plus its queue.
    execute_timeout_seconds: float = 30.0

    model_config = SettingsConfigDict(env_file="../.env", extra="ignore")


settings = Settings()
