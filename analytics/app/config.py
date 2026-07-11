from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Shared secret with the Spring Boot backend. This service is never exposed
    # publicly; Spring is the only caller.
    internal_token: str = "dev-internal-token"

    # LeetCode's GraphQL endpoint is unofficial and Cloudflare-fronted; it 403s
    # without browser-like headers. See clients/leetcode.py.
    leetcode_graphql_url: str = "https://leetcode.com/graphql/"
    codeforces_api_url: str = "https://codeforces.com/api"

    # Piston runs untrusted user code in its own sandbox. Default is the public instance; point
    # this at a self-hosted Piston for higher rate limits. See clients/piston.py.
    piston_url: str = "https://emkc.org/api/v2/piston"

    http_timeout_seconds: float = 15.0
    # Longer: a run covers Piston compiling and executing the program, plus its queue.
    execute_timeout_seconds: float = 30.0

    model_config = SettingsConfigDict(env_file="../.env", extra="ignore")


settings = Settings()
