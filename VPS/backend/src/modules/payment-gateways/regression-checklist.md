# Phase 9 Payment Gateways Regression Checklist

- [ ] Razorpay gateway can be enabled and disabled from admin API.
- [ ] Disabled gateway cannot be selected for payment attempt creation.
- [ ] Same checkout session can create multiple online payment attempts before success.
- [ ] Duplicate webhook does not create duplicate paid order state.
- [ ] Webhook route works with `/api/payments/webhook/:gateway`.
- [ ] Direct payment discount configuration is editable from admin.
