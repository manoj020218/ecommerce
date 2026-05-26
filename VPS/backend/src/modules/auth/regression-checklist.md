# Phase 2 Auth Regression Checklist

- [ ] Guest can access browse endpoint without login.
- [ ] Guest can call search endpoint without login.
- [ ] Guest can add items to guest cart without login.
- [ ] Customer login with `guestSessionId` merges guest cart into customer cart.
- [ ] Google login creates customer and returns access/refresh token pair.
- [ ] OTP request + verify flow logs customer in.
- [ ] Admin login issues tokens and respects staff permissions.
