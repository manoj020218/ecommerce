# Integrations Adapters

Provider-specific integrations must be implemented as adapters and injected into services.

Current folders:

- `payment-gateways/`
- `shipping-providers/`
- `otp-providers/`
- `email-providers/`
- `analytics-providers/`
- `google-auth/`

Do not hard-code any provider in business logic.
